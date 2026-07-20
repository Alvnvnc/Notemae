import unittest
from uuid import uuid4

from app import profile, scoring, taxonomy
from app.models import FragranceCandidate, RecommendationProfile


def candidate(
    slug: str,
    notes: list[str],
    top: list[str] | None = None,
    heart: list[str] | None = None,
    base: list[str] | None = None,
) -> FragranceCandidate:
    return FragranceCandidate(
        id=uuid4(),
        slug=slug,
        brand="Test",
        name=slug,
        description="",
        gender="unisex",
        notes=notes,
        top_notes=top or [],
        heart_notes=heart or [],
        base_notes=base or [],
        occasions=[],
        climates=[],
        source_url="https://example.test",
        source_type="fixture",
    )


class TaxonomyTest(unittest.TestCase):
    def test_typos_snap_onto_the_canonical_note(self) -> None:
        for typed, expected in (
            ("bergamont", "bergamot"),
            ("sandlewood", "sandalwood"),
            ("patchuli", "patchouli"),
            ("lavendar", "lavender"),
        ):
            with self.subTest(typed=typed):
                self.assertEqual(taxonomy.canonical_note(typed), expected)

    def test_short_words_are_never_fuzzy_corrected(self) -> None:
        # "out" is one edit from "oud"; correcting it would invent a note
        self.assertEqual(taxonomy.canonical_note("out"), "out")

    def test_unknown_terms_pass_through_unchanged(self) -> None:
        self.assertEqual(taxonomy.canonical_note("xyzzy"), "xyzzy")
        self.assertFalse(taxonomy.is_known_note("xyzzy"))

    def test_similar_notes_are_symmetric(self) -> None:
        for note, neighbours in taxonomy.NOTE_NEIGHBOURS.items():
            for neighbour in neighbours:
                with self.subTest(pair=(note, neighbour)):
                    self.assertIn(note, taxonomy.NOTE_NEIGHBOURS[neighbour])

    def test_every_note_has_families_and_traits(self) -> None:
        for entry in taxonomy.note_database():
            with self.subTest(note=entry["name"]):
                self.assertTrue(entry["families"])
                self.assertTrue(entry["traits"])

    def test_every_note_has_a_volatility(self) -> None:
        # a note added to NOTE_FAMILIES but not to NOTE_VOLATILITY would be
        # silently sorted into the heart forever
        for entry in taxonomy.note_database():
            with self.subTest(note=entry["name"]):
                self.assertIn(entry["volatility"], taxonomy.TIERS)


class PyramidTest(unittest.TestCase):
    def test_flat_notes_are_sorted_by_material_volatility(self) -> None:
        pyramid, stated = taxonomy.resolve_pyramid(["vanilla", "bergamot", "iris"])

        self.assertFalse(stated)
        self.assertEqual(pyramid["top"], ["bergamot"])
        self.assertEqual(pyramid["heart"], ["iris"])
        self.assertEqual(pyramid["base"], ["vanilla"])

    def test_stated_tiers_win_over_the_volatility_table(self) -> None:
        # a perfumer really can push a citrus into the heart; the catalog
        # saying so must not be second-guessed
        pyramid, stated = taxonomy.resolve_pyramid(
            ["bergamot", "vanilla"], heart=["bergamot"], base=["vanilla"]
        )

        self.assertTrue(stated)
        self.assertEqual(pyramid["heart"], ["bergamot"])
        self.assertEqual(pyramid["top"], [])

    def test_notes_missing_from_a_stated_pyramid_are_still_placed(self) -> None:
        pyramid, stated = taxonomy.resolve_pyramid(
            ["bergamot", "oud"], top=["bergamot"]
        )

        self.assertTrue(stated)
        self.assertEqual(pyramid["base"], ["oud"])

    def test_a_note_claimed_twice_keeps_only_its_earliest_tier(self) -> None:
        pyramid, _ = taxonomy.resolve_pyramid(
            ["amber"], heart=["amber"], base=["amber"]
        )

        self.assertEqual(pyramid["heart"], ["amber"])
        self.assertEqual(pyramid["base"], [])

    def test_flattening_a_pyramid_reproduces_the_note_list(self) -> None:
        pyramid, _ = taxonomy.resolve_pyramid(
            ["bergamot", "iris", "vanilla"], top=["bergamot"], base=["vanilla"]
        )

        self.assertEqual(
            sorted(taxonomy.flatten_pyramid(pyramid)),
            sorted(["bergamot", "iris", "vanilla"]),
        )

    def test_an_inferred_pyramid_is_never_offered_to_the_model(self) -> None:
        self.assertIsNone(taxonomy.stated_pyramid([], [], []))
        self.assertEqual(
            taxonomy.stated_pyramid(["bergamot"], [], []),
            {"top": ["bergamot"], "heart": [], "base": []},
        )


class ScentProfileTest(unittest.TestCase):
    def test_profile_reports_families_traits_and_corrections(self) -> None:
        result = profile.build_scent_profile(["bergamont", "jasmine", "vanilla"])

        self.assertEqual(result.corrections, {"bergamont": "bergamot"})
        self.assertEqual([note.name for note in result.notes], ["bergamot", "jasmine", "vanilla"])
        self.assertIn("floral", result.families)
        self.assertIn("sweet", result.traits)
        self.assertTrue(result.summary.startswith("fresh floral"))

    def test_fresh_members_collapse_into_one_headline(self) -> None:
        result = profile.build_scent_profile(["marine", "mint", "grapefruit"])

        self.assertEqual(profile.headline_families(result.families), ["fresh"])

    def test_unrecognized_notes_are_reported_not_scored(self) -> None:
        result = profile.build_scent_profile(["xyzzy"])

        self.assertEqual(result.unrecognized, ["xyzzy"])
        self.assertEqual(result.families, [])


