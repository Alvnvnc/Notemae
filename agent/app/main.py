import json
import logging
import re

from fastapi import FastAPI, HTTPException, status
from openai import APIError, OpenAI
from pydantic import ValidationError

from . import reranker, scoring
from .config import settings
from .models import (
    CompareRequest,
    CompareResponse,
    DupeExplainRequest,
    DupeExplainResponse,
    EmbeddingRequest,
    EmbeddingResponse,
    MatchResult,
    PreferenceExtractionRequest,
    PreferenceExtractionResponse,
    RecommendationProfile,
    RecommendationRequest,
    RecommendationResponse,
    RelatedCandidate,
)
from .prompts import (
    DUPE_SYSTEM_PROMPT,
    PROFILE_SYSTEM_PROMPT,
    RECOMMENDATION_SYSTEM_PROMPT,
)


logger = logging.getLogger(__name__)
app = FastAPI(title="ScentSphere Qwen Agent API", version="0.3.0")

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
    client = qwen_client()
    if client is None:
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
        )
        return completion.choices[0].message.content.strip() or None
    except (APIError, AttributeError, IndexError, TypeError) as error:
        logger.warning("Qwen generation failed: %s", error)
        return None


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
    client = qwen_client()
    if client is None:
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
        )
        content = completion.choices[0].message.content
        profile = RecommendationProfile.model_validate_json(content)
        profile.free_text = payload.text
        profile.limit = payload.limit
        return profile
    except (APIError, AttributeError, IndexError, TypeError, ValidationError) as error:
        logger.warning("Qwen preference extraction failed: %s", error)
        return None


def rank_candidates(request: RecommendationRequest) -> list[MatchResult]:
    survivors, rejected = scoring.score_pool(
        request.profile,
        request.candidates,
        request.liked_references,
        request.disliked_references,
    )
    survivors = reranker.consensus_rerank(qwen_client(), request.profile, survivors)
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


@app.post("/v1/preferences/parse", response_model=PreferenceExtractionResponse)
def parse_preferences(
    payload: PreferenceExtractionRequest,
) -> PreferenceExtractionResponse:
    profile = extract_profile_with_qwen(payload)
    return PreferenceExtractionResponse(
        profile=profile or fallback_profile(payload),
        generated_by="qwen" if profile else "catalog_fallback",
    )


@app.post("/v1/recommend", response_model=RecommendationResponse)
def recommend(payload: RecommendationRequest) -> RecommendationResponse:
    matches = rank_candidates(payload)
    selected = matches[0]
    explanation = ask_qwen(
        RECOMMENDATION_SYSTEM_PROMPT,
        {
            "profile": payload.profile.model_dump(),
            "recommendation": selected.model_dump(mode="json"),
            "alternatives": [match.model_dump(mode="json") for match in matches[1:]],
        },
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
    try:
        response = client.embeddings.create(
            model=settings.qwen_embed_model,
            input=payload.texts,
            dimensions=settings.qwen_embedding_dimensions,
            encoding_format="float",
        )
    except APIError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Qwen embedding request failed",
        ) from error
    embeddings = [
        item.embedding for item in sorted(response.data, key=lambda item: item.index)
    ]
    return EmbeddingResponse(
        embeddings=embeddings,
        model=settings.qwen_embed_model,
        dimensions=settings.qwen_embedding_dimensions,
    )
