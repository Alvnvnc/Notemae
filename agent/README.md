# Agent service

FastAPI service for catalog-grounded fragrance recommendations and comparisons. Qwen extracts free-text preferences, layered deterministic code scores candidates (taxonomy note matching, anchor similarity, hard constraint filters, MMR diversity), Qwen optionally reranks the survivor pool listwise with self-consistency voting, and Qwen explains the result using only supplied catalog facts.

## Environment

Local commands automatically load `.env` from the repository root or from
`agent/.env` (the agent-local file takes precedence). Process environment
variables and explicit settings still take precedence over dotenv values.

- `DASHSCOPE_API_KEY`: Qwen Cloud key. Without it, endpoints use deterministic fallbacks.
- `QWEN_BASE_URL`: OpenAI-compatible Qwen endpoint.
- `QWEN_MODEL`: explanation/reasoning model, default `qwen3.7-plus`.
- `QWEN_PROFILE_MODEL`: optional deployed fine-tuned model code for preference extraction.
- `QWEN_EMBED_MODEL`: embedding model, default `text-embedding-v4`.
- `QWEN_EMBEDDING_DIMENSIONS`: must match the pgvector column; default `1024`.
- `QWEN_THINKING`: enables thinking for explanations, but not structured profile extraction.
- `QWEN_RERANK_ENABLED`: LLM listwise rerank of the scored survivor pool, default on; degrades to deterministic order on any failure.
- `QWEN_RERANK_VOTES` / `QWEN_RERANK_POOL` / `QWEN_RERANK_WEIGHT` / `QWEN_RERANK_TEMPERATURE`: self-consistency vote count (default 2), pool size (10), blend weight (0.3), and vote temperature (0.7).

Fine-tuning data, validation, evaluation scripts, and console instructions are in `fine_tuning/`.

## Offline ranking evaluation

`evaluation/run_eval.py` measures ranking quality on a hand-labeled persona golden set (`evaluation/fixtures/`) with nDCG@3, hit@1, constraint-violation rates, and intra-list diversity. Labels are authored independently of the scoring code so results are not circular; the catalog fixture is never ingested.

```bash
uv run python evaluation/run_eval.py              # deterministic baseline
uv run python evaluation/run_eval.py --with-qwen  # A/B against LLM listwise rerank
uv run python evaluation/run_eval.py --with-qwen --judge --runs 10
```

For a reportable stochastic result, use at least 10 rerank runs. The harness averages repeated outcomes within each persona before the paired sign-flip test, uses a hierarchical bootstrap over personas and runs, and reports run-to-run variance. Repeated model calls therefore do not inflate the sample size beyond the 30 persona-level units.

The judge evaluates the union of products returned for a persona once, then reuses those ratings across variants and runs. Agreement is reported over unique persona-product pairs with Pearson, Spearman, and quadratic weighted kappa. Prefer a genuinely different judge model when one is available:

```bash
uv run python evaluation/run_eval.py --with-qwen --judge --runs 10 \
  --judge-model <independent-model-code>
```

Every result records model settings, the command, and SHA-256 hashes of both fixtures. Use `--personas-file`, `--catalog-file`, and `--output` to evaluate a frozen holdout without overwriting development results. Once this 30-persona set is used to choose adaptive weights, treat it as development data and make final claims only from a separately labeled holdout.

The historical single-run A/B in `evaluation/results.json` reported nDCG@3 0.778 to 0.852 (paired sign-flip p = 0.0137, 95% CI [0.02, 0.128]) and hit@1 0.833 to 0.933, with no observed avoid or budget violations in that fixture. It is evidence about offline ranking over structured profiles and a curated full catalog, not about profile extraction, production retrieval, ingestion, explanation grounding, or all possible constraint-pool conditions.

### Latest development multi-run

`evaluation/results-multirun-dev.json` is a 10-run development-set
evaluation using `qwen3.7-plus` for reranking and the independent
`deepseek-v4-flash` model as judge. It reports nDCG@3 0.778 to 0.847
(mean delta +0.069, paired sign-flip p = 0.0113, hierarchical-bootstrap
95% CI [0.019, 0.121]). Every run improved over baseline; the run-level
delta SD is 0.003 with range [+0.065, +0.074].

The independent judge mean improved from 1.156 to 1.296. Agreement against
hand labels over 116 unique persona-product pairs is Pearson 0.624, Spearman
0.622, and quadratic weighted kappa 0.554. These are development results:
the fixture has already informed ranking analysis, so they must not be
presented as final holdout evidence.

### Human-labeled holdout

`evaluation/fixtures/personas-holdout-unlabeled.json` contains 30 new personas
with no relevance labels. Generate two blinded forms with independently
shuffled product order:

```bash
uv run python evaluation/holdout_annotations.py prepare \
  --output-dir evaluation/annotations/holdout-v1
```

Two evaluators must fill `relevance_0_to_3` independently for every row:
`0` means not relevant, `1` acceptable, `2` good, and `3` perfect. They
must not see each other's form. Finalization writes an adjudication form and
exits when any ratings differ:

```bash
uv run python evaluation/holdout_annotations.py finalize \
  --annotator-a evaluation/annotations/holdout-v1/holdout-annotator-a.csv \
  --annotator-b evaluation/annotations/holdout-v1/holdout-annotator-b.csv \
  --annotator-a-id <evaluator-a-id> \
  --annotator-b-id <evaluator-b-id>
```

After a third evaluator fills every `adjudicated_relevance` cell, rerun with:

```bash
uv run python evaluation/holdout_annotations.py finalize \
  --annotator-a evaluation/annotations/holdout-v1/holdout-annotator-a.csv \
  --annotator-b evaluation/annotations/holdout-v1/holdout-annotator-b.csv \
  --annotator-a-id <evaluator-a-id> \
  --annotator-b-id <evaluator-b-id> \
  --adjudication evaluation/annotations/holdout-disagreements.csv \
  --adjudicator-id <adjudicator-id>
```

This freezes `personas-holdout.json` and a metadata sidecar containing human
agreement, label distribution, provenance, and SHA-256 hashes. Only then run:

```bash
uv run python evaluation/run_eval.py \
  --with-qwen --judge --runs 10 \
  --judge-model deepseek-v4-flash \
  --personas-file evaluation/fixtures/personas-holdout.json \
  --output evaluation/results-holdout.json
```

Run through the root `docker-compose.yml`. Interactive API documentation is served at `/docs`.
