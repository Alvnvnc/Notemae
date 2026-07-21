// Package usecase holds the application business rules. It orchestrates the
// repository and agent ports (from the repository package) but never touches
// HTTP or SQL directly. The functions in this file are pure — no I/O — and are
// the most heavily unit-tested part of the domain.
package usecase

import (
	"fmt"
	"strings"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
)

// FallbackSentinel mirrors the agent's marker appended to a streamed
// explanation that came from its deterministic fallback. It is a wire protocol
// constant shared with the agent service.
const FallbackSentinel = "␞catalog_fallback"

// DupeDisclaimer is attached to every relationship response.
const DupeDisclaimer = "Dupe/clone relationships come from community-consensus curation, not official " +
	"brand statements. The 'similar' list only indicates a comparable scent profile, " +
	"not a dupe claim. ScentSphere does not verify the authenticity (genuine/fake) of " +
	"physical products; be wary of offers priced far below market."

// profileQueryText builds the semantic-search text from a structured profile.
// Free text wins outright; otherwise the set fields are joined. Returns nil
// when there is nothing to search on.
func profileQueryText(p entity.RecommendationRequest) *string {
	if p.FreeText != nil && *p.FreeText != "" {
		return p.FreeText
	}
	var parts []string
	if len(p.PreferredNotes) > 0 {
		parts = append(parts, "notes: "+strings.Join(p.PreferredNotes, ", "))
	}
	if len(p.PreferredFamilies) > 0 {
		parts = append(parts, "families: "+strings.Join(p.PreferredFamilies, ", "))
	}
	if p.Occasion != nil && *p.Occasion != "" {
		parts = append(parts, "occasion: "+*p.Occasion)
	}
	if p.Climate != nil && *p.Climate != "" {
		parts = append(parts, "climate: "+*p.Climate)
	}
	if len(parts) == 0 {
		return nil
	}
	text := strings.Join(parts, " | ")
	return &text
}

// fragranceDocument renders a fragrance into the text that gets embedded. Tiers
// are named so semantic retrieval can tell a perfume that opens on vanilla from
// one that dries down to it; records with no stored pyramid contribute only the
// flat note list rather than a guessed pyramid.
func fragranceDocument(f entity.Fragrance) string {
	var pyramid []string
	for _, tier := range []struct {
		label string
		notes []string
	}{
		{"top", f.TopNotes},
		{"heart", f.HeartNotes},
		{"base", f.BaseNotes},
	} {
		if len(tier.notes) > 0 {
			pyramid = append(pyramid, fmt.Sprintf("%s notes: %s", tier.label, strings.Join(tier.notes, ", ")))
		}
	}

	var parts []string
	add := func(s string) {
		if s != "" {
			parts = append(parts, s)
		}
	}
	add(fmt.Sprintf("%s %s", f.Brand, f.Name))
	add(f.Description)
	if len(f.Notes) > 0 {
		add("notes: " + strings.Join(f.Notes, ", "))
	}
	if len(pyramid) > 0 {
		add(strings.Join(pyramid, " | "))
	}
	if len(f.Occasions) > 0 {
		add("occasions: " + strings.Join(f.Occasions, ", "))
	}
	if len(f.Climates) > 0 {
		add("climates: " + strings.Join(f.Climates, ", "))
	}
	return strings.Join(parts, " | ")
}

// centroid returns the element-wise mean of the vectors, or nil if empty.
func centroid(vectors [][]float32) []float32 {
	if len(vectors) == 0 {
		return nil
	}
	dim := len(vectors[0])
	sum := make([]float32, dim)
	for _, v := range vectors {
		for i := 0; i < dim && i < len(v); i++ {
			sum[i] += v[i]
		}
	}
	out := make([]float32, dim)
	n := float32(len(vectors))
	for i := range sum {
		out[i] = sum[i] / n
	}
	return out
}

// combineQueryVectors applies Rocchio-style relevance feedback: pull the query
// toward liked anchors and away from disliked ones in embedding space. Returns
// nil when there is no basis to search on.
func combineQueryVectors(textVector []float32, likedVectors, dislikedVectors [][]float32) []float32 {
	liked := centroid(likedVectors)
	disliked := centroid(dislikedVectors)

	base := textVector
	if base == nil {
		base = liked
	}
	if base == nil {
		return nil
	}

	combined := make([]float32, len(base))
	copy(combined, base)
	if liked != nil && textVector != nil {
		for i := range combined {
			if i < len(liked) {
				combined[i] += 0.8 * liked[i]
			}
		}
	}
	if disliked != nil {
		for i := range combined {
			if i < len(disliked) {
				combined[i] -= 0.5 * disliked[i]
			}
		}
	}
	return combined
}

// fallbackRecommendation builds a deterministic response from the candidate
// pool when the agent is unavailable. The first candidate is the headline pick.
func fallbackRecommendation(candidates []entity.Fragrance) entity.RecommendationResponse {
	recommendation := candidates[0]

	alternatives := make([]entity.Fragrance, 0, len(candidates)-1)
	alternatives = append(alternatives, candidates[1:]...)

	noteList := "available"
	if len(recommendation.Notes) > 0 {
		top := recommendation.Notes
		if len(top) > 3 {
			top = top[:3]
		}
		noteList = strings.Join(top, ", ")
	}

	matches := make([]entity.MatchResult, 0, len(candidates))
	for i, candidate := range candidates {
		score := 60 - i*5
		if score < 40 {
			score = 40
		}
		matches = append(matches, entity.MatchResult{
			Fragrance:      candidate,
			Score:          score,
			Reasons:        []string{"ordered by available catalog relevance"},
			Cautions:       []string{"Qwen agent was unavailable"},
			ScoreBreakdown: map[string]float64{},
		})
	}

	return entity.RecommendationResponse{
		Recommendation: recommendation,
		Alternatives:   alternatives,
		Matches:        matches,
		Explanation: fmt.Sprintf(
			"%s %s is the strongest available catalog match based on its %s profile and recorded use cases.",
			recommendation.Brand, recommendation.Name, noteList,
		),
		GeneratedBy: entity.GeneratedByFallback,
	}
}

// fallbackExplanation renders a one-line explanation for a single match when
// the streamed narrative is unavailable.
func fallbackExplanation(match entity.MatchResult) string {
	reasons := "the available catalog fields"
	if len(match.Reasons) > 0 {
		reasons = strings.Join(match.Reasons, ", ")
	}
	return fmt.Sprintf(
		"%s %s scores %d%% based on %s. This result uses only supplied catalog data.",
		match.Fragrance.Brand, match.Fragrance.Name, match.Score, reasons,
	)
}
