import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx

from .config import settings
from .enrichment import enrich_record, extract_fragrances_from_titles
from .models import IngestionJobResponse, SourceRecord
from .normalization import normalize_record, slugify
from .sources import wikidata, youtube
from .sources.open_beauty_facts import (
    CATEGORY_SOURCE_NAME,
    DUMP_SOURCE_NAME,
    SOURCE_NAME,
    fetch_category_page,
    fetch_delta_records,
    list_delta_files,
    stream_dump_records,
)
from .state import IngestionState

ENRICHMENT_SOURCE_NAME = "AI enrichment (LLM, confidence-gated)"


jobs: dict[str, IngestionJobResponse] = {}
state = IngestionState(settings.ingestion_state_path)
run_lock = asyncio.Lock()


async def submit_records(records: list[SourceRecord]) -> list[str]:
    headers = {"X-Service-Key": settings.service_shared_secret}
    normalized_records = [normalize_record(record) for record in records]
    async with httpx.AsyncClient(timeout=30) as client:
        for record in normalized_records:
            response = await client.post(
                f"{settings.backend_url}/internal/fragrances",
                json=record,
                headers=headers,
            )
            response.raise_for_status()
    return [str(record["slug"]) for record in normalized_records]


async def refresh_embeddings(limit: int) -> None:
    headers = {"X-Service-Key": settings.service_shared_secret}
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            f"{settings.backend_url}/internal/embeddings/rebuild",
            params={"limit": limit},
            headers=headers,
        )
        response.raise_for_status()


async def refresh_embeddings_until_done(max_rounds: int = 40) -> None:
    """Rebuild embeddings in bounded rounds so big ingest runs never hit one
    long request timeout; stops when the backend reports nothing left."""
    headers = {"X-Service-Key": settings.service_shared_secret}
    async with httpx.AsyncClient(timeout=300) as client:
        for _ in range(max_rounds):
            response = await client.post(
                f"{settings.backend_url}/internal/embeddings/rebuild",
                params={"limit": 500},
                headers=headers,
            )
            response.raise_for_status()
            payload = response.json()
            if not payload.get("selected") or not payload.get("updated"):
                return


async def submit_upsert(payload: dict[str, Any]) -> None:
    """Send one pre-normalized fragrance payload straight to the catalog
    upsert, preserving its existing slug (used by the enrichment merge)."""
    headers = {"X-Service-Key": settings.service_shared_secret}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{settings.backend_url}/internal/fragrances",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()


async def fetch_internal_fragrances(
    missing_notes: bool = False,
    missing_pyramid: bool = False,
    max_records: int = 5000,
) -> list[dict[str, Any]]:
    headers = {"X-Service-Key": settings.service_shared_secret}
    items: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=60) as client:
        offset = 0
        while len(items) < max_records:
            response = await client.get(
                f"{settings.backend_url}/internal/fragrances",
                params={
                    "missing_notes": missing_notes,
                    "missing_pyramid": missing_pyramid,
                    "limit": 500,
                    "offset": offset,
                },
                headers=headers,
            )
            response.raise_for_status()
            page = response.json().get("items", [])
            if not page:
                break
            items.extend(page)
            offset += len(page)
    return items[:max_records]


async def fetch_existing_identity_keys() -> set[str]:
    """slugified brand+name of every cataloged fragrance, used to keep
    discovery sources (Wikidata, YouTube) from re-adding known products."""
    records = await fetch_internal_fragrances()
    return {slugify(f"{record['brand']}-{record['name']}") for record in records}


def create_job(source_name: str = SOURCE_NAME) -> IngestionJobResponse:
    job = IngestionJobResponse(
        id=str(uuid4()),
        source_name=source_name,
        status="queued",
        created_at=datetime.now(UTC),
    )
    jobs[job.id] = job
    if len(jobs) > 100:
        jobs.pop(next(iter(jobs)))
    return job


async def run_open_beauty_facts(job: IngestionJobResponse) -> None:
    async with run_lock:
        job.status = "running"
        job.started_at = datetime.now(UTC)
        try:
            headers = {"User-Agent": settings.source_user_agent}
            async with httpx.AsyncClient(
                timeout=120,
                follow_redirects=True,
                headers=headers,
            ) as client:
                filenames = await list_delta_files(client, settings.obf_delta_index_url)
                if not filenames:
                    raise RuntimeError("Open Beauty Facts returned no delta files")

                if state.processed_files:
                    candidates = [
                        filename
                        for filename in reversed(filenames)
                        if filename not in state.processed_files
                    ][: settings.obf_max_files_per_run]
                else:
                    candidates = filenames[: settings.obf_bootstrap_files]

                for filename in candidates:
                    remaining = settings.obf_max_records_per_run - job.records_received
                    if remaining <= 0:
                        break
                    records = await fetch_delta_records(
                        client,
                        f"{settings.obf_delta_base_url}/{filename}",
                        remaining,
                    )
                    if records:
                        await submit_records(records)
                        job.records_received += len(records)
                    state.mark_processed([filename])
                    job.cursor = filename

                await refresh_embeddings(settings.obf_max_records_per_run)
                job.cursor = job.cursor or filenames[0]
                job.status = "completed"
        except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
            job.status = "failed"
            job.error = str(error)[:500]
        finally:
            job.completed_at = datetime.now(UTC)


