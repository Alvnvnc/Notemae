"""Wikidata perfume adapter.

Reads individual perfume entities (instances of Q131746) from the official
SPARQL endpoint. Wikidata content is CC0, and the query service permits
programmatic access with a descriptive User-Agent and modest request rates.
Only entities with a manufacturer are emitted so abstract concepts (e.g.
"eau de toilette" as a category) never reach the catalog.
"""

from typing import Any

import httpx

from ..models import SourceRecord


SOURCE_NAME = "Wikidata perfumes"
LICENSE_URL = "https://www.wikidata.org/wiki/Wikidata:Licensing"

SPARQL_QUERY = """
SELECT ?item ?itemLabel ?itemDescription ?brandLabel ?year ?designerLabel WHERE {
  ?item wdt:P31 wd:Q131746 .
  ?item wdt:P176 ?brand .
  OPTIONAL { ?item wdt:P571 ?inception . BIND(YEAR(?inception) AS ?year) }
  OPTIONAL { ?item wdt:P287 ?designer . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,fr,de,id". }
}
"""


def entity_id(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def to_source_record(binding: dict[str, Any]) -> SourceRecord | None:
    item_uri = binding.get("item", {}).get("value", "")
    name = binding.get("itemLabel", {}).get("value", "").strip()
    brand = binding.get("brandLabel", {}).get("value", "").strip()
    qid = entity_id(item_uri)
    if not qid.startswith("Q") or not name or not brand or name == qid:
        return None

    year_text = binding.get("year", {}).get("value", "")
    release_year = int(year_text) if year_text.isdigit() else None
    if release_year is not None and not 1800 <= release_year <= 2100:
        release_year = None

    details = [binding.get("itemDescription", {}).get("value", "").strip()]
    designer = binding.get("designerLabel", {}).get("value", "").strip()
    if designer and not designer.startswith("Q"):
        details.append(f"Composed by {designer}")
    description = ". ".join(part for part in details if part)

    return SourceRecord(
        source_name=SOURCE_NAME,
        source_type="official_api",
        source_url=f"https://www.wikidata.org/wiki/{qid}",
        source_record_id=qid,
        terms_confirmed=True,
        brand=brand,
        name=name,
        description=description[:2000],
        release_year=release_year,
    )


async def fetch_perfumes(
    client: httpx.AsyncClient, sparql_url: str
) -> list[SourceRecord]:
    response = await client.get(
        sparql_url,
        params={"format": "json", "query": SPARQL_QUERY},
    )
    response.raise_for_status()
    bindings = response.json().get("results", {}).get("bindings", [])
    records: dict[str, SourceRecord] = {}
    for binding in bindings:
        record = to_source_record(binding)
        # one entity can bind several designers; keep the first row per QID
        if record and record.source_record_id not in records:
            records[record.source_record_id] = record
    return list(records.values())
