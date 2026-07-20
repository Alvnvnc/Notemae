"""LLM listwise reranking with self-consistency.

The deterministic scorer stays the source of truth for facts and constraint
handling; Qwen re-orders the already-filtered survivor pool as a holistic
taste judgment (RankGPT-style listwise ranking). Because a single LLM ranking
is noisy, several independent votes are aggregated with a Borda count and
blended with the deterministic score at a bounded weight, so one bad
generation can never override the constraint layer. Any failure falls back to
the deterministic order.
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor

from openai import APIError, OpenAI

from . import taxonomy
from .config import settings
from .models import MatchResult, RecommendationProfile
from .usage import model_usage

logger = logging.getLogger(__name__)

RERANK_SYSTEM_PROMPT = """
You rank fragrance candidates for one user of an Indonesian fragrance service.
You receive the user's preference profile and a numbered candidate list with
catalog facts and a deterministic score. Judge overall taste fit holistically:
scent character versus the request, occasion and climate fit, references the
user likes or dislikes, and value for the budget. Use only supplied facts.
Where "note_pyramid" is present, weigh where the user's notes sit in it: a
wanted note in the base lasts all day, the same note in the top is gone in an
hour. A null "note_pyramid" means the arrangement is unknown, not flat.
Return JSON only: {"ranking": ["slug-best", "slug-next", ...]} containing every
candidate slug exactly once, best fit first.
""".strip()


def candidate_digest(match: MatchResult) -> dict[str, object]:
    fragrance = match.fragrance
    return {
        "slug": fragrance.slug,
        "brand": fragrance.brand,
        "name": fragrance.name,
        "notes": fragrance.notes,
        "note_pyramid": taxonomy.stated_pyramid(
            fragrance.top_notes, fragrance.heart_notes, fragrance.base_notes
        ),
        "occasions": fragrance.occasions,
        "climates": fragrance.climates,
        "price_idr": fragrance.price_idr,
        "rating": fragrance.rating,
        "longevity_score": fragrance.longevity_score,
        "projection_score": fragrance.projection_score,
        "deterministic_score": match.score,
        "cautions": match.cautions,
    }


def request_vote(
    client: OpenAI,
    profile: RecommendationProfile,
    digests: list[dict[str, object]],
    known_slugs: list[str],
) -> list[str] | None:
    if not model_usage.reserve(
        "rerank",
        settings.qwen_max_calls_per_hour,
        settings.redis_url,
        settings.redis_key_prefix,
    ):
        logger.warning("Qwen rerank skipped: hourly model-call budget exhausted")
        return None
    try:
        completion = client.chat.completions.create(
            model=settings.qwen_model,
            temperature=settings.qwen_rerank_temperature,
            messages=[
                {"role": "system", "content": RERANK_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "profile": profile.model_dump(exclude={"free_text"}),
                            "free_text": profile.free_text,
                            "candidates": digests,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            response_format={"type": "json_object"},
            extra_body=settings.structured_extra_body,
            max_tokens=settings.qwen_max_output_tokens,
        )
        model_usage.success(completion)
        parsed = json.loads(completion.choices[0].message.content)
        ranking = [slug for slug in parsed.get("ranking", []) if slug in known_slugs]
    except (APIError, AttributeError, IndexError, TypeError, ValueError) as error:
        model_usage.failure("rerank")
        logger.warning("Qwen rerank vote failed: %s", error)
        return None
    if not ranking:
        return None
    seen: list[str] = []
    for slug in ranking:
        if slug not in seen:
            seen.append(slug)
    # a vote that dropped slugs keeps them in deterministic order at the tail
    seen.extend(slug for slug in known_slugs if slug not in seen)
    return seen


def consensus_rerank(
    client: OpenAI | None,
    profile: RecommendationProfile,
    survivors: list[MatchResult],
) -> list[MatchResult]:
    """Re-order survivors by blending Borda-aggregated LLM votes with the
    deterministic score. Returns survivors unchanged when reranking is
    disabled, unavailable, or every vote fails."""
    pool_size = min(len(survivors), settings.qwen_rerank_pool)
    if (
        client is None
        or not settings.qwen_rerank_enabled
        or pool_size < 3
    ):
        return survivors
    pool = survivors[:pool_size]
    tail = survivors[pool_size:]
    digests = [candidate_digest(match) for match in pool]
    known_slugs = [match.fragrance.slug for match in pool]

    # Votes are independent samples, so issue them concurrently: the pass
    # costs one round trip instead of ``qwen_rerank_votes`` of them.
    with ThreadPoolExecutor(max_workers=settings.qwen_rerank_votes) as executor:
        futures = [
            executor.submit(request_vote, client, profile, digests, known_slugs)
            for _ in range(settings.qwen_rerank_votes)
        ]
        votes = [vote for vote in (future.result() for future in futures) if vote]
    if not votes:
        return survivors

    borda: dict[str, float] = {slug: 0.0 for slug in known_slugs}
    for vote in votes:
        for position, slug in enumerate(vote):
            borda[slug] += len(vote) - 1 - position
    max_points = max(len(votes) * (pool_size - 1), 1)

    weight = settings.qwen_rerank_weight
    for match in pool:
        consensus = borda[match.fragrance.slug] / max_points * 100
        blended = round((1 - weight) * match.score + weight * consensus)
        delta = blended - match.score
        if delta:
            match.score_breakdown["llm_rerank"] = float(delta)
        match.score = max(0, min(blended, 100))
    pool.sort(key=lambda match: match.score, reverse=True)
    if pool and votes:
        pool[0].reasons.append(
            f"ranked first by {len(votes)} independent taste judgments"
        )
    return pool + tail
