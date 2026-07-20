"""Turn picked notes into a readable scent profile.

This is the step between "user tapped bergamot, jasmine, vanilla" and the
scoring engine: notes are normalized (typos corrected), each one is expanded
into its families, traits and substitutes, and the union is condensed into a
handful of descriptors the interface can show back before any perfume has
been ranked. The picked notes are also grouped into a pyramid so the
interface can show *when* each one would be smelled.

Everything here is deterministic. The language model only rephrases the
result; it never decides what the profile is.
"""

from collections import Counter

from . import taxonomy
from .models import NoteInsight, ScentProfile

# how many descriptors a summary may carry before it stops being scannable
MAX_SUMMARY_FAMILIES = 3
MAX_SUMMARY_TRAITS = 3
# a trait carried by this share of the picked notes counts as dominant
DOMINANT_SHARE = 0.5

# Naming one of these alongside its parent says the same thing twice.
_FAMILY_PARENTS = {"white floral": "floral"}

# Families that describe the same axis as a trait already in the summary
# would double up ("fresh, citrusy" reads as one idea, not two).
_TRAIT_IMPLIED_BY_FAMILY = {
    "fresh": {"fresh", "citrusy", "clean", "airy", "aquatic", "green", "herbal"},
    "citrus": {"citrusy", "fresh"},
    "gourmand": {"sweet"},
    "amber": {"warm"},
    "floral": {"floral"},
    "white floral": {"floral"},
    "green": {"green"},
    "aquatic": {"aquatic", "fresh"},
    "woody": {"woody"},
    "spicy": {"spicy"},
    "leather": {"leathery"},
    "powdery": {"powdery"},
    "musky": {"musky"},
    "fruity": {"fruity"},
}


def describe_note(raw: str) -> NoteInsight:
    canonical = taxonomy.canonical_note(raw)
    families = sorted(taxonomy.families_for_note(canonical))
    return NoteInsight(
        input=raw,
        name=canonical,
        corrected=taxonomy.normalize_term(raw) != canonical,
        known=taxonomy.is_known_note(canonical),
        family=families[0] if families else None,
        families=families,
        traits=list(taxonomy.NOTE_TRAITS.get(canonical, ())),
        similar_notes=sorted(taxonomy.similar_notes(canonical)),
        volatility=taxonomy.volatility_of(canonical),
    )


def _rank_families(notes: list[NoteInsight]) -> list[str]:
    """Order families by how many picked notes carry them.

    "fresh" is an umbrella over citrus/green/aromatic/aquatic, so it is
    derived from the members rather than counted as a peer of them.
    """
    counts: Counter[str] = Counter()
    for note in notes:
        counts.update(note.families)
    ranked = [family for family, _ in counts.most_common()]
    if counts.keys() & taxonomy.FRESH_MEMBER_FAMILIES and "fresh" not in ranked:
        ranked.append("fresh")
    return ranked


def _rank_traits(notes: list[NoteInsight]) -> tuple[list[str], list[str]]:
    """Return (all traits by frequency, traits shared by most picked notes)."""
    counts: Counter[str] = Counter()
    for note in notes:
        counts.update(note.traits)
    ranked = [trait for trait, _ in counts.most_common()]
    threshold = max(2, round(len(notes) * DOMINANT_SHARE)) if notes else 0
    dominant = [trait for trait, count in counts.most_common() if count >= threshold]
    return ranked, dominant


def headline_families(families: list[str]) -> list[str]:
    """Reduce the ranked families to the few that actually differentiate.

    Sub-families collapse into their parent and every fresh member collapses
    into "fresh", so a citrus-plus-aquatic pick reads as "fresh" once rather
    than listing each contributor.
    """
    present = set(families)
    lead: list[str] = []
    for family in families:
        if family == "fresh":
            continue
        if _FAMILY_PARENTS.get(family) in present:
            continue
        candidate = "fresh" if family in taxonomy.FRESH_MEMBER_FAMILIES else family
        if candidate not in lead:
            lead.append(candidate)
    if "fresh" in present and "fresh" not in lead:
        lead.insert(0, "fresh")
    return lead[:MAX_SUMMARY_FAMILIES]


def summarize(families: list[str], traits: list[str]) -> str:
    """Compose the one-line profile shown above the recommendations."""
    lead = headline_families(families)
    implied: set[str] = set()
    for family in lead:
        implied |= _TRAIT_IMPLIED_BY_FAMILY.get(family, set())
    accents = [trait for trait in traits if trait not in implied][:MAX_SUMMARY_TRAITS]
    if not lead and not accents:
        return "no recognizable scent character yet"
    if not accents:
        return " ".join(lead)
    return f"{' '.join(lead) or 'mixed'}, with {', '.join(accents)} accents"


def build_scent_profile(raw_notes: list[str]) -> ScentProfile:
    notes: list[NoteInsight] = []
    seen: set[str] = set()
    for raw in raw_notes:
        insight = describe_note(raw)
        if insight.name in seen:
            continue
        seen.add(insight.name)
        notes.append(insight)

    recognized = [note for note in notes if note.known]
    families = _rank_families(recognized)
    traits, dominant = _rank_traits(recognized)
    corrections = {
        note.input: note.name for note in notes if note.corrected and note.known
    }
    return ScentProfile(
        notes=notes,
        pyramid=taxonomy.infer_pyramid([note.name for note in recognized]),
        families=families,
        traits=traits,
        dominant_traits=dominant,
        corrections=corrections,
        unrecognized=[note.input for note in notes if not note.known],
        summary=summarize(families, dominant or traits),
    )
