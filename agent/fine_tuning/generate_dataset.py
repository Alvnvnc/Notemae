import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.prompts import PROFILE_SYSTEM_PROMPT


INDONESIAN_SUBJECTS = [
    ("Saya pria", "men"),
    ("Aku perempuan", "women"),
    ("Saya mencari parfum unisex", "unisex"),
    ("Saya laki-laki", "men"),
    ("Aku wanita", "women"),
]
ENGLISH_SUBJECTS = [
    ("I am a man", "men"),
    ("I am a woman", "women"),
    ("I want a unisex fragrance", "unisex"),
]
BUDGETS_ID = [
    ("budget 500 ribu", 500_000),
    ("maksimal 750 ribu", 750_000),
    ("anggaran 1 juta", 1_000_000),
    ("budget 1,5 juta", 1_500_000),
    ("maksimal 2 juta", 2_000_000),
]
BUDGETS_EN = [
    ("with a budget of 500 thousand rupiah", 500_000),
    ("under 1 million rupiah", 1_000_000),
    ("with a 1.5 million rupiah budget", 1_500_000),
    ("under 2 million rupiah", 2_000_000),
]
OCCASIONS_ID = [
    ("untuk ke kantor", "office"),
    ("untuk wawancara kerja", "interview"),
    ("untuk kencan", "date"),
    ("untuk dipakai santai", "casual"),
    ("untuk pesta", "party"),
    ("untuk pernikahan", "wedding"),
]
OCCASIONS_EN = [
    ("for the office", "office"),
    ("for an interview", "interview"),
    ("for a date", "date"),
    ("for casual wear", "casual"),
    ("for a party", "party"),
    ("for a wedding", "wedding"),
]
CLIMATES_ID = [
    ("di cuaca tropis", "tropical"),
    ("untuk hari yang panas", "hot"),
    ("di cuaca hangat", "warm"),
]
CLIMATES_EN = [
    ("in a tropical climate", "tropical"),
    ("for hot weather", "hot"),
    ("in warm weather", "warm"),
]
PREFERENCES_ID = [
    ("Suka citrus dan cedar yang fresh", ["citrus", "cedar"], ["fresh"]),
    ("Suka iris dan neroli yang clean", ["iris", "neroli"], ["fresh"]),
    ("Suka oud dan amber yang woody", ["oud", "amber"], ["woody"]),
    ("Suka rose dan jasmine yang floral", ["rose", "jasmine"], ["floral"]),
    ("Suka vetiver dan bergamot yang aromatic", ["vetiver", "bergamot"], ["aromatic"]),
    ("Suka coffee dan vanilla yang gourmand", ["coffee", "vanilla"], ["gourmand"]),
    ("Suka leather dan tobacco", ["leather", "tobacco"], ["leather"]),
]
PREFERENCES_EN = [
    ("I like fresh citrus and cedar", ["citrus", "cedar"], ["fresh"]),
    ("I like clean iris and neroli", ["iris", "neroli"], ["fresh"]),
    ("I prefer woody oud and amber", ["oud", "amber"], ["woody"]),
    ("I enjoy floral rose and jasmine", ["rose", "jasmine"], ["floral"]),
    ("I prefer aromatic vetiver and bergamot", ["vetiver", "bergamot"], ["aromatic"]),
    ("I enjoy gourmand coffee and vanilla", ["coffee", "vanilla"], ["gourmand"]),
]
AVOID_ID = [
    ("tidak suka aroma manis", ["sweet"]),
    ("hindari vanilla", ["vanilla"]),
    ("jangan ada oud", ["oud"]),
    ("tidak suka leather", ["leather"]),
    ("hindari tobacco", ["tobacco"]),
]
AVOID_EN = [
    ("not sweet", ["sweet"]),
    ("avoid vanilla", ["vanilla"]),
    ("no oud", ["oud"]),
    ("avoid leather", ["leather"]),
    ("no tobacco", ["tobacco"]),
]
PERFORMANCE_ID = [
    ("ingin ketahanan tinggi dan proyeksi sedang", "high", "moderate"),
    ("ketahanan sedang dengan proyeksi rendah", "moderate", "low"),
    ("ingin ketahanan dan proyeksi tinggi", "high", "high"),
]
PERFORMANCE_EN = [
    ("with high longevity and moderate projection", "high", "moderate"),
    ("with moderate longevity and low projection", "moderate", "low"),
    ("with high longevity and high projection", "high", "high"),
]
REFERENCE_LIKES_ID = [
    ("Saya suka aroma seperti Bleu de Chanel", ["Bleu de Chanel"]),
    ("Biasa pakai Dior Sauvage", ["Dior Sauvage"]),
    ("Ingin yang mirip Prada L'Homme", ["Prada L'Homme"]),
    ("Cari yang mirip Versace Pour Homme", ["Versace Pour Homme"]),
    ("Suka pakai HMNS Farhampton", ["HMNS Farhampton"]),
]
REFERENCE_LIKES_EN = [
    ("I want something like Bleu de Chanel", ["Bleu de Chanel"]),
    ("I usually wear Dior Sauvage", ["Dior Sauvage"]),
    ("Something similar to Prada L'Homme", ["Prada L'Homme"]),
]
REFERENCE_DISLIKES_ID = [
    ("Acqua di Gio kurang cocok buat saya", ["Acqua di Gio"]),
    ("Sudah bosan dengan Dior Sauvage", ["Dior Sauvage"]),
    ("Versace Eros terlalu menyengat buat saya", ["Versace Eros"]),
]
REFERENCE_DISLIKES_EN = [
    ("Acqua di Gio did not work for me", ["Acqua di Gio"]),
    ("I am bored of Dior Sauvage", ["Dior Sauvage"]),
]


