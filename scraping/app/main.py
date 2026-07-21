import asyncio
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI, HTTPException, status

from .config import settings
from .models import (
    IngestionJobResponse,
    RecordBatch,
    RecordBatchResponse,
    SourceStatus,
)
from .runner import (
    ENRICHMENT_SOURCE_NAME,
    create_job,
    jobs,
    run_category_search,
    run_enrichment,
    run_obf_dump,
    run_open_beauty_facts,
    run_wikidata,
    run_youtube,
    scheduler_loop,
    state,
    submit_records,
)
from .sources.open_beauty_facts import (
    CATEGORY_SOURCE_NAME,
    DUMP_SOURCE_NAME,
    SOURCE_NAME,
)
from .sources.wikidata import SOURCE_NAME as WIKIDATA_SOURCE_NAME
from .sources.youtube import SOURCE_NAME as YOUTUBE_SOURCE_NAME


background_tasks: set[asyncio.Task[None]] = set()


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler_task: asyncio.Task[None] | None = None
    if settings.auto_ingest_enabled:
        scheduler_task = asyncio.create_task(scheduler_loop())
    yield
    if scheduler_task:
        scheduler_task.cancel()
        with suppress(asyncio.CancelledError):
            await scheduler_task


app = FastAPI(
    title="Notemae Ingestion API",
    version="0.2.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "service": "scraping",
        "automatic_ingestion": settings.auto_ingest_enabled,
    }


@app.get("/v1/sources", response_model=list[SourceStatus])
def list_sources() -> list[SourceStatus]:
    return [
        SourceStatus(
            name=SOURCE_NAME,
            enabled=settings.auto_ingest_enabled,
            schedule_seconds=settings.auto_ingest_interval_seconds,
            last_cursor=state.last_cursor,
            processed_files=len(state.processed_files),
        ),
        SourceStatus(
            name=CATEGORY_SOURCE_NAME,
            enabled=True,
            schedule_seconds=0,
            last_cursor=", ".join(
                f"{tag}:{page}" for tag, page in state.category_pages.items()
            )
            or None,
            processed_files=len(state.category_pages),
        ),
        SourceStatus(
            name=DUMP_SOURCE_NAME,
            enabled=True,
            schedule_seconds=0,
            last_cursor=f"line-{state.dump_line}" if state.dump_line else None,
            processed_files=0,
        ),
        SourceStatus(
            name=WIKIDATA_SOURCE_NAME,
            enabled=True,
            schedule_seconds=0,
            last_cursor=None,
            processed_files=0,
        ),
        SourceStatus(
            name=YOUTUBE_SOURCE_NAME,
            enabled=bool(settings.youtube_api_key),
            schedule_seconds=0,
            last_cursor=None,
            processed_files=0,
        ),
        SourceStatus(
            name=ENRICHMENT_SOURCE_NAME,
            enabled=bool(settings.dashscope_api_key),
            schedule_seconds=0,
            last_cursor=f"attempted-{len(state.enriched_slugs)}"
            if state.enriched_slugs
            else None,
            processed_files=len(state.enriched_slugs),
        ),
    ]


def start_job(source_name, runner) -> IngestionJobResponse:
    if any(job.status in {"queued", "running"} for job in jobs.values()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An ingestion run is already active",
        )
    job = create_job(source_name)
    task = asyncio.create_task(runner(job))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)
    return job


@app.post(
    "/v1/sources/open-beauty-facts/run",
    response_model=IngestionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_open_beauty_facts() -> IngestionJobResponse:
    return start_job(SOURCE_NAME, run_open_beauty_facts)


@app.post(
    "/v1/sources/open-beauty-facts-categories/run",
    response_model=IngestionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_category_search() -> IngestionJobResponse:
    return start_job(CATEGORY_SOURCE_NAME, run_category_search)


@app.post(
    "/v1/sources/open-beauty-facts-dump/run",
    response_model=IngestionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_obf_dump() -> IngestionJobResponse:
    return start_job(DUMP_SOURCE_NAME, run_obf_dump)


@app.post(
    "/v1/sources/wikidata/run",
    response_model=IngestionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_wikidata() -> IngestionJobResponse:
    return start_job(WIKIDATA_SOURCE_NAME, run_wikidata)


@app.post(
    "/v1/sources/youtube/run",
    response_model=IngestionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_youtube() -> IngestionJobResponse:
    if not settings.youtube_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="YOUTUBE_API_KEY is not configured",
        )
    return start_job(YOUTUBE_SOURCE_NAME, run_youtube)


@app.post(
    "/v1/enrichment/run",
    response_model=IngestionJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_enrichment() -> IngestionJobResponse:
    if not settings.dashscope_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="DASHSCOPE_API_KEY is not configured",
        )
    return start_job(ENRICHMENT_SOURCE_NAME, run_enrichment)


@app.get("/v1/jobs", response_model=list[IngestionJobResponse])
def list_jobs() -> list[IngestionJobResponse]:
    return list(reversed(jobs.values()))


@app.get("/v1/jobs/{job_id}", response_model=IngestionJobResponse)
def get_job(job_id: str) -> IngestionJobResponse:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingestion job not found",
        )
    return job


@app.post("/v1/records", response_model=RecordBatchResponse)
async def ingest_records(payload: RecordBatch) -> RecordBatchResponse:
    unapproved = [
        record.source_name for record in payload.records if not record.terms_confirmed
    ]
    if unapproved:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Source terms were not confirmed for: {', '.join(unapproved)}",
        )
    try:
        slugs = await submit_records(payload.records)
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Catalog API rejected the normalized records",
        ) from error
    return RecordBatchResponse(accepted=len(slugs), upserted_slugs=slugs)
