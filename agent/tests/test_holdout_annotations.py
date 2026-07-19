import csv
import json
import tempfile
import unittest
from pathlib import Path

from evaluation.holdout_annotations import (
    UnresolvedDisagreements,
    finalize_holdout,
    prepare_forms,
)


class HoldoutAnnotationsTest(unittest.TestCase):
    def test_prepares_all_unowned_pairs_in_independent_orders(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            paths = prepare_forms(
                Path("evaluation/fixtures/personas-holdout-unlabeled.json"),
                Path("evaluation/fixtures/catalog.json"),
                output_dir,
                seed=17,
            )

            rows = []
            for path in paths:
                with path.open(encoding="utf-8", newline="") as handle:
                    rows.append(list(csv.DictReader(handle)))
            pairs_a = [
                (row["persona_name"], row["product_slug"]) for row in rows[0]
            ]
            pairs_b = [
                (row["persona_name"], row["product_slug"]) for row in rows[1]
            ]

            self.assertEqual(len(pairs_a), 1107)
            self.assertEqual(set(pairs_a), set(pairs_b))
            self.assertNotEqual(pairs_a, pairs_b)
            self.assertNotIn(
                ("Bagas — alternatif Bleu hemat", "bleu-de-chanel-edp"),
                set(pairs_a),
            )

    def test_disagreements_require_complete_adjudication(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            personas = root / "personas.json"
            catalog = root / "catalog.json"
            personas.write_text(
                json.dumps(
                    [
                        {
                            "name": "Persona",
                            "text": "A valid holdout persona",
                            "profile": {"limit": 1},
                        }
                    ]
                )
            )
            catalog.write_text(
                json.dumps(
                    [
                        {"slug": "first", "brand": "A", "name": "First"},
                        {"slug": "second", "brand": "B", "name": "Second"},
                    ]
                )
            )
            form_a, form_b = prepare_forms(personas, catalog, root / "forms", 17)
            self._fill(form_a, {"first": 3, "second": 0})
            self._fill(form_b, {"first": 2, "second": 0})
            disagreements = root / "disagreements.csv"

            with self.assertRaises(UnresolvedDisagreements):
                finalize_holdout(
                    personas,
                    catalog,
                    form_a,
                    form_b,
                    root / "holdout.json",
                    disagreements,
                    "human-a",
                    "human-b",
                )

            self._adjudicate(disagreements, 3)
            output, metadata = finalize_holdout(
                personas,
                catalog,
                form_a,
                form_b,
                root / "holdout.json",
                disagreements,
                "human-a",
                "human-b",
                adjudication_path=disagreements,
                adjudicator_id="human-c",
            )
            labeled = json.loads(output.read_text())
            provenance = json.loads(metadata.read_text())

            self.assertEqual(labeled[0]["relevant"]["perfect"], ["first"])
            self.assertEqual(provenance["disagreements"], 1)
            self.assertEqual(provenance["rated_pairs"], 2)
            self.assertEqual(provenance["annotator_ids"], ["human-a", "human-b"])
            self.assertEqual(provenance["adjudicator_id"], "human-c")

    def test_rejects_persona_without_any_relevant_product(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            personas = root / "personas.json"
            catalog = root / "catalog.json"
            personas.write_text(
                json.dumps(
                    [
                        {
                            "name": "Persona",
                            "text": "A valid holdout persona",
                            "profile": {"limit": 1},
                        }
                    ]
                )
            )
            catalog.write_text(
                json.dumps(
                    [
                        {"slug": "first", "brand": "A", "name": "First"},
                        {"slug": "second", "brand": "B", "name": "Second"},
                    ]
                )
            )
            form_a, form_b = prepare_forms(personas, catalog, root / "forms", 17)
            self._fill(form_a, {"first": 0, "second": 0})
            self._fill(form_b, {"first": 0, "second": 0})

            with self.assertRaisesRegex(ValueError, "Persona: no relevant products"):
                finalize_holdout(
                    personas,
                    catalog,
                    form_a,
                    form_b,
                    root / "holdout.json",
                    root / "disagreements.csv",
                    "human-a",
                    "human-b",
                )

    @staticmethod
    def _fill(path: Path, ratings: dict[str, int]) -> None:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
            fieldnames = reader.fieldnames
        for row in rows:
            row["relevance_0_to_3"] = str(ratings[row["product_slug"]])
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    @staticmethod
    def _adjudicate(path: Path, rating: int) -> None:
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
            fieldnames = reader.fieldnames
        for row in rows:
            row["adjudicated_relevance"] = str(rating)
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)


if __name__ == "__main__":
    unittest.main()
