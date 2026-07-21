package usecase

import (
	"context"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// embeddingBatchSize matches the Python rebuild loop: embeddings are requested
// ten at a time so one agent call never carries the whole backlog.
const embeddingBatchSize = 10

// InternalService owns the service-to-service surface the scraping/ingestion
// pipeline uses: upserting normalized records, listing sparse rows for
// enrichment, and rebuilding missing document embeddings via the agent.
type InternalService struct {
	repo  repository.FragranceRepository
	agent repository.AgentPort
}

func NewInternalService(repo repository.FragranceRepository, agent repository.AgentPort) *InternalService {
	return &InternalService{repo: repo, agent: agent}
}

// Upsert inserts or updates one fragrance by slug and returns the stored row.
func (s *InternalService) Upsert(ctx context.Context, input entity.InternalFragranceUpsert) (*entity.Fragrance, error) {
	return s.repo.Upsert(ctx, input)
}

// ListInternal returns a paginated, optionally sparsity-filtered window of the
// catalog for the enrichment worker.
func (s *InternalService) ListInternal(ctx context.Context, filter repository.InternalListFilter) (entity.InternalList, error) {
	return s.repo.ListInternal(ctx, filter)
}

// RebuildEmbeddings recomputes document embeddings for rows whose vector is
// NULL, up to limit rows. It mirrors the Python endpoint: records are embedded
// in fixed batches, and an agent failure stops the run early and reports the
// partial progress (selected, updated) rather than erroring — only a database
// failure propagates. The returned selected is the number of NULL-embedding
// rows chosen; updated is how many were successfully written.
func (s *InternalService) RebuildEmbeddings(ctx context.Context, limit int) (selected, updated int, err error) {
	records, err := s.repo.ListMissingEmbeddings(ctx, limit)
	if err != nil {
		return 0, 0, err
	}
	selected = len(records)

	for start := 0; start < len(records); start += embeddingBatchSize {
		end := min(start+embeddingBatchSize, len(records))
		batch := records[start:end]

		texts := make([]string, len(batch))
		for i, record := range batch {
			texts[i] = fragranceDocument(record)
		}

		embeddings, agentErr := s.agent.Embed(ctx, texts)
		// A short or failed agent response stops the run, matching Python's
		// break-on-error: the rows just stay NULL for the next sweep.
		if agentErr != nil || len(embeddings) != len(batch) {
			break
		}

		for i, record := range batch {
			if updateErr := s.repo.UpdateEmbedding(ctx, record.ID, embeddings[i]); updateErr != nil {
				return selected, updated, updateErr
			}
			updated++
		}
	}
	return selected, updated, nil
}
