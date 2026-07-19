import secrets
from contextlib import asynccontextmanager
from typing import Annotated, Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row

from .config import settings
from .db import pool, start_pool, stop_pool
from .models import (
    DupeResponse,
    Fragrance,
    FragranceList,
    InternalFragranceUpsert,
    MatchResult,
    RecommendationRequest,
    RecommendationResponse,
    RelatedFragrance,
    TextRecommendationRequest,
    TextRecommendationResponse,
)


FIELDS = """
    id, slug, brand, name, description, gender, release_year, notes, occasions,
    climates, price_idr, rating, longevity_score, projection_score, source_url, source_type
"""
PREFIXED_FIELDS = ", ".join(
    f"f.{column.strip()}" for column in FIELDS.split(",") if column.strip()
)

DUPE_DISCLAIMER = (
    "Dupe/clone relationships come from community-consensus curation, not official "
    "brand statements. The 'similar' list only indicates a comparable scent profile, "
    "not a dupe claim. ScentSphere does not verify the authenticity (genuine/fake) of "
    "physical products; be wary of offers priced far below market."
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    start_pool()
    yield
    stop_pool()


app = FastAPI(
    title="ScentSphere Catalog API",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def list_catalog(
    *,
    query: str | None = None,
    note: str | None = None,
    occasion: str | None = None,
    max_price_idr: int | None = None,
    avoid_notes: list[str] | None = None,
    query_embedding: list[float] | None = None,
    limit: int = 12,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    select_values: list[Any] = []
    where_values: list[Any] = []
    order_values: list[Any] = []

    if query:
        clauses.append("(brand ILIKE %s OR name ILIKE %s OR description ILIKE %s)")
        where_values.extend([f"%{query}%"] * 3)
    if note:
        clauses.append("%s = ANY(notes)")
        where_values.append(note.lower())
    if occasion:
        clauses.append("%s = ANY(occasions)")
        where_values.append(occasion.lower())
    if max_price_idr is not None:
        clauses.append("(price_idr IS NULL OR price_idr <= %s)")
        where_values.append(max_price_idr)
    for avoided_note in avoid_notes or []:
        clauses.append("NOT (%s = ANY(notes))")
        where_values.append(avoided_note.lower())

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    select_fields = FIELDS
    if query_embedding:
        vector = "[" + ",".join(f"{value:.8g}" for value in query_embedding) + "]"
        select_fields = (
            FIELDS + ", 1 - (document_embedding <=> %s::vector) AS semantic_similarity"
        )
        select_values.append(vector)
        order_clause = (
            "document_embedding <=> %s::vector NULLS LAST, rating DESC NULLS LAST"
        )
        order_values.append(vector)
    else:
        order_clause = "rating DESC NULLS LAST, brand, name"
    statement = f"""
        SELECT {select_fields}
        FROM fragrances
        {where_clause}
        ORDER BY {order_clause}
        LIMIT %s
    """
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(
            statement, select_values + where_values + order_values + [limit]
        )
        return list(cursor.fetchall())


def get_by_slug(slug: str) -> dict[str, Any] | None:
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(f"SELECT {FIELDS} FROM fragrances WHERE slug = %s", (slug,))
        return cursor.fetchone()


def list_relationships(
    fragrance_id: Any,
) -> tuple[list[RelatedFragrance], list[RelatedFragrance], list[RelatedFragrance]]:
    """Split curated relationships for a fragrance into (dupes of it,
    fragrances it dupes, flankers either way)."""
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(
            f"""
            SELECT {PREFIXED_FIELDS}, fr.relation, fr.confidence, fr.source,
                   fr.related_id = %(id)s AS points_here
            FROM fragrance_relationships fr
            JOIN fragrances f ON f.id = CASE
                WHEN fr.related_id = %(id)s THEN fr.fragrance_id
                ELSE fr.related_id
            END
            WHERE fr.related_id = %(id)s OR fr.fragrance_id = %(id)s
            ORDER BY fr.confidence DESC
            """,
            {"id": fragrance_id},
        )
        rows = list(cursor.fetchall())

    dupes: list[RelatedFragrance] = []
    original_of: list[RelatedFragrance] = []
    flankers: list[RelatedFragrance] = []
    for row in rows:
        points_here = row.pop("points_here")
        related = RelatedFragrance(
            fragrance=Fragrance.model_validate(row),
            relation=row["relation"],
            confidence=row["confidence"],
            source=row["source"],
        )
        if related.relation == "flanker_of":
            flankers.append(related)
        elif points_here:
            dupes.append(related)
        else:
            original_of.append(related)
    return dupes, original_of, flankers


def list_similar(
    fragrance_id: Any, exclude_ids: set[Any], limit: int = 5
) -> list[Fragrance]:
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(
            "SELECT document_embedding FROM fragrances WHERE id = %s",
            (fragrance_id,),
        )
        row = cursor.fetchone()
        if row is None or row["document_embedding"] is None:
            return []
        vector = str(row["document_embedding"])
        cursor.execute(
            f"""
            SELECT {FIELDS},
                   1 - (document_embedding <=> %s::vector) AS semantic_similarity
            FROM fragrances
            WHERE id <> %s AND document_embedding IS NOT NULL
            ORDER BY document_embedding <=> %s::vector
            LIMIT %s
            """,
            (vector, fragrance_id, vector, limit + len(exclude_ids)),
        )
        rows = list(cursor.fetchall())
    return [
        Fragrance.model_validate(item)
        for item in rows
        if item["id"] not in exclude_ids
    ][:limit]


def fallback_recommendation(candidates: list[dict[str, Any]]) -> RecommendationResponse:
    recommendation = Fragrance.model_validate(candidates[0])
    alternatives = [Fragrance.model_validate(candidate) for candidate in candidates[1:]]
    note_list = ", ".join(recommendation.notes[:3]) or "available"
    return RecommendationResponse(
        recommendation=recommendation,
        alternatives=alternatives,
        matches=[
            MatchResult(
                fragrance=Fragrance.model_validate(candidate),
                score=max(40, 60 - index * 5),
                reasons=["ordered by available catalog relevance"],
                cautions=["Qwen agent was unavailable"],
            )
            for index, candidate in enumerate(candidates)
        ],
        explanation=(
            f"{recommendation.brand} {recommendation.name} is the strongest available catalog match "
            f"based on its {note_list} profile and recorded use cases."
        ),
        generated_by="catalog_fallback",
    )


async def agent_embedding(text: str) -> list[float] | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{settings.agent_url}/v1/embeddings",
                json={"texts": [text]},
            )
            response.raise_for_status()
        embeddings = response.json().get("embeddings", [])
        return embeddings[0] if embeddings else None
    except (httpx.HTTPError, IndexError, TypeError, ValueError):
        return None


def fragrance_document(record: dict[str, Any]) -> str:
    return " | ".join(
        part
        for part in (
            f"{record['brand']} {record['name']}",
            record["description"],
            f"notes: {', '.join(record['notes'])}" if record["notes"] else "",
            f"occasions: {', '.join(record['occasions'])}"
            if record["occasions"]
            else "",
            f"climates: {', '.join(record['climates'])}" if record["climates"] else "",
        )
        if part
    )


def profile_query_text(payload: RecommendationRequest) -> str | None:
    if payload.free_text:
        return payload.free_text
    parts = [
        f"notes: {', '.join(payload.preferred_notes)}" if payload.preferred_notes else "",
        f"families: {', '.join(payload.preferred_families)}"
        if payload.preferred_families
        else "",
        f"occasion: {payload.occasion}" if payload.occasion else "",
        f"climate: {payload.climate}" if payload.climate else "",
    ]
    text = " | ".join(part for part in parts if part)
    return text or None


def parse_vector(value: Any) -> list[float] | None:
    if isinstance(value, (list, tuple)):
        return [float(item) for item in value]
    if isinstance(value, str) and value.startswith("["):
        try:
            return [float(item) for item in value.strip("[]").split(",") if item]
        except ValueError:
            return None
    return None


def resolve_reference(name: str) -> dict[str, Any] | None:
    pattern = f"%{name.strip()}%"
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(
            f"""
            SELECT {FIELDS}, document_embedding
            FROM fragrances
            WHERE (brand || ' ' || name) ILIKE %s OR name ILIKE %s OR brand ILIKE %s
            ORDER BY rating DESC NULLS LAST
            LIMIT 1
            """,
            (pattern, pattern, pattern),
        )
        return cursor.fetchone()


def combine_query_vectors(
    text_vector: list[float] | None,
    liked_vectors: list[list[float]],
    disliked_vectors: list[list[float]],
) -> list[float] | None:
    """Rocchio-style relevance feedback: pull the query toward liked anchors
    and away from disliked ones in embedding space."""

    def centroid(vectors: list[list[float]]) -> list[float] | None:
        if not vectors:
            return None
        return [sum(items) / len(vectors) for items in zip(*vectors, strict=True)]

    liked = centroid(liked_vectors)
    disliked = centroid(disliked_vectors)
    base = text_vector or liked
    if base is None:
        return None
    combined = list(base)
    if liked is not None and text_vector is not None:
        combined = [value + 0.8 * like for value, like in zip(combined, liked, strict=True)]
    if disliked is not None:
        combined = [
            value - 0.5 * dislike
            for value, dislike in zip(combined, disliked, strict=True)
        ]
    return combined


async def request_recommendation(
    payload: RecommendationRequest,
) -> RecommendationResponse:
    query_text = profile_query_text(payload)
    text_embedding = await agent_embedding(query_text) if query_text else None

    liked_records = [
        record
        for record in (resolve_reference(name) for name in payload.reference_likes)
        if record
    ]
    disliked_records = [
        record
        for record in (resolve_reference(name) for name in payload.reference_dislikes)
        if record
    ]
    embedding = combine_query_vectors(
        text_embedding,
        [
            vector
            for vector in (
                parse_vector(record.get("document_embedding"))
                for record in liked_records
            )
            if vector
        ],
        [
            vector
            for vector in (
                parse_vector(record.get("document_embedding"))
                for record in disliked_records
            )
            if vector
        ],
    )

    max_price = (
        int(payload.budget_idr * 1.15) if payload.budget_idr is not None else None
    )
    candidates = list_catalog(
        query_embedding=embedding,
        max_price_idr=max_price,
        avoid_notes=payload.avoid_notes,
        limit=30,
    )
    if payload.preferred_notes:
        preferred = {note.lower() for note in payload.preferred_notes}
        candidates.sort(
            key=lambda item: len(preferred.intersection(item["notes"])), reverse=True
        )
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No catalog fragrance passes the requested filters",
        )

    def serialize_reference(record: dict[str, Any]) -> dict[str, Any]:
        trimmed = {key: value for key, value in record.items() if key != "document_embedding"}
        return Fragrance.model_validate(trimmed).model_dump(mode="json")

    try:
        serialized_candidates = [
            Fragrance.model_validate(candidate).model_dump(mode="json")
            for candidate in candidates
        ]
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f"{settings.agent_url}/v1/recommend",
                json={
                    "profile": payload.model_dump(mode="json"),
                    "candidates": serialized_candidates,
                    "liked_references": [
                        serialize_reference(record) for record in liked_records
                    ],
                    "disliked_references": [
                        serialize_reference(record) for record in disliked_records
                    ],
                },
            )
            response.raise_for_status()
        return RecommendationResponse.model_validate(response.json())
    except (httpx.HTTPError, TypeError, ValueError):
        return fallback_recommendation(candidates[: payload.limit])


