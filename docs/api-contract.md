# API contract v1

All JSON requests and responses use `application/json`. Backend and agent public endpoints are browser-safe when the caller origin is listed in `FRONTEND_ORIGINS`.

## Frontend to backend

### `GET /v1/fragrances?q=&note=&occasion=&max_price_idr=&limit=`

Returns `{ "items": [Fragrance] }`. Filters are optional. `limit` defaults to 12 and is capped at 50.

### `GET /v1/fragrances/{slug}`

Returns one `Fragrance`, or `404`.

### `GET /v1/fragrances/{slug}/dupes?explain=`

Returns curated dupe relationships plus embedding neighbors for one fragrance:

```json
{
  "fragrance": {},
  "dupes": [
    { "fragrance": {}, "relation": "clone_of", "confidence": 0.9, "source": "community-consensus-v1" }
  ],
  "original_of": [],
  "flankers": [],
  "similar": [],
  "explanation": null,
  "generated_by": null,
  "disclaimer": "..."
}
```

`dupes` lists fragrances curated as clones of / inspired by this one; `original_of` lists what this fragrance itself dupes; `flankers` covers same-line releases either way. `similar` is a pgvector nearest-neighbor list and explicitly carries no dupe claim. With `explain=true` the agent writes an Indonesian narrative whose hedging follows the stored confidence; the endpoint never judges physical-product authenticity, and `disclaimer` restates that.

### `POST /v1/recommendations`

```json
{
  "budget_idr": 2000000,
  "occasion": "office",
  "climate": "tropical",
  "gender": "men",
  "preferred_notes": ["iris", "citrus"],
  "avoid_notes": ["vanilla"],
  "reference_likes": ["Bleu de Chanel"],
  "reference_dislikes": [],
  "limit": 3
}
```

`reference_likes` / `reference_dislikes` are perfumes the user already knows; the backend resolves them in the catalog and uses Rocchio relevance feedback to pull the retrieval vector toward liked anchors and away from disliked ones. Budget is applied as a hard SQL filter with 15% tolerance and `avoid_notes` are excluded at retrieval time.

The backend filters and ranks catalog candidates, then asks `agent` for a constrained explanation. It returns:

```json
{
  "recommendation": { "slug": "prada-lhomme", "brand": "Prada", "name": "L'Homme" },
  "alternatives": [],
  "matches": [
    {
      "fragrance": {},
      "score": 87,
      "reasons": [],
      "cautions": [],
      "score_breakdown": { "notes": 30.0, "semantic": 18.4, "occasion": 15.0 }
    }
  ],
  "explanation": "...",
  "generated_by": "qwen"
}
```

`generated_by` is `catalog_fallback` when Qwen is unconfigured or unavailable.

### `POST /v1/recommendations/from-text`

Accepts `{ "text": "...", "limit": 3 }`. Qwen extracts a typed preference profile, pgvector retrieves semantically relevant records, deterministic code scores them, and Qwen explains the highest match. The response also includes `profile` and `profile_generated_by`.

## Backend to agent

### `POST /v1/recommend`

The backend passes the submitted profile plus its `candidates` list (each candidate may carry `semantic_similarity`, the pgvector cosine similarity against the combined query vector) and resolved `liked_references` / `disliked_references` catalog records. The agent applies layered matching: hard constraint filters (avoided notes via the note taxonomy, budget with tolerance, gender), taxonomy-aware weighted scoring with anchor similarity and prior-shrunk ratings, an optional Qwen listwise rerank of the survivor pool (`QWEN_RERANK_*` settings: several independent votes aggregated by Borda count and blended at a bounded weight, falling back to the deterministic order on any failure), then MMR selection for a diverse top list. It must only explain or select entries present in the candidate list; it does not query sources or invent product data. Offline ranking quality is measured by `agent/evaluation/run_eval.py` against the hand-labeled persona golden set in `agent/evaluation/fixtures/`.

### `POST /v1/preferences/parse`

Converts Indonesian or English free text into budget, occasion, climate, gender, notes, scent families, reference perfumes the user likes or dislikes, and performance preferences. Set `QWEN_PROFILE_MODEL` after deploying the fine-tuned Qwen3-14B LoRA model.

### `POST /v1/embeddings`

Embeds up to 10 catalog/query documents with `text-embedding-v4` at 1024 dimensions.

### `POST /v1/compare`

Accepts `left` and `right` fragrance objects from the catalog and returns a comparison narrative based solely on their supplied fields.

### `POST /v1/dupes/explain`

Accepts the target `fragrance` plus its `dupes`, `original_of`, `flankers`, and `similar` lists as returned by the backend. Produces an Indonesian explanation whose wording is tied to each relationship's `confidence` (>= 0.8 "dikenal luas sebagai clone/alternatif", 0.6-0.8 "sering dibandingkan", below 0.6 "konsensus terbatas"); `similar` entries are described only as note-profile matches, never as dupes. Falls back to a deterministic template when Qwen is unavailable.

## Scraping to backend

### `POST /internal/fragrances`

Used only by `scraping`. It requires `X-Service-Key` matching `SERVICE_SHARED_SECRET`. The normalized record includes its `source_url`, `source_type`, and product fields. `slug` is the upsert key.

### `POST /internal/embeddings/rebuild`

Embeds catalog rows that have no vector in batches of 10 after ingestion.

## Renewable ingestion

- `POST /v1/sources/open-beauty-facts/run` queues an immediate licensed delta run.
- `POST /v1/sources/open-beauty-facts-categories/run` queues a paginated pull of the official v2 search API over the fragrance category tags (`OBF_CATEGORY_TAGS`), spaced by `OBF_CATEGORY_REQUEST_INTERVAL_SECONDS` per request and capped at `OBF_CATEGORY_MAX_PAGES_PER_RUN` pages per run.
- `POST /v1/records` accepts a reviewed batch of `SourceRecord`s (used for `scraping/sources/curated-catalog-v1.json`).
- `GET /v1/jobs` returns run status, record count, cursor, and errors.
- Automatic ingestion runs every `AUTO_INGEST_INTERVAL_SECONDS` and resumes from its persistent cursor.

## Source policy

`scraping` accepts records only when `terms_confirmed` is true and source type is one of `public_dataset`, `official_api`, or `licensed_feed`. Build a source-specific adapter only after its terms, rate limit, attribution requirements, and retention policy have been reviewed.
