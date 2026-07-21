import json
import logging
import re
from collections.abc import Iterator
from hashlib import sha256
from threading import Lock
from time import monotonic

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from openai import APIError, OpenAI
from pydantic import ValidationError

from . import profile as profiling
from . import reranker, scoring, taxonomy
from .config import settings
from .usage import model_usage, redis_client
from .models import (
    CompareRequest,
    CompareResponse,
    DupeExplainRequest,
    DupeExplainResponse,
    EmbeddingRequest,
    EmbeddingResponse,
    ExplainRequest,
    MatchResult,
    NoteProfileRequest,
    NoteProfileResponse,
    PreferenceExtractionRequest,
    PreferenceExtractionResponse,
    RankRequest,
    RankResponse,
    RecommendationProfile,
    RecommendationRequest,
    RecommendationResponse,
    RelatedCandidate,
    ScentProfile,
)
from .prompts import (
    DUPE_SYSTEM_PROMPT,
    NOTE_PROFILE_SYSTEM_PROMPT,
    PROFILE_SYSTEM_PROMPT,
    RECOMMENDATION_SYSTEM_PROMPT,
)


logger = logging.getLogger(__name__)
app = FastAPI(title="Notemae Qwen Agent API", version="0.3.0")

NOTE_VOCABULARY = {
    "amber",
    "bergamot",
    "cedar",
    "citrus",
    "coffee",
    "iris",
    "jasmine",
    "lavender",
    "leather",
    "musk",
    "neroli",
    "oud",
    "patchouli",
    "rose",
    "sandalwood",
    "tobacco",
    "vanilla",
    "vetiver",
}


# Successful, deterministic-from-input model responses are safe to reuse for
# a short period. This is process-local by design: no user prompt leaves the
# service process, and a cache miss only affects cost, never correctness.
_model_cache: dict[str, tuple[float, str]] = {}
_model_cache_lock = Lock()


