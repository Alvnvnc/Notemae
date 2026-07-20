"""Layered taste matching.

Layer 1: hard constraints (avoided notes, budget, gender) filter candidates
before any scoring; rejected candidates only return if the survivor pool is
smaller than the requested limit, carrying an explicit penalty and caution.

Layer 2: weighted soft scoring over taxonomy-aware note matching, dense
semantic similarity supplied by the backend, anchor-fragrance similarity
(relevance feedback), occasion, climate, performance bands, and a
prior-shrunk rating so sparse ratings cannot dominate.

Layer 3: MMR selection so the returned list is diverse, not near-duplicates
of the top match.
"""

from . import taxonomy
from .models import FragranceCandidate, MatchResult, RecommendationProfile


# How the "notes" criterion below splits its budget. An exact note match is
# worth as much as the other three routes combined, so a perfume that really
# lists the requested note can never be outranked by one that merely shares
# its family. The four shares sum to 100 and are read as percentages of
# WEIGHTS["notes"], which keeps the criterion's weight against occasion,
# budget and the rest unchanged.
NOTE_MATCH_SHARES = {
    "exact": 50.0,
    "similar": 20.0,
    "family": 15.0,
    "character": 15.0,
}

WEIGHTS = {
    "notes": 30.0,
    "families": 10.0,
    "semantic": 25.0,
    "anchors": 20.0,
    "occasion": 15.0,
    "climate": 10.0,
    "longevity": 5.0,
    "projection": 5.0,
    "budget": 5.0,
    "rating": 10.0,
}
BUDGET_TOLERANCE = 1.15
HARD_FILTER_PENALTY = 30.0
DISLIKE_ANCHOR_PENALTY = 15.0
MISSING_NOTES_PENALTY = 5.0
# An avoided note itself is a hard filter. Its close substitutes are not
# disqualifying — someone who avoids vanilla can still tolerate tonka — but
# they should cost the candidate something.
AVOIDED_NEIGHBOUR_PENALTY = 8.0
# How much of that penalty each tier carries. This is the one place where the
# pyramid genuinely belongs in the score: a relative of an avoided note in the
# dry-down is on the wearer's skin all evening, while the same material in the
# opening is gone before they reach the office.
#
# Note the asymmetry with *wanted* notes, which are deliberately NOT scaled by
# tier. Where a material sits is a property of the material — bergamot is only
# ever an opening note — so docking a citrus perfume for putting bergamot on
# top would penalise every citrus perfume ever made. Being stuck with
# something you asked to avoid is a real cost; getting what you asked for in
# the only place it can exist is not a defect.
AVOIDED_TIER_SCALE = {"top": 0.4, "heart": 0.7, "base": 1.0}
RATING_PRIOR = 3.5
MMR_LAMBDA = 0.75
# cosine similarities from text embeddings rarely span [0, 1]; rescale the
# useful band so the semantic criterion can actually differentiate candidates
SEMANTIC_FLOOR = 0.2
SEMANTIC_CEILING = 0.8
PERFORMANCE_BANDS = {
    "low": (0.0, 2.7),
    "moderate": (2.3, 3.9),
    "high": (3.5, 5.0),
}


def candidate_taste_terms(candidate: FragranceCandidate) -> set[str]:
    notes = set(taxonomy.canonical_notes(candidate.notes))
    return notes | taxonomy.family_profile(notes)


def candidate_pyramid(
    candidate: FragranceCandidate,
) -> tuple[dict[str, list[str]], bool]:
    """The candidate's tiers, stated if the catalog knows them."""
    return taxonomy.resolve_pyramid(
        candidate.notes,
        top=candidate.top_notes,
        heart=candidate.heart_notes,
        base=candidate.base_notes,
    )


