// Package httpapi is the presentation layer: it adapts HTTP requests to the
// domain services and renders their results (and the SSE stream) back to the
// client. It depends only on the domain — never on pgx or the agent client
// directly — so the transport can change without touching business rules.
//
// The router is built on the standard library's net/http ServeMux (Go 1.22+
// method-and-wildcard patterns), keeping the dependency surface to pgx + uuid.
package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
)

// writeJSON renders v as JSON with the given status. Encoding errors are only
// possible after the header is sent, so they are intentionally swallowed.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	_ = enc.Encode(v)
}

// writeError renders {"detail": ...}, the same error envelope FastAPI used, so
// existing clients keep parsing failures the same way.
func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"detail": detail})
}

// decodeJSON reads a JSON body into dst, rejecting unknown fields and trailing
// data. A failure is reported as 422 to match FastAPI's validation status.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "malformed request body")
		return false
	}
	return true
}

// query wraps url.Values with length/range validation. The first violation is
// recorded in err; subsequent reads short-circuit so one message is reported.
type query struct {
	vals url.Values
	err  string
}

func newQuery(r *http.Request) *query { return &query{vals: r.URL.Query()} }

func (q *query) fail(msg string) {
	if q.err == "" {
		q.err = msg
	}
}

// str returns a pointer to a present, non-empty value bounded by [minLen,maxLen],
// or nil when the key is absent. Out-of-bound lengths record a validation error.
func (q *query) str(key string, minLen, maxLen int) *string {
	if q.err != "" {
		return nil
	}
	v := q.vals.Get(key)
	if v == "" {
		return nil
	}
	if len(v) < minLen || len(v) > maxLen {
		q.fail(fmt.Sprintf("%s must be between %d and %d characters", key, minLen, maxLen))
		return nil
	}
	return &v
}

// enum returns a pointer to a present value that must be one of allowed, or nil
// when absent. An unrecognized value records a validation error.
func (q *query) enum(key string, allowed ...string) *string {
	if q.err != "" {
		return nil
	}
	v := q.vals.Get(key)
	if v == "" {
		return nil
	}
	for _, a := range allowed {
		if v == a {
			return &v
		}
	}
	q.fail(fmt.Sprintf("%s must be one of %s", key, strings.Join(allowed, ", ")))
	return nil
}

// intDefault reads an integer with a default, clamped to [lo,hi]; a value
// outside the range is a validation error, matching FastAPI's ge/le bounds.
func (q *query) intDefault(key string, def, lo, hi int) int {
	if q.err != "" {
		return def
	}
	raw := q.vals.Get(key)
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		q.fail(fmt.Sprintf("%s must be an integer", key))
		return def
	}
	if n < lo || n > hi {
		q.fail(fmt.Sprintf("%s must be between %d and %d", key, lo, hi))
		return def
	}
	return n
}

// optIntMin reads an optional integer with a lower bound, or nil when absent.
func (q *query) optIntMin(key string, lo int) *int {
	if q.err != "" {
		return nil
	}
	raw := q.vals.Get(key)
	if raw == "" {
		return nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		q.fail(fmt.Sprintf("%s must be an integer", key))
		return nil
	}
	if n < lo {
		q.fail(fmt.Sprintf("%s must be at least %d", key, lo))
		return nil
	}
	return &n
}

// boolVal reads a boolean flag (default false); "true"/"1" are truthy, matching
// the query-string conventions FastAPI accepted.
func (q *query) boolVal(key string) bool {
	raw := strings.ToLower(q.vals.Get(key))
	return raw == "true" || raw == "1"
}

// --- request-body validation ---------------------------------------------

// validator accumulates the first field violation into a single message.
type validator struct{ err string }

func (v *validator) fail(msg string) {
	if v.err == "" {
		v.err = msg
	}
}

func (v *validator) strLen(field, val string, minLen, maxLen int) {
	if len(val) < minLen || len(val) > maxLen {
		v.fail(fmt.Sprintf("%s must be between %d and %d characters", field, minLen, maxLen))
	}
}

func (v *validator) maxLen(field, val string, maxLen int) {
	if len(val) > maxLen {
		v.fail(fmt.Sprintf("%s must be at most %d characters", field, maxLen))
	}
}

func (v *validator) sliceMax(field string, s []string, maxItems int) {
	if len(s) > maxItems {
		v.fail(fmt.Sprintf("%s must have at most %d items", field, maxItems))
	}
}

func (v *validator) enum(field, val string, allowed ...string) {
	for _, a := range allowed {
		if val == a {
			return
		}
	}
	v.fail(fmt.Sprintf("%s must be one of %s", field, strings.Join(allowed, ", ")))
}

func (v *validator) intRange(field string, p *int, lo, hi int) {
	if p != nil && (*p < lo || *p > hi) {
		v.fail(fmt.Sprintf("%s must be between %d and %d", field, lo, hi))
	}
}

func (v *validator) floatRange(field string, p *float64, lo, hi float64) {
	if p != nil && (*p < lo || *p > hi) {
		v.fail(fmt.Sprintf("%s must be between %g and %g", field, lo, hi))
	}
}

// validateUpsert mirrors the bounds of the Python InternalFragranceUpsert model
// so the ingestion boundary rejects malformed records before they reach SQL.
func validateUpsert(u entity.InternalFragranceUpsert) string {
	var v validator
	v.strLen("slug", u.Slug, 3, 160)
	v.strLen("brand", u.Brand, 1, 120)
	v.strLen("name", u.Name, 1, 160)
	v.maxLen("description", u.Description, 2000)
	v.maxLen("gender", u.Gender, 30)
	v.intRange("release_year", u.ReleaseYear, 1800, 2100)
	v.sliceMax("notes", u.Notes, 50)
	v.sliceMax("top_notes", u.TopNotes, 25)
	v.sliceMax("heart_notes", u.HeartNotes, 25)
	v.sliceMax("base_notes", u.BaseNotes, 25)
	v.sliceMax("occasions", u.Occasions, 20)
	v.sliceMax("climates", u.Climates, 20)
	v.intRange("price_idr", u.PriceIDR, 0, 1<<62)
	v.floatRange("rating", u.Rating, 0, 5)
	v.floatRange("longevity_score", u.LongevityScore, 0, 5)
	v.floatRange("projection_score", u.ProjectionScore, 0, 5)
	v.strLen("source_url", u.SourceURL, 8, 1000)
	v.enum("source_type", string(u.SourceType),
		string(entity.SourcePublicDataset), string(entity.SourceOfficialAPI), string(entity.SourceLicensedFeed))
	return v.err
}

// clampRecommendationLimit applies the model default (3) and 1..5 bound to the
// limit field, which JSON unmarshals to 0 when the client omits it.
func clampRecommendationLimit(limit int) int {
	if limit == 0 {
		return 3
	}
	if limit < 1 {
		return 1
	}
	if limit > 5 {
		return 5
	}
	return limit
}

// ensureProfileSlices materializes nil slices on a profile so it marshals with
// `[]` rather than `null`, matching the shape Python's model_dump produced (the
// fallback profile, built when the agent is down, otherwise leaves them nil).
func ensureProfileSlices(p *entity.RecommendationRequest) {
	if p.PreferredNotes == nil {
		p.PreferredNotes = []string{}
	}
	if p.AvoidNotes == nil {
		p.AvoidNotes = []string{}
	}
	if p.PreferredFamilies == nil {
		p.PreferredFamilies = []string{}
	}
	if p.ReferenceLikes == nil {
		p.ReferenceLikes = []string{}
	}
	if p.ReferenceDislikes == nil {
		p.ReferenceDislikes = []string{}
	}
}