def choose_references(
    randomizer: random.Random, language: str
) -> tuple[list[str], list[str], list[str]]:
    """Return (text fragments, reference_likes, reference_dislikes)."""
    likes_pool = REFERENCE_LIKES_ID if language == "id" else REFERENCE_LIKES_EN
    dislikes_pool = (
        REFERENCE_DISLIKES_ID if language == "id" else REFERENCE_DISLIKES_EN
    )
    fragments: list[str] = []
    likes: list[str] = []
    dislikes: list[str] = []
    if randomizer.random() < 0.45:
        text, names = randomizer.choice(likes_pool)
        fragments.append(text)
        likes = names
    if randomizer.random() < 0.25:
        text, names = randomizer.choice(
            [option for option in dislikes_pool if option[1] != likes] or dislikes_pool
        )
        if names != likes:
            fragments.append(text)
            dislikes = names
    return fragments, likes, dislikes


def choose_non_conflicting_avoid(
    randomizer: random.Random,
    options: list[tuple[str, list[str]]],
    preferred_notes: list[str],
) -> tuple[str, list[str]]:
    conflicts = set(preferred_notes)
    if "vanilla" in conflicts:
        conflicts.add("sweet")
    valid = [option for option in options if not conflicts.intersection(option[1])]
    return randomizer.choice(valid)


def make_example(
    randomizer: random.Random, language: str, limit: int
) -> dict[str, object]:
    if language == "id":
        subject, gender = randomizer.choice(INDONESIAN_SUBJECTS)
        budget_text, budget = randomizer.choice(BUDGETS_ID)
        occasion_text, occasion = randomizer.choice(OCCASIONS_ID)
        climate_text, climate = randomizer.choice(CLIMATES_ID)
        preference_text, notes, families = randomizer.choice(PREFERENCES_ID)
        avoid_text, avoided = choose_non_conflicting_avoid(randomizer, AVOID_ID, notes)
        performance_text, longevity, projection = randomizer.choice(PERFORMANCE_ID)
    else:
        subject, gender = randomizer.choice(ENGLISH_SUBJECTS)
        budget_text, budget = randomizer.choice(BUDGETS_EN)
        occasion_text, occasion = randomizer.choice(OCCASIONS_EN)
        climate_text, climate = randomizer.choice(CLIMATES_EN)
        preference_text, notes, families = randomizer.choice(PREFERENCES_EN)
        avoid_text, avoided = choose_non_conflicting_avoid(randomizer, AVOID_EN, notes)
        performance_text, longevity, projection = randomizer.choice(PERFORMANCE_EN)

    reference_fragments, likes, dislikes = choose_references(randomizer, language)
    text = (
        ". ".join(
            [
                f"{subject}, {budget_text}, {occasion_text} {climate_text}",
                preference_text,
                avoid_text,
                performance_text,
                *reference_fragments,
            ]
        )
        + "."
    )

    profile = {
        "budget_idr": budget,
        "occasion": occasion,
        "climate": climate,
        "gender": gender,
        "preferred_notes": notes,
        "avoid_notes": avoided,
        "preferred_families": families,
        "reference_likes": likes,
        "reference_dislikes": dislikes,
        "longevity_preference": longevity,
        "projection_preference": projection,
        "free_text": text,
        "limit": limit,
    }
    return {
        "messages": [
            {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {"text": text, "limit": limit}, ensure_ascii=False
                ),
            },
            {
                "role": "assistant",
                "content": json.dumps(
                    profile, ensure_ascii=False, separators=(",", ":")
                ),
            },
        ]
    }