async def run_category_search(job: IngestionJobResponse) -> None:
    async with run_lock:
        job.status = "running"
        job.started_at = datetime.now(UTC)
        try:
            headers = {"User-Agent": settings.source_user_agent}
            pages_fetched = 0
            async with httpx.AsyncClient(
                timeout=120,
                follow_redirects=True,
                headers=headers,
            ) as client:
                for tag in settings.obf_category_tag_list:
                    page = max(state.category_pages.get(tag, 1), 1)
                    while pages_fetched < settings.obf_category_max_pages_per_run:
                        records, product_count = await fetch_category_page(
                            client,
                            settings.obf_search_url,
                            tag,
                            page,
                            settings.obf_category_page_size,
                        )
                        pages_fetched += 1
                        if records:
                            await submit_records(records)
                            job.records_received += len(records)
                        job.cursor = f"{tag}:page-{page}"
                        if product_count < settings.obf_category_page_size:
                            # partial page ends the category; restart from page 1 next run
                            state.set_category_page(tag, 1)
                            break
                        page += 1
                        state.set_category_page(tag, page)
                        await asyncio.sleep(
                            settings.obf_category_request_interval_seconds
                        )
                    if pages_fetched >= settings.obf_category_max_pages_per_run:
                        break
                    await asyncio.sleep(settings.obf_category_request_interval_seconds)

                await refresh_embeddings(settings.obf_max_records_per_run)
                job.status = "completed"
        except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
            job.status = "failed"
            job.error = str(error)[:500]
        finally:
            job.completed_at = datetime.now(UTC)


async def run_obf_dump(job: IngestionJobResponse) -> None:
    async with run_lock:
        job.status = "running"
        job.started_at = datetime.now(UTC)
        try:
            headers = {"User-Agent": settings.source_user_agent}
            limit = settings.obf_dump_max_records_per_run
            batch: list[SourceRecord] = []
            last_line = state.dump_line
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(300, connect=30),
                follow_redirects=True,
                headers=headers,
            ) as client:
                async for line_number, record in stream_dump_records(
                    client, settings.obf_dump_url, state.dump_line, limit
                ):
                    batch.append(record)
                    last_line = line_number
                    if len(batch) >= 100:
                        await submit_records(batch)
                        job.records_received += len(batch)
                        batch = []
                        state.set_dump_line(last_line)
                        job.cursor = f"line-{last_line}"
            if batch:
                await submit_records(batch)
                job.records_received += len(batch)
            if job.records_received < limit:
                # reached the end of the export; next run starts fresh
                state.set_dump_line(0)
                job.cursor = f"line-{last_line} (complete)"
            else:
                state.set_dump_line(last_line)
                job.cursor = f"line-{last_line}"
            await refresh_embeddings_until_done()
            job.status = "completed"
        except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
            job.status = "failed"
            job.error = str(error)[:500]
        finally:
            job.completed_at = datetime.now(UTC)


async def run_wikidata(job: IngestionJobResponse) -> None:
    async with run_lock:
        job.status = "running"
        job.started_at = datetime.now(UTC)
        try:
            headers = {"User-Agent": settings.source_user_agent}
            existing = await fetch_existing_identity_keys()
            async with httpx.AsyncClient(
                timeout=120, follow_redirects=True, headers=headers
            ) as client:
                records = await wikidata.fetch_perfumes(
                    client, settings.wikidata_sparql_url
                )
            fresh = [
                record
                for record in records
                if slugify(f"{record.brand}-{record.name}") not in existing
            ]
            if fresh:
                await submit_records(fresh)
                job.records_received = len(fresh)
            job.cursor = f"fetched-{len(records)}-new-{len(fresh)}"
            await refresh_embeddings_until_done()
            job.status = "completed"
        except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
            job.status = "failed"
            job.error = str(error)[:500]
        finally:
            job.completed_at = datetime.now(UTC)


