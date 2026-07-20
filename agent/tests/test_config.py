import unittest

from app.config import AGENT_ROOT, ENV_FILES, Settings


class SettingsTest(unittest.TestCase):
    def test_default_env_files_cover_project_and_agent_roots(self) -> None:
        self.assertEqual(
            ENV_FILES,
            (AGENT_ROOT.parent / ".env", AGENT_ROOT / ".env"),
        )

    def test_explicit_values_override_dotenv(self) -> None:
        settings = Settings(
            _env_file=ENV_FILES,
            dashscope_api_key="explicit-test-key",
            qwen_model="explicit-test-model",
        )

        self.assertEqual(settings.dashscope_api_key, "explicit-test-key")
        self.assertEqual(settings.qwen_model, "explicit-test-model")

    def test_credit_conscious_defaults(self) -> None:
        settings = Settings(_env_file=None)

        self.assertFalse(settings.qwen_thinking)
        self.assertFalse(settings.qwen_rerank_enabled)
        self.assertEqual(settings.qwen_rerank_votes, 1)
        self.assertEqual(settings.qwen_rerank_pool, 6)
        self.assertEqual(settings.qwen_max_output_tokens, 320)
        self.assertEqual(settings.qwen_max_calls_per_hour, 120)
        self.assertGreater(settings.model_cache_ttl_seconds, 0)


if __name__ == "__main__":
    unittest.main()
