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


def normalize_record(record: SourceRecord) -> dict[str, object]:
    identity = f"-{record.source_record_id}" if record.source_record_id else ""
    return {
        "slug": slugify(f"{record.brand}-{record.name}{identity}"),
        "brand": record.brand.strip(),
        "name": record.name.strip(),
        "description": record.description.strip(),
        "gender": record.gender.strip().lower(),
        "release_year": record.release_year,
        "notes": normalize_tags(record.notes),
        "occasions": normalize_tags(record.occasions),
        "climates": normalize_tags(record.climates),
        "price_idr": record.price_idr,
        "rating": record.rating,
        "longevity_score": record.longevity_score,
        "projection_score": record.projection_score,
        "source_url": str(record.source_url),
        "source_type": record.source_type,
    }
