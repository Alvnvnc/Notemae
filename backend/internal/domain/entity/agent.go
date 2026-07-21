package entity

// AgentRequest is the candidate pool the backend assembles and the agent ranks.
// It mirrors the JSON body Python's build_agent_request produced.
type AgentRequest struct {
	Profile            RecommendationRequest `json:"profile"`
	Candidates         []Fragrance           `json:"candidates"`
	LikedReferences    []Fragrance           `json:"liked_references"`
	DislikedReferences []Fragrance           `json:"disliked_references"`
}

// ExplainPayload is the body POSTed to the agent's /v1/recommend/explain.
type ExplainPayload struct {
	Profile        RecommendationRequest `json:"profile"`
	Recommendation MatchResult           `json:"recommendation"`
	Alternatives   []MatchResult         `json:"alternatives"`
}

// DupeExplainPayload is the body POSTed to the agent's /v1/dupes/explain.
type DupeExplainPayload struct {
	Fragrance  Fragrance          `json:"fragrance"`
	Dupes      []RelatedFragrance `json:"dupes"`
	OriginalOf []RelatedFragrance `json:"original_of"`
	Flankers   []RelatedFragrance `json:"flankers"`
	Similar    []Fragrance        `json:"similar"`
}

// ReferenceRecord is a resolved reference fragrance together with its stored
// embedding. The embedding never leaves the server (it is stripped before the
// fragrance is serialized) but the recommendation math needs it, so the data
// layer returns both halves here.
type ReferenceRecord struct {
	Fragrance Fragrance
	Embedding []float32
}

// --- Streaming recommendation events -------------------------------------
//
// The recommendation stream emits a fixed sequence of named SSE events. The
// domain builds the typed payloads; the presentation layer is the only thing
// that knows they become `event:`/`data:` frames. Keeping the shapes here lets
// the non-streaming and streaming paths share one source of truth.

type StageEvent struct {
	Stage string `json:"stage"`
}

type ErrorEvent struct {
	Detail string `json:"detail"`
}

type DeltaEvent struct {
	Text string `json:"text"`
}

// MatchesEvent is the incrementally-refined result set the browser paints.
type MatchesEvent struct {
	Recommendation Fragrance     `json:"recommendation"`
	Alternatives   []Fragrance   `json:"alternatives"`
	Matches        []MatchResult `json:"matches"`
	Refined        bool          `json:"refined"`
}

// FallbackMatchesEvent is emitted when ranking is unavailable: it carries the
// full deterministic response plus the refined flag, flattened into one object.
type FallbackMatchesEvent struct {
	RecommendationResponse
	Refined bool `json:"refined"`
}

type ProfileEvent struct {
	Profile     RecommendationRequest `json:"profile"`
	GeneratedBy GeneratedBy           `json:"generated_by"`
}

type DoneEvent struct {
	GeneratedBy        GeneratedBy  `json:"generated_by"`
	ProfileGeneratedBy *GeneratedBy `json:"profile_generated_by"`
}

// NewMatchesEvent derives the browser-facing event from a ranked match list.
// matches[0] is the headline recommendation; the rest are alternatives.
func NewMatchesEvent(matches []MatchResult, refined bool) MatchesEvent {
	alternatives := make([]Fragrance, 0, len(matches))
	for _, m := range matches[1:] {
		alternatives = append(alternatives, m.Fragrance)
	}
	return MatchesEvent{
		Recommendation: matches[0].Fragrance,
		Alternatives:   alternatives,
		Matches:        matches,
		Refined:        refined,
	}
}
