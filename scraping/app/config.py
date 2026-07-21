from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    backend_url: str = "http://localhost:8000"
    service_shared_secret: str = "change-me-before-production"
    auto_ingest_enabled: bool = True
    auto_ingest_interval_seconds: int = Field(default=21600, ge=300)
    auto_ingest_retry_seconds: int = Field(default=300, ge=30)
    auto_ingest_startup_delay_seconds: int = Field(default=15, ge=0)
    ingestion_state_path: str = "/tmp/notemae-ingestion-state.json"
    obf_delta_index_url: str = "https://static.openbeautyfacts.org/data/delta/index.txt"
    obf_delta_base_url: str = "https://static.openbeautyfacts.org/data/delta"
    obf_bootstrap_files: int = Field(default=14, ge=1, le=14)
    obf_max_files_per_run: int = Field(default=2, ge=1, le=14)
    obf_max_records_per_run: int = Field(default=500, ge=1, le=5000)
    obf_search_url: str = "https://world.openbeautyfacts.org/api/v2/search"
    obf_category_tags: str = "perfumes,eau-de-toilette,eau-de-cologne,eau-de-parfum"
    obf_category_page_size: int = Field(default=100, ge=1, le=100)
    obf_category_max_pages_per_run: int = Field(default=8, ge=1, le=50)
    obf_category_request_interval_seconds: float = Field(default=6.0, ge=0)

    obf_dump_url: str = (
        "https://static.openbeautyfacts.org/data/openbeautyfacts-products.jsonl.gz"
    )
    obf_dump_max_records_per_run: int = Field(default=5000, ge=1, le=20000)

    wikidata_sparql_url: str = "https://query.wikidata.org/sparql"

    youtube_api_key: str = ""
    youtube_search_queries: str = (
        "fragrance review,best fragrances 2026,review parfum lokal indonesia,"
        "parfum viral"
    )
    youtube_max_results_per_query: int = Field(default=25, ge=1, le=50)
    youtube_min_confidence: float = Field(default=0.75, ge=0, le=1)
    youtube_request_interval_seconds: float = Field(default=1.0, ge=0)

    dashscope_api_key: str = ""
    qwen_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen3.7-plus"
    enrichment_max_records_per_run: int = Field(default=60, ge=1, le=500)
    enrichment_min_confidence: float = Field(default=0.7, ge=0, le=1)

    @property
    def obf_category_tag_list(self) -> list[str]:
        return [tag.strip() for tag in self.obf_category_tags.split(",") if tag.strip()]

    @property
    def youtube_query_list(self) -> list[str]:
        return [
            query.strip()
            for query in self.youtube_search_queries.split(",")
            if query.strip()
        ]

    source_user_agent: str = "Notemae/0.1 (Open Beauty Facts ODbL delta importer)"


settings = Settings()
