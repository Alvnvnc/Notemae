# Notemae

ScentSphere is an AI-powered fragrance discovery platform. This repository separates data ingestion, catalog APIs, AI reasoning, and the frontend integration preview so each concern can evolve independently.

OpenAI Build Week track: **Apps for Your Life**. ScentSphere helps everyday fragrance buyers turn subjective preferences, Indonesian context, climate, occasion, and budget into catalog-backed choices they can inspect instead of generic chatbot suggestions.

## Services

| Directory | Responsibility | Local URL |
| --- | --- | --- |
| `scraping/` | Polls reviewed renewable sources, normalizes records, and sends them to the catalog | `http://localhost:8002` |
| `backend/` | Owns the fragrance catalog, price data, search, and public API | `http://localhost:8000` |
| `agent/` | Extracts preferences, scores matches, embeds documents, and explains results with Qwen | `http://localhost:8001` |
| `fe/` | Responsive integration preview for the backend API; Squarespace can use the same contract | `http://localhost:4173` |

`database/init.sql` provisions PostgreSQL, pgvector, the catalog schema, and a small demonstrator dataset. The database is the source of truth. The agent never creates fragrance facts outside the candidate records it receives.

## Run locally

Prerequisite: Docker with Docker Compose.

1. Copy `.env.example` to `.env` and set a non-default `SERVICE_SHARED_SECRET`.
2. Add `DASHSCOPE_API_KEY` for Qwen parsing, embeddings, reranking, and explanations. Without it, the demo remains runnable with deterministic catalog fallbacks.
3. Run `docker compose up --build`.
4. Open `http://localhost:4173` and use the preview search or recommendation form.

The API documentation for each FastAPI service is available at its `/docs` URL.

Try this sample request in the recommendation form:

```text
Saya pria, kerja kantoran di Jakarta, budget 1,2 juta, suka citrus dan cedar, tidak suka manis.
```

## Service flow

```text
Approved public dataset / official API / licensed feed
  -> scheduled scraping normalizer
  -> backend internal upsert
  -> Qwen text-embedding-v4
  -> PostgreSQL + pgvector hybrid retrieval (Rocchio anchor feedback)
  -> layered agent matching (hard filters -> taxonomy + semantic scoring -> MMR) + Qwen explanation
  -> frontend preview / Squarespace custom-code integration
```

## Building with Codex and GPT-5.6

ScentSphere's architecture, working prototype, and agent MVP were built in an official Codex session powered by GPT-5.6, and we returned to Codex to review the finished system. In between those anchor points, iteration passes were implemented with other development tools because of Codex usage limits. We disclose that split explicitly so the Codex contribution can be verified against the session log.

### Where Codex accelerated the workflow

**1. Architecture and working prototype.** Codex turned the initial fragrance-consultant concept into a runnable system: it defined the service boundaries (ingestion, catalog backend, recommendation agent, browser UI), wired the frontend, FastAPI services, PostgreSQL/pgvector, and Docker Compose together, and delivered the first end-to-end recommendation flow from a browser request to a catalog-backed answer.

**2. Agent MVP and engineering direction.** Codex completed the early recommendation-agent MVP — preference parsing, catalog constraint filtering, and the first scoring pass — and acted as an engineering advisor on what to build next: which signals the agent lacked, what should stay deterministic, and where a bounded LLM step was worth adding. Those proposals shaped the roadmap we executed afterward.

**3. Enhancement with other tools.** The subsequent iteration passes — strengthening taxonomy-aware scoring, reference-fragrance feedback, bounded reranking, diversity controls, backend/frontend contract consistency, and evaluation tooling — were implemented with other development tools, following the structure and direction established in the Codex stages above.

**4. Verification back in Codex.** We brought the enhanced system back to Codex to check it: reviewing cross-service behavior against the original architecture, identifying ranking regressions and edge cases, and validating that the changes stayed within the grounding and constraint boundaries the prototype defined.

### Key decisions we made

- **Catalog facts remain the source of truth.** The product identity and recommendation candidates come from PostgreSQL; the language model is not allowed to invent products.
- **Constraints stay deterministic.** Avoided notes, budget, and gender compatibility are handled before the LLM reranker so model taste judgments cannot become the only safety layer.
- **LLM judgment is bounded.** Qwen may reorder known survivor slugs and explain supplied records, while deterministic scoring and fallbacks keep the service runnable during provider failures.
- **Data provenance matters.** The ingestion boundary accepts only reviewed public datasets, official APIs, or licensed feeds and preserves source URLs.
- **Quality must be measured.** We selected nDCG@3 as the primary offline ranking metric and also track hit@1, constraint violations, diversity, latency, stochastic run variance, and judge-label agreement.

### How GPT-5.6 and Codex contributed to the final result

GPT-5.6 inside Codex supplied the codebase-level reasoning at the points that shaped the project most: the service architecture, the first runnable prototype, the agent MVP, the roadmap advice on what to add next, and the final regression review. The enhancement work in between used other tools, but it was built on the structure Codex established and was checked back in Codex before we accepted it. Codex proposed engineering additions; we made the final calls and retained responsibility for the product scope, source policy, grounding boundary, ranking tradeoffs, evaluation labels, and acceptance of every change.

### Build and runtime tooling disclosure

Codex and GPT-5.6 anchored the build as described above; other development tools were used for the intermediate enhancement passes. At runtime, the ScentSphere demo uses Qwen through an OpenAI-compatible API for preference extraction, embeddings, bounded reranking, and natural-language explanations. Both distinctions are disclosed intentionally so judges can see exactly which parts of the project were built in Codex and which provider powers the demo.

The copy-ready Devpost description, demo voiceover, compliance checklist, and `/feedback` instructions are in [`docs/devpost-submission.md`](docs/devpost-submission.md).

## Contract and safety

- Only `public_dataset`, `official_api`, and `licensed_feed` source types are accepted by the ingestion service. It intentionally does not crawl arbitrary websites.
- Open Beauty Facts nightly deltas are ingested automatically under ODbL. Its data helps product freshness but does not contain reliable fragrance notes or prices.
- `scraping` calls the backend internal endpoint using `X-Service-Key`; do not expose this header or endpoint to browsers.
- The public API is versioned under `/v1`; the internal ingestion API is under `/internal`.
- `docs/api-contract.md` documents the initial frontend, backend, agent, and ingestion payloads.

## Next implementation steps

1. Add a licensed catalog/retailer feed for authoritative notes, performance, and Indonesian prices.
2. Review and upload `agent/fine_tuning/data/*.jsonl` to Qwen Cloud, then set `QWEN_PROFILE_MODEL` to its deployed model code.
3. Put the backend behind a public HTTPS domain, then set that URL in Squarespace custom code and `fe/runtime-env.js`.
