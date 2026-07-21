// Package repository declares the ports the domain depends on. These are
// interfaces only — the data layer (postgres, agent HTTP client) provides the
// concrete implementations, and main.go wires them together. This is the
// dependency-inversion boundary of the clean architecture: the domain owns the
// contract, infrastructure conforms to it.
package repository

import (
	"context"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/google/uuid"
)

// CatalogFilter is the shared WHERE-clause specification. The paginated list
// and its total count both read from one filter so the pager can never size
// itself against a different predicate than the window is drawn from.
type CatalogFilter struct {
	Query       *string
	Note        *string
	NoteTier    *string // "top" | "heart" | "base"; anything else widens to the flat union
	Occasion    *string
	Gender      *string
	Brand       *string
	MaxPriceIDR *int
	MinPriceIDR *int
	AvoidNotes  []string
}

// CatalogQuery is a filter plus paging and an optional semantic-search vector.
type CatalogQuery struct {
	Filter         CatalogFilter
	QueryEmbedding []float32
	Limit          int
	Offset         int
}

// InternalListFilter drives the enrichment-facing /internal/fragrances listing.
type InternalListFilter struct {
	MissingNotes   bool
	MissingPyramid bool
	Limit          int
	Offset         int
}

// FragranceRepository is the catalog persistence port (backed by PostgreSQL +
// pgvector). All methods take a context so callers can cancel/timeout.
type FragranceRepository interface {
	// Ping verifies the database is reachable (powers /health).
	Ping(ctx context.Context) error

	CountCatalog(ctx context.Context, filter CatalogFilter) (int, error)
	ListCatalog(ctx context.Context, query CatalogQuery) ([]entity.Fragrance, error)
	GetBySlug(ctx context.Context, slug string) (*entity.Fragrance, error)
	ListBrands(ctx context.Context) ([]string, error)

	// ListRelationships splits curated links for a fragrance into (dupes of it,
	// fragrances it dupes, flankers either way).
	ListRelationships(ctx context.Context, id uuid.UUID) (dupes, originalOf, flankers []entity.RelatedFragrance, err error)
	// ListSimilar returns the nearest embedding neighbours, excluding the given ids.
	ListSimilar(ctx context.Context, id uuid.UUID, exclude map[uuid.UUID]struct{}, limit int) ([]entity.Fragrance, error)
	// ResolveReference fuzzy-matches a free-text name to one fragrance and
	// returns it with its embedding. Returns (nil, nil) when nothing matches.
	ResolveReference(ctx context.Context, name string) (*entity.ReferenceRecord, error)
	// ListFeaturedOriginals ranks originals by how many curated alternatives point at them.
	ListFeaturedOriginals(ctx context.Context, limit int) ([]entity.Fragrance, error)

	Upsert(ctx context.Context, input entity.InternalFragranceUpsert) (*entity.Fragrance, error)
	ListInternal(ctx context.Context, filter InternalListFilter) (entity.InternalList, error)
	// ListMissingEmbeddings returns records whose document_embedding is NULL.
	ListMissingEmbeddings(ctx context.Context, limit int) ([]entity.Fragrance, error)
	UpdateEmbedding(ctx context.Context, id uuid.UUID, embedding []float32) error
}

// AgentPort is the port to the Qwen agent service (backed by an HTTP client).
// Every method is best-effort from the domain's point of view: the services
// wrap these calls with deterministic fallbacks, so an error here degrades the
// response rather than failing the request.
type AgentPort interface {
	// Embed returns one vector per input text.
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	// Recommend asks the agent for a full ranked recommendation.
	Recommend(ctx context.Context, req entity.AgentRequest) (*entity.RecommendationResponse, error)
	// Rank returns just the ordered matches; rerank toggles the consensus pass.
	Rank(ctx context.Context, req entity.AgentRequest, rerank bool) ([]entity.MatchResult, error)
	// ParseProfile turns free text into a structured profile. fast selects the
	// cheap heuristic parse used for the first streamed paint.
	ParseProfile(ctx context.Context, text string, limit int, fast bool) (entity.RecommendationRequest, entity.GeneratedBy, error)
	// ExplainRecommendation streams the narrative explanation as text chunks.
	// The returned channel is closed when the stream ends; errCh delivers a
	// single terminal error (or nil) after the text channel closes.
	ExplainRecommendation(ctx context.Context, payload entity.ExplainPayload) (<-chan string, <-chan error, error)
	// ExplainDupes returns a one-shot explanation for a relationship graph.
	ExplainDupes(ctx context.Context, payload entity.DupeExplainPayload) (string, entity.GeneratedBy, error)
}