def score_note_match(
    preferred: list[str],
    candidate_notes: set[str],
    candidate_families: set[str],
    candidate_traits: set[str],
    candidate_tiers: dict[str, str] | None = None,
    pyramid_stated: bool = False,
) -> tuple[dict[str, float], list[str], list[str]]:
    """Grade one wanted note list along four increasingly loose routes.

    Each preferred note earns credit independently on every route it clears,
    and the routes nest: an exact match also counts as its own best
    substitute, shares its families, and carries its character. So exact
    matching dominates by construction rather than by tuning.

    The pyramid changes no number here — see AVOIDED_TIER_SCALE for why —
    but it does change what the wearer is told: an exact match is named with
    the tier it lands in, and a match that lives entirely in the opening is
    called out, because "it smells like what you asked for" and "it smells
    like what you asked for for twenty minutes" are different products.
    Tiers are only narrated when the catalog actually stated them; an
    inferred pyramid ranks but never speaks.

    Returns (breakdown keyed by route plus the "notes" total, reasons,
    cautions).
    """
    tiers = candidate_tiers or {}
    shares = {route: 0.0 for route in NOTE_MATCH_SHARES}
    exact_hits: list[str] = []
    similar_hits: list[str] = []
    family_hits: list[str] = []
    exact_tiers: set[str] = set()

    for note in preferred:
        note_families = taxonomy.families_for_note(note)
        note_traits = taxonomy.traits_for_note(note)
        substitutes = taxonomy.similar_notes(note) & candidate_notes
        is_exact = note in candidate_notes

        if is_exact:
            tier = tiers.get(note)
            if tier:
                exact_tiers.add(tier)
            label = taxonomy.TIER_LABELS.get(tier or "")
            exact_hits.append(f"{note} ({label})" if label and pyramid_stated else note)
            shares["exact"] += 1.0
            shares["similar"] += 1.0
        elif substitutes:
            similar_hits.append(f"{note}≈{sorted(substitutes)[0]}")
            shares["similar"] += 1.0

        shared_families = note_families & candidate_families
        if note_families:
            shares["family"] += len(shared_families) / len(note_families)
        if shared_families and not is_exact and not substitutes:
            family_hits.append(f"{note}≈{sorted(shared_families)[0]}")

        if note_traits:
            shares["character"] += len(note_traits & candidate_traits) / len(
                note_traits
            )

    count = max(len(preferred), 1)
    breakdown = {
        f"notes_{route}": round(
            shares[route] / count * NOTE_MATCH_SHARES[route] / 100 * WEIGHTS["notes"], 1
        )
        for route in NOTE_MATCH_SHARES
    }
    breakdown["notes"] = round(sum(breakdown.values()), 1)

    reasons: list[str] = []
    cautions: list[str] = []
    if exact_hits:
        reasons.append(f"preferred notes: {', '.join(exact_hits)}")
    if pyramid_stated and exact_tiers:
        if exact_tiers == {"top"}:
            cautions.append(
                "the notes you asked for are all in the opening, so they fade "
                "within about an hour"
            )
        elif "base" in exact_tiers:
            reasons.append("your notes carry through into the dry-down")
    if similar_hits:
        reasons.append(f"close substitutes: {', '.join(similar_hits)}")
    if family_hits:
        reasons.append(f"same-family notes: {', '.join(family_hits)}")
    if not exact_hits and not similar_hits and not family_hits:
        cautions.append("none of the requested notes or their families match")
    return breakdown, reasons, cautions


def avoided_neighbour_penalty(
    candidate_notes: set[str],
    avoided_notes: set[str],
    candidate_tiers: dict[str, str] | None = None,
) -> tuple[float, list[str]]:
    """Cost a candidate for carrying close relatives of an avoided note.

    Scaled by how long the wearer is stuck with it: a relative in the
    dry-down costs the full penalty, one in the opening a fraction of it.
    Where a candidate has several relatives of the same avoided note, the
    longest-lasting one sets the cost.
    """
    if not avoided_notes or not candidate_notes:
        return 0.0, []
    tiers = candidate_tiers or {}
    flagged: list[str] = []
    hit = 0.0
    for avoided in avoided_notes:
        neighbours = taxonomy.similar_notes(avoided) & candidate_notes
        if not neighbours:
            continue
        # sorted() first: several relatives can share the worst tier, and the
        # flagged caution must not depend on set iteration order
        worst = max(
            sorted(neighbours),
            key=lambda note: AVOIDED_TIER_SCALE.get(tiers.get(note, "heart"), 0.7),
        )
        hit += AVOIDED_TIER_SCALE.get(tiers.get(worst, "heart"), 0.7)
        flagged.append(f"{worst} is close to {avoided}")
    penalty = round(hit / len(avoided_notes) * AVOIDED_NEIGHBOUR_PENALTY, 1)
    return penalty, flagged