async def run_youtube(job: IngestionJobResponse) -> None:
    async with run_lock:
        job.status = "running"
        job.started_at = datetime.now(UTC)
        try:
            if not settings.youtube_api_key:
                raise RuntimeError("YOUTUBE_API_KEY is not configured")
            if not settings.dashscope_api_key:
                raise RuntimeError("DASHSCOPE_API_KEY is not configured")
            headers = {"User-Agent": settings.source_user_agent}
            existing = await fetch_existing_identity_keys()
            videos: list[dict[str, str]] = []
            async with httpx.AsyncClient(timeout=60, headers=headers) as client:
                for query in settings.youtube_query_list:
                    videos.extend(
                        await search_videos_safely(client, query)
                    )
                    await asyncio.sleep(settings.youtube_request_interval_seconds)
            titles = [video["title"] for video in videos]
            records: list[SourceRecord] = []
            seen: set[str] = set()
            async with httpx.AsyncClient(timeout=180) as llm_client:
                for start in range(0, len(titles), 40):
                    candidates = await extract_fragrances_from_titles(
                        llm_client, titles[start : start + 40]
                    )
                    for candidate in candidates:
                        if candidate["confidence"] < settings.youtube_min_confidence:
                            continue
                        key = slugify(f"{candidate['brand']}-{candidate['name']}")
                        if key in existing or key in seen:
                            continue
                        seen.add(key)
                        video = videos[start + candidate["title_index"]]
                        records.append(youtube.to_source_record(candidate, video))
            if records:
                await submit_records(records)
                job.records_received = len(records)
            job.cursor = f"videos-{len(videos)}-new-{len(records)}"
            await refresh_embeddings_until_done()
            job.status = "completed"
        except (httpx.HTTPError, OSError, RuntimeError, ValueError) as error:
            job.status = "failed"
            job.error = str(error)[:500]
        finally:
            job.completed_at = datetime.now(UTC)


async def search_videos_safely(
    client: httpx.AsyncClient, query: str
) -> list[dict[str, str]]:
    try:
        return await youtube.search_videos(
            client,
            settings.youtube_api_key,
            query,
            settings.youtube_max_results_per_query,
        )
    except httpx.HTTPStatusError as error:
        if error.response.status_code in {400, 403}:
            raise RuntimeError(
                f"YouTube API refused query '{query}': {error.response.text[:200]}"
            ) from error
        raise


async def run_enrichment(job: IngestionJobResponse) -> None:
    async with run_lock:
        job.status = "running"
        job.started_at = datetime.now(UTC)
        try:
            if not settings.dashscope_api_key:
                raise RuntimeError("DASHSCOPE_API_KEY is not configured")
            # A record with no notes at all also has no pyramid, so this one
            # filter covers both the never-enriched rows and the ones that
            # were enriched before tiers existed.
            sparse = await fetch_internal_fragrances(missing_pyramid=True)
            attempted = set(state.enriched_slugs)
            targets = [
                record for record in sparse if record["slug"] not in attempted
            ][: settings.enrichment_max_records_per_run]
            enriched = 0
            skipped = 0
            async with httpx.AsyncClient(timeout=180) as llm_client:
                for record in targets:
                    result = await enrich_record(llm_client, record)
                    if result is None:
                        skipped += 1
                    else:
                        payload = {
                            key: record[key]
                            for key in (
                                "slug",
                                "brand",
                                "name",
                                "description",
                                "gender",
                                "release_year",
                                "notes",
                                "top_notes",
                                "heart_notes",
                                "base_notes",
                                "occasions",
                                "climates",
                                "price_idr",
                                "rating",
                                "longevity_score",
                                "projection_score",
                                "source_url",
                                "source_type",
                            )
                        }
                        # Tiers only move together with the flat list they
                        # summarize, so the two can never end up describing
                        # different sets of notes.
                        for key in ("notes", "top_notes", "heart_notes", "base_notes"):
                            payload[key] = result[key]
                        if not payload["occasions"]:
                            payload["occasions"] = result["occasions"]
                        if not payload["climates"]:
                            payload["climates"] = result["climates"]
                        if not payload["description"]:
                            payload["description"] = result["description"]
                        if payload["release_year"] is None:
                            payload["release_year"] = result["release_year"]
                        if payload["gender"] == "unisex" and result["gender"]:
                            payload["gender"] = result["gender"]
                        await submit_upsert(payload)
                        enriched += 1
                    state.mark_enriched([record["slug"]])
                    job.records_received = enriched
                    job.cursor = f"enriched-{enriched}-skipped-{skipped}"
            await refresh_embeddings_until_done()
            job.status = "completed"
        except (httpx.HTTPError, KeyError, OSError, RuntimeError, ValueError) as error:
            job.status = "failed"
            job.error = str(error)[:500]
        finally:
            job.completed_at = datetime.now(UTC)


async def scheduler_loop() -> None:
    await asyncio.sleep(settings.auto_ingest_startup_delay_seconds)
    while True:
        job = create_job()
        await run_open_beauty_facts(job)
        delay = (
            settings.auto_ingest_interval_seconds
            if job.status == "completed"
            else settings.auto_ingest_retry_seconds
        )
        await asyncio.sleep(delay)
