package usecase

import (
	"context"
	"errors"
	"sort"
	"strings"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// Emitter delivers one named event to the caller (the presentation layer turns
// it into an SSE frame). Returning an error — typically a client disconnect —
// aborts the stream.
type Emitter func(event string, data any) error

// RecommendationService owns the recommendation pipeline: assembling the
// candidate pool from the catalog, delegating ranking/narrative to the agent,
// and falling back deterministically whenever the agent is unavailable.
type RecommendationService struct {
	repo  repository.FragranceRepository
	agent repository.AgentPort
}

func NewRecommendationService(repo repository.FragranceRepository, agent repository.AgentPort) *RecommendationService {
	return &RecommendationService{repo: repo, agent: agent}
}

// embedOne is a best-effort single-text embedding: any agent failure yields nil
// rather than an error, matching the Python agent_embedding contract.
func (s *RecommendationService) embedOne(ctx context.Context, text string) []float32 {
	vectors, err := s.agent.Embed(ctx, []string{text})
	if err != nil || len(vectors) == 0 {
		return nil
	}
	return vectors[0]
}

// BuildAgentRequest assembles the candidate pool the agent ranks. Everything
// here is cheap catalog work (embedding lookup + SQL); the expensive half is
// whatever the agent does with the result. Returns entity.ErrNoCandidates when
// nothing passes the filters.
func (s *RecommendationService) BuildAgentRequest(ctx context.Context, profile entity.RecommendationRequest) (entity.AgentRequest, error) {
	var textEmbedding []float32
	if queryText := profileQueryText(profile); queryText != nil {
		textEmbedding = s.embedOne(ctx, *queryText)
	}

	likedRecords := s.resolveReferences(ctx, profile.ReferenceLikes)
	dislikedRecords := s.resolveReferences(ctx, profile.ReferenceDislikes)

	embedding := combineQueryVectors(
		textEmbedding,
		embeddingsOf(likedRecords),
		embeddingsOf(dislikedRecords),
	)

	var maxPrice *int
	if profile.BudgetIDR != nil {
		capped := int(float64(*profile.BudgetIDR) * 1.15)
		maxPrice = &capped
	}

	candidates, err := s.repo.ListCatalog(ctx, repository.CatalogQuery{
		Filter: repository.CatalogFilter{
			MaxPriceIDR: maxPrice,
			AvoidNotes:  profile.AvoidNotes,
		},
		QueryEmbedding: embedding,
		Limit:          30,
	})
	if err != nil {
		return entity.AgentRequest{}, err
	}

	if len(profile.PreferredNotes) > 0 {
		preferred := make(map[string]struct{}, len(profile.PreferredNotes))
		for _, note := range profile.PreferredNotes {
			preferred[strings.ToLower(note)] = struct{}{}
		}
		// Stable sort keeps embedding order among candidates that tie on the
		// number of preferred-note matches.
		sort.SliceStable(candidates, func(i, j int) bool {
			return preferredMatches(candidates[i], preferred) > preferredMatches(candidates[j], preferred)
		})
	}

	if len(candidates) == 0 {
		return entity.AgentRequest{}, entity.ErrNoCandidates
	}

	return entity.AgentRequest{
		Profile:            profile,
		Candidates:         candidates,
		LikedReferences:    fragrancesOf(likedRecords),
		DislikedReferences: fragrancesOf(dislikedRecords),
	}, nil
}

// Recommend runs the full non-streaming pipeline, degrading to a deterministic
// fallback when the agent cannot rank the pool.
func (s *RecommendationService) Recommend(ctx context.Context, profile entity.RecommendationRequest) (entity.RecommendationResponse, error) {
	request, err := s.BuildAgentRequest(ctx, profile)
	if err != nil {
		return entity.RecommendationResponse{}, err
	}
	response, err := s.agent.Recommend(ctx, request)
	if err != nil || response == nil {
		return fallbackRecommendation(limitCandidates(request.Candidates, profile.Limit)), nil
	}
	return *response, nil
}

// RecommendFromText parses free text into a profile, then recommends against it.
func (s *RecommendationService) RecommendFromText(ctx context.Context, text string, limit int) (entity.TextRecommendationResponse, error) {
	profile, profileGeneratedBy := s.parseProfileOrFallback(ctx, text, limit, false)

	recommendation, err := s.Recommend(ctx, profile)
	if err != nil {
		return entity.TextRecommendationResponse{}, err
	}
	return entity.TextRecommendationResponse{
		RecommendationResponse: recommendation,
		Profile:                profile,
		ProfileGeneratedBy:     profileGeneratedBy,
	}, nil
}

// StreamRecommendation emits a recommendation in the order the user can act on
// it: the deterministic ranking first (painted immediately), then the LLM
// passes (preference parse, consensus rerank, narrative) refining what is
// already on screen. Pass payload for the structured endpoint, or text for the
// free-text endpoint; exactly one should be non-nil.
func (s *RecommendationService) StreamRecommendation(ctx context.Context, payload *entity.RecommendationRequest, text *string, limit int, emit Emitter) error {
	var profile entity.RecommendationRequest
	var profileGeneratedBy *entity.GeneratedBy

	if payload != nil {
		profile = *payload
	} else {
		if err := emit("stage", entity.StageEvent{Stage: "reading"}); err != nil {
			return err
		}
		// The provisional profile uses the cheap heuristic parse; the model
		// parse below can revise it.
		profile, _ = s.parseProfileOrFallback(ctx, *text, limit, true)
	}

	if err := emit("stage", entity.StageEvent{Stage: "matching"}); err != nil {
		return err
	}
	request, err := s.BuildAgentRequest(ctx, profile)
	if err != nil {
		if errors.Is(err, entity.ErrNoCandidates) {
			return emit("error", entity.ErrorEvent{Detail: err.Error()})
		}
		return err
	}

	matches, _ := s.agent.Rank(ctx, request, false)
	if len(matches) == 0 {
		fallback := fallbackRecommendation(limitCandidates(request.Candidates, limit))
		if err := emit("matches", entity.FallbackMatchesEvent{RecommendationResponse: fallback, Refined: true}); err != nil {
			return err
		}
		return emit("done", entity.DoneEvent{GeneratedBy: entity.GeneratedByFallback})
	}
	if err := emit("matches", entity.NewMatchesEvent(matches, false)); err != nil {
		return err
	}

	// For the free-text path, the model parse can change budget/occasion/notes,
	// so the candidate pool is rebuilt from the refined profile.
	if text != nil {
		if err := emit("stage", entity.StageEvent{Stage: "reading"}); err != nil {
			return err
		}
		var gb entity.GeneratedBy
		profile, gb = s.parseProfileOrFallback(ctx, *text, limit, false)
		profileGeneratedBy = &gb
		if err := emit("profile", entity.ProfileEvent{Profile: profile, GeneratedBy: gb}); err != nil {
			return err
		}
		request, err = s.BuildAgentRequest(ctx, profile)
		if err != nil {
			if errors.Is(err, entity.ErrNoCandidates) {
				return emit("error", entity.ErrorEvent{Detail: err.Error()})
			}
			return err
		}
	}

	if err := emit("stage", entity.StageEvent{Stage: "refining"}); err != nil {
		return err
	}
	if refined, _ := s.agent.Rank(ctx, request, true); len(refined) > 0 {
		matches = refined
	}
	if err := emit("matches", entity.NewMatchesEvent(matches, true)); err != nil {
		return err
	}

	if err := emit("stage", entity.StageEvent{Stage: "writing"}); err != nil {
		return err
	}
	generatedBy, err := s.streamExplanation(ctx, profile, matches, limit, emit)
	if err != nil {
		return err
	}

	return emit("done", entity.DoneEvent{
		GeneratedBy:        generatedBy,
		ProfileGeneratedBy: profileGeneratedBy,
	})
}

// streamExplanation streams the narrative deltas and returns who generated it.
// It holds back the last len(sentinel) runes of the stream so the trailing
// fallback marker — which can be split across chunks — is never emitted to the
// browser and correctly flips generated_by.
func (s *RecommendationService) streamExplanation(
	ctx context.Context,
	profile entity.RecommendationRequest,
	matches []entity.MatchResult,
	limit int,
	emit Emitter,
) (entity.GeneratedBy, error) {
	payload := entity.ExplainPayload{
		Profile:        profile,
		Recommendation: matches[0],
		Alternatives:   alternativeMatches(matches, limit),
	}

	textCh, errCh, err := s.agent.ExplainRecommendation(ctx, payload)
	if err != nil {
		return entity.GeneratedByFallback, emit("delta", entity.DeltaEvent{Text: fallbackExplanation(matches[0])})
	}

	sentinel := []rune(FallbackSentinel)
	held := []rune{}
	for chunk := range textCh {
		if chunk == "" {
			continue
		}
		held = append(held, []rune(chunk)...)
		if len(held) > len(sentinel) {
			cut := len(held) - len(sentinel)
			emitPart := string(held[:cut])
			held = held[cut:]
			if err := emit("delta", entity.DeltaEvent{Text: emitPart}); err != nil {
				return entity.GeneratedByQwen, err
			}
		}
	}

	if streamErr := <-errCh; streamErr != nil {
		return entity.GeneratedByFallback, emit("delta", entity.DeltaEvent{Text: fallbackExplanation(matches[0])})
	}

	generatedBy := entity.GeneratedByQwen
	if hasRuneSuffix(held, sentinel) {
		held = held[:len(held)-len(sentinel)]
		generatedBy = entity.GeneratedByFallback
	}
	if len(held) > 0 {
		if err := emit("delta", entity.DeltaEvent{Text: string(held)}); err != nil {
			return generatedBy, err
		}
	}
	return generatedBy, nil
}

// parseProfileOrFallback wraps the agent parse with the deterministic fallback
// profile (free text passed through verbatim) used when the agent fails.
func (s *RecommendationService) parseProfileOrFallback(ctx context.Context, text string, limit int, fast bool) (entity.RecommendationRequest, entity.GeneratedBy) {
	profile, generatedBy, err := s.agent.ParseProfile(ctx, text, limit, fast)
	if err != nil {
		freeText := text
		return entity.RecommendationRequest{FreeText: &freeText, Limit: limit}, entity.GeneratedByFallback
	}
	return profile, generatedBy
}

func (s *RecommendationService) resolveReferences(ctx context.Context, names []string) []entity.ReferenceRecord {
	records := make([]entity.ReferenceRecord, 0, len(names))
	for _, name := range names {
		record, err := s.repo.ResolveReference(ctx, name)
		if err == nil && record != nil {
			records = append(records, *record)
		}
	}
	return records
}

// --- small pure helpers ---------------------------------------------------

func embeddingsOf(records []entity.ReferenceRecord) [][]float32 {
	out := make([][]float32, 0, len(records))
	for _, record := range records {
		if len(record.Embedding) > 0 {
			out = append(out, record.Embedding)
		}
	}
	return out
}

func fragrancesOf(records []entity.ReferenceRecord) []entity.Fragrance {
	out := make([]entity.Fragrance, 0, len(records))
	for _, record := range records {
		out = append(out, record.Fragrance)
	}
	return out
}

func preferredMatches(f entity.Fragrance, preferred map[string]struct{}) int {
	count := 0
	for _, note := range f.Notes {
		if _, ok := preferred[note]; ok {
			count++
		}
	}
	return count
}

func limitCandidates(candidates []entity.Fragrance, limit int) []entity.Fragrance {
	if limit < len(candidates) {
		return candidates[:limit]
	}
	return candidates
}

// alternativeMatches returns matches[1:limit+1], clamped to the slice bounds.
func alternativeMatches(matches []entity.MatchResult, limit int) []entity.MatchResult {
	if len(matches) <= 1 {
		return []entity.MatchResult{}
	}
	end := limit + 1
	if end > len(matches) {
		end = len(matches)
	}
	return matches[1:end]
}

func hasRuneSuffix(s, suffix []rune) bool {
	if len(suffix) > len(s) {
		return false
	}
	for i := 0; i < len(suffix); i++ {
		if s[len(s)-len(suffix)+i] != suffix[i] {
			return false
		}
	}
	return true
}
