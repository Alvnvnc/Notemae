package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ListRelationships splits curated links for a fragrance into (dupes of it,
// fragrances it dupes, flankers either way). The id is passed as text and cast
// to ::uuid so no pgx uuid codec is required.
func (r *Repository) ListRelationships(ctx context.Context, id uuid.UUID) (dupes, originalOf, flankers []entity.RelatedFragrance, err error) {
	dupes = []entity.RelatedFragrance{}
	originalOf = []entity.RelatedFragrance{}
	flankers = []entity.RelatedFragrance{}

	statement := fmt.Sprintf(`
		SELECT %s, fr.relation, fr.confidence::float8, fr.source,
		       fr.related_id = $1::uuid AS points_here
		FROM fragrance_relationships fr
		JOIN fragrances f ON f.id = CASE
			WHEN fr.related_id = $1::uuid THEN fr.fragrance_id
			ELSE fr.related_id
		END
		WHERE fr.related_id = $1::uuid OR fr.fragrance_id = $1::uuid
		ORDER BY fr.confidence DESC
	`, fragranceColsF)

	rows, err := r.pool.Query(ctx, statement, id.String())
	if err != nil {
		return nil, nil, nil, fmt.Errorf("postgres: list relationships: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		related, pointsHere, scanErr := scanRelated(rows)
		if scanErr != nil {
			return nil, nil, nil, fmt.Errorf("postgres: scan relationship: %w", scanErr)
		}
		switch {
		case related.Relation == entity.RelationFlankerOf:
			flankers = append(flankers, related)
		case pointsHere:
			dupes = append(dupes, related)
		default:
			originalOf = append(originalOf, related)
		}
	}
	return dupes, originalOf, flankers, rows.Err()
}

// ListSimilar returns the nearest embedding neighbours, excluding the given ids.
// It fetches the anchor's embedding first, then over-fetches by len(exclude) so
// the post-filter still leaves `limit` results.
func (r *Repository) ListSimilar(ctx context.Context, id uuid.UUID, exclude map[uuid.UUID]struct{}, limit int) ([]entity.Fragrance, error) {
	var embText *string
	err := r.pool.QueryRow(ctx,
		"SELECT document_embedding::text FROM fragrances WHERE id = $1::uuid", id.String(),
	).Scan(&embText)
	if errors.Is(err, pgx.ErrNoRows) || embText == nil {
		return []entity.Fragrance{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("postgres: similar anchor lookup: %w", err)
	}

	statement := fmt.Sprintf(`
		SELECT %s, 1 - (document_embedding <=> $1::vector) AS semantic_similarity
		FROM fragrances
		WHERE id <> $2::uuid AND document_embedding IS NOT NULL
		ORDER BY document_embedding <=> $1::vector
		LIMIT $3
	`, fragranceCols)

	rows, err := r.pool.Query(ctx, statement, *embText, id.String(), limit+len(exclude))
	if err != nil {
		return nil, fmt.Errorf("postgres: list similar: %w", err)
	}
	defer rows.Close()

	similar := make([]entity.Fragrance, 0, limit)
	for rows.Next() {
		f, err := scanFragrance(rows, true)
		if err != nil {
			return nil, fmt.Errorf("postgres: scan similar row: %w", err)
		}
		if _, skip := exclude[f.ID]; skip {
			continue
		}
		similar = append(similar, f)
		if len(similar) >= limit {
			break
		}
	}
	return similar, rows.Err()
}

// ResolveReference fuzzy-matches a free-text name to one fragrance and returns
// it with its embedding, or (nil, nil) when nothing matches.
func (r *Repository) ResolveReference(ctx context.Context, name string) (*entity.ReferenceRecord, error) {
	pattern := "%" + strings.TrimSpace(name) + "%"
	statement := fmt.Sprintf(`
		SELECT %s, document_embedding::text
		FROM fragrances
		WHERE (brand || ' ' || name) ILIKE $1 OR name ILIKE $1 OR brand ILIKE $1
		ORDER BY rating DESC NULLS LAST
		LIMIT 1
	`, fragranceCols)

	row := r.pool.QueryRow(ctx, statement, pattern)
	fragrance, embedding, err := scanFragranceEmbedding(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("postgres: resolve reference: %w", err)
	}
	return &entity.ReferenceRecord{Fragrance: fragrance, Embedding: embedding}, nil
}

// ListFeaturedOriginals ranks originals by how many curated alternatives point
// at them. Grouping by the primary key is equivalent to grouping by every
// column (id is unique) but lets the casts in fragranceColsF stand.
func (r *Repository) ListFeaturedOriginals(ctx context.Context, limit int) ([]entity.Fragrance, error) {
	statement := fmt.Sprintf(`
		SELECT %s
		FROM fragrance_relationships fr
		JOIN fragrances f ON f.id = fr.related_id
		WHERE fr.relation IN ('clone_of', 'inspired_by')
		GROUP BY f.id
		ORDER BY COUNT(*) DESC, MAX(fr.confidence) DESC, f.rating DESC NULLS LAST
		LIMIT $1
	`, fragranceColsF)

	rows, err := r.pool.Query(ctx, statement, limit)
	if err != nil {
		return nil, fmt.Errorf("postgres: list featured: %w", err)
	}
	defer rows.Close()

	items := make([]entity.Fragrance, 0, limit)
	for rows.Next() {
		f, err := scanFragrance(rows, false)
		if err != nil {
			return nil, fmt.Errorf("postgres: scan featured row: %w", err)
		}
		items = append(items, f)
	}
	return items, rows.Err()
}
