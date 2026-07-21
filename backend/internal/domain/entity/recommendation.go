package entity

// PreferenceLevel mirrors the Literal["low","moderate","high"] preference.
type PreferenceLevel string

const (
	PreferenceLow      PreferenceLevel = "low"
	PreferenceModerate PreferenceLevel = "moderate"
	PreferenceHigh     PreferenceLevel = "high"
)

// RecommendationRequest is the structured preference profile the agent ranks
// against. Every field is optional; the zero value is a valid "no preference".
type RecommendationRequest struct {
	BudgetIDR            *int             `json:"budget_idr"`
	Occasion             *string          `json:"occasion"`
	Climate              *string          `json:"climate"`
	Gender               *string          `json:"gender"`
	PreferredNotes       []string         `json:"preferred_notes"`
	AvoidNotes           []string         `json:"avoid_notes"`
	PreferredFamilies    []string         `json:"preferred_families"`
	ReferenceLikes       []string         `json:"reference_likes"`
	ReferenceDislikes    []string         `json:"reference_dislikes"`
	LongevityPreference  *PreferenceLevel `json:"longevity_preference"`
	ProjectionPreference *PreferenceLevel `json:"projection_preference"`
	FreeText             *string          `json:"free_text"`
	Limit                int              `json:"limit"`
}

type MatchResult struct {
	Fragrance      Fragrance          `json:"fragrance"`
	Score          int                `json:"score"`
	Reasons        []string           `json:"reasons"`
	Cautions       []string           `json:"cautions"`
	ScoreBreakdown map[string]float64 `json:"score_breakdown"`
}

type RecommendationResponse struct {
	Recommendation Fragrance     `json:"recommendation"`
	Alternatives   []Fragrance   `json:"alternatives"`
	Matches        []MatchResult `json:"matches"`
	Explanation    string        `json:"explanation"`
	GeneratedBy    GeneratedBy   `json:"generated_by"`
}

type TextRecommendationRequest struct {
	Text  string `json:"text"`
	Limit int    `json:"limit"`
}

// TextRecommendationResponse is RecommendationResponse plus the profile the
// free text was parsed into. The embedded struct flattens into the same JSON
// shape the Python subclass produced.
type TextRecommendationResponse struct {
	RecommendationResponse
	Profile            RecommendationRequest `json:"profile"`
	ProfileGeneratedBy GeneratedBy           `json:"profile_generated_by"`
}