@app.get("/health")
def health() -> dict[str, str]:
    with pool.connection() as connection, connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return {"status": "ok", "service": "backend"}


@app.get("/v1/fragrances", response_model=FragranceList)
def search_fragrances(
    q: str | None = Query(default=None, min_length=1, max_length=100),
    note: str | None = Query(default=None, min_length=1, max_length=50),
    occasion: str | None = Query(default=None, min_length=1, max_length=50),
    max_price_idr: int | None = Query(default=None, ge=0),
    limit: int = Query(default=12, ge=1, le=50),
) -> FragranceList:
    return FragranceList(
        items=list_catalog(
            query=q,
            note=note,
            occasion=occasion,
            max_price_idr=max_price_idr,
            limit=limit,
        )
    )


@app.get("/v1/fragrances/{slug}", response_model=Fragrance)
def get_fragrance(slug: str) -> dict[str, Any]:
    fragrance = get_by_slug(slug)
    if fragrance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fragrance not found"
        )
    return fragrance


@app.get("/v1/fragrances/{slug}/dupes", response_model=DupeResponse)
async def get_fragrance_dupes(
    slug: str,
    explain: bool = Query(default=False),
) -> DupeResponse:
    record = get_by_slug(slug)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fragrance not found"
        )
    dupes, original_of, flankers = list_relationships(record["id"])
    related_ids = {
        item.fragrance.id for item in (*dupes, *original_of, *flankers)
    }
    similar = list_similar(record["id"], related_ids | {record["id"]})

    explanation: str | None = None
    generated_by = None
    if explain:
        payload = {
            "fragrance": Fragrance.model_validate(record).model_dump(mode="json"),
            "dupes": [item.model_dump(mode="json") for item in dupes],
            "original_of": [item.model_dump(mode="json") for item in original_of],
            "flankers": [item.model_dump(mode="json") for item in flankers],
            "similar": [item.model_dump(mode="json") for item in similar],
        }
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    f"{settings.agent_url}/v1/dupes/explain", json=payload
                )
                response.raise_for_status()
            parsed = response.json()
            explanation = parsed["explanation"]
            generated_by = parsed["generated_by"]
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            explanation = None
            generated_by = None

    return DupeResponse(
        fragrance=Fragrance.model_validate(record),
        dupes=dupes,
        original_of=original_of,
        flankers=flankers,
        similar=similar,
        explanation=explanation,
        generated_by=generated_by,
        disclaimer=DUPE_DISCLAIMER,
    )