def _cache_key(
    kind: str, instructions: str, context: object, *, model: str | None = None
) -> str:
    return json.dumps(
        {
            "kind": kind,
            "model": model or settings.qwen_model,
            "instructions": instructions,
            "context": context,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )


def _cache_get(key: str) -> str | None:
    if not settings.model_cache_ttl_seconds or not settings.model_cache_max_entries:
        return None
    if settings.redis_url:
        try:
            client = redis_client(settings.redis_url)
            if client is not None:
                cached = client.get(
                    f"{settings.redis_key_prefix}:model-cache:{sha256(key.encode()).hexdigest()}"
                )
                if cached is not None:
                    return cached
        except Exception as error:  # Local cache preserves availability.
            logger.warning("Redis model cache unavailable; using local cache: %s", error)
            model_usage.note_redis_error()
    with _model_cache_lock:
        entry = _model_cache.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if monotonic() >= expires_at:
            _model_cache.pop(key, None)
            return None
        return value


def _cache_put(key: str, value: str) -> None:
    if not settings.model_cache_ttl_seconds or not settings.model_cache_max_entries:
        return
    if settings.redis_url:
        try:
            client = redis_client(settings.redis_url)
            if client is not None:
                client.setex(
                    f"{settings.redis_key_prefix}:model-cache:{sha256(key.encode()).hexdigest()}",
                    settings.model_cache_ttl_seconds,
                    value,
                )
        except Exception as error:  # Local cache preserves availability.
            logger.warning("Redis model cache unavailable; using local cache: %s", error)
            model_usage.note_redis_error()
    with _model_cache_lock:
        while len(_model_cache) >= settings.model_cache_max_entries:
            _model_cache.pop(next(iter(_model_cache)))
        _model_cache[key] = (monotonic() + settings.model_cache_ttl_seconds, value)


def qwen_client() -> OpenAI | None:
    if not settings.dashscope_api_key:
        return None
    return OpenAI(
        api_key=settings.dashscope_api_key,
        base_url=settings.qwen_base_url,
        timeout=45,
        max_retries=2,
    )


USD_TO_IDR = 17800  # keep in sync with USD_TO_IDR in fe/app.js


def _usd_view(value):
    """Recursively rename ``*_idr`` keys to ``*_usd`` and convert the amount.

    Prices/budgets are stored in IDR (the catalog is the source of truth). The
    demo presents money in USD, so everything the language model is shown is
    converted first — the model is grounded on the numbers it receives rather
    than asked to convert currencies itself.
    """
    if isinstance(value, dict):
        converted = {}
        for key, item in value.items():
            if key.endswith("_idr"):
                converted[key[:-4] + "_usd"] = (
                    None if item is None else round(item / USD_TO_IDR)
                )
            else:
                converted[key] = _usd_view(item)
        return converted
    if isinstance(value, list):
        return [_usd_view(item) for item in value]
    return value


def ask_qwen(instructions: str, context: dict[str, object]) -> str | None:
    cache_key = _cache_key("generation", instructions, context)
    if cached := _cache_get(cache_key):
        model_usage.cache_hit("generation")
        return cached
    client = qwen_client()
    if client is None:
        return None
    if not model_usage.reserve(
        "generation", settings.qwen_max_calls_per_hour, settings.redis_url, settings.redis_key_prefix
    ):
        logger.warning("Qwen generation skipped: hourly model-call budget exhausted")
        return None
    try:
        completion = client.chat.completions.create(
            model=settings.qwen_model,
            messages=[
                {"role": "system", "content": instructions},
                {
                    "role": "user",
                    "content": json.dumps(_usd_view(context), ensure_ascii=False),
                },
            ],
            extra_body=settings.thinking_extra_body,
            max_tokens=settings.qwen_max_output_tokens,
        )
        model_usage.success(completion)
        content = completion.choices[0].message.content.strip() or None
        if content:
            _cache_put(cache_key, content)
        return content
    except (APIError, AttributeError, IndexError, TypeError) as error:
        model_usage.failure("generation")
        logger.warning("Qwen generation failed: %s", error)
        return None


def stream_qwen(
    instructions: str, context: dict[str, object], *, thinking: bool = False
) -> Iterator[str]:
    """Yield answer deltas as they arrive.

    Thinking is off by default: reasoning tokens are never shown to the user,
    so with it on the stream stalls for the whole thinking budget before the
    first visible character — which is exactly what streaming exists to avoid.
    The explanation is a summary of JSON the caller already supplied, so there
    is little for the model to reason about.

    Raises ``RuntimeError`` when no token was ever produced so the caller can
    fall back to the deterministic catalog sentence instead of showing an
    empty explanation.
    """
    client = qwen_client()
    if client is None:
        raise RuntimeError("qwen not configured")
    if not model_usage.reserve(
        "stream", settings.qwen_max_calls_per_hour, settings.redis_url, settings.redis_key_prefix
    ):
        raise RuntimeError("Qwen hourly model-call budget exhausted")
    produced = False
    last_chunk = None
    try:
        stream = client.chat.completions.create(
            model=settings.qwen_model,
            messages=[
                {"role": "system", "content": instructions},
                {
                    "role": "user",
                    "content": json.dumps(_usd_view(context), ensure_ascii=False),
                },
            ],
            extra_body=(
                settings.thinking_extra_body if thinking else settings.streaming_extra_body
            ),
            max_tokens=settings.qwen_max_output_tokens,
            stream=True,
        )
        for chunk in stream:
            last_chunk = chunk
            if not chunk.choices:
                continue
            delta = getattr(chunk.choices[0].delta, "content", None)
            if delta:
                produced = True
                yield delta
        if last_chunk is not None:
            model_usage.success(last_chunk)
    except (APIError, AttributeError, IndexError, TypeError) as error:
        model_usage.failure("stream")
        logger.warning("Qwen streaming failed: %s", error)
        if not produced:
            raise RuntimeError("qwen stream failed") from error
        return
    if not produced:
        raise RuntimeError("qwen stream produced nothing")


def parse_budget(text: str) -> int | None:
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)", text.lower())
    if not match:
        return None
    value = float(match.group(1).replace(",", "."))
    multiplier = 1_000_000 if match.group(2) in {"juta", "jt"} else 1_000
    return int(value * multiplier)


