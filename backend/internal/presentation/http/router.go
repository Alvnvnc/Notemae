package httpapi

import (
	"net/http"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/usecase"
)

// Config carries the presentation-layer settings. It is a small local struct so
// this package never imports internal/config; the composition root translates.
type Config struct {
	AllowedOrigins      []string
	ServiceSharedSecret string
}

// Server holds the domain services the handlers delegate to. It is transport
// state only — it owns no business logic of its own.
type Server struct {
	cfg      Config
	catalog  *usecase.CatalogService
	dupe     *usecase.DupeService
	rec      *usecase.RecommendationService
	internal *usecase.InternalService
}

// NewRouter wires every endpoint onto a standard-library ServeMux (Go 1.22
// method + wildcard patterns) and wraps it with recovery and CORS. The returned
// handler is ready to hand to http.Server.
func NewRouter(
	cfg Config,
	catalog *usecase.CatalogService,
	dupe *usecase.DupeService,
	rec *usecase.RecommendationService,
	internal *usecase.InternalService,
) http.Handler {
	s := &Server{cfg: cfg, catalog: catalog, dupe: dupe, rec: rec, internal: internal}

	mux := http.NewServeMux()

	// Health + frontend-facing catalog reads.
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /v1/fragrances", s.handleSearch)
	mux.HandleFunc("GET /v1/brands", s.handleBrands)
	mux.HandleFunc("GET /v1/fragrances/{slug}", s.handleGetFragrance)
	mux.HandleFunc("GET /v1/fragrances/{slug}/dupes", s.handleDupes)
	mux.HandleFunc("GET /v1/featured", s.handleFeatured)

	// Recommendations (unary + streaming).
	mux.HandleFunc("POST /v1/recommendations", s.handleRecommend)
	mux.HandleFunc("POST /v1/recommendations/from-text", s.handleRecommendFromText)
	mux.HandleFunc("POST /v1/recommendations/stream", s.handleRecommendStream)
	mux.HandleFunc("POST /v1/recommendations/from-text/stream", s.handleRecommendFromTextStream)

	// Service-to-service ingestion surface (shared-secret guarded).
	mux.HandleFunc("POST /internal/fragrances", s.requireServiceKey(s.handleUpsert))
	mux.HandleFunc("GET /internal/fragrances", s.requireServiceKey(s.handleListInternal))
	mux.HandleFunc("POST /internal/embeddings/rebuild", s.requireServiceKey(s.handleRebuildEmbeddings))

	return recoverMiddleware(corsMiddleware(s.cfg.AllowedOrigins, mux))
}
