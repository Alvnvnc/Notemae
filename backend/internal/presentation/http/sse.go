package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/usecase"
)

// marshalSSE encodes an event payload without HTML escaping, matching the
// Python sse() helper's json.dumps(ensure_ascii=False). json.Marshal never
// emits literal newlines, so the compact result is a safe single `data:` line.
func marshalSSE(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// handleRecommendStream is POST /v1/recommendations/stream (structured profile).
func (s *Server) handleRecommendStream(w http.ResponseWriter, r *http.Request) {
	var payload entity.RecommendationRequest
	if !decodeJSON(w, r, &payload) {
		return
	}
	if payload.BudgetIDR != nil && *payload.BudgetIDR < 0 {
		writeError(w, http.StatusUnprocessableEntity, "budget_idr must be at least 0")
		return
	}
	payload.Limit = clampRecommendationLimit(payload.Limit)
	s.runRecommendationStream(w, r, &payload, nil, payload.Limit)
}

// handleRecommendFromTextStream is POST /v1/recommendations/from-text/stream.
func (s *Server) handleRecommendFromTextStream(w http.ResponseWriter, r *http.Request) {
	var payload entity.TextRecommendationRequest
	if !decodeJSON(w, r, &payload) {
		return
	}
	if len(payload.Text) < 5 || len(payload.Text) > 2000 {
		writeError(w, http.StatusUnprocessableEntity, "text must be between 5 and 2000 characters")
		return
	}
	limit := clampRecommendationLimit(payload.Limit)
	s.runRecommendationStream(w, r, nil, &payload.Text, limit)
}

// runRecommendationStream sets up the SSE response and drives the domain stream.
// Exactly one of payload/text is non-nil. Once the first frame is flushed the
// status is committed to 200, so a later hard error can only end the stream —
// matching the Python StreamingResponse, which cut off mid-stream on failure.
func (s *Server) runRecommendationStream(
	w http.ResponseWriter,
	r *http.Request,
	payload *entity.RecommendationRequest,
	text *string,
	limit int,
) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	header := w.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-store")
	header.Set("Connection", "keep-alive")
	// nginx/Cloudflare buffer SSE by default, which would defeat streaming.
	header.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	emit := func(event string, data any) error {
		body, err := marshalSSE(data)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, body); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	err := s.rec.StreamRecommendation(r.Context(), payload, text, limit, usecase.Emitter(emit))
	if err != nil && !errors.Is(err, context.Canceled) {
		// The response is already committed; nothing to do but record the cause.
		log.Printf("recommendation stream ended early: %v", err)
	}
}