def fallback_profile(payload: PreferenceExtractionRequest) -> RecommendationProfile:
    text = payload.text.lower()
    occasion_aliases = {
        "office": ("office", "kantor", "kerja"),
        "interview": ("interview", "wawancara"),
        "date": ("date", "kencan"),
        "gym": ("gym", "olahraga"),
        "party": ("party", "pesta"),
        "wedding": ("wedding", "nikah", "pernikahan"),
    }
    occasion = next(
        (
            canonical
            for canonical, aliases in occasion_aliases.items()
            if any(alias in text for alias in aliases)
        ),
        None,
    )
    gender = None
    if re.search(r"\b(wanita|perempuan|female|woman)\b", text):
        gender = "women"
    elif re.search(r"\b(pria|laki-laki|male|man)\b", text):
        gender = "men"
    avoid_notes: list[str] = []
    if any(
        phrase in text for phrase in ("tidak suka manis", "hindari manis", "not sweet")
    ):
        avoid_notes.append("sweet")
    preferred_notes: list[str] = []
    for note in sorted(NOTE_VOCABULARY):
        if note not in text:
            continue
        avoided_pattern = (
            rf"(?:tidak suka|hindari|jangan ada|avoid|no)\s+(?:aroma\s+)?{note}\b"
        )
        if re.search(avoided_pattern, text):
            avoid_notes.append(note)
        else:
            preferred_notes.append(note)
    climate = (
        "tropical"
        if any(
            place in text
            for place in (
                "indonesia",
                "surabaya",
                "jakarta",
                "bali",
                "tropis",
                "tropical",
            )
        )
        else None
    )
    return RecommendationProfile(
        budget_idr=parse_budget(text),
        occasion=occasion,
        climate=climate,
        gender=gender,
        preferred_notes=preferred_notes,
        avoid_notes=avoid_notes,
        reference_likes=extract_reference_likes(payload.text),
        free_text=payload.text,
        limit=payload.limit,
    )


REFERENCE_LIKE_PATTERN = re.compile(
    r"(?:seperti|mirip|kayak|biasa pakai|suka pakai|like|similar to)\s+"
    r"([^,.;!?\n]{3,60})",
    re.IGNORECASE,
)


REFERENCE_STOP_WORDS = (
    " untuk ",
    " buat ",
    " yang ",
    " dengan ",
    " karena ",
    " for ",
    " that ",
    " because ",
)


def extract_reference_likes(text: str) -> list[str]:
    references: list[str] = []
    for raw in REFERENCE_LIKE_PATTERN.findall(text):
        name = f" {raw} "
        for stop_word in REFERENCE_STOP_WORDS:
            name = name.split(stop_word, 1)[0] + " "
        name = " ".join(name.split()[:6]).strip("-' ")
        if any(letter.isupper() for letter in name) and name not in references:
            references.append(name)
    return references[:5]


def extract_profile_with_qwen(
    payload: PreferenceExtractionRequest,
) -> RecommendationProfile | None:
    cache_key = _cache_key(
        "profile",
        PROFILE_SYSTEM_PROMPT,
        payload.model_dump(),
        model=settings.qwen_profile_model or settings.qwen_model,
    )
    if cached := _cache_get(cache_key):
        try:
            model_usage.cache_hit("profile")
            return RecommendationProfile.model_validate_json(cached)
        except ValidationError:
            # A malformed old cache entry must not prevent a fresh parse.
            pass
    client = qwen_client()
    if client is None:
        return None
    if not model_usage.reserve(
        "profile", settings.qwen_max_calls_per_hour, settings.redis_url, settings.redis_key_prefix
    ):
        logger.warning("Qwen profile parse skipped: hourly model-call budget exhausted")
        return None
    try:
        completion = client.chat.completions.create(
            model=settings.qwen_profile_model or settings.qwen_model,
            messages=[
                {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(payload.model_dump(), ensure_ascii=False),
                },
            ],
            response_format={"type": "json_object"},
            extra_body=settings.structured_extra_body,
            max_tokens=settings.qwen_max_output_tokens,
        )
        model_usage.success(completion)
        content = completion.choices[0].message.content
        profile = RecommendationProfile.model_validate_json(content)
        profile.free_text = payload.text
        profile.limit = payload.limit
        _cache_put(cache_key, profile.model_dump_json())
        return profile
    except (APIError, AttributeError, IndexError, TypeError, ValidationError) as error:
        model_usage.failure("profile")
        logger.warning("Qwen preference extraction failed: %s", error)
        return None


