package usecase

import (
	"context"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
	"github.com/google/uuid"
)

// DupeService assembles the relationship graph around a fragrance and, on the
// home page, the curated "featured originals" list.
type DupeService struct {
	repo  repository.FragranceRepository
	agent repository.AgentPort
}

func NewDupeService(repo repository.FragranceRepository, agent repository.AgentPort) *DupeService {
	return &DupeService{repo: repo, agent: agent}
}

// relatedIDs collects every fragrance id referenced by the relationship lists,
// so ListSimilar can exclude anything already shown as a curated relation.
func relatedIDs(groups ...[]entity.RelatedFragrance) map[uuid.UUID]struct{} {
	ids := make(map[uuid.UUID]struct{})
	for _, group := range groups {
		for _, item := range group {
			ids[item.Fragrance.ID] = struct{}{}
		}
	}
	return ids
}

// GetDupes returns the full relationship graph for a slug. When explain is set,
// it asks the agent for a narrative; an agent failure degrades to no
// explanation rather than failing the whole response.
func (s *DupeService) GetDupes(ctx context.Context, slug string, explain bool) (entity.DupeResponse, error) {
	record, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return entity.DupeResponse{}, err
	}
	if record == nil {
		return entity.DupeResponse{}, entity.ErrNotFound
	}

	dupes, originalOf, flankers, err := s.repo.ListRelationships(ctx, record.ID)
	if err != nil {
		return entity.DupeResponse{}, err
	}

	exclude := relatedIDs(dupes, originalOf, flankers)
	exclude[record.ID] = struct{}{}
	similar, err := s.repo.ListSimilar(ctx, record.ID, exclude, 5)
	if err != nil {
		return entity.DupeResponse{}, err
	}

	response := entity.DupeResponse{
		Fragrance:  *record,
		Dupes:      dupes,
		OriginalOf: originalOf,
		Flankers:   flankers,
		Similar:    similar,
		Disclaimer: DupeDisclaimer,
	}

	if explain {
		explanation, generatedBy, agentErr := s.agent.ExplainDupes(ctx, entity.DupeExplainPayload{
			Fragrance:  *record,
			Dupes:      dupes,
			OriginalOf: originalOf,
			Flankers:   flankers,
			Similar:    similar,
		})
		if agentErr == nil {
			response.Explanation = &explanation
			gb := generatedBy
			response.GeneratedBy = &gb
		}
	}

	return response, nil
}

// Featured returns originals that have curated alternatives, ranked by curation
// depth. Originals with no dupes are skipped rather than shown empty.
func (s *DupeService) Featured(ctx context.Context, limit int) (entity.FeaturedList, error) {
	originals, err := s.repo.ListFeaturedOriginals(ctx, limit)
	if err != nil {
		return entity.FeaturedList{}, err
	}

	items := make([]entity.DupeResponse, 0, len(originals))
	for _, record := range originals {
		dupes, originalOf, flankers, err := s.repo.ListRelationships(ctx, record.ID)
		if err != nil {
			return entity.FeaturedList{}, err
		}
		if len(dupes) == 0 {
			continue
		}
		exclude := relatedIDs(dupes, originalOf, flankers)
		exclude[record.ID] = struct{}{}
		similar, err := s.repo.ListSimilar(ctx, record.ID, exclude, 5)
		if err != nil {
			return entity.FeaturedList{}, err
		}
		items = append(items, entity.DupeResponse{
			Fragrance:  record,
			Dupes:      dupes,
			OriginalOf: originalOf,
			Flankers:   flankers,
			Similar:    similar,
			Disclaimer: DupeDisclaimer,
		})
	}
	return entity.FeaturedList{Items: items}, nil
}
