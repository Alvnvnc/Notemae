from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


SourceType = Literal["public_dataset", "official_api", "licensed_feed"]
GeneratedBy = Literal["qwen", "catalog_fallback"]
PreferenceLevel = Literal["low", "moderate", "high"]


class Fragrance(BaseModel):
    id: UUID
    slug: str
    brand: str
    name: str
    description: str
    gender: str
    release_year: int | None = None
    notes: list[str]
    occasions: list[str]
    climates: list[str]
    price_idr: int | None = None
    rating: float | None = None
    longevity_score: float | None = None
    projection_score: float | None = None
    source_url: str
    source_type: SourceType
    semantic_similarity: float | None = Field(default=None, ge=-1, le=1)


class FragranceList(BaseModel):
    items: list[Fragrance]


class InternalFragranceUpsert(BaseModel):
    slug: str = Field(min_length=3, max_length=160)
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
    source_url: str = Field(min_length=8, max_length=1000)
    source_type: SourceType


RelationType = Literal["clone_of", "inspired_by", "flanker_of"]


class RelatedFragrance(BaseModel):
    fragrance: Fragrance
    relation: RelationType
    confidence: float = Field(ge=0, le=1)
    source: str


class DupeResponse(BaseModel):
    fragrance: Fragrance
    dupes: list[RelatedFragrance]
    original_of: list[RelatedFragrance]
    flankers: list[RelatedFragrance]
    similar: list[Fragrance]
    explanation: str | None = None
    generated_by: GeneratedBy | None = None
    disclaimer: str


class RecommendationRequest(BaseModel):
    budget_idr: int | None = Field(default=None, ge=0)
    occasion: str | None = Field(default=None, max_length=50)
    climate: str | None = Field(default=None, max_length=50)
    gender: Literal["men", "women", "unisex"] | None = None
    preferred_notes: list[str] = Field(default_factory=list, max_length=15)
    avoid_notes: list[str] = Field(default_factory=list, max_length=15)
    preferred_families: list[str] = Field(default_factory=list, max_length=10)
    reference_likes: list[str] = Field(default_factory=list, max_length=5)
    reference_dislikes: list[str] = Field(default_factory=list, max_length=5)
    longevity_preference: PreferenceLevel | None = None
    projection_preference: PreferenceLevel | None = None
    free_text: str | None = Field(default=None, max_length=2000)
    limit: int = Field(default=3, ge=1, le=5)


class MatchResult(BaseModel):
    fragrance: Fragrance
    score: int = Field(ge=0, le=100)
    reasons: list[str]
    cautions: list[str]
    score_breakdown: dict[str, float] = Field(default_factory=dict)


class RecommendationResponse(BaseModel):
    recommendation: Fragrance
    alternatives: list[Fragrance]
    matches: list[MatchResult]
    explanation: str
    generated_by: GeneratedBy


class TextRecommendationRequest(BaseModel):
    text: str = Field(min_length=5, max_length=2000)
    limit: int = Field(default=3, ge=1, le=5)


class TextRecommendationResponse(RecommendationResponse):
    profile: RecommendationRequest
    profile_generated_by: GeneratedBy
