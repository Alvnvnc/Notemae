from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


AGENT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = (AGENT_ROOT.parent / ".env", AGENT_ROOT / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    dashscope_api_key: str | None = None
    qwen_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen3.7-plus"
    qwen_profile_model: str | None = None
    qwen_embed_model: str = "text-embedding-v4"
    qwen_embedding_dimensions: int = Field(default=1024, ge=64, le=2048)
    # Explanations are grounded summaries, not long-form reasoning tasks. Keep
    # reasoning off by default so it cannot silently consume a large token
    # budget on every recommendation.
    qwen_thinking: bool = False
    qwen_thinking_budget: int = Field(default=600, ge=100, le=4000)
    # Reranking is optional quality polish. Deterministic ranking is the
    # production default because every vote is a separate billable request.
    qwen_rerank_enabled: bool = False
    qwen_rerank_votes: int = Field(default=1, ge=1, le=5)
    qwen_rerank_pool: int = Field(default=6, ge=3, le=20)
    qwen_rerank_weight: float = Field(default=0.3, ge=0.0, le=0.6)
    qwen_rerank_temperature: float = Field(default=0.7, ge=0.0, le=1.5)
    qwen_max_output_tokens: int = Field(default=320, ge=64, le=2000)
    qwen_max_calls_per_hour: int = Field(default=120, ge=0, le=100_000)
    model_cache_ttl_seconds: int = Field(default=3600, ge=0, le=86400)
    model_cache_max_entries: int = Field(default=256, ge=0, le=4096)
    redis_url: str | None = None
    redis_key_prefix: str = "scentsphere-agent"

    @property
    def structured_extra_body(self) -> dict:
        """DashScope needs enable_thinking=False to force structured JSON;
        other OpenAI-compatible providers (e.g. Fireworks) reject the field."""
        if "dashscope" in self.qwen_base_url:
            return {"enable_thinking": False}
        return {}

    @property
    def streaming_extra_body(self) -> dict:
        """Thinking disabled for streamed prose: reasoning tokens are never
        surfaced, so leaving it on only delays the first visible character by
        the whole thinking budget."""
        if "dashscope" in self.qwen_base_url:
            return {"enable_thinking": False}
        return {}

    @property
    def thinking_extra_body(self) -> dict:
        """DashScope thinking controls for free-text generation; other
        OpenAI-compatible providers reject these fields, so send nothing
        and let the model use its own default reasoning behaviour."""
        if "dashscope" in self.qwen_base_url:
            return {
                "enable_thinking": self.qwen_thinking,
                "thinking_budget": self.qwen_thinking_budget,
            }
        return {}


settings = Settings(_env_file=ENV_FILES)
