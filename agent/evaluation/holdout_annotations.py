"""Prepare and finalize a blinded, dual-annotator ranking holdout."""

import argparse
import csv
import hashlib
import json
import random
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import RecommendationProfile  # noqa: E402
from evaluation.run_eval import pearson, rank_values  # noqa: E402


FIXTURES = Path(__file__).parent / "fixtures"
DEFAULT_PERSONAS = FIXTURES / "personas-holdout-unlabeled.json"
DEFAULT_CATALOG = FIXTURES / "catalog.json"
DEFAULT_OUTPUT = FIXTURES / "personas-holdout.json"
FORM_COLUMNS = (
    "persona_name",
    "persona_text",
    "profile_json",
    "product_slug",
    "product_brand",
    "product_name",
    "product_facts_json",
    "relevance_0_to_3",
)
ADJUDICATION_COLUMNS = (
    "persona_name",
    "product_slug",
    "relevance_a",
    "relevance_b",
    "adjudicated_relevance",
)
GRADE_BY_RATING = {3: "perfect", 2: "good", 1: "acceptable"}


class UnresolvedDisagreements(ValueError):
    def __init__(self, count: int, path: Path) -> None:
        super().__init__(
            f"{count} disagreements require adjudication; complete {path} and "
            "rerun finalize with --adjudication"
        )
        self.count = count
        self.path = path


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_personas(path: Path) -> list[dict]:
    personas = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(personas, list) or not personas:
        raise ValueError("persona fixture must be a non-empty JSON list")
    names: set[str] = set()
    for persona in personas:
        name = persona.get("name")
        if not isinstance(name, str) or not name.strip() or name in names:
            raise ValueError(f"invalid or duplicate persona name: {name!r}")
        names.add(name)
        if "relevant" in persona:
            raise ValueError(f"{name}: expected an unlabeled persona fixture")
        if not isinstance(persona.get("text"), str) or not persona["text"].strip():
            raise ValueError(f"{name}: text is required")
        RecommendationProfile.model_validate(persona.get("profile"))
    return personas


def load_catalog(path: Path) -> list[dict]:
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(catalog, list) or not catalog:
        raise ValueError("catalog fixture must be a non-empty JSON list")
    slugs = [record.get("slug") for record in catalog]
    if any(not isinstance(slug, str) or not slug for slug in slugs):
        raise ValueError("every catalog product must have a slug")
    if len(slugs) != len(set(slugs)):
        raise ValueError("catalog slugs must be unique")
    return catalog


def products_for_persona(persona: dict, catalog: list[dict]) -> list[dict]:
    owned = set(persona.get("reference_like_slugs", []))
    return [record for record in catalog if record["slug"] not in owned]


def expected_pairs(
    personas: list[dict], catalog: list[dict]
) -> set[tuple[str, str]]:
    return {
        (persona["name"], product["slug"])
        for persona in personas
        for product in products_for_persona(persona, catalog)
    }


def product_facts(product: dict) -> dict[str, object]:
    return {
        key: product.get(key)
        for key in (
            "description",
            "gender",
            "notes",
            "occasions",
            "climates",
            "price_idr",
            "rating",
            "longevity_score",
            "projection_score",
        )
    }


def prepare_forms(
    personas_path: Path,
    catalog_path: Path,
    output_dir: Path,
    seed: int,
    force: bool = False,
) -> tuple[Path, Path]:
    personas = load_personas(personas_path)
    catalog = load_catalog(catalog_path)
    catalog_slugs = {record["slug"] for record in catalog}
    reference_slugs = {
        slug
        for persona in personas
        for key in ("reference_like_slugs", "reference_dislike_slugs")
        for slug in persona.get(key, [])
    }
    unknown = sorted(reference_slugs - catalog_slugs)
    if unknown:
        raise ValueError(f"unknown reference slugs: {unknown}")

    output_dir.mkdir(parents=True, exist_ok=True)
    paths = (
        output_dir / "holdout-annotator-a.csv",
        output_dir / "holdout-annotator-b.csv",
    )
    for label, path in zip(("a", "b"), paths, strict=True):
        if path.exists() and not force:
            raise FileExistsError(f"refusing to overwrite {path}")
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FORM_COLUMNS)
            writer.writeheader()
            for persona in personas:
                products = products_for_persona(persona, catalog)
                random.Random(f"{seed}:{label}:{persona['name']}").shuffle(products)
                for product in products:
                    writer.writerow(
                        {
                            "persona_name": persona["name"],
                            "persona_text": persona["text"],
                            "profile_json": json.dumps(
                                persona["profile"], ensure_ascii=False, sort_keys=True
                            ),
                            "product_slug": product["slug"],
                            "product_brand": product["brand"],
                            "product_name": product["name"],
                            "product_facts_json": json.dumps(
                                product_facts(product),
                                ensure_ascii=False,
                                sort_keys=True,
                            ),
                            "relevance_0_to_3": "",
                        }
                    )
    return paths


