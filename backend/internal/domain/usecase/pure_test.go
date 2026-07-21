package usecase

import (
	"strings"
	"testing"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
)

func strptr(s string) *string { return &s }
func intptr(i int) *int       { return &i }

// closeEnough compares float32 values with a tolerance, since Rocchio math
// accumulates float32 rounding (e.g. 0.8-1.0 lands at -0.19999999).
func closeEnough(a, b float32) bool {
	d := a - b
	if d < 0 {
		d = -d
	}
	return d < 1e-5
}

func TestProfileQueryText_FreeTextWins(t *testing.T) {
	got := profileQueryText(entity.RecommendationRequest{
		FreeText:       strptr("something woody"),
		PreferredNotes: []string{"vanilla"},
	})
	if got == nil || *got != "something woody" {
		t.Fatalf("free text should win, got %v", got)
	}
}

func TestProfileQueryText_JoinsFields(t *testing.T) {
	got := profileQueryText(entity.RecommendationRequest{
		PreferredNotes:    []string{"vanilla", "amber"},
		PreferredFamilies: []string{"woody"},
		Occasion:          strptr("office"),
		Climate:           strptr("tropical"),
	})
	want := "notes: vanilla, amber | families: woody | occasion: office | climate: tropical"
	if got == nil || *got != want {
		t.Fatalf("want %q, got %v", want, got)
	}
}

func TestProfileQueryText_EmptyIsNil(t *testing.T) {
	if got := profileQueryText(entity.RecommendationRequest{}); got != nil {
		t.Fatalf("empty profile should yield nil, got %v", *got)
	}
}

func TestFragranceDocument_SkipsEmptyTiers(t *testing.T) {
	doc := fragranceDocument(entity.Fragrance{
		Brand:       "Prada",
		Name:        "L'Homme",
		Description: "clean iris",
		Notes:       []string{"iris", "amber"},
		TopNotes:    []string{"neroli"},
		BaseNotes:   []string{"amber"},
		Occasions:   []string{"office"},
	})
	if !strings.Contains(doc, "Prada L'Homme") {
		t.Errorf("missing headline: %q", doc)
	}
	if strings.Contains(doc, "heart notes") {
		t.Errorf("empty heart tier should be skipped: %q", doc)
	}
	if !strings.Contains(doc, "top notes: neroli") || !strings.Contains(doc, "base notes: amber") {
		t.Errorf("present tiers missing: %q", doc)
	}
	if !strings.Contains(doc, "occasions: office") {
		t.Errorf("occasions missing: %q", doc)
	}
}

func TestCombineQueryVectors_Rocchio(t *testing.T) {
	text := []float32{1, 0}
	liked := [][]float32{{1, 1}}
	disliked := [][]float32{{0, 2}}
	// base=text; +0.8*liked -0.5*disliked
	got := combineQueryVectors(text, liked, disliked)
	want := []float32{1 + 0.8*1 - 0.5*0, 0 + 0.8*1 - 0.5*2}
	for i := range want {
		if !closeEnough(got[i], want[i]) {
			t.Fatalf("dim %d: want %v, got %v", i, want[i], got[i])
		}
	}
}

func TestCombineQueryVectors_LikedOnlyBaseNoBoost(t *testing.T) {
	// With no text vector, liked centroid becomes the base but is NOT boosted
	// (the 0.8 term only applies when text is present).
	got := combineQueryVectors(nil, [][]float32{{2, 4}}, nil)
	want := []float32{2, 4}
	for i := range want {
		if !closeEnough(got[i], want[i]) {
			t.Fatalf("dim %d: want %v, got %v", i, want[i], got[i])
		}
	}
}

func TestCombineQueryVectors_NoBasisIsNil(t *testing.T) {
	if got := combineQueryVectors(nil, nil, nil); got != nil {
		t.Fatalf("no basis should be nil, got %v", got)
	}
}

func TestFallbackRecommendation_ScoresAndFloor(t *testing.T) {
	candidates := make([]entity.Fragrance, 6)
	for i := range candidates {
		candidates[i] = entity.Fragrance{Brand: "B", Name: "N", Notes: []string{"a", "b", "c", "d"}}
	}
	resp := fallbackRecommendation(candidates)
	if resp.GeneratedBy != entity.GeneratedByFallback {
		t.Errorf("generated_by = %q", resp.GeneratedBy)
	}
	if resp.Matches[0].Score != 60 {
		t.Errorf("first score want 60, got %d", resp.Matches[0].Score)
	}
	// index 5 -> 60-25 = 35, floored to 40
	if resp.Matches[5].Score != 40 {
		t.Errorf("floored score want 40, got %d", resp.Matches[5].Score)
	}
	if len(resp.Alternatives) != 5 {
		t.Errorf("alternatives want 5, got %d", len(resp.Alternatives))
	}
	// note_list uses only the first three notes
	if !strings.Contains(resp.Explanation, "a, b, c profile") {
		t.Errorf("explanation note list wrong: %q", resp.Explanation)
	}
}

func TestAlternativeMatches_Clamped(t *testing.T) {
	matches := make([]entity.MatchResult, 2) // headline + 1
	got := alternativeMatches(matches, 3)    // wants [1:4] but only 2 exist
	if len(got) != 1 {
		t.Fatalf("want 1 alternative, got %d", len(got))
	}
}

func TestHasRuneSuffix(t *testing.T) {
	held := []rune("hello" + FallbackSentinel)
	if !hasRuneSuffix(held, []rune(FallbackSentinel)) {
		t.Fatal("suffix not detected")
	}
	if hasRuneSuffix([]rune("hi"), []rune(FallbackSentinel)) {
		t.Fatal("false positive on short string")
	}
}

func TestPreferredMatches(t *testing.T) {
	f := entity.Fragrance{Notes: []string{"vanilla", "amber", "musk"}}
	pref := map[string]struct{}{"vanilla": {}, "musk": {}}
	if n := preferredMatches(f, pref); n != 2 {
		t.Fatalf("want 2, got %d", n)
	}
}

// keep intptr referenced so the helper does not trip unused-symbol tooling
var _ = intptr
