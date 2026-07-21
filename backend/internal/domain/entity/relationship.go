package entity

// RelationType mirrors the CHECK on fragrance_relationships.relation.
type RelationType string

const (
	RelationCloneOf    RelationType = "clone_of"
	RelationInspiredBy RelationType = "inspired_by"
	RelationFlankerOf  RelationType = "flanker_of"
)

// GeneratedBy records who produced a piece of generated text: the Qwen agent
// or the deterministic catalog fallback.
type GeneratedBy string

const (
	GeneratedByQwen     GeneratedBy = "qwen"
	GeneratedByFallback GeneratedBy = "catalog_fallback"
)

type RelatedFragrance struct {
	Fragrance  Fragrance    `json:"fragrance"`
	Relation   RelationType `json:"relation"`
	Confidence Score        `json:"confidence"`
	Source     string       `json:"source"`
}

// DupeResponse is the full relationship graph around one fragrance. Explanation
// and GeneratedBy are only set when the caller asked for an LLM explanation.
type DupeResponse struct {
	Fragrance   Fragrance          `json:"fragrance"`
	Dupes       []RelatedFragrance `json:"dupes"`
	OriginalOf  []RelatedFragrance `json:"original_of"`
	Flankers    []RelatedFragrance `json:"flankers"`
	Similar     []Fragrance        `json:"similar"`
	Explanation *string            `json:"explanation"`
	GeneratedBy *GeneratedBy       `json:"generated_by"`
	Disclaimer  string             `json:"disclaimer"`
}

type FeaturedList struct {
	Items []DupeResponse `json:"items"`
}