def rank_candidates(
    request: RecommendationRequest, *, rerank: bool = True
) -> list[MatchResult]:
    survivors, rejected = scoring.score_pool(
        request.profile,
        request.candidates,
        request.liked_references,
        request.disliked_references,
    )
    if rerank:
        survivors = reranker.consensus_rerank(
            qwen_client(), request.profile, survivors
        )
    matches = scoring.select_top(request.profile, survivors, rejected)
    if matches:
        return matches
    # every candidate was an already-owned anchor; recommend from them anyway
    fallback = [
        scoring.score_candidate(
            candidate,
            request.profile,
            request.liked_references,
            request.disliked_references,
        )
        for candidate in request.candidates
    ]
    return sorted(fallback, key=lambda match: match.score, reverse=True)[
        : request.profile.limit
    ]


# Appended to a streamed explanation that came from the deterministic
# fallback rather than the model. U+241E ("symbol for record separator")
# never appears in generated prose, so the caller can split it off safely.
FALLBACK_SENTINEL = "␞catalog_fallback"


def catalog_explanation(match: MatchResult) -> str:
    reasons = ", ".join(match.reasons) or "the available catalog fields"
    caution = f" Caveat: {'; '.join(match.cautions)}." if match.cautions else ""
    return (
        f"{match.fragrance.brand} {match.fragrance.name} scores {match.score}% based on {reasons}."
        f"{caution} This result uses only supplied catalog data."
    )


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "service": "agent",
        "provider": "qwen",
        "configured": bool(settings.dashscope_api_key),
    }


@app.get("/v1/metrics/model")
def model_metrics() -> dict[str, object]:
    """Aggregate model-credit telemetry, with no prompts or user data."""
    return model_usage.snapshot(
        settings.qwen_max_calls_per_hour, redis_enabled=bool(settings.redis_url)
    )


@app.post("/v1/preferences/parse", response_model=PreferenceExtractionResponse)
def parse_preferences(
    payload: PreferenceExtractionRequest,
    fast: bool = Query(
        default=False,
        description="Skip the model and return the heuristic profile only. "
        "Lets a caller show provisional matches while the real parse runs.",
    ),
) -> PreferenceExtractionResponse:
    if fast:
        return PreferenceExtractionResponse(
            profile=fallback_profile(payload), generated_by="catalog_fallback"
        )
    profile = extract_profile_with_qwen(payload)
    return PreferenceExtractionResponse(
        profile=profile or fallback_profile(payload),
        generated_by="qwen" if profile else "catalog_fallback",
    )


@app.get("/v1/notes")
def notes() -> dict[str, object]:
    """The note vocabulary the picker offers.

    Each entry carries the family, character traits and close substitutes that
    scoring actually uses, so the interface and the engine cannot drift apart.
    """
    return {"items": taxonomy.note_database()}


@app.post("/v1/notes/profile", response_model=NoteProfileResponse)
def note_profile(payload: NoteProfileRequest) -> NoteProfileResponse:
    """Turn picked notes into a scent profile, then narrate it.

    The profile itself is computed deterministically; the model only phrases
    it and asks a follow-up question, so an unavailable model costs the user
    the prose but never the profile.
    """
    scent = profiling.build_scent_profile(payload.notes)
    avoided = (
        profiling.build_scent_profile(payload.avoid_notes)
        if payload.avoid_notes
        else None
    )
    narrative = ask_qwen(
        NOTE_PROFILE_SYSTEM_PROMPT,
        {
            "scent_profile": scent.model_dump(),
            "avoided_profile": avoided.model_dump() if avoided else None,
        },
    )
    return NoteProfileResponse(
        profile=scent,
        avoided=avoided,
        narrative=narrative or profile_fallback_narrative(scent),
        generated_by="qwen" if narrative else "catalog_fallback",
    )


