package usecase

import (
	"context"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/entity"
	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
)

// CatalogService covers the plain read paths over the catalog: search, brands,
// and single-fragrance lookup.
type CatalogService struct {
	repo repository.FragranceRepository
}

func NewCatalogService(repo repository.FragranceRepository) *CatalogService {
	return &CatalogService{repo: repo}
}

// Health verifies downstream dependencies are reachable.
func (s *CatalogService) Health(ctx context.Context) error {
	return s.repo.Ping(ctx)
}

// Search returns a paginated window plus the total under the same filter, so
// the pager total always matches what the window is drawn from.
func (s *CatalogService) Search(ctx context.Context, filter repository.CatalogFilter, limit, offset int) (entity.FragranceList, error) {
	total, err := s.repo.CountCatalog(ctx, filter)
	if err != nil {
		return entity.FragranceList{}, err
	}
	items, err := s.repo.ListCatalog(ctx, repository.CatalogQuery{
		Filter: filter,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		return entity.FragranceList{}, err
	}
	return entity.FragranceList{Total: total, Items: items}, nil
}

// ListBrands returns the distinct brands powering the brand filter.
func (s *CatalogService) ListBrands(ctx context.Context) (entity.BrandList, error) {
	items, err := s.repo.ListBrands(ctx)
	if err != nil {
		return entity.BrandList{}, err
	}
	return entity.BrandList{Items: items}, nil
}

// GetBySlug returns one fragrance or entity.ErrNotFound.
func (s *CatalogService) GetBySlug(ctx context.Context, slug string) (*entity.Fragrance, error) {
	fragrance, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if fragrance == nil {
		return nil, entity.ErrNotFound
	}
	return fragrance, nil
}
