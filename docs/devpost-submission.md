# OpenAI Build Week Submission Draft

This document is the copy-ready submission package for ScentSphere AI. Replace every `PENDING` value before submitting.

## Submission Status

- Project name: `ScentSphere AI`
- Tagline: `A catalog-grounded fragrance consultant for real budgets, climates, occasions, and tastes.`
- Track: `Apps for Your Life`
- Public repository URL: `PENDING_PUBLIC_REPOSITORY_URL`
- Public demo URL: `PENDING_LIVE_DEMO_URL`
- Public YouTube demo URL: `PENDING_YOUTUBE_URL`
- Codex `/feedback` Session ID: `PENDING_CODEX_FEEDBACK_SESSION_ID`

## Track Rationale

**Apps for Your Life** is the best fit because ScentSphere is a consumer application for an everyday purchasing decision. It helps people choose a fragrance for work, dates, gifts, hot weather, and personal budgets without requiring them to understand fragrance taxonomy or compare dozens of reviews manually.

## Project Description

### Inspiration

Buying a fragrance is unusually hard online. Users describe what they want in human terms such as "safe for my first interview," "not too sweet in Jakarta heat," or "similar to Aventus but affordable." Product catalogs, however, are structured around notes, performance scores, gender labels, prices, and occasions. A generic chatbot can bridge the language gap, but it can also invent products, prices, notes, or performance claims.

We built ScentSphere to combine natural conversation with a catalog-backed decision system. The goal is not to produce the most confident answer. The goal is to produce a useful recommendation whose candidate, score, reasons, cautions, and source data can be inspected.

### What it does

ScentSphere accepts an Indonesian or English fragrance request and turns it into a typed preference profile containing budget, occasion, climate, gender, preferred and avoided notes, scent families, performance preferences, and reference perfumes.

The backend retrieves catalog candidates with PostgreSQL and pgvector. If a user names perfumes they like or dislike, Rocchio-style relevance feedback moves the query vector toward liked references and away from disliked ones.

The recommendation agent then:

1. Applies deterministic catalog constraints and taxonomy-aware scoring.
2. Combines note, family, semantic, reference, occasion, climate, performance, budget, and rating signals.
3. Lets Qwen perform bounded listwise reranking over known survivor slugs.
4. Aggregates multiple rerank votes with Borda count.
5. Uses maximal marginal relevance to avoid returning three near-duplicates.
6. Produces a concise explanation from the selected catalog record, reasons, and cautions.
7. Falls back to deterministic behavior if the model provider is unavailable.

The product also includes catalog search, product comparison APIs, renewable Open Beauty Facts ingestion, source provenance, Dockerized local deployment, and a responsive browser preview.

### How we built it

The system is divided into four services:

- `scraping/` handles approved-source ingestion, normalization, cursors, and service-authenticated catalog writes.
- `backend/` owns PostgreSQL, pgvector retrieval, public APIs, reference resolution, and orchestration.
- `agent/` handles typed preference extraction, deterministic scoring, bounded LLM reranking, embeddings, comparisons, and explanations.
- `fe/` provides the working responsive catalog and recommendation experience.

The database is the source of truth for fragrance records. Model calls receive typed JSON and a finite candidate pool. The reranker can return only known slugs, and provider failures fall back to deterministic paths.

We evaluated ranking on 30 hand-labeled Indonesian personas. The historical recorded A/B run improved nDCG@3 from `0.778` to `0.852` and hit@1 from `0.833` to `0.933`, with a paired sign-flip `p=0.0137` and no observed avoid or budget violations on that fixture. Because the reranker is stochastic and the benchmark uses structured profiles plus a curated full catalog, we strengthened the harness to support repeated runs, hierarchical bootstrap confidence intervals, unique persona-product judge pairs, model disclosures, fixture hashes, and a separate frozen holdout. We present the historical result as offline ranking evidence, not as an end-to-end production guarantee.

### Challenges we ran into

- Translating subjective Indonesian requests into stable structured preferences without converting every nuance into an invented fact.
- Combining deterministic constraints with LLM taste judgment without allowing a persuasive model response to override catalog boundaries.
- Making reference perfumes useful even when users provide partial or colloquial names.
- Separating algorithm failures from catalog gaps. For example, a low-budget outdoor worker who needs high longevity may have no genuinely suitable item in the current catalog.
- Evaluating a stochastic reranker without treating repeated model calls as additional independent users.
- Maintaining a renewable catalog while respecting source terms, attribution, and the fact that public product datasets rarely contain reliable fragrance notes or Indonesian prices.