def read_annotations(
    path: Path, expected: set[tuple[str, str]]
) -> dict[tuple[str, str], int]:
    ratings: dict[tuple[str, str], int] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if not set(FORM_COLUMNS).issubset(reader.fieldnames or []):
            raise ValueError(f"{path}: invalid annotation columns")
        for line_number, row in enumerate(reader, 2):
            key = (row["persona_name"], row["product_slug"])
            if key in ratings:
                raise ValueError(f"{path}:{line_number}: duplicate pair {key}")
            raw_rating = row["relevance_0_to_3"].strip()
            if raw_rating not in {"0", "1", "2", "3"}:
                raise ValueError(
                    f"{path}:{line_number}: relevance must be an integer from 0 to 3"
                )
            ratings[key] = int(raw_rating)
    missing = expected - set(ratings)
    extra = set(ratings) - expected
    if missing or extra:
        raise ValueError(
            f"{path}: annotation pairs differ from fixture "
            f"(missing={len(missing)}, extra={len(extra)})"
        )
    return ratings


def write_disagreements(
    path: Path,
    disagreements: dict[tuple[str, str], tuple[int, int]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=ADJUDICATION_COLUMNS)
        writer.writeheader()
        for (persona, slug), (rating_a, rating_b) in sorted(disagreements.items()):
            writer.writerow(
                {
                    "persona_name": persona,
                    "product_slug": slug,
                    "relevance_a": rating_a,
                    "relevance_b": rating_b,
                    "adjudicated_relevance": "",
                }
            )


def read_adjudication(
    path: Path, disagreements: dict[tuple[str, str], tuple[int, int]]
) -> dict[tuple[str, str], int]:
    resolved: dict[tuple[str, str], int] = {}
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if not set(ADJUDICATION_COLUMNS).issubset(reader.fieldnames or []):
            raise ValueError(f"{path}: invalid adjudication columns")
        for line_number, row in enumerate(reader, 2):
            key = (row["persona_name"], row["product_slug"])
            if key in resolved:
                raise ValueError(f"{path}:{line_number}: duplicate pair {key}")
            raw_rating = row["adjudicated_relevance"].strip()
            if raw_rating not in {"0", "1", "2", "3"}:
                raise ValueError(
                    f"{path}:{line_number}: adjudicated relevance must be 0 to 3"
                )
            resolved[key] = int(raw_rating)
    if set(resolved) != set(disagreements):
        raise ValueError("adjudication rows must exactly match all disagreements")
    return resolved


def quadratic_weighted_kappa(left: list[int], right: list[int]) -> float:
    categories = 4
    observed = [[0 for _ in range(categories)] for _ in range(categories)]
    for left_value, right_value in zip(left, right, strict=True):
        observed[left_value][right_value] += 1
    left_counts = [sum(row) for row in observed]
    right_counts = [
        sum(observed[row][column] for row in range(categories))
        for column in range(categories)
    ]
    total = len(left)
    observed_disagreement = 0.0
    expected_disagreement = 0.0
    for row in range(categories):
        for column in range(categories):
            weight = ((row - column) / (categories - 1)) ** 2
            observed_disagreement += weight * observed[row][column] / total
            expected_disagreement += (
                weight * left_counts[row] * right_counts[column] / total**2
            )
    if expected_disagreement == 0:
        return 1.0 if observed_disagreement == 0 else 0.0
    return 1 - observed_disagreement / expected_disagreement


def agreement_stats(
    ratings_a: dict[tuple[str, str], int],
    ratings_b: dict[tuple[str, str], int],
) -> dict[str, float | int]:
    keys = sorted(ratings_a)
    left = [ratings_a[key] for key in keys]
    right = [ratings_b[key] for key in keys]
    return {
        "pairs": len(keys),
        "exact_agreement": round(
            sum(a == b for a, b in zip(left, right, strict=True)) / len(keys), 3
        ),
        "pearson_r": round(pearson(left, right), 3),
        "spearman_rho": round(
            pearson(rank_values(left), rank_values(right)), 3
        ),
        "quadratic_weighted_kappa": round(
            quadratic_weighted_kappa(left, right), 3
        ),
    }


def finalize_holdout(
    personas_path: Path,
    catalog_path: Path,
    annotator_a_path: Path,
    annotator_b_path: Path,
    output_path: Path,
    disagreements_path: Path,
    annotator_a_id: str,
    annotator_b_id: str,
    adjudication_path: Path | None = None,
    adjudicator_id: str | None = None,
    force: bool = False,
) -> tuple[Path, Path]:
    personas = load_personas(personas_path)
    catalog = load_catalog(catalog_path)
    expected = expected_pairs(personas, catalog)
    ratings_a = read_annotations(annotator_a_path, expected)
    ratings_b = read_annotations(annotator_b_path, expected)
    disagreements = {
        key: (ratings_a[key], ratings_b[key])
        for key in expected
        if ratings_a[key] != ratings_b[key]
    }
    if disagreements and adjudication_path is None:
        write_disagreements(disagreements_path, disagreements)
        raise UnresolvedDisagreements(len(disagreements), disagreements_path)
    if adjudication_path is not None and not adjudicator_id:
        raise ValueError("--adjudicator-id is required with --adjudication")
    adjudicated = (
        read_adjudication(adjudication_path, disagreements)
        if adjudication_path is not None
        else {}
    )
    resolved = {key: adjudicated.get(key, ratings_a[key]) for key in expected}

    labeled_personas: list[dict] = []
    for persona in personas:
        relevant = {"perfect": [], "good": [], "acceptable": []}
        for product in products_for_persona(persona, catalog):
            rating = resolved[(persona["name"], product["slug"])]
            if rating:
                relevant[GRADE_BY_RATING[rating]].append(product["slug"])
        if not any(relevant.values()):
            raise ValueError(
                f"{persona['name']}: no relevant products; replace or adjudicate "
                "this persona before freezing the holdout"
            )
        labeled_persona = dict(persona)
        labeled_persona["relevant"] = relevant
        labeled_personas.append(labeled_persona)

    metadata_path = output_path.with_name(f"{output_path.stem}-metadata.json")
    for path in (output_path, metadata_path):
        if path.exists() and not force:
            raise FileExistsError(f"refusing to overwrite frozen artifact {path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(labeled_personas, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    distribution = Counter(resolved.values())
    metadata = {
        "created_at": datetime.now(UTC).isoformat(),
        "labeling_protocol": (
            "two independent 0-3 relevance ratings with adjudication of every "
            "disagreement"
        ),
        "annotator_ids": [annotator_a_id, annotator_b_id],
        "adjudicator_id": adjudicator_id,
        "personas": len(personas),
        "catalog_items": len(catalog),
        "rated_pairs": len(expected),
        "disagreements": len(disagreements),
        "agreement": agreement_stats(ratings_a, ratings_b),
        "resolved_label_distribution": {
            str(rating): distribution.get(rating, 0) for rating in range(4)
        },
        "source_personas": str(personas_path.resolve()),
        "source_personas_sha256": file_sha256(personas_path),
        "catalog": str(catalog_path.resolve()),
        "catalog_sha256": file_sha256(catalog_path),
        "annotator_a_sha256": file_sha256(annotator_a_path),
        "annotator_b_sha256": file_sha256(annotator_b_path),
        "adjudication_sha256": (
            file_sha256(adjudication_path) if adjudication_path else None
        ),
        "holdout_sha256": file_sha256(output_path),
    }
    metadata_path.write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return output_path, metadata_path


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--personas", type=Path, default=DEFAULT_PERSONAS)
    prepare.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    prepare.add_argument("--output-dir", type=Path, required=True)
    prepare.add_argument("--seed", type=int, default=20260718)
    prepare.add_argument("--force", action="store_true")

    finalize = subparsers.add_parser("finalize")
    finalize.add_argument("--personas", type=Path, default=DEFAULT_PERSONAS)
    finalize.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    finalize.add_argument("--annotator-a", type=Path, required=True)
    finalize.add_argument("--annotator-b", type=Path, required=True)
    finalize.add_argument("--annotator-a-id", required=True)
    finalize.add_argument("--annotator-b-id", required=True)
    finalize.add_argument("--adjudication", type=Path)
    finalize.add_argument("--adjudicator-id")
    finalize.add_argument(
        "--disagreements-output",
        type=Path,
        default=Path("evaluation/annotations/holdout-disagreements.csv"),
    )
    finalize.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    finalize.add_argument("--force", action="store_true")

    args = parser.parse_args()
    if args.command == "prepare":
        paths = prepare_forms(
            args.personas, args.catalog, args.output_dir, args.seed, args.force
        )
        print(f"wrote {paths[0]}")
        print(f"wrote {paths[1]}")
        return

    try:
        output_path, metadata_path = finalize_holdout(
            personas_path=args.personas,
            catalog_path=args.catalog,
            annotator_a_path=args.annotator_a,
            annotator_b_path=args.annotator_b,
            output_path=args.output,
            disagreements_path=args.disagreements_output,
            annotator_a_id=args.annotator_a_id,
            annotator_b_id=args.annotator_b_id,
            adjudication_path=args.adjudication,
            adjudicator_id=args.adjudicator_id,
            force=args.force,
        )
    except UnresolvedDisagreements as error:
        parser.exit(2, f"{error}\n")
    print(f"wrote frozen holdout {output_path}")
    print(f"wrote provenance {metadata_path}")


if __name__ == "__main__":
    main()
