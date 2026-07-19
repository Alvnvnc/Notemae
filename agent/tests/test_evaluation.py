import statistics
import unittest

from evaluation.run_eval import (
    aggregate_runs,
    judge_label_agreement,
    paired_stats,
)


def make_summary(ndcgs: list[float], suffix: str) -> dict:
    rows = [
        {
            "persona": f"persona-{index}",
            "top": [f"item-{index}-{suffix}", "other-a", "other-b"],
            "ndcg@3": ndcg,
            "hit@1": ndcg >= 0.5,
            "avoid_violation": False,
            "budget_violation": False,
            "diversity": 0.7,
            "latency_s": 1.0,
        }
        for index, ndcg in enumerate(ndcgs)
    ]
    return {
        "per_persona": rows,
        "mean_ndcg@3": round(statistics.mean(ndcgs), 3),
        "hit@1_rate": round(
            statistics.mean(float(row["hit@1"]) for row in rows), 3
        ),
        "avoid_violation_rate": 0.0,
        "budget_violation_rate": 0.0,
        "mean_diversity": 0.7,
        "mean_latency_s": 1.0,
    }


class AggregateRunsTest(unittest.TestCase):
    def test_aggregates_within_persona_and_reports_run_variance(self) -> None:
        first = make_summary([0.8, 0.4], "first")
        second = make_summary([0.6, 0.6], "second")

        result = aggregate_runs([first, second])

        self.assertEqual(result["runs"], 2)
        self.assertEqual(result["mean_ndcg@3"], 0.6)
        self.assertEqual(result["per_persona"][0]["ndcg@3"], 0.7)
        self.assertEqual(result["per_persona"][1]["ndcg@3"], 0.5)
        self.assertEqual(result["per_persona"][0]["top_run_frequency"], 0.5)


class PairedStatsTest(unittest.TestCase):
    def test_repeated_runs_keep_persona_as_the_statistical_unit(self) -> None:
        baseline = make_summary([0.5, 0.5], "base")
        first = make_summary([0.7, 0.4], "first")
        second = make_summary([0.6, 0.6], "second")

        result = paired_stats(baseline, [first, second])

        self.assertEqual(result["rerank_runs"], 2)
        self.assertEqual(result["mean_ndcg_delta"], 0.075)
        self.assertEqual(result["wins"], 1)
        self.assertEqual(result["ties"], 1)
        self.assertEqual(result["positive_run_rate"], 1.0)


class JudgeAgreementTest(unittest.TestCase):
    def test_deduplicates_persona_item_pairs(self) -> None:
        ratings = [2, 2, 1, 0, 2, 1, 0, 2, 1, 0]
        gains = [3, 2, 1, 0, 3, 1, 0, 2, 1, 0]
        first_rows = [
            {
                "persona": "persona",
                "judge_ratings": {f"item-{index}": rating},
                "label_gains": {f"item-{index}": gain},
            }
            for index, (rating, gain) in enumerate(zip(ratings, gains, strict=True))
        ]
        duplicate_rows = first_rows[:5]

        result = judge_label_agreement(
            [{"per_persona": first_rows}, {"per_persona": duplicate_rows}]
        )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["unique_persona_item_pairs"], 10)
        self.assertEqual(result["duplicate_observations_removed"], 5)
        self.assertEqual(result["inconsistent_duplicate_ratings"], 0)
        self.assertEqual(result["quadratic_weighted_kappa"], 1.0)


if __name__ == "__main__":
    unittest.main()
