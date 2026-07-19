import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openai import OpenAI

from app.prompts import PROFILE_SYSTEM_PROMPT


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument(
        "--dataset", type=Path, default=Path("fine_tuning/data/validation.jsonl")
    )
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()

    client = OpenAI(
        api_key=os.environ["DASHSCOPE_API_KEY"],
        base_url=os.getenv(
            "QWEN_BASE_URL",
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        ),
    )
    exact = 0
    fields_correct = 0
    fields_total = 0
    examples = args.dataset.read_text(encoding="utf-8").splitlines()[: args.limit]
    for line in examples:
        messages = json.loads(line)["messages"]
        expected = json.loads(messages[2]["content"])
        response = client.chat.completions.create(
            model=args.model,
            messages=[
                {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
                {"role": "user", "content": messages[1]["content"]},
            ],
            response_format={"type": "json_object"},
            extra_body={"enable_thinking": False},
        )
        actual = json.loads(response.choices[0].message.content)
        exact += actual == expected
        for key, expected_value in expected.items():
            fields_total += 1
            fields_correct += actual.get(key) == expected_value

    print(f"examples={len(examples)}")
    print(f"exact_match={exact / len(examples):.3f}")
    print(f"field_accuracy={fields_correct / fields_total:.3f}")


if __name__ == "__main__":
    main()
