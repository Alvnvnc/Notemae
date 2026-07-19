import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import RecommendationProfile
from app.prompts import PROFILE_SYSTEM_PROMPT


def validate(path: Path) -> set[str]:
    seen: set[str] = set()
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), 1
    ):
        example = json.loads(line)
        messages = example["messages"]
        assert [message["role"] for message in messages] == [
            "system",
            "user",
            "assistant",
        ], f"{path}:{line_number}: invalid roles"
        assert messages[0]["content"] == PROFILE_SYSTEM_PROMPT
        user_payload = json.loads(messages[1]["content"])
        profile = RecommendationProfile.model_validate_json(messages[2]["content"])
        assert profile.free_text == user_payload["text"]
        assert profile.limit == user_payload["limit"]
        assert messages[1]["content"] not in seen, f"{path}:{line_number}: duplicate"
        seen.add(messages[1]["content"])
    return seen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    all_examples: set[str] = set()
    for path in args.paths:
        examples = validate(path)
        overlap = all_examples.intersection(examples)
        assert not overlap, f"{path}: overlaps another split"
        all_examples.update(examples)
        print(f"{path}: {len(examples)} valid examples")


if __name__ == "__main__":
    main()
