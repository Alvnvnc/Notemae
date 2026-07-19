# Scraping and ingestion service

FastAPI boundary for approved-source ingestion. It automatically checks Open Beauty Facts nightly delta exports, filters fragrance products, and stores its cursor in a persistent volume. It intentionally does not crawl arbitrary websites.

Two additional approved paths grow the catalog on demand:

- `POST /v1/sources/open-beauty-facts-categories/run` walks the official v2 search API over the fragrance category tags (`OBF_CATEGORY_TAGS`, default perfumes / eau-de-toilette / eau-de-cologne / eau-de-parfum). Requests are spaced `OBF_CATEGORY_REQUEST_INTERVAL_SECONDS` apart (default 6s) and capped at `OBF_CATEGORY_MAX_PAGES_PER_RUN` pages per run; the per-tag page cursor persists in the state file. Use this when the nightly deltas contain few fragrances.
- `POST /v1/records` ingests a reviewed batch such as `sources/curated-catalog-v1.json`, the first-party curated dataset that carries notes, occasions, climates, and Indonesian price estimates that Open Beauty Facts lacks. After submitting it, run `database/seed_dupe_relationships.sql` so every dupe pair resolves.

## Environment

- `BACKEND_URL`: internal catalog API base URL.
- `SERVICE_SHARED_SECRET`: credential used to upsert normalized records.
- `AUTO_INGEST_INTERVAL_SECONDS`: polling interval, default six hours.
- `OBF_BOOTSTRAP_FILES`: initial nightly deltas to process, default 14.
- `OBF_MAX_FILES_PER_RUN`: subsequent deltas per run, default 2.
- `OBF_MAX_RECORDS_PER_RUN`: safety cap, default 500.
- `SOURCE_USER_AGENT`: identify the deployment and add a real contact before production.

Trigger an immediate run with `POST /v1/sources/open-beauty-facts/run`. Inspect progress through `GET /v1/jobs` and source cursor state through `GET /v1/sources`.

Open Beauty Facts is ODbL and useful for renewable product identity data. It does not provide dependable scent notes, longevity, projection, or Indonesian prices; use a reviewed licensed feed for those fields.

Source adapter policy and an example payload are available in `sources/`.
