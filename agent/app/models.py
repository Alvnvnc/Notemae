from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


GeneratedBy = Literal["qwen", "catalog_fallback"]
PreferenceLevel = Literal["low", "moderate", "high"]


class FragranceCandidate(BaseModel):
    id: UUID
    slug: str
    brand: str
    name: str
    description: str
    gender: str
    release_year: int | None = None
    # `notes` is the ordered union of the tiers below. The tiers are empty
    # for records ingested before the pyramid existed, which is why nothing
    # here may assume they are populated — see taxonomy.resolve_pyramid.
    notes: list[str]
    top_notes: list[str] = Field(default_factory=list)
    heart_notes: list[str] = Field(default_factory=list)
    base_notes: list[str] = Field(default_factory=list)
    occasions: list[str]
    climates: list[str]
    price_idr: int | None = None
    rating: float | None = None
    longevity_score: float | None = None
    projection_score: float | None = None
    source_url: str
    source_type: str
    semantic_similarity: float | None = Field(default=None, ge=-1, le=1)


class NoteInsight(BaseModel):
    """One picked note, expanded through the taxonomy."""

    input: str
    name: str
    corrected: bool = False
    known: bool = True
    family: str | None = None
    families: list[str] = Field(default_factory=list)
    traits: list[str] = Field(default_factory=list)
    similar_notes: list[str] = Field(default_factory=list)
    # the tier this material naturally occupies, None if unclassified
    volatility: str | None = None


class ScentProfile(BaseModel):
    """Deterministic reading of what the picked notes add up to."""

    notes: list[NoteInsight] = Field(default_factory=list)
    # the picked notes grouped by tier, so an interface can lay them out as a
    # pyramid. Ranking is deliberately NOT weighted by tier: this describes
    # what the wearer asked for, not what a perfume would smell like in hour
    # three, and weighting a mirror of their own choice would distort it.
    pyramid: dict[str, list[str]] = Field(default_factory=dict)
    families: list[str] = Field(default_factory=list)
    traits: list[str] = Field(default_factory=list)
    dominant_traits: list[str] = Field(default_factory=list)
    corrections: dict[str, str] = Field(default_factory=dict)
    unrecognized: list[str] = Field(default_factory=list)
    summary: str = ""


class NoteProfileRequest(BaseModel):
    notes: list[str] = Field(min_length=1, max_length=15)
    avoid_notes: list[str] = Field(default_factory=list, max_length=15)


class NoteProfileResponse(BaseModel):
    profile: ScentProfile
    avoided: ScentProfile | None = None
    narrative: str
    generated_by: GeneratedBy


class RecommendationProfile(BaseModel):
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

    @field_validator(
        "preferred_notes",
        "avoid_notes",
        "preferred_families",
        "reference_likes",
        "reference_dislikes",
        mode="before",
    )
    @classmethod
    def _coerce_null_list(cls, value: object) -> object:
        # LLMs often emit null for an empty list; treat it as [].
        return [] if value is None else value


class PreferenceExtractionRequest(BaseModel):
    text: str = Field(min_length=5, max_length=2000)
    limit: int = Field(default=3, ge=1, le=5)


class PreferenceExtractionResponse(BaseModel):
    profile: RecommendationProfile
    generated_by: GeneratedBy


class RecommendationRequest(BaseModel):
    profile: RecommendationProfile
    candidates: list[FragranceCandidate] = Field(min_length=1, max_length=50)
    liked_references: list[FragranceCandidate] = Field(
        default_factory=list, max_length=5
    )
    disliked_references: list[FragranceCandidate] = Field(
        default_factory=list, max_length=5
    )


class RankRequest(RecommendationRequest):
    """Ranking-only variant of :class:`RecommendationRequest`.

    ``rerank`` lets the caller trade the LLM consensus pass (a few seconds)
    for an instant deterministic ordering — the streaming endpoint asks for
    the fast ordering first so the browser can paint matches immediately.
    """

    rerank: bool = True


class MatchResult(BaseModel):
    fragrance: FragranceCandidate
    score: int = Field(ge=0, le=100)
    reasons: list[str]
    cautions: list[str]
    score_breakdown: dict[str, float] = Field(default_factory=dict)


class RankResponse(BaseModel):
    matches: list[MatchResult]
    reranked: bool


class ExplainRequest(BaseModel):
    profile: RecommendationProfile
    recommendation: MatchResult
    alternatives: list[MatchResult] = Field(default_factory=list, max_length=5)


class RecommendationResponse(BaseModel):
    recommendation: FragranceCandidate
    alternatives: list[FragranceCandidate]
    matches: list[MatchResult]
    explanation: str
    generated_by: GeneratedBy


RelationType = Literal["clone_of", "inspired_by", "flanker_of"]


class RelatedCandidate(BaseModel):
    fragrance: FragranceCandidate
    relation: RelationType
    confidence: float = Field(ge=0, le=1)
    source: str


class DupeExplainRequest(BaseModel):
    fragrance: FragranceCandidate
    dupes: list[RelatedCandidate] = Field(default_factory=list, max_length=10)
    original_of: list[RelatedCandidate] = Field(default_factory=list, max_length=10)
    flankers: list[RelatedCandidate] = Field(default_factory=list, max_length=10)
    similar: list[FragranceCandidate] = Field(default_factory=list, max_length=10)


class DupeExplainResponse(BaseModel):
    explanation: str
    generated_by: GeneratedBy


class CompareRequest(BaseModel):
    left: FragranceCandidate
    right: FragranceCandidate
    context: str | None = Field(default=None, max_length=500)


class CompareResponse(BaseModel):
    explanation: str
    generated_by: GeneratedBy


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=10)


class EmbeddingResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimensions: int
