# Approved source adapters

Adapters live in `app/sources/`. Add another adapter only after documenting the
source's terms, permitted access method, rate limit, data license, required
attribution, and retention period.

Supported source types are:

- `public_dataset`: a dataset whose license permits this use.
- `official_api`: an API accessed within its documented authorization and rate limits.
- `licensed_feed`: a feed provided under a written or otherwise verifiable license.

Each adapter should output `SourceRecord` objects and submit them to
`POST /v1/records`. Do not pass raw, unverified source payloads to the catalog API.

## Active sources

| Source | Type | License / terms | Access & rate | Trigger |
| --- | --- | --- | --- | --- |
| Open Beauty Facts nightly deltas | `public_dataset` | ODbL (attribution via `source_url`) | Official static delta exports | `POST /v1/sources/open-beauty-facts/run` (also auto-scheduled) |
| Open Beauty Facts category search | `public_dataset` | ODbL | Official API v2 search, 6s between requests, persisted page cursor | `POST /v1/sources/open-beauty-facts-categories/run` |
| Open Beauty Facts full export | `public_dataset` | ODbL | Official `openbeautyfacts-products.jsonl.gz` (~88 MB), streamed once per run, resumable line cursor | `POST /v1/sources/open-beauty-facts-dump/run` |
| Wikidata perfumes | `official_api` | CC0 | Official SPARQL query service, one query per run, descriptive User-Agent | `POST /v1/sources/wikidata/run` |
| YouTube fragrance reviews | `official_api` | YouTube API Services ToS; metadata only (titles), no video content stored | Official Data API v3 `search.list` (100 quota units/call, default 10k/day), requires `YOUTUBE_API_KEY` | `POST /v1/sources/youtube/run` |

## YouTube discovery pipeline

Video titles are never ingested directly. The adapter searches configured
queries (`YOUTUBE_SEARCH_QUERIES`), then an LLM extracts explicit
`(brand, name)` product mentions with a confidence score. Candidates below
`YOUTUBE_MIN_CONFIDENCE` (default 0.75), or already present in the catalog
(matched on slugified brand+name), are dropped. Accepted records keep the video
URL as `source_url` for provenance and start without notes — the enrichment
pass below fills them only when the product is independently recognized.

## LLM enrichment (not a source)

`POST /v1/enrichment/run` fills `notes`, `occasions`, `climates`,
`description`, `release_year`, and (only when currently `unisex`) `gender` for
catalog records that have no notes. It uses the shared Qwen-compatible
endpoint (`DASHSCOPE_API_KEY`, `QWEN_BASE_URL`, `QWEN_MODEL`). Guardrails:

- The model must explicitly claim it recognizes the exact product
  (`known: true`) with `confidence >= ENRICHMENT_MIN_CONFIDENCE` and at least
  3 notes, otherwise the record is left untouched — notes are never invented
  (this is why small local brands stay sparse until verifiable data exists).
- Only empty fields are filled; curated/manual data is never overwritten, and
  `source_url`/`source_type` provenance is preserved.
- `occasions`/`climates` are constrained to the catalog taxonomy
  (casual/date/formal/office/party/wedding; cool/hot/mild/tropical/warm).
- Attempted slugs are persisted so repeat runs advance instead of re-asking.
- Each run is capped by `ENRICHMENT_MAX_RECORDS_PER_RUN` (default 60).
