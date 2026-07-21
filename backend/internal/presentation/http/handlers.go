package httpapi

import (
	"errors"
	"log"
	"net/http"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// maxOffset bounds the paging offset; Python left it unbounded (ge=0 only), but
// a ceiling keeps a hostile query from requesting an absurd OFFSET.
const maxOffset = 1 << 31

// writeDomainError maps sentinel domain errors to their HTTP status, mirroring
// the Python handlers' status codes and detail strings. Anything unrecognized
// is a 500 and is logged with its cause.
func (s *Server) writeDomainError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, entity.ErrNotFound):
		writeError(w, http.StatusNotFound, "Fragrance not found")
	case errors.Is(err, entity.ErrNoCandidates):
		writeError(w, http.StatusNotFound, "No catalog fragrance passes the requested filters")
	default:
		log.Printf("error serving %s %s: %v", r.Method, r.URL.Path, err)
		writeError(w, http.StatusInternalServerError, "internal server error")
	}
}

// handleHealth verifies the database is reachable, matching the Python health
// probe that ran SELECT 1.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.catalog.Health(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status": "unavailable", "service": "backend",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "backend"})
}

// handleSearch is GET /v1/fragrances: a filtered, paginated catalog window plus
// its total under the same filter.
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := newQuery(r)
	filter := repository.CatalogFilter{
		Query:       q.str("q", 1, 100),
		Note:        q.str("note", 1, 50),
		NoteTier:    q.enum("note_tier", "top", "heart", "base"),
		Occasion:    q.str("occasion", 1, 50),
		Gender:      q.str("gender", 1, 30),
		Brand:       q.str("brand", 1, 120),
		MaxPriceIDR: q.optIntMin("max_price_idr", 0),
		MinPriceIDR: q.optIntMin("min_price_idr", 0),
	}
	limit := q.intDefault("limit", 12, 1, 50)
	offset := q.intDefault("offset", 0, 0, maxOffset)
	if q.err != "" {
		writeError(w, http.StatusUnprocessableEntity, q.err)
		return
	}

	list, err := s.catalog.Search(r.Context(), filter, limit, offset)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// handleBrands is GET /v1/brands: the distinct brand list behind the filter.
func (s *Server) handleBrands(w http.ResponseWriter, r *http.Request) {
	brands, err := s.catalog.ListBrands(r.Context())
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, brands)
}

// handleGetFragrance is GET /v1/fragrances/{slug}.
func (s *Server) handleGetFragrance(w http.ResponseWriter, r *http.Request) {
	fragrance, err := s.catalog.GetBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, fragrance)
}

// handleDupes is GET /v1/fragrances/{slug}/dupes?explain=.
func (s *Server) handleDupes(w http.ResponseWriter, r *http.Request) {
	explain := newQuery(r).boolVal("explain")
	response, err := s.dupe.GetDupes(r.Context(), r.PathValue("slug"), explain)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// handleFeatured is GET /v1/featured?limit=.
func (s *Server) handleFeatured(w http.ResponseWriter, r *http.Request) {
	q := newQuery(r)
	limit := q.intDefault("limit", 5, 1, 12)
	if q.err != "" {
		writeError(w, http.StatusUnprocessableEntity, q.err)
		return
	}
	list, err := s.dupe.Featured(r.Context(), limit)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// handleRecommend is POST /v1/recommendations.
func (s *Server) handleRecommend(w http.ResponseWriter, r *http.Request) {
	var payload entity.RecommendationRequest
	if !decodeJSON(w, r, &payload) {
		return
	}
	if payload.BudgetIDR != nil && *payload.BudgetIDR < 0 {
		writeError(w, http.StatusUnprocessableEntity, "budget_idr must be at least 0")
		return
	}
	payload.Limit = clampRecommendationLimit(payload.Limit)

	response, err := s.rec.Recommend(r.Context(), payload)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
}

// handleRecommendFromText is POST /v1/recommendations/from-text.
func (s *Server) handleRecommendFromText(w http.ResponseWriter, r *http.Request) {
	var payload entity.TextRecommendationRequest
	if !decodeJSON(w, r, &payload) {
		return
	}
	if len(payload.Text) < 5 || len(payload.Text) > 2000 {
		writeError(w, http.StatusUnprocessableEntity, "text must be between 5 and 2000 characters")
		return
	}
	limit := clampRecommendationLimit(payload.Limit)

	response, err := s.rec.RecommendFromText(r.Context(), payload.Text, limit)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	ensureProfileSlices(&response.Profile)
	writeJSON(w, http.StatusOK, response)
}
