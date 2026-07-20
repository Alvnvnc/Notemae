import unittest

from app.usage import ModelUsage


class ModelUsageTest(unittest.TestCase):
    def test_hourly_budget_refuses_excess_calls(self) -> None:
        usage = ModelUsage()

        self.assertTrue(usage.reserve("profile", 1))
        self.assertFalse(usage.reserve("rerank", 1))

        snapshot = usage.snapshot(1)
        self.assertEqual(snapshot["reserved_model_calls"], 1)
        self.assertEqual(snapshot["calls_denied_by_budget"], {"rerank": 1})

    def test_local_budget_remains_available_without_redis(self) -> None:
        usage = ModelUsage()

        self.assertTrue(usage.reserve("generation", 1, redis_url=None))
        self.assertFalse(usage.reserve("generation", 1, redis_url=None))

    def test_usage_uses_provider_token_counts(self) -> None:
        usage = ModelUsage()
        completion = type(
            "Completion",
            (), {"usage": type("Usage", (), {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20})()},
        )()

        usage.success(completion)
        snapshot = usage.snapshot(0)
        self.assertEqual(snapshot["input_tokens"], 12)
        self.assertEqual(snapshot["output_tokens"], 8)
        self.assertEqual(snapshot["total_tokens"], 20)


if __name__ == "__main__":
    unittest.main()
