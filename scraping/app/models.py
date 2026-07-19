from datetime import datetime
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, Field


SourceType = Literal["public_dataset", "official_api", "licensed_feed"]


class IngestionJobRequest(BaseModel):
    source_name: str = Field(min_length=2, max_length=120)
    source_type: SourceType
    source_url: AnyHttpUrl
    terms_confirmed: bool


class IngestionJobResponse(BaseModel):
    id: str
    source_name: str
    status: Literal["queued", "running", "completed", "failed"]
    records_received: int = 0
    cursor: str | None = None
    error: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class SourceRecord(BaseModel):
    source_name: str = Field(min_length=2, max_length=120)
    source_type: SourceType
    source_url: AnyHttpUrl
    terms_confirmed: bool
    source_record_id: str | None = Field(default=None, max_length=200)
    brand: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    gender: str = Field(default="unisex", max_length=30)
    release_year: int | None = Field(default=None, ge=1800, le=2100)
    notes: list[str] = Field(default_factory=list, max_length=50)
    occasions: list[str] = Field(default_factory=list, max_length=20)
    climates: list[str] = Field(default_factory=list, max_length=20)
    price_idr: int | None = Field(default=None, ge=0)
    rating: float | None = Field(default=None, ge=0, le=5)
    longevity_score: float | None = Field(default=None, ge=0, le=5)
    projection_score: float | None = Field(default=None, ge=0, le=5)


class RecordBatch(BaseModel):
    records: list[SourceRecord] = Field(min_length=1, max_length=100)


class RecordBatchResponse(BaseModel):
    accepted: int
    upserted_slugs: list[str]


class SourceStatus(BaseModel):
    name: str
    enabled: bool
    schedule_seconds: int
    last_cursor: str | None
    processed_files: int
