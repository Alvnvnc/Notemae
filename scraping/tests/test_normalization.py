"""The note pyramid and the flat note list must never disagree.

Two representations of the same fact will drift the moment anything is
allowed to write one without the other, and a drifted catalog is invisible:
the record still looks complete, it just ranks and reads wrong. Every test
here pins one half of that invariant.
"""

import unittest

from app.enrichment import clean_pyramid
from app.models import SourceRecord
from app.normalization import normalize_record


def record(**overrides: object) -> SourceRecord:
    payload: dict[str, object] = {
        "source_name": "fixture",
        "source_type": "public_dataset",
        "source_url": "https://example.test/dataset",
        "terms_confirmed": True,
        "brand": "Test",
        "name": "Fixture",
    }
    payload.update(overrides)
    return SourceRecord(**payload)


class NormalizationTest(unittest.TestCase):
    def test_flat_notes_are_derived_from_the_tiers(self) -> None:
        result = normalize_record(
            record(
                notes=["ignored"],
                top_notes=["Bergamot"],
                heart_notes=["Iris"],
                base_notes=["Vanilla"],
            )
        )

        # whatever a source claims in `notes` is discarded once it also
        # states a pyramid, so the union can only ever be the tiers
        self.assertEqual(result["notes"], ["bergamot", "iris", "vanilla"])

    def test_the_union_is_ordered_opening_first(self) -> None:
        result = normalize_record(
            record(top_notes=["lemon"], heart_notes=["rose"], base_notes=["oud"])
        )

        self.assertEqual(result["notes"], ["lemon", "rose", "oud"])

    def test_a_note_claimed_in_two_tiers_lands_in_the_earlier_one(self) -> None:
        result = normalize_record(
            record(heart_notes=["amber"], base_notes=["amber", "musk"])
        )

        self.assertEqual(result["heart_notes"], ["amber"])
        self.assertEqual(result["base_notes"], ["musk"])
        self.assertEqual(result["notes"], ["amber", "musk"])

    def test_a_source_without_a_pyramid_keeps_its_flat_list(self) -> None:
        result = normalize_record(record(notes=["Bergamot", "bergamot", "Oud"]))

        self.assertEqual(result["notes"], ["bergamot", "oud"])
        self.assertEqual(result["top_notes"], [])
        self.assertEqual(result["base_notes"], [])


class CleanPyramidTest(unittest.TestCase):
    def test_tiers_are_read_into_a_derived_union(self) -> None:
        result = clean_pyramid(
            {"top_notes": ["Bergamot"], "base_notes": ["Vanilla", "vanilla"]}
        )

        self.assertEqual(result["notes"], ["bergamot", "vanilla"])
        self.assertEqual(result["heart_notes"], [])

    def test_the_old_flat_reply_shape_still_parses(self) -> None:
        # models occasionally answer with the pre-pyramid contract; that is
        # the same state as any record ingested before tiers existed
        result = clean_pyramid({"notes": ["oud", "rose"]})

        self.assertEqual(result["notes"], ["oud", "rose"])
        self.assertEqual(result["top_notes"], [])

    def test_the_note_cap_trims_tiers_and_union_together(self) -> None:
        overlong = [f"note{index}" for index in range(20)]
        result = clean_pyramid({"base_notes": overlong})

        self.assertEqual(len(result["notes"]), 15)
        self.assertEqual(result["base_notes"], result["notes"])


if __name__ == "__main__":
    unittest.main()
