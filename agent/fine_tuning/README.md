# Qwen preference fine-tuning

This dataset specializes preference extraction, not fragrance facts. Catalog facts, prices, and reviews remain in retrieval so they can change without retraining.

## Generate and validate

From `agent/`:

```bash
python fine_tuning/generate_dataset.py --count 800
python fine_tuning/validate_dataset.py fine_tuning/data/train.jsonl fine_tuning/data/validation.jsonl
```

The generated ChatML data is deterministic: 640 training examples and 160 held-out validation examples by default. Review samples and correct any language patterns that do not reflect production traffic before paying for training.

## Train in Qwen Cloud

Qwen Cloud currently exposes this workflow through its console:

1. Open `https://home.qwencloud.com/model-production/datasets`.
2. Create a Text Generation / SFT dataset and upload `data/train.jsonl`.
3. Publish the dataset.
4. Create a fine-tuning job using Qwen3-14B, SFT, and LoRA.
5. Attach `data/validation.jsonl` as a custom validation dataset.
6. Start with 3 epochs, learning rate `0.0001`, batch size `16`, LoRA rank `64`, alpha `16`, and dropout `0.05`.
7. Publish the best checkpoint and create a deployment.
8. Put its deployment model code in `QWEN_PROFILE_MODEL`.

Do not replace `QWEN_MODEL=qwen3.7-plus`; that model remains the general explanation/reasoning model.

## Evaluate

Compare the base and deployed models on held-out data:

```bash
python fine_tuning/evaluate_profile_model.py --model qwen3.7-plus
python fine_tuning/evaluate_profile_model.py --model YOUR_DEPLOYMENT_MODEL_CODE
```

Promote the custom model only if validation exact-match and field accuracy improve without degrading negation, missing-value handling, Indonesian budgets, and mixed-language input.
