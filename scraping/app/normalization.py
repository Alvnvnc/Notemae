import re
import unicodedata

from .models import SourceRecord


def slugify(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    )
    normalized = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return normalized[:160]


def normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    for tag in tags:
        value = " ".join(tag.lower().split())
        if value and value not in normalized:
            normalized.append(value)
    return normalized


TIER_FIELDS = ("top_notes", "heart_notes", "base_notes")


def normalize_pyramid(record: SourceRecord) -> dict[str, list[str]]:
    """Normalize the three tiers and derive the flat ``notes`` union.

    The union is computed here, opening first, so the two representations
    cannot drift: whatever a source claims in ``notes`` is ignored the
    moment it also states a pyramid. Sources with no pyramid keep their flat
    list untouched and leave every tier empty.
    """
    tiers: dict[str, list[str]] = {}
    union: list[str] = []
    for field in TIER_FIELDS:
        tier: list[str] = []
        for note in normalize_tags(getattr(record, field)):
            # a note claimed in two tiers belongs to the first one it appears
            # in, which is where the wearer meets it
            if note in union:
                continue
            union.append(note)
            tier.append(note)
        tiers[field] = tier
    return {"notes": union or normalize_tags(record.notes), **tiers}


def normalize_record(record: SourceRecord) -> dict[str, object]:
    identity = f"-{record.source_record_id}" if record.source_record_id else ""
    return {
        "slug": slugify(f"{record.brand}-{record.name}{identity}"),
        "brand": record.brand.strip(),
        "name": record.name.strip(),
        "description": record.description.strip(),
        "gender": record.gender.strip().lower(),
        "release_year": record.release_year,
        **normalize_pyramid(record),
        "occasions": normalize_tags(record.occasions),
        "climates": normalize_tags(record.climates),
        "price_idr": record.price_idr,
        "rating": record.rating,
        "longevity_score": record.longevity_score,
        "projection_score": record.projection_score,
        "source_url": str(record.source_url),
        "source_type": record.source_type,
    }
