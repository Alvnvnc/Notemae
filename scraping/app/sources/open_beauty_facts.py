import gzip
import json
import zlib
from collections.abc import AsyncIterator
from io import BytesIO
from typing import Any

import httpx

from ..models import SourceRecord


SOURCE_NAME = "Open Beauty Facts"
CATEGORY_SOURCE_NAME = "Open Beauty Facts perfume categories"
DUMP_SOURCE_NAME = "Open Beauty Facts full export"
SOURCE_LICENSE_URL = "https://world.openbeautyfacts.org/data"
SEARCH_FIELDS = (
    "code,brands,brands_tags,product_name,product_name_en,"
    "generic_name,quantity,categories,categories_tags"
)
FRAGRANCE_MARKERS = (
    "perfume",
    "parfum",
    "fragrance",
    "eau-de-parfum",
    "eau-de-toilette",
    "eau-de-cologne",
)
EXCLUDED_CATEGORY_MARKERS = (
    "air-freshener",
    "candle",
    "home-fragrance",
    "in-sun-protection",
    "insect-repellent",
    "suncare",
    "sunscreen",
)


async def list_delta_files(client: httpx.AsyncClient, index_url: str) -> list[str]:
    response = await client.get(index_url)
    response.raise_for_status()
    return [
        line.strip()
        for line in response.text.splitlines()
        if line.strip().endswith(".json.gz")
    ]


def is_fragrance(product: dict[str, Any]) -> bool:
    categories = " ".join(
        str(value)
        for value in (
            product.get("categories", ""),
            " ".join(product.get("categories_tags") or []),
        )
    ).lower()
    if any(marker in categories for marker in EXCLUDED_CATEGORY_MARKERS):
        return False
    return any(marker in categories for marker in FRAGRANCE_MARKERS)


def first_value(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, list):
        value = value[0] if value else ""
    return str(value).split(",", 1)[0].strip()


def product_gender(product: dict[str, Any]) -> str:
    categories = " ".join(product.get("categories_tags") or []).lower()
    if any(marker in categories for marker in ("women", "female")):
        return "women"
    if any(marker in categories for marker in ("men", "male")):
        return "men"
    return "unisex"


def to_source_record(product: dict[str, Any]) -> SourceRecord | None:
    code = str(product.get("code") or product.get("_id") or "").strip()
    brand = first_value(product.get("brands") or product.get("brands_tags"))
    name = first_value(
        product.get("product_name")
        or product.get("product_name_en")
        or product.get("generic_name")
    )
    if not code or not brand or not name:
        return None

    details = [
        first_value(product.get("generic_name")),
        first_value(product.get("quantity")),
    ]
    description = ". ".join(detail for detail in details if detail and detail != name)
    return SourceRecord(
        source_name=SOURCE_NAME,
        source_type="public_dataset",
        source_url=f"https://world.openbeautyfacts.org/product/{code}",
        source_record_id=code,
        terms_confirmed=True,
        brand=brand,
        name=name,
        description=description[:2000],
        gender=product_gender(product),
    )


async def fetch_category_page(
    client: httpx.AsyncClient,
    search_url: str,
    category_tag: str,
    page: int,
    page_size: int,
) -> tuple[list[SourceRecord], int]:
    """Fetch one page of the official v2 search API filtered to a fragrance
    category tag. Returns the fragrance records plus the raw product count of
    the page (a partial page signals the end of the category)."""
    response = await client.get(
        search_url,
        params={
            "categories_tags_en": category_tag,
            "page": page,
            "page_size": page_size,
            "fields": SEARCH_FIELDS,
        },
    )
    response.raise_for_status()
    payload = response.json()
    products = payload.get("products") or []
    records: list[SourceRecord] = []
    for product in products:
        if not is_fragrance(product):
            continue
        record = to_source_record(product)
        if record:
            records.append(record)
    return records, len(products)


async def stream_dump_records(
    client: httpx.AsyncClient,
    dump_url: str,
    start_line: int,
    limit: int,
) -> AsyncIterator[tuple[int, SourceRecord]]:
    """Stream the complete ODbL jsonl.gz export and yield fragrance records with
    their 1-based line number. Lines up to start_line are skipped so an
    interrupted run can resume without re-submitting earlier records."""
    decompressor = zlib.decompressobj(wbits=31)
    buffer = b""
    line_number = 0
    emitted = 0
    async with client.stream("GET", dump_url) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes():
            buffer += decompressor.decompress(chunk)
            while True:
                newline = buffer.find(b"\n")
                if newline < 0:
                    break
                raw_line = buffer[:newline]
                buffer = buffer[newline + 1 :]
                line_number += 1
                if line_number <= start_line:
                    continue
                try:
                    product = json.loads(raw_line)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    continue
                if not is_fragrance(product):
                    continue
                record = to_source_record(product)
                if record is None:
                    continue
                yield line_number, record.model_copy(
                    update={"source_name": DUMP_SOURCE_NAME}
                )
                emitted += 1
                if emitted >= limit:
                    return


async def fetch_delta_records(
    client: httpx.AsyncClient,
    delta_url: str,
    limit: int,
) -> list[SourceRecord]:
    response = await client.get(delta_url)
    response.raise_for_status()
    records: list[SourceRecord] = []
    with gzip.GzipFile(fileobj=BytesIO(response.content)) as archive:
        for raw_line in archive:
            try:
                product = json.loads(raw_line)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            if not is_fragrance(product):
                continue
            record = to_source_record(product)
            if record:
                records.append(record)
            if len(records) >= limit:
                break
    return records
