# API contract v1

All JSON requests and responses use `application/json`. Backend and agent public endpoints are browser-safe when the caller origin is listed in `FRONTEND_ORIGINS`.

## The note pyramid

Every `Fragrance` carries four note fields: `notes`, `top_notes`, `heart_notes`
and `base_notes`. `notes` is the ordered union of the three tiers, opening
first, and remains the field every filter and every pre-pyramid client uses.
The union is derived during ingestion, never sent independently, so the two
representations cannot drift.

A record whose three tiers are all empty is valid and common: that is every
record ingested before the pyramid existed, plus every product the enrichment
model would not vouch for an arrangement on. Readers must treat empty tiers as
*unknown*, not as *flat*. The agent infers a pyramid from material volatility
for those records so they still rank and render sensibly, but an inferred
pyramid is never narrated — it does not reach the language model, and the
frontend labels it as estimated.

## Frontend to backend

### `GET /v1/fragrances?q=&note=&note_tier=&occasion=&max_price_idr=&limit=`

Returns `{ "items": [Fragrance] }`. Filters are optional. `limit` defaults to 12 and is capped at 50.

`note_tier` is one of `top`, `heart` or `base` and narrows `note` to that tier
of the pyramid. Records with no stored pyramid never match a tier-scoped
filter, because the catalog cannot claim where their notes sit.

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
      "score_breakdown": {
        "notes": 30.0,
        "notes_exact": 15.0,
        "notes_similar": 6.0,
        "notes_family": 4.5,
        "notes_character": 4.5,
        "semantic": 18.4,
        "occasion": 15.0
      }
    }
  ],
  "explanation": "...",
  "generated_by": "qwen"
}
```

`generated_by` is `catalog_fallback` when Qwen is unconfigured or unavailable.

The `notes_*` keys decompose the single `notes` figure and must never be added
to it. They record which route earned the credit: `notes_exact` (the perfume
literally lists the requested note), `notes_similar` (it uses a curated close
substitute), `notes_family` (it only shares the note's scent family), and
`notes_character` (it shares the note's character traits). Their shares of the
`notes` weight are 50 / 20 / 15 / 15, and they nest — an exact match also
counts as its own best substitute, family and character — so a perfume that
really lists the requested note can never be outranked on this criterion by
one that merely resembles it. A note the user asked to avoid is a hard filter;
a *close relative* of one is not, and costs `avoided_neighbour_penalty`
instead.

The pyramid deliberately does **not** scale the credit a wanted note earns.
Where a material sits is a property of the material, so docking a perfume for
putting bergamot in the opening would dock every citrus perfume ever made.
What the tier does change:

* `avoided_neighbour_penalty` is scaled by tier — 0.4 in the opening, 0.7 in
  the heart, 1.0 in the dry-down. Being stuck all evening with a relative of
  something you asked to avoid is a real cost; meeting it for ten minutes is
  not. Where several relatives of one avoided note are present, the
  longest-lasting one sets the cost.
* `reasons` name the tier a matched note lands in, and a match confined
  entirely to the opening raises a caution — "smells like what you asked for"
  and "smells like what you asked for for twenty minutes" are different
  products.

The two differ in what they trust. The penalty scale applies to inferred tiers
as well, because material volatility is physics and is reliable enough to rank
on. The narration applies only to a *stated* pyramid: an inferred tier is a
good enough reason to move a candidate down the list, and never a good enough
reason to tell the wearer their perfume "opens on bergamot".

### `POST /v1/recommendations/from-text`

Accepts `{ "text": "...", "limit": 3 }`. Qwen extracts a typed preference profile, pgvector retrieves semantically relevant records, deterministic code scores them, and Qwen explains the highest match. The response also includes `profile` and `profile_generated_by`.

### `GET /v1/featured?limit=`

Returns `{ "items": [DupeResponse] }` for the originals with the most curated alternatives pointing at them, ordered by curation depth then confidence then rating. Originals without any curated dupe are omitted. The home page uses this instead of a hardcoded slug list, so it can never point at a fragrance that has left the catalog.

### `POST /v1/recommendations/stream` and `POST /v1/recommendations/from-text/stream`

Same request bodies as the two endpoints above, but the response is `text/event-stream`. The stages are emitted in the order the user can act on them rather than all at the end, because the model passes take seconds while the catalog ranking takes milliseconds:

| event | data | when |
|---|---|---|
| `stage` | `{ "stage": "reading" \| "matching" \| "refining" \| "writing" }` | on entering each phase |
| `matches` | `{ recommendation, alternatives, matches, refined }` | twice: `refined: false` for the deterministic ranking (sub-second), then `refined: true` after the LLM rerank |
| `profile` | `{ profile, generated_by }` | free-text only, once the model parse replaces the heuristic one |
| `delta` | `{ "text": "..." }` | per token of the explanation |
| `done` | `{ generated_by, profile_generated_by }` | last frame |
| `error` | `{ detail }` | no catalog fragrance passes the filters |

For free text the backend first parses with heuristics (`?fast=true`) so provisional matches can be shown immediately, then reruns the pool against the model-parsed profile. Clients that cannot consume a stream can keep using the non-streaming endpoints; both remain supported.

## Backend to agent

### `GET /v1/notes`

The note vocabulary the picker offers, one entry per canonical note:

```json
{ "items": [
  {
    "name": "vanilla",
    "family": "gourmand",
    "families": ["gourmand", "amber"],
    "traits": ["sweet", "warm", "creamy"],
    "similar_notes": ["amber", "benzoin", "caramel", "praline", "tonka"],
    "volatility": "base",
    "known": true
  }
] }
```

These are the same records scoring reads, so the picker and the engine cannot
drift apart. `similar_notes` is symmetric by construction.

`volatility` is `top`, `heart` or `base`: the tier this raw material naturally
occupies. It is a property of the material, not of any one perfume — bergamot
is gone within the hour whoever blends it — which is why it can be used to
infer a pyramid for records that never stated one.

### `POST /v1/notes/profile`

Accepts `{ "notes": [...], "avoid_notes": [...] }` and returns what the picked
notes add up to, before any perfume is ranked:

```json
{
  "profile": {
    "notes": [{ "input": "bergamont", "name": "bergamot", "corrected": true, "known": true, "family": "citrus", "families": [], "traits": [], "similar_notes": [], "volatility": "top" }],
    "pyramid": { "top": ["bergamot"], "heart": ["jasmine"], "base": ["vanilla"] },
    "families": ["citrus", "floral", "amber", "gourmand", "fresh"],
    "traits": ["fresh", "citrusy", "floral", "sweet", "warm"],
    "dominant_traits": [],
    "corrections": { "bergamont": "bergamot" },
    "unrecognized": [],
    "summary": "fresh floral amber, with bright, elegant, sensual accents"
  },
  "avoided": null,
  "narrative": "...",
  "generated_by": "qwen"
}
```

The profile itself — spelling correction, families, traits, summary — is
computed deterministically in `agent/app/profile.py`. The model only phrases it
and asks one narrowing follow-up question, so an unavailable model costs the
prose but never the profile; `generated_by` is `catalog_fallback` then.

### `POST /v1/recommend`

The backend passes the submitted profile plus its `candidates` list (each candidate may carry `semantic_similarity`, the pgvector cosine similarity against the combined query vector) and resolved `liked_references` / `disliked_references` catalog records. The agent applies layered matching: hard constraint filters (avoided notes via the note taxonomy, budget with tolerance, gender), taxonomy-aware weighted scoring — notes graded on the four nested routes above, plus anchor similarity and prior-shrunk ratings — an optional Qwen listwise rerank of the survivor pool (`QWEN_RERANK_*` settings: several independent votes aggregated by Borda count and blended at a bounded weight, falling back to the deterministic order on any failure), then MMR selection for a diverse top list. It must only explain or select entries present in the candidate list; it does not query sources or invent product data. Offline ranking quality is measured by `agent/evaluation/run_eval.py` against the hand-labeled persona golden set in `agent/evaluation/fixtures/`.

### `POST /v1/recommend/rank`

The ranking half of `/v1/recommend`, same request body plus `rerank` (default `true`). With `rerank: false` no model call happens at all — the response is the deterministic scoring, which is what lets the streaming endpoint paint matches before any LLM has answered. Returns `{ "matches": [MatchResult], "reranked": bool }`.

### `POST /v1/recommend/explain`

The narrative half. Accepts `{ profile, recommendation, alternatives }` (match objects, not bare fragrances) and streams the explanation as `text/plain` deltas. Thinking is disabled on this path: reasoning tokens are never shown, so leaving it on would stall the first visible character for the whole thinking budget. If the model is unavailable the deterministic catalog sentence is streamed instead, terminated by the sentinel `␞catalog_fallback` which the backend strips before forwarding.

### `POST /v1/preferences/parse?fast=`

Converts Indonesian or English free text into budget, occasion, climate, gender, notes, scent families, reference perfumes the user likes or dislikes, and performance preferences. Set `QWEN_PROFILE_MODEL` after deploying the fine-tuned Qwen3-14B LoRA model. With `fast=true` the model is skipped and only the keyword heuristic runs, so a caller can show provisional results while the real parse is still in flight.

### `POST /v1/embeddings`

Embeds up to 10 catalog/query documents with `text-embedding-v4` at 1024 dimensions.

### `POST /v1/compare`

Accepts `left` and `right` fragrance objects from the catalog and returns a comparison narrative based solely on their supplied fields.

### `POST /v1/dupes/explain`

Accepts the target `fragrance` plus its `dupes`, `original_of`, `flankers`, and `similar` lists as returned by the backend. Produces an Indonesian explanation whose wording is tied to each relationship's `confidence` (>= 0.8 "dikenal luas sebagai clone/alternatif", 0.6-0.8 "sering dibandingkan", below 0.6 "konsensus terbatas"); `similar` entries are described only as note-profile matches, never as dupes. Falls back to a deterministic template when Qwen is unavailable.

## Scraping to backend

### `POST /internal/fragrances`

Used only by `scraping`. It requires `X-Service-Key` matching `SERVICE_SHARED_SECRET`. The normalized record includes its `source_url`, `source_type`, and product fields. `slug` is the upsert key.

The three tier fields are optional and move as a set with `notes`. A change to
any of them clears `document_embedding`, because the embedded document names
the tiers.

### `GET /internal/fragrances?missing_notes=&missing_pyramid=`

Lists catalog rows for the enrichment sweep. `missing_pyramid` is the superset:
a record with no notes has no tiers either, so one pass covers both
never-enriched rows and rows enriched before tiers existed.

### `POST /internal/embeddings/rebuild`

Embeds catalog rows that have no vector in batches of 10 after ingestion.

Adopting the pyramid is therefore a three-step rollout: apply
`database/migrations/004-note-pyramid.sql`, run the enrichment job (which now
targets `missing_pyramid=true`), then call this endpoint — the upsert has
already nulled the vectors of every record whose tiers changed, so it picks
them up without a manual invalidation.

## Renewable ingestion

- `POST /v1/sources/open-beauty-facts/run` queues an immediate licensed delta run.
- `POST /v1/sources/open-beauty-facts-categories/run` queues a paginated pull of the official v2 search API over the fragrance category tags (`OBF_CATEGORY_TAGS`), spaced by `OBF_CATEGORY_REQUEST_INTERVAL_SECONDS` per request and capped at `OBF_CATEGORY_MAX_PAGES_PER_RUN` pages per run.
- `POST /v1/records` accepts a reviewed batch of `SourceRecord`s (used for `scraping/sources/curated-catalog-v1.json`).
- `GET /v1/jobs` returns run status, record count, cursor, and errors.
- Automatic ingestion runs every `AUTO_INGEST_INTERVAL_SECONDS` and resumes from its persistent cursor.

## Source policy

`scraping` accepts records only when `terms_confirmed` is true and source type is one of `public_dataset`, `official_api`, or `licensed_feed`. Build a source-specific adapter only after its terms, rate limit, attribution requirements, and retention policy have been reviewed.
