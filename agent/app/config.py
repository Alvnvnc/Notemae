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
    qwen_thinking: bool = True
    qwen_thinking_budget: int = Field(default=600, ge=100, le=4000)
    qwen_rerank_enabled: bool = True
    qwen_rerank_votes: int = Field(default=2, ge=1, le=5)
    qwen_rerank_pool: int = Field(default=10, ge=3, le=20)
    qwen_rerank_weight: float = Field(default=0.3, ge=0.0, le=0.6)
    qwen_rerank_temperature: float = Field(default=0.7, ge=0.0, le=1.5)

    @property
    def structured_extra_body(self) -> dict:
        """DashScope needs enable_thinking=False to force structured JSON;
        other OpenAI-compatible providers (e.g. Fireworks) reject the field."""
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
