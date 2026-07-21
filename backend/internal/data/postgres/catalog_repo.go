package postgres

import (
	"context"
	"errors"
	"fmt"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
	"github.com/jackc/pgx/v5"
)

// CountCatalog counts rows under the filter, ignoring paging — sizes the pager.
func (r *Repository) CountCatalog(ctx context.Context, filter repository.CatalogFilter) (int, error) {
	b := &argBuilder{}
	where := catalogWhere(b, filter)
	var total int
	if err := r.pool.QueryRow(ctx, "SELECT count(*) FROM fragrances "+where, b.args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("postgres: count catalog: %w", err)
	}
	return total, nil
}

// ListCatalog returns a page under the filter. When a query embedding is given,
// the page is ordered by semantic distance and carries a similarity score;
// otherwise it falls back to rating/brand/name ordering.
func (r *Repository) ListCatalog(ctx context.Context, query repository.CatalogQuery) ([]entity.Fragrance, error) {
	b := &argBuilder{}
	selectFields := fragranceCols
	orderClause := "rating DESC NULLS LAST, brand, name"
	hasEmbedding := len(query.QueryEmbedding) > 0

	if hasEmbedding {
		// The vector is bound once and referenced in both the SELECT and the
		// ORDER BY via the same placeholder.
		vp := b.next(formatVector(query.QueryEmbedding))
		selectFields = fragranceCols + fmt.Sprintf(", 1 - (document_embedding <=> %s::vector) AS semantic_similarity", vp)
		orderClause = fmt.Sprintf("document_embedding <=> %s::vector NULLS LAST, rating DESC NULLS LAST", vp)
	}

	where := catalogWhere(b, query.Filter)
	limitP := b.next(query.Limit)
	offsetP := b.next(query.Offset)

	statement := fmt.Sprintf(
		"SELECT %s FROM fragrances %s ORDER BY %s LIMIT %s OFFSET %s",
		selectFields, where, orderClause, limitP, offsetP,
	)

	rows, err := r.pool.Query(ctx, statement, b.args...)
	if err != nil {
		return nil, fmt.Errorf("postgres: list catalog: %w", err)
	}
	defer rows.Close()

	items := make([]entity.Fragrance, 0)
	for rows.Next() {
		f, err := scanFragrance(rows, hasEmbedding)
		if err != nil {
			return nil, fmt.Errorf("postgres: scan catalog row: %w", err)
		}
		items = append(items, f)
	}
	return items, rows.Err()
}

// GetBySlug returns one fragrance, or (nil, nil) when the slug is unknown.
func (r *Repository) GetBySlug(ctx context.Context, slug string) (*entity.Fragrance, error) {
	row := r.pool.QueryRow(ctx, "SELECT "+fragranceCols+" FROM fragrances WHERE slug = $1", slug)
	f, err := scanFragrance(row, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("postgres: get by slug: %w", err)
	}
	return &f, nil
}

// ListBrands returns the distinct brands powering the brand filter.
func (r *Repository) ListBrands(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx, "SELECT DISTINCT brand FROM fragrances WHERE brand <> '' ORDER BY brand")
	if err != nil {
		return nil, fmt.Errorf("postgres: list brands: %w", err)
	}
	defer rows.Close()

	brands := make([]string, 0)
	for rows.Next() {
		var brand string
		if err := rows.Scan(&brand); err != nil {
			return nil, fmt.Errorf("postgres: scan brand: %w", err)
		}
		brands = append(brands, brand)
	}
	return brands, rows.Err()
}