### Accomplishments that we are proud of

- A working, Dockerized product flow from browser request to typed profile, vector retrieval, scoring, reranking, explanation, and visible alternatives.
- A bounded hybrid ranker rather than a free-form chatbot recommendation.
- Explicit source provenance and a renewable ingestion path instead of opaque scraped facts.
- Graceful deterministic fallbacks for unavailable model calls.
- A hand-labeled Indonesian persona benchmark with paired statistics, diversity metrics, constraint checks, and documented limitations.
- An evaluation harness that records model settings and fixture hashes and can run a separate holdout without overwriting development results.

### What we learned

LLMs add the most value where user intent is contextual and thin, but deterministic signals remain stronger when exact notes or constraints are explicit. The useful architecture is therefore not "LLM versus rules." It is a layered system where code protects facts and constraints while the model resolves contextual tradeoffs inside a bounded candidate set.

We also learned that a low score is not always an algorithm problem. Evaluation exposed catalog segments where no good answer exists. Returning that evidence is more useful than making the model sound certain.

### What's next

- Add a separately labeled holdout and run at least 10 stochastic rerank repetitions before making final comparative claims.
- Learn an adaptive rerank weight from profile richness, exact-note coverage, and deterministic score gaps using development data only.
- Add a reviewed licensed catalog and Indonesian retailer feed for authoritative notes, bottle sizes, and fresh prices.
- Add claim-level validation for generated explanations and make structured cautions visible in the frontend.
- Improve exact reference resolution and request clarification for ambiguous perfume names.
- Turn catalog gaps into an explicit abstention or "no reliable match" product experience.

## Codex and GPT-5.6 Collaboration

The majority of the core project was built in an official Codex session powered by GPT-5.6. We used Codex as a persistent engineering collaborator across the multi-service repository.

### Where Codex accelerated us

- Converted a broad fragrance-consultant concept into typed service boundaries and an executable Docker Compose stack.
- Followed data across frontend, backend, agent, ingestion, database, and evaluation code, reducing the manual cost of cross-service changes.
- Implemented and refined the hybrid ranking path: taxonomy matching, semantic retrieval inputs, anchor feedback, bounded listwise reranking, Borda aggregation, and MMR.
- Generated focused verification loops and helped diagnose concrete ranking regressions rather than only polishing prompts.
- Accelerated documentation of API contracts, runtime fallbacks, source policy, and reproducible evaluation commands.

### Where we made the key decisions

We decided the product problem, target audience, and Apps for Your Life positioning. We chose catalog grounding over unconstrained generation, deterministic constraints over prompt-only safety, reviewed data sources over arbitrary crawling, and measured ranking quality over persuasive anecdotes. We authored and reviewed the persona labels, selected the tradeoffs, and accepted or rejected Codex's implementation suggestions.

### How GPT-5.6 contributed

GPT-5.6 powered the reasoning inside Codex. It was especially useful for codebase-wide dependency tracing, comparing ranking designs, identifying hidden assumptions, implementing statistical evaluation, and keeping changes consistent across Python, SQL, Docker, and browser JavaScript. The project still required human judgment for product scope, domain labels, source licensing, safety boundaries, and what evidence was strong enough to report.

### Runtime disclosure

Codex and GPT-5.6 were used to build the project. The current application runtime uses Qwen through an OpenAI-compatible API for preference extraction, embeddings, bounded reranking, and explanations. We disclose this distinction explicitly rather than implying GPT-5.6 is the deployed inference provider.

## Built With

- Codex
- GPT-5.6
- Python 3.12
- FastAPI
- PostgreSQL 16
- pgvector
- Qwen OpenAI-compatible API
- Docker Compose
- Nginx
- Vanilla HTML, CSS, and JavaScript
- Open Beauty Facts renewable data exports

## Codex `/feedback` Session ID

The Devpost form requires the Session ID from the Codex conversation where most core functionality was built. This ID cannot be generated from this repository or from an OpenCode session.

1. Open the original official Codex session used for the core build.
2. Enter `/feedback` and press Enter.
3. Complete and submit the feedback flow. Codex returns the Session ID after submission.
4. Replace `PENDING_CODEX_FEEDBACK_SESSION_ID` at the top of this document.
5. Paste exactly that ID into the Devpost `/feedback Codex Session ID` field.