def hard_filter_failures(
    candidate: FragranceCandidate,
    profile: RecommendationProfile,
    avoided_notes: set[str],
    avoided_families: set[str],
) -> list[str]:
    failures: list[str] = []
    conflicts = taxonomy.note_conflicts(
        candidate.notes, avoided_notes, avoided_families
    )
    if conflicts:
        failures.append(f"contains avoided notes: {', '.join(sorted(conflicts))}")
    if (
        profile.budget_idr
        and candidate.price_idr is not None
        and candidate.price_idr > profile.budget_idr * BUDGET_TOLERANCE
    ):
        failures.append("above budget even with 15% tolerance")
    if profile.gender and candidate.gender not in {profile.gender, "unisex"}:
        failures.append(f"cataloged for {candidate.gender}, not {profile.gender}")
    return failures


def score_candidate(
    candidate: FragranceCandidate,
    profile: RecommendationProfile,
    liked_references: list[FragranceCandidate],
    disliked_references: list[FragranceCandidate],
) -> MatchResult:
    candidate_notes = taxonomy.canonical_notes(candidate.notes)
    candidate_note_set = set(candidate_notes)
    candidate_families = taxonomy.family_profile(candidate_notes)
    pyramid, pyramid_stated = candidate_pyramid(candidate)
    candidate_tiers = taxonomy.tier_index(pyramid)
    description_text = candidate.description.lower()
    breakdown: dict[str, float] = {}
    reasons: list[str] = []
    cautions: list[str] = []
    earned = 0.0
    possible = 0.0

    # rating with shrinkage toward the catalog prior (no vote counts available,
    # so a lone enthusiastic rating cannot dominate taste criteria)
    possible += WEIGHTS["rating"]
    shrunk_rating = (
        (2 * candidate.rating + RATING_PRIOR) / 3
        if candidate.rating is not None
        else RATING_PRIOR
    )
    breakdown["rating"] = round(shrunk_rating / 5 * WEIGHTS["rating"], 1)
    earned += breakdown["rating"]

    if profile.preferred_notes:
        possible += WEIGHTS["notes"]
        note_breakdown, note_reasons, note_cautions = score_note_match(
            taxonomy.canonical_notes(profile.preferred_notes),
            candidate_note_set,
            candidate_families,
            taxonomy.trait_profile(candidate_notes),
            candidate_tiers,
            pyramid_stated,
        )
        breakdown.update(note_breakdown)
        earned += note_breakdown["notes"]
        reasons.extend(note_reasons)
        cautions.extend(note_cautions)

    if profile.preferred_families:
        possible += WEIGHTS["families"]
        wanted = [
            family
            for family in (
                taxonomy.canonical_family(item) for item in profile.preferred_families
            )
            if family
        ]
        matched = [
            family
            for family in wanted
            if family in candidate_families or family in description_text
        ]
        ratio = len(matched) / max(len(wanted), 1) if wanted else 0.0
        breakdown["families"] = round(ratio * WEIGHTS["families"], 1)
        earned += breakdown["families"]
        if matched:
            reasons.append(f"scent family: {', '.join(matched)}")

    if candidate.semantic_similarity is not None:
        possible += WEIGHTS["semantic"]
        rescaled = (candidate.semantic_similarity - SEMANTIC_FLOOR) / (
            SEMANTIC_CEILING - SEMANTIC_FLOOR
        )
        rescaled = max(0.0, min(rescaled, 1.0))
        breakdown["semantic"] = round(rescaled * WEIGHTS["semantic"], 1)
        earned += breakdown["semantic"]
        if rescaled >= 0.6:
            reasons.append("strong semantic match with your description")

    if liked_references:
        possible += WEIGHTS["anchors"]
        best_similarity = 0.0
        best_anchor: FragranceCandidate | None = None
        candidate_terms = candidate_note_set | candidate_families
        for anchor in liked_references:
            anchor_terms = candidate_taste_terms(anchor)
            if not anchor_terms or not candidate_terms:
                continue
            similarity = len(candidate_terms & anchor_terms) / len(
                candidate_terms | anchor_terms
            )
            if similarity > best_similarity:
                best_similarity = similarity
                best_anchor = anchor
        breakdown["anchors"] = round(best_similarity * WEIGHTS["anchors"], 1)
        earned += breakdown["anchors"]
        if best_anchor and best_similarity >= 0.25:
            reasons.append(
                f"shares its profile with {best_anchor.brand} {best_anchor.name}"
            )

    if disliked_references:
        candidate_terms = candidate_note_set | candidate_families
        worst = 0.0
        worst_anchor: FragranceCandidate | None = None
        for anchor in disliked_references:
            anchor_terms = candidate_taste_terms(anchor)
            if not anchor_terms or not candidate_terms:
                continue
            similarity = len(candidate_terms & anchor_terms) / len(
                candidate_terms | anchor_terms
            )
            if similarity > worst:
                worst = similarity
                worst_anchor = anchor
        if worst > 0.0:
            penalty = round(worst * DISLIKE_ANCHOR_PENALTY, 1)
            breakdown["dislike_penalty"] = -penalty
            earned -= penalty
            if worst_anchor and worst >= 0.25:
                cautions.append(
                    f"resembles {worst_anchor.brand} {worst_anchor.name}, "
                    "which you disliked"
                )

    if profile.avoid_notes:
        avoided_notes, _ = taxonomy.expand_avoided(profile.avoid_notes)
        penalty, flagged = avoided_neighbour_penalty(
            candidate_note_set, avoided_notes, candidate_tiers
        )
        if penalty:
            breakdown["avoided_neighbour_penalty"] = -penalty
            earned -= penalty
            cautions.extend(flagged)

    if profile.occasion:
        possible += WEIGHTS["occasion"]
        if profile.occasion.lower() in {item.lower() for item in candidate.occasions}:
            breakdown["occasion"] = WEIGHTS["occasion"]
            earned += WEIGHTS["occasion"]
            reasons.append(f"cataloged for {profile.occasion}")
        else:
            cautions.append(f"not explicitly cataloged for {profile.occasion}")

    if profile.climate:
        possible += WEIGHTS["climate"]
        if profile.climate.lower() in {item.lower() for item in candidate.climates}:
            breakdown["climate"] = WEIGHTS["climate"]
            earned += WEIGHTS["climate"]
            reasons.append(f"cataloged for {profile.climate} climate")
        if (
            profile.climate.lower() in {"tropical", "hot"}
            and profile.projection_preference is None
            and candidate.projection_score is not None
            and candidate.projection_score >= 4.5
        ):
            cautions.append("projects very strongly for hot weather")

    for preference, value, label in (
        (profile.longevity_preference, candidate.longevity_score, "longevity"),
        (profile.projection_preference, candidate.projection_score, "projection"),
    ):
        if not preference:
            continue
        possible += WEIGHTS[label]
        if value is None:
            cautions.append(f"{label} is not recorded")
            continue
        low, high = PERFORMANCE_BANDS[preference]
        if low <= value <= high:
            breakdown[label] = WEIGHTS[label]
            earned += WEIGHTS[label]
            reasons.append(f"{label} fits your {preference} preference")
        elif value > high:
            cautions.append(f"{label} is stronger than your {preference} preference")
        else:
            cautions.append(f"{label} is weaker than your {preference} preference")

    if profile.budget_idr:
        possible += WEIGHTS["budget"]
        if candidate.price_idr is None:
            cautions.append("price is not recorded")
        elif candidate.price_idr <= profile.budget_idr:
            breakdown["budget"] = WEIGHTS["budget"]
            earned += WEIGHTS["budget"]
            reasons.append("within budget")
        else:
            cautions.append("slightly above budget (within 15% tolerance)")

    if not candidate.notes:
        breakdown["missing_notes_penalty"] = -MISSING_NOTES_PENALTY
        earned -= MISSING_NOTES_PENALTY
        cautions.append("catalog record has no note data")

    score = round(max(0.0, earned) / possible * 100) if possible else 0
    return MatchResult(
        fragrance=candidate,
        score=max(0, min(score, 100)),
        reasons=reasons,
        cautions=cautions,
        score_breakdown=breakdown,
    )


