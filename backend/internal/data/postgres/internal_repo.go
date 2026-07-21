package postgres

import (
	"context"
	"fmt"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
	"github.com/google/uuid"
)

// Upsert inserts or updates a fragrance by slug. The document embedding is
// invalidated (set NULL) only when a semantically-relevant field actually
// changed, so unrelated edits don't force a re-embed.
func (r *Repository) Upsert(ctx context.Context, input entity.InternalFragranceUpsert) (*entity.Fragrance, error) {
	statement := `
		INSERT INTO fragrances (
			slug, brand, name, description, gender, release_year,
			notes, top_notes, heart_notes, base_notes, occasions, climates,
			price_idr, rating, longevity_score, projection_score, source_url, source_type
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11, $12,
			$13, $14, $15, $16, $17, $18
		)
		ON CONFLICT (slug) DO UPDATE SET
			brand = EXCLUDED.brand,
			name = EXCLUDED.name,
			description = EXCLUDED.description,
			gender = EXCLUDED.gender,
			release_year = EXCLUDED.release_year,
			notes = EXCLUDED.notes,
			top_notes = EXCLUDED.top_notes,
			heart_notes = EXCLUDED.heart_notes,
			base_notes = EXCLUDED.base_notes,
			occasions = EXCLUDED.occasions,
			climates = EXCLUDED.climates,
			price_idr = EXCLUDED.price_idr,
			rating = EXCLUDED.rating,
			longevity_score = EXCLUDED.longevity_score,
			projection_score = EXCLUDED.projection_score,
			source_url = EXCLUDED.source_url,
			source_type = EXCLUDED.source_type,
			document_embedding = CASE
				WHEN fragrances.brand IS DISTINCT FROM EXCLUDED.brand
					OR fragrances.name IS DISTINCT FROM EXCLUDED.name
					OR fragrances.description IS DISTINCT FROM EXCLUDED.description
					OR fragrances.notes IS DISTINCT FROM EXCLUDED.notes
					OR fragrances.top_notes IS DISTINCT FROM EXCLUDED.top_notes
					OR fragrances.heart_notes IS DISTINCT FROM EXCLUDED.heart_notes
					OR fragrances.base_notes IS DISTINCT FROM EXCLUDED.base_notes
					OR fragrances.occasions IS DISTINCT FROM EXCLUDED.occasions
					OR fragrances.climates IS DISTINCT FROM EXCLUDED.climates
				THEN NULL
				ELSE fragrances.document_embedding
			END,
			updated_at = now()
		RETURNING ` + fragranceCols

	args := []any{
		input.Slug, input.Brand, input.Name, input.Description, input.Gender, input.ReleaseYear,
		nz(input.Notes), nz(input.TopNotes), nz(input.HeartNotes), nz(input.BaseNotes),
		nz(input.Occasions), nz(input.Climates),
		input.PriceIDR, input.Rating, input.LongevityScore, input.ProjectionScore,
		input.SourceURL, string(input.SourceType),
	}

	row := r.pool.QueryRow(ctx, statement, args...)
	f, err := scanFragrance(row, false)
	if err != nil {
		return nil, fmt.Errorf("postgres: upsert fragrance: %w", err)
	}
	return &f, nil
}

// ListInternal powers the enrichment-facing listing. missingPyramid is the
// superset of missingNotes: a record with no notes has no tiers either, so it
// sweeps never-enriched rows and pre-pyramid rows in one pass.
func (r *Repository) ListInternal(ctx context.Context, filter repository.InternalListFilter) (entity.InternalList, error) {
	where := ""
	switch {
	case filter.MissingPyramid:
		where = "WHERE top_notes = '{}' AND heart_notes = '{}' AND base_notes = '{}'"
	case filter.MissingNotes:
		where = "WHERE notes = '{}'"
	}

	var total int
	if err := r.pool.QueryRow(ctx, "SELECT count(*) FROM fragrances "+where).Scan(&total); err != nil {
		return entity.InternalList{}, fmt.Errorf("postgres: count internal: %w", err)
	}

	statement := fmt.Sprintf(
		"SELECT %s FROM fragrances %s ORDER BY slug LIMIT $1 OFFSET $2",
		fragranceCols, where,
	)
	rows, err := r.pool.Query(ctx, statement, filter.Limit, filter.Offset)
	if err != nil {
		return entity.InternalList{}, fmt.Errorf("postgres: list internal: %w", err)
	}
	defer rows.Close()

	items := make([]entity.Fragrance, 0)
	for rows.Next() {
		f, err := scanFragrance(rows, false)
		if err != nil {
			return entity.InternalList{}, fmt.Errorf("postgres: scan internal row: %w", err)
		}
		items = append(items, f)
	}
	if err := rows.Err(); err != nil {
		return entity.InternalList{}, err
	}
	return entity.InternalList{Total: total, Items: items}, nil
}

// ListMissingEmbeddings returns records whose document_embedding is NULL, most
// recently updated first.
func (r *Repository) ListMissingEmbeddings(ctx context.Context, limit int) ([]entity.Fragrance, error) {
	statement := fmt.Sprintf(`
		SELECT %s
		FROM fragrances
		WHERE document_embedding IS NULL
		ORDER BY updated_at DESC
		LIMIT $1
	`, fragranceCols)

	rows, err := r.pool.Query(ctx, statement, limit)
	if err != nil {
		return nil, fmt.Errorf("postgres: list missing embeddings: %w", err)
	}
	defer rows.Close()

	items := make([]entity.Fragrance, 0)
	for rows.Next() {
		f, err := scanFragrance(rows, false)
		if err != nil {
			return nil, fmt.Errorf("postgres: scan missing-embedding row: %w", err)
		}
		items = append(items, f)
	}
	return items, rows.Err()
}

// UpdateEmbedding stores a freshly computed vector for one fragrance.
func (r *Repository) UpdateEmbedding(ctx context.Context, id uuid.UUID, embedding []float32) error {
	_, err := r.pool.Exec(ctx,
		"UPDATE fragrances SET document_embedding = $1::vector WHERE id = $2::uuid",
		formatVector(embedding), id.String(),
	)
	if err != nil {
		return fmt.Errorf("postgres: update embedding: %w", err)
	}
	return nil
}