def profile_fallback_narrative(scent: ScentProfile) -> str:
    """Deterministic stand-in for the model's phrasing of a scent profile."""
    if not scent.notes or scent.summary.startswith("no recognizable"):
        return "None of those notes are in the catalog vocabulary yet."
    picked = ", ".join(note.name for note in scent.notes if note.known)
    corrected = (
        " Read "
        + ", ".join(f"{typed} as {fixed}" for typed, fixed in scent.corrections.items())
        + "."
        if scent.corrections
        else ""
    )
    return (
        f"Your picks ({picked}) read as {scent.summary}.{corrected} "
        "Tell us the occasion or budget to narrow this down."
    )


def match_payload(match: MatchResult) -> dict[str, object]:
    """Serialize a match with the pyramid in the shape the prompts describe.

    The three tier columns are folded into one ``note_pyramid`` object, or
    null when the catalog never stated one. Leaving the raw columns in as
    well would offer the model two representations of the same fact and
    three empty lists to mistake for "this perfume has no base notes".
    """
    payload = match.model_dump(mode="json")
    fragrance = payload["fragrance"]
    fragrance["note_pyramid"] = taxonomy.stated_pyramid(
        fragrance.pop("top_notes", None),
        fragrance.pop("heart_notes", None),
        fragrance.pop("base_notes", None),
    )
    return payload


def explanation_context(
    profile: RecommendationProfile,
    selected: MatchResult,
    alternatives: list[MatchResult],
) -> dict[str, object]:
    context: dict[str, object] = {
        "profile": profile.model_dump(),
        "recommendation": match_payload(selected),
        "alternatives": [match_payload(match) for match in alternatives],
    }
    if profile.preferred_notes:
        # the same profile the user was shown after picking notes, so the
        # narrative reasons about character instead of re-listing raw notes
        context["scent_profile"] = profiling.build_scent_profile(
            profile.preferred_notes
        ).model_dump()
    return context


@app.post("/v1/recommend/rank", response_model=RankResponse)
def recommend_rank(payload: RankRequest) -> RankResponse:
    """Ranking without the narrative pass.

    With ``rerank=false`` this is pure deterministic scoring — no network call
    to the model provider — so the caller can show matches in milliseconds and
    fetch the prose separately.
    """
    matches = rank_candidates(payload, rerank=payload.rerank)
    return RankResponse(matches=matches, reranked=payload.rerank)