@app.post("/v1/recommendations", response_model=RecommendationResponse)
async def recommend(payload: RecommendationRequest) -> RecommendationResponse:
    return await request_recommendation(payload)


@app.post(
    "/v1/recommendations/from-text",
    response_model=TextRecommendationResponse,
)
async def recommend_from_text(
    payload: TextRecommendationRequest,
) -> TextRecommendationResponse:
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f"{settings.agent_url}/v1/preferences/parse",
                json=payload.model_dump(mode="json"),
            )
            response.raise_for_status()
        parsed = response.json()
        profile = RecommendationRequest.model_validate(parsed["profile"])
        profile_generated_by = parsed["generated_by"]
    except (httpx.HTTPError, TypeError, ValueError):
        profile = RecommendationRequest(free_text=payload.text, limit=payload.limit)
        profile_generated_by = "catalog_fallback"

    recommendation = await request_recommendation(profile)
    return TextRecommendationResponse(
        **recommendation.model_dump(),
        profile=profile,
        profile_generated_by=profile_generated_by,
    )


@app.post("/internal/fragrances", response_model=Fragrance)
def upsert_fragrance(
    payload: InternalFragranceUpsert,
    x_service_key: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    if not x_service_key or not secrets.compare_digest(
        x_service_key, settings.service_shared_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key"
        )

    values = payload.model_dump()
    statement = f"""
        INSERT INTO fragrances (
            slug, brand, name, description, gender, release_year, notes, occasions, climates,
            price_idr, rating, longevity_score, projection_score, source_url, source_type
        ) VALUES (
            %(slug)s, %(brand)s, %(name)s, %(description)s, %(gender)s, %(release_year)s,
            %(notes)s, %(occasions)s, %(climates)s, %(price_idr)s, %(rating)s,
            %(longevity_score)s, %(projection_score)s, %(source_url)s, %(source_type)s
        )
        ON CONFLICT (slug) DO UPDATE SET
            brand = EXCLUDED.brand,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            gender = EXCLUDED.gender,
            release_year = EXCLUDED.release_year,
            notes = EXCLUDED.notes,
            occasions = EXCLUDED.occasions,
            climates = EXCLUDED.climates,
            price_idr = EXCLUDED.price_idr,
            rating = EXCLUDED.rating,
            longevity_score = EXCLUDED.longevity_score,
            projection_score = EXCLUDED.projection_score,
            source_url = EXCLUDED.source_url,
            source_type = EXCLUDED.source_type,
            document_embedding = CASE
                WHEN fragrances.brand IS DISTINCT FROM EXCLUDED.brand
                    OR fragrances.name IS DISTINCT FROM EXCLUDED.name
                    OR fragrances.description IS DISTINCT FROM EXCLUDED.description
                    OR fragrances.notes IS DISTINCT FROM EXCLUDED.notes
                    OR fragrances.occasions IS DISTINCT FROM EXCLUDED.occasions
                    OR fragrances.climates IS DISTINCT FROM EXCLUDED.climates
                THEN NULL
                ELSE fragrances.document_embedding
            END,
            updated_at = now()
        RETURNING {FIELDS}
    """
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(statement, values)
        record = cursor.fetchone()
        connection.commit()
    return record


@app.get("/internal/fragrances")
def list_fragrances_internal(
    x_service_key: Annotated[str | None, Header()] = None,
    missing_notes: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    if not x_service_key or not secrets.compare_digest(
        x_service_key, settings.service_shared_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid service key"
        )

    where = "WHERE notes = '{}'" if missing_notes else ""
    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(f"SELECT count(*) AS total FROM fragrances {where}")
        total = cursor.fetchone()["total"]
        cursor.execute(
            f"""
            SELECT {FIELDS}
            FROM fragrances {where}
            ORDER BY slug
            LIMIT %s OFFSET %s
            """,
            (limit, offset),
        )
        items = list(cursor.fetchall())
    return {"total": total, "items": items}


@app.post("/internal/embeddings/rebuild")
async def rebuild_embeddings(
    x_service_key: Annotated[str | None, Header()] = None,
    limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, int]:
    if not x_service_key or not secrets.compare_digest(
        x_service_key, settings.service_shared_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service key",
        )

    with (
        pool.connection() as connection,
        connection.cursor(row_factory=dict_row) as cursor,
    ):
        cursor.execute(
            f"""
            SELECT {FIELDS}
            FROM fragrances
            WHERE document_embedding IS NULL
            ORDER BY updated_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        records = list(cursor.fetchall())

    updated = 0
    async with httpx.AsyncClient(timeout=45) as client:
        for offset in range(0, len(records), 10):
            batch = records[offset : offset + 10]
            try:
                response = await client.post(
                    f"{settings.agent_url}/v1/embeddings",
                    json={"texts": [fragrance_document(record) for record in batch]},
                )
                response.raise_for_status()
                embeddings = response.json()["embeddings"]
            except (httpx.HTTPError, KeyError, TypeError, ValueError):
                break

            with pool.connection() as connection, connection.cursor() as cursor:
                for record, embedding in zip(batch, embeddings, strict=True):
                    vector = "[" + ",".join(f"{value:.8g}" for value in embedding) + "]"
                    cursor.execute(
                        "UPDATE fragrances SET document_embedding = %s::vector WHERE id = %s",
                        (vector, record["id"]),
                    )
                    updated += 1
                connection.commit()
    return {"selected": len(records), "updated": updated}
