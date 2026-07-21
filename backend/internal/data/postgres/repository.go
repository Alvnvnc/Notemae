package postgres

import (
	"context"
	"strconv"
	"strings"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository is the pgxpool-backed FragranceRepository.
type Repository struct {
	pool *pgxpool.Pool
}

// compile-time proof the adapter satisfies the domain port.
var _ repository.FragranceRepository = (*Repository)(nil)

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

// Column lists. Numeric columns are cast to float8 and id to text so they scan
// cleanly into *float64 / string; nulls survive the cast as NULL. fragranceCols
// is the bare form; fragranceColsF is the same list prefixed for JOINs.
const fragranceCols = `id::text, slug, brand, name, description, gender, release_year,
	notes, top_notes, heart_notes, base_notes, occasions, climates,
	price_idr, rating::float8 AS rating, longevity_score::float8 AS longevity_score,
	projection_score::float8 AS projection_score, source_url, source_type`

const fragranceColsF = `f.id::text, f.slug, f.brand, f.name, f.description, f.gender, f.release_year,
	f.notes, f.top_notes, f.heart_notes, f.base_notes, f.occasions, f.climates,
	f.price_idr, f.rating::float8 AS rating, f.longevity_score::float8 AS longevity_score,
	f.projection_score::float8 AS projection_score, f.source_url, f.source_type`

// scannable is satisfied by both pgx.Row (QueryRow) and pgx.Rows.
type scannable interface {
	Scan(dest ...any) error
}

// numericTemps holds the rating/longevity/projection columns while scanning.
// They are read as plain float64 (the SQL casts NUMERIC to float8) and then
// converted to *entity.Score in finalize, which controls their JSON rendering.
type numericTemps struct {
	rating     *float64
	longevity  *float64
	projection *float64
}

// fragranceDest returns the scan targets for the base fragrance columns, in the
// exact order of fragranceCols. id is read as text into idStr and parsed after;
// the numeric score columns are read into t and converted in finalize.
func fragranceDest(f *entity.Fragrance, idStr *string, t *numericTemps) []any {
	return []any{
		idStr, &f.Slug, &f.Brand, &f.Name, &f.Description, &f.Gender, &f.ReleaseYear,
		&f.Notes, &f.TopNotes, &f.HeartNotes, &f.BaseNotes, &f.Occasions, &f.Climates,
		&f.PriceIDR, &t.rating, &t.longevity, &t.projection, &f.SourceURL, &f.SourceType,
	}
}

// scorePtr converts a scanned *float64 into a *entity.Score, preserving NULL.
func scorePtr(v *float64) *entity.Score {
	if v == nil {
		return nil
	}
	s := entity.Score(*v)
	return &s
}

// finalize parses the text id, converts the numeric temps to scores, and
// materializes empty slices so they marshal to `[]` rather than `null`,
// preserving the Python API's shape.
func finalize(f *entity.Fragrance, idStr string, t numericTemps) error {
	id, err := uuid.Parse(idStr)
	if err != nil {
		return err
	}
	f.ID = id
	f.Rating = scorePtr(t.rating)
	f.LongevityScore = scorePtr(t.longevity)
	f.ProjectionScore = scorePtr(t.projection)
	ensureSlices(f)
	return nil
}

func ensureSlices(f *entity.Fragrance) {
	if f.Notes == nil {
		f.Notes = []string{}
	}
	if f.TopNotes == nil {
		f.TopNotes = []string{}
	}
	if f.HeartNotes == nil {
		f.HeartNotes = []string{}
	}
	if f.BaseNotes == nil {
		f.BaseNotes = []string{}
	}
	if f.Occasions == nil {
		f.Occasions = []string{}
	}
	if f.Climates == nil {
		f.Climates = []string{}
	}
}

// scanFragrance scans the base columns, optionally followed by a trailing
// semantic_similarity column.
func scanFragrance(s scannable, withSimilarity bool) (entity.Fragrance, error) {
	var f entity.Fragrance
	var idStr string
	var t numericTemps
	dest := fragranceDest(&f, &idStr, &t)
	if withSimilarity {
		dest = append(dest, &f.SemanticSimilarity)
	}
	if err := s.Scan(dest...); err != nil {
		return f, err
	}
	return f, finalize(&f, idStr, t)
}

// scanFragranceEmbedding scans the base columns plus a trailing
// document_embedding text column, returning the parsed vector (nil when NULL).
func scanFragranceEmbedding(s scannable) (entity.Fragrance, []float32, error) {
	var f entity.Fragrance
	var idStr string
	var t numericTemps
	var embText *string
	dest := append(fragranceDest(&f, &idStr, &t), &embText)
	if err := s.Scan(dest...); err != nil {
		return f, nil, err
	}
	if err := finalize(&f, idStr, t); err != nil {
		return f, nil, err
	}
	var embedding []float32
	if embText != nil {
		embedding = parseVector(*embText)
	}
	return f, embedding, nil
}

// scanRelated scans the base columns (prefixed f.) plus the relationship
// columns, returning whether the relationship points at the queried fragrance.
func scanRelated(s scannable) (entity.RelatedFragrance, bool, error) {
	var f entity.Fragrance
	var idStr string
	var t numericTemps
	var relation entity.RelationType
	var confidence float64
	var source string
	var pointsHere bool
	dest := append(fragranceDest(&f, &idStr, &t), &relation, &confidence, &source, &pointsHere)
	if err := s.Scan(dest...); err != nil {
		return entity.RelatedFragrance{}, false, err
	}
	if err := finalize(&f, idStr, t); err != nil {
		return entity.RelatedFragrance{}, false, err
	}
	return entity.RelatedFragrance{
		Fragrance:  f,
		Relation:   relation,
		// confidence is REAL (float4); Score renders its shortest float32 form.
		Confidence: entity.Score(confidence),
		Source:     source,
	}, pointsHere, nil
}

// formatVector renders a vector as pgvector's text input, matching the Python
// "%.8g" join so the same value casts to ::vector identically.
func formatVector(v []float32) string {
	var sb strings.Builder
	sb.WriteByte('[')
	for i, x := range v {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString(strconv.FormatFloat(float64(x), 'g', 8, 32))
	}
	sb.WriteByte(']')
	return sb.String()
}

// parseVector reads pgvector's text output ("[v1,v2,...]") back into floats.
func parseVector(s string) []float32 {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]float32, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		val, err := strconv.ParseFloat(part, 32)
		if err != nil {
			return nil
		}
		out = append(out, float32(val))
	}
	return out
}

// nz coerces a nil slice to an empty one so text[] NOT NULL columns never
// receive a NULL on insert.
func nz(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