class NoteScoringTest(unittest.TestCase):
    def setUp(self) -> None:
        self.wanted = RecommendationProfile(
            preferred_notes=["bergamot", "jasmine", "vanilla"]
        )

    def score(self, notes: list[str]) -> int:
        return scoring.score_candidate(
            candidate("c", notes), self.wanted, [], []
        ).score

    def test_match_routes_are_strictly_ordered(self) -> None:
        exact = self.score(["bergamot", "jasmine", "vanilla"])
        similar = self.score(["lemon", "tuberose", "tonka"])
        family = self.score(["yuzu", "peony", "honey"])
        unrelated = self.score(["leather", "vetiver", "pepper"])

        self.assertGreater(exact, similar)
        self.assertGreater(similar, family)
        self.assertGreater(family, unrelated)

    def test_breakdown_components_sum_to_the_notes_total(self) -> None:
        match = scoring.score_candidate(
            candidate("c", ["lemon", "jasmine", "honey"]), self.wanted, [], []
        )
        components = sum(
            value
            for key, value in match.score_breakdown.items()
            if key.startswith("notes_")
        )

        self.assertAlmostEqual(components, match.score_breakdown["notes"], places=1)

    def test_exact_match_earns_the_full_notes_weight(self) -> None:
        match = scoring.score_candidate(
            candidate("c", ["bergamot", "jasmine", "vanilla"]), self.wanted, [], []
        )

        self.assertAlmostEqual(
            match.score_breakdown["notes"], scoring.WEIGHTS["notes"], places=1
        )

    def test_close_relative_of_an_avoided_note_is_penalised_not_filtered(self) -> None:
        avoiding = RecommendationProfile(
            preferred_notes=["bergamot"], avoid_notes=["vanilla"]
        )
        with_tonka = candidate("with-tonka", ["bergamot", "tonka"])
        without = candidate("without", ["bergamot", "cedar"])

        penalised = scoring.score_candidate(with_tonka, avoiding, [], [])
        clean = scoring.score_candidate(without, avoiding, [], [])

        self.assertLess(penalised.score, clean.score)
        self.assertIn(
            "avoided_neighbour_penalty", penalised.score_breakdown
        )
        # a mere relative must not disqualify the candidate outright
        self.assertEqual(
            scoring.hard_filter_failures(
                with_tonka, avoiding, *taxonomy.expand_avoided(avoiding.avoid_notes)
            ),
            [],
        )


class PyramidScoringTest(unittest.TestCase):
    """The pyramid must change what the wearer is told, not what they rank."""

    def setUp(self) -> None:
        self.wanted = RecommendationProfile(preferred_notes=["vanilla"])
        self.fleeting = candidate(
            "fleeting", ["vanilla", "cedar"], top=["vanilla"], base=["cedar"]
        )
        self.lasting = candidate(
            "lasting", ["cedar", "vanilla"], top=["cedar"], base=["vanilla"]
        )

    def test_a_wanted_note_scores_the_same_wherever_it_sits(self) -> None:
        # bergamot is only ever an opening note; docking a perfume for that
        # would dock every citrus perfume ever made
        fleeting = scoring.score_candidate(self.fleeting, self.wanted, [], [])
        lasting = scoring.score_candidate(self.lasting, self.wanted, [], [])

        self.assertEqual(fleeting.score, lasting.score)

    def test_a_match_confined_to_the_opening_is_called_out(self) -> None:
        fleeting = scoring.score_candidate(self.fleeting, self.wanted, [], [])
        lasting = scoring.score_candidate(self.lasting, self.wanted, [], [])

        self.assertTrue(any("opening" in c for c in fleeting.cautions))
        self.assertIn("preferred notes: vanilla (opening)", fleeting.reasons)
        self.assertEqual(lasting.cautions, [])
        self.assertIn("preferred notes: vanilla (dry-down)", lasting.reasons)

    def test_an_inferred_pyramid_is_never_narrated(self) -> None:
        untiered = candidate("untiered", ["vanilla", "cedar"])
        match = scoring.score_candidate(untiered, self.wanted, [], [])

        self.assertIn("preferred notes: vanilla", match.reasons)
        self.assertEqual(match.cautions, [])

    def test_an_avoided_relative_costs_less_in_the_opening(self) -> None:
        avoiding = RecommendationProfile(
            preferred_notes=["bergamot"], avoid_notes=["vanilla"]
        )
        in_opening = candidate(
            "top-tonka", ["bergamot", "tonka"], top=["bergamot", "tonka"]
        )
        in_drydown = candidate(
            "base-tonka", ["bergamot", "tonka"], top=["bergamot"], base=["tonka"]
        )

        cheap = scoring.score_candidate(in_opening, avoiding, [], [])
        dear = scoring.score_candidate(in_drydown, avoiding, [], [])

        self.assertLess(
            abs(cheap.score_breakdown["avoided_neighbour_penalty"]),
            abs(dear.score_breakdown["avoided_neighbour_penalty"]),
        )

    def test_an_inferred_dry_down_still_costs_the_full_penalty(self) -> None:
        # Inferred tiers do reach the penalty scale — volatility is physics
        # and is reliable enough to rank on, unlike to narrate on. Tonka
        # infers to the base, so the common legacy case is unchanged.
        avoiding = RecommendationProfile(
            preferred_notes=["bergamot"], avoid_notes=["vanilla"]
        )
        untiered = candidate("untiered", ["bergamot", "tonka"])

        match = scoring.score_candidate(untiered, avoiding, [], [])

        self.assertAlmostEqual(
            match.score_breakdown["avoided_neighbour_penalty"],
            -scoring.AVOIDED_NEIGHBOUR_PENALTY,
            places=1,
        )


if __name__ == "__main__":
    unittest.main()