def make_sparse_example(
    randomizer: random.Random, language: str, limit: int
) -> dict[str, object]:
    if language == "id":
        subjects = INDONESIAN_SUBJECTS
        budgets = BUDGETS_ID
        occasions = OCCASIONS_ID
        climates = CLIMATES_ID
        preferences = PREFERENCES_ID
        avoids = AVOID_ID
        performances = PERFORMANCE_ID
    else:
        subjects = ENGLISH_SUBJECTS
        budgets = BUDGETS_EN
        occasions = OCCASIONS_EN
        climates = CLIMATES_EN
        preferences = PREFERENCES_EN
        avoids = AVOID_EN
        performances = PERFORMANCE_EN

    subject_text, gender_value = randomizer.choice(subjects)
    budget_text, budget_value = randomizer.choice(budgets)
    occasion_text, occasion_value = randomizer.choice(occasions)
    climate_text, climate_value = randomizer.choice(climates)
    preference_text, notes_value, families_value = randomizer.choice(preferences)
    avoid_text, avoided_value = choose_non_conflicting_avoid(
        randomizer, avoids, notes_value
    )
    performance_text, longevity_value, projection_value = randomizer.choice(
        performances
    )

    flags = {
        "subject": randomizer.random() < 0.55,
        "budget": randomizer.random() < 0.55,
        "occasion": randomizer.random() < 0.65,
        "climate": randomizer.random() < 0.45,
        "preference": randomizer.random() < 0.65,
        "avoid": randomizer.random() < 0.4,
        "performance": randomizer.random() < 0.4,
    }
    if not any(flags.values()):
        flags["occasion"] = True

    reference_fragments, likes_value, dislikes_value = choose_references(
        randomizer, language
    )
    fragments = [
        text
        for key, text in (
            ("subject", subject_text),
            ("budget", budget_text),
            ("occasion", occasion_text),
            ("climate", climate_text),
            ("preference", preference_text),
            ("avoid", avoid_text),
            ("performance", performance_text),
        )
        if flags[key]
    ] + reference_fragments
    text = ", ".join(fragments) + "."
    profile = {
        "budget_idr": budget_value if flags["budget"] else None,
        "occasion": occasion_value if flags["occasion"] else None,
        "climate": climate_value if flags["climate"] else None,
        "gender": gender_value if flags["subject"] else None,
        "preferred_notes": notes_value if flags["preference"] else [],
        "avoid_notes": avoided_value if flags["avoid"] else [],
        "preferred_families": families_value if flags["preference"] else [],
        "reference_likes": likes_value,
        "reference_dislikes": dislikes_value,
        "longevity_preference": longevity_value if flags["performance"] else None,
        "projection_preference": projection_value if flags["performance"] else None,
        "free_text": text,
        "limit": limit,
    }
    return {
        "messages": [
            {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {"text": text, "limit": limit}, ensure_ascii=False
                ),
            },
            {
                "role": "assistant",
                "content": json.dumps(
                    profile, ensure_ascii=False, separators=(",", ":")
                ),
            },
        ]
    }


def write_jsonl(path: Path, examples: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(example, ensure_ascii=False) + "\n" for example in examples),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=800)
    parser.add_argument("--validation-ratio", type=float, default=0.2)
    parser.add_argument("--output", type=Path, default=Path("fine_tuning/data"))
    args = parser.parse_args()

    randomizer = random.Random(20260717)
    unique: dict[str, dict[str, object]] = {}
    attempts = 0
    while len(unique) < args.count and attempts < args.count * 20:
        language = "id" if randomizer.random() < 0.75 else "en"
        factory = make_sparse_example if randomizer.random() < 0.5 else make_example
        example = factory(randomizer, language, randomizer.randint(1, 5))
        user_content = str(example["messages"][1]["content"])
        unique[user_content] = example
        attempts += 1

    examples = list(unique.values())
    randomizer.shuffle(examples)
    validation_size = max(1, round(len(examples) * args.validation_ratio))
    write_jsonl(args.output / "train.jsonl", examples[validation_size:])
    write_jsonl(args.output / "validation.jsonl", examples[:validation_size])
    print(
        f"Generated {len(examples) - validation_size} training and "
        f"{validation_size} validation examples."
    )


if __name__ == "__main__":
    main()
