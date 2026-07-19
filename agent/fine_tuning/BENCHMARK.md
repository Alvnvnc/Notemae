# Preference extraction benchmark

## Baseline

- Date: 2026-07-17
- Model: `qwen3.7-plus`
- Dataset: first 10 held-out examples from `data/validation.jsonl`
- Exact match: `0.200`
- Field accuracy: `0.864`

This small smoke benchmark justifies testing the specialized model but is not enough for a production promotion decision. Run all 160 held-out examples against both the base and deployed fine-tuned models. Promote only if exact match improves materially and no critical field regresses, especially negation, budget normalization, missing values, and `free_text` preservation.