def taste_similarity(left: FragranceCandidate, right: FragranceCandidate) -> float:
    left_terms = candidate_taste_terms(left)
    right_terms = candidate_taste_terms(right)
    if not left_terms or not right_terms:
        return 0.0
    return len(left_terms & right_terms) / len(left_terms | right_terms)


def mmr_select(matches: list[MatchResult], limit: int) -> list[MatchResult]:
    """Pick a relevant but diverse top list (Maximal Marginal Relevance)."""
    pool = sorted(matches, key=lambda match: match.score, reverse=True)
    if len(pool) <= 1 or limit <= 1:
        return pool[:limit]
    selected = [pool.pop(0)]
    while pool and len(selected) < limit:
        best_index = 0
        best_value = float("-inf")
        for index, match in enumerate(pool):
            redundancy = max(
                taste_similarity(match.fragrance, chosen.fragrance)
                for chosen in selected
            )
            value = MMR_LAMBDA * (match.score / 100) - (1 - MMR_LAMBDA) * redundancy
            if value > best_value:
                best_value = value
                best_index = index
        selected.append(pool.pop(best_index))
    return selected


def score_pool(
    profile: RecommendationProfile,
    candidates: list[FragranceCandidate],
    liked_references: list[FragranceCandidate],
    disliked_references: list[FragranceCandidate],
) -> tuple[list[MatchResult], list[MatchResult]]:
    """Hard-filter and score every candidate.

    Returns (survivors sorted by score desc, rejected with penalty applied).
    """
    avoided_notes, avoided_families = taxonomy.expand_avoided(profile.avoid_notes)
    owned_slugs = {anchor.slug for anchor in liked_references}
    survivors: list[MatchResult] = []
    rejected: list[MatchResult] = []
    for candidate in candidates:
        if candidate.slug in owned_slugs:
            continue
        failures = hard_filter_failures(
            candidate, profile, avoided_notes, avoided_families
        )
        match = score_candidate(
            candidate, profile, liked_references, disliked_references
        )
        if failures:
            match.cautions = failures + match.cautions
            match.score = max(0, match.score - round(HARD_FILTER_PENALTY))
            match.score_breakdown["hard_filter_penalty"] = -HARD_FILTER_PENALTY
            rejected.append(match)
        else:
            survivors.append(match)
    survivors.sort(key=lambda match: match.score, reverse=True)
    return survivors, rejected


def select_top(
    profile: RecommendationProfile,
    survivors: list[MatchResult],
    rejected: list[MatchResult],
) -> list[MatchResult]:
    chosen = mmr_select(survivors, profile.limit)
    if len(chosen) < profile.limit and rejected:
        backfill = sorted(rejected, key=lambda match: match.score, reverse=True)
        chosen.extend(backfill[: profile.limit - len(chosen)])
    return chosen


def rank_candidates(
    profile: RecommendationProfile,
    candidates: list[FragranceCandidate],
    liked_references: list[FragranceCandidate],
    disliked_references: list[FragranceCandidate],
) -> list[MatchResult]:
    survivors, rejected = score_pool(
        profile, candidates, liked_references, disliked_references
    )
    return select_top(profile, survivors, rejected)
