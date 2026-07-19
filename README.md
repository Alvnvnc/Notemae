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

The majority of ScentSphere's core implementation was developed in an official Codex session powered by GPT-5.6. Codex was used as an engineering collaborator across the repository, not as a one-shot code generator.

### Where Codex accelerated the workflow

- Mapped the product idea into four runnable boundaries: ingestion, catalog backend, recommendation agent, and browser UI.
- Traced and implemented typed payloads across FastAPI, PostgreSQL/pgvector, Docker Compose, and the frontend instead of optimizing one isolated file at a time.
- Accelerated implementation and review of taxonomy-aware scoring, Rocchio reference feedback, listwise reranking, Borda aggregation, and MMR diversity.
- Built evaluation tooling around a hand-labeled persona set, then helped inspect regressions rather than relying on a few persuasive demos.
- Shortened debugging loops by reading the relevant call path, editing the smallest responsible layer, and running focused verification after each change.

### Key decisions we made

- **Catalog facts remain the source of truth.** The product identity and recommendation candidates come from PostgreSQL; the language model is not allowed to invent products.
- **Constraints stay deterministic.** Avoided notes, budget, and gender compatibility are handled before the LLM reranker so model taste judgments cannot become the only safety layer.
- **LLM judgment is bounded.** Qwen may reorder known survivor slugs and explain supplied records, while deterministic scoring and fallbacks keep the service runnable during provider failures.
- **Data provenance matters.** The ingestion boundary accepts only reviewed public datasets, official APIs, or licensed feeds and preserves source URLs.
- **Quality must be measured.** We selected nDCG@3 as the primary offline ranking metric and also track hit@1, constraint violations, diversity, latency, stochastic run variance, and judge-label agreement.

GPT-5.6 supplied the codebase-level reasoning inside Codex: comparing architecture options, following data across services, identifying weak assumptions, and turning decisions into tested implementation. We retained responsibility for the product scope, source policy, grounding boundary, ranking tradeoffs, labels, and final acceptance of changes.

### Runtime model disclosure

GPT-5.6 and Codex were the build-time engineering tools required by OpenAI Build Week. The running ScentSphere demo currently uses Qwen through an OpenAI-compatible API for preference extraction, embeddings, bounded reranking, and natural-language explanations. This distinction is intentional and is disclosed so judges can separate how the project was built from which provider powers the demo at runtime.

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