Do not substitute an OpenCode session ID, a ChatGPT share link, a random UUID, or the ID of a short submission-writing session. Devpost asks for the session where the majority of core functionality was built.

## Demo Video Script

Target duration: `2:40`. The video must be public on YouTube and remain under three minutes. Use voiceover; captions alone do not demonstrate the required explanation clearly.

### 0:00-0:18 - Problem and product

Visual: Open the ScentSphere homepage and catalog.

Voiceover:

> Buying fragrance online means translating human needs like "professional, tropical, under one million rupiah, not sweet" into scattered notes, prices, and performance data. ScentSphere is a catalog-grounded fragrance consultant that makes that translation without letting a chatbot invent the products.

### 0:18-0:55 - Working recommendation

Visual: Submit this request:

```text
Saya pria, kerja kantoran di Jakarta, budget 1,2 juta, suka citrus dan cedar, tidak suka manis.
```

Show the recommended fragrance, explanation, and alternatives.

Voiceover:

> The app parses Indonesian intent into a typed profile, retrieves candidates from PostgreSQL and pgvector, applies deterministic compatibility scoring, and returns a recommendation plus alternatives. If the model provider is unavailable, the same product flow falls back to catalog-based logic.

### 0:55-1:25 - Technical implementation

Visual: Show the architecture diagram, then briefly show `backend/app/main.py`, `agent/app/scoring.py`, and `agent/app/reranker.py`.

Voiceover:

> The backend owns catalog facts and semantic retrieval. The agent applies taxonomy-aware scoring and reference-fragrance feedback. Qwen may rerank only known survivor slugs; multiple votes are aggregated with Borda count, and MMR keeps the final list diverse. Product facts never originate from the reranker.

### 1:25-1:58 - Codex and GPT-5.6

Visual: Show the official Codex session, a representative cross-service implementation step, and the resulting files or tests.

Voiceover:

> We built the majority of the core implementation with Codex powered by GPT-5.6. Codex accelerated cross-service tracing and implementation across FastAPI, SQL, Docker, evaluation, and the browser UI. We made the key decisions: catalog grounding, deterministic constraints, reviewed data sources, bounded LLM judgment, and measurable ranking quality. GPT-5.6 helped turn those decisions into consistent code and verification rather than replacing our product judgment.

### 1:58-2:25 - Evaluation and honesty

Visual: Show `agent/evaluation/results.json` and the repeated-run evaluation command in `agent/README.md`.

Voiceover:

> On our 30-persona offline benchmark, the recorded rerank run improved nDCG at three from point seven seven eight to point eight five two. We also found regressions and a real catalog gap for low-budget, high-longevity users. Because reranking is stochastic, the harness now supports repeated runs, hierarchical confidence intervals, independent judge models, and frozen holdouts.

### 2:25-2:40 - Close

Visual: Return to the recommendation result on desktop and mobile widths.

Voiceover:

> ScentSphere combines a consumer-ready experience with an inspectable recommendation pipeline: natural language where it helps, deterministic evidence where it matters.

## Final Compliance Checklist

- [ ] Working project is publicly accessible or straightforward for judges to run.
- [ ] Track is set to `Apps for Your Life`.
- [ ] Devpost project description explains what was created and how it works.
- [ ] Public YouTube demo is shorter than three minutes.
- [ ] Demo voiceover explicitly explains Codex and GPT-5.6 usage.
- [ ] Demo visibly shows the working project, not only slides or source code.
- [ ] Public repository contains setup instructions and sample input.
- [ ] Repository contains no `.env`, API key, service secret, or private data.
- [ ] README identifies where Codex accelerated work and where human decisions were made.
- [ ] Runtime Qwen and build-time GPT-5.6 roles are not conflated.
- [ ] `/feedback` Session ID comes from the original core Codex session.
- [ ] Historical single-run benchmark is not described as end-to-end proof.
- [ ] Development and holdout evaluation results are kept separate.
- [ ] All `PENDING` values in this document have been replaced.
- [ ] Deadline and eligibility are rechecked in the logged-in Devpost form before final submission.

Devpost currently lists the deadline as July 21, 2026 at 5:00 PM PDT. Confirm the displayed deadline before submitting.
