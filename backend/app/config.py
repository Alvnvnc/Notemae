from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    database_url: str = "postgresql://scent:scent@localhost:5432/scentsphere"
    agent_url: str = "http://localhost:8001"
    service_shared_secret: str = "change-me-before-production"
    frontend_origins: str = "http://localhost:4173"

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.frontend_origins.split(",")
            if origin.strip()
        ]


settings = Settings()
