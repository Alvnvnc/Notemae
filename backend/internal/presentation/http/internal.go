package httpapi

import (
	"net/http"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// handleUpsert is POST /internal/fragrances: the scraping service pushes one
// normalized record, which is inserted or updated by slug. Auth is applied by
// the requireServiceKey wrapper before this runs.
func (s *Server) handleUpsert(w http.ResponseWriter, r *http.Request) {
	var payload entity.InternalFragranceUpsert
	if !decodeJSON(w, r, &payload) {
		return
	}
	// Match the Python model defaults for fields the source may omit.
	if payload.Gender == "" {
		payload.Gender = "unisex"
	}
	if msg := validateUpsert(payload); msg != "" {
		writeError(w, http.StatusUnprocessableEntity, msg)
		return
	}

	fragrance, err := s.internal.Upsert(r.Context(), payload)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, fragrance)
}

// handleListInternal is GET /internal/fragrances: the enrichment worker pulls
// sparse rows to backfill notes/pyramids.
func (s *Server) handleListInternal(w http.ResponseWriter, r *http.Request) {
	q := newQuery(r)
	filter := repository.InternalListFilter{
		MissingNotes:   q.boolVal("missing_notes"),
		MissingPyramid: q.boolVal("missing_pyramid"),
		Limit:          q.intDefault("limit", 100, 1, 500),
		Offset:         q.intDefault("offset", 0, 0, maxOffset),
	}
	if q.err != "" {
		writeError(w, http.StatusUnprocessableEntity, q.err)
		return
	}

	list, err := s.internal.ListInternal(r.Context(), filter)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// handleRebuildEmbeddings is POST /internal/embeddings/rebuild: recompute the
// document embedding for NULL-vector rows via the agent, up to limit rows. A
// partial run (agent unavailable mid-batch) still returns 200 with the counts.
func (s *Server) handleRebuildEmbeddings(w http.ResponseWriter, r *http.Request) {
	q := newQuery(r)
	limit := q.intDefault("limit", 500, 1, 5000)
	if q.err != "" {
		writeError(w, http.StatusUnprocessableEntity, q.err)
		return
	}

	selected, updated, err := s.internal.RebuildEmbeddings(r.Context(), limit)
	if err != nil {
		s.writeDomainError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"selected": selected, "updated": updated})
}