@app.post("/v1/recommend/explain")
def recommend_explain(payload: ExplainRequest) -> StreamingResponse:
    """Stream the recommendation narrative as plain-text deltas.

    Falls back to the deterministic catalog sentence when the model is
    unavailable, so the response body is never empty. The ``X-Generated-By``
    header cannot be used (it would have to be set before the first token), so
    a fallback is signalled by the trailing sentinel line instead.
    """

    def body() -> Iterator[str]:
        try:
            yield from stream_qwen(
                RECOMMENDATION_SYSTEM_PROMPT,
                explanation_context(
                    payload.profile, payload.recommendation, payload.alternatives
                ),
            )
        except RuntimeError:
            yield catalog_explanation(payload.recommendation)
            yield FALLBACK_SENTINEL

    return StreamingResponse(
        body(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.post("/v1/recommend", response_model=RecommendationResponse)
def recommend(payload: RecommendationRequest) -> RecommendationResponse:
    matches = rank_candidates(payload)
    selected = matches[0]
    explanation = ask_qwen(
        RECOMMENDATION_SYSTEM_PROMPT,
        explanation_context(payload.profile, selected, matches[1:]),
    )
    return RecommendationResponse(
        recommendation=selected.fragrance,
        alternatives=[match.fragrance for match in matches[1:]],
        matches=matches,
        explanation=explanation or catalog_explanation(selected),
        generated_by="qwen" if explanation else "catalog_fallback",
    )


@app.post("/v1/compare", response_model=CompareResponse)
def compare(payload: CompareRequest) -> CompareResponse:
    fallback = (
        f"{payload.left.brand} {payload.left.name} lists "
        f"{', '.join(payload.left.notes[:4]) or 'no notes'}, while "
        f"{payload.right.brand} {payload.right.name} lists "
        f"{', '.join(payload.right.notes[:4]) or 'no notes'}."
    )
    explanation = ask_qwen(
        "Compare the two supplied fragrance records in clear, standard English. All prices in the "
        "JSON are in USD. Use only JSON facts, state missing evidence, and do not introduce other products.",
        {
            "context": payload.context,
            "left": payload.left.model_dump(mode="json"),
            "right": payload.right.model_dump(mode="json"),
        },
    )
    return CompareResponse(
        explanation=explanation or fallback,
        generated_by="qwen" if explanation else "catalog_fallback",
    )


def relation_phrase(related: RelatedCandidate) -> str:
    label = {
        "clone_of": "a clone of",
        "inspired_by": "inspired by",
        "flanker_of": "a flanker of",
    }[related.relation]
    if related.relation == "flanker_of":
        return f"{label} {related.fragrance.brand} {related.fragrance.name}"
    if related.confidence >= 0.8:
        return (
            f"widely known as {label} "
            f"{related.fragrance.brand} {related.fragrance.name}"
        )
    if related.confidence >= 0.6:
        return (
            f"often compared to "
            f"{related.fragrance.brand} {related.fragrance.name}"
        )
    return (
        f"sometimes described as similar to {related.fragrance.brand} "
        f"{related.fragrance.name}, but the consensus is limited"
    )


def fallback_dupe_explanation(payload: DupeExplainRequest) -> str:
    target = f"{payload.fragrance.brand} {payload.fragrance.name}"
    sentences: list[str] = []
    if payload.original_of:
        phrases = "; ".join(relation_phrase(item) for item in payload.original_of)
        sentences.append(f"{target} {phrases}.")
    if payload.dupes:
        names = ", ".join(
            f"{item.fragrance.brand} {item.fragrance.name}" for item in payload.dupes
        )
        sentences.append(
            f"Community-curated alternatives for {target}: {names}."
        )
    if payload.flankers:
        names = ", ".join(
            f"{item.fragrance.brand} {item.fragrance.name}"
            for item in payload.flankers
        )
        sentences.append(f"Same fragrance family (flankers): {names}.")
    if payload.similar:
        names = ", ".join(
            f"{item.brand} {item.name}" for item in payload.similar[:3]
        )
        sentences.append(
            f"Similar note profile (not a dupe claim): {names}."
        )
    if not sentences:
        sentences.append(
            f"No curated dupe relationships for {target} in the catalog yet."
        )
    sentences.append(
        "These relationships come from community-consensus curation, not official brand statements."
    )
    return " ".join(sentences)


@app.post("/v1/dupes/explain", response_model=DupeExplainResponse)
def explain_dupes(payload: DupeExplainRequest) -> DupeExplainResponse:
    explanation = ask_qwen(
        DUPE_SYSTEM_PROMPT,
        payload.model_dump(mode="json"),
    )
    return DupeExplainResponse(
        explanation=explanation or fallback_dupe_explanation(payload),
        generated_by="qwen" if explanation else "catalog_fallback",
    )


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
def create_embeddings(payload: EmbeddingRequest) -> EmbeddingResponse:
    client = qwen_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Qwen is not configured",
        )
    if not model_usage.reserve(
        "embedding", settings.qwen_max_calls_per_hour, settings.redis_url, settings.redis_key_prefix
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Hourly model-call budget exhausted",
        )
    try:
        response = client.embeddings.create(
            model=settings.qwen_embed_model,
            input=payload.texts,
            dimensions=settings.qwen_embedding_dimensions,
            encoding_format="float",
        )
    except APIError as error:
        model_usage.failure("embedding")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Qwen embedding request failed",
        ) from error
    model_usage.success(response)
    embeddings = [
        item.embedding for item in sorted(response.data, key=lambda item: item.index)
    ]
    return EmbeddingResponse(
        embeddings=embeddings,
        model=settings.qwen_embed_model,
        dimensions=settings.qwen_embedding_dimensions,
    )
