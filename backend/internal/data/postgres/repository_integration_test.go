package postgres

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Alvnvnc/Notemae/backend/internal/domain/repository"
	"github.com/google/uuid"
)

// TestRepository_Integration exercises the ported SQL against a real database.
// It is skipped unless DATABASE_URL is set, keeping `go test ./...` hermetic:
//
//	DATABASE_URL=postgresql://scent:scent@localhost:5432/scentsphere \
//	  go test ./internal/data/postgres -run Integration -v
func TestRepository_Integration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("set DATABASE_URL to run the live postgres test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := NewPool(ctx, dsn)
	if err != nil {
		t.Fatalf("NewPool: %v", err)
	}
	defer pool.Close()
	repo := New(pool)

	if err := repo.Ping(ctx); err != nil {
		t.Fatalf("Ping: %v", err)
	}

	brands, err := repo.ListBrands(ctx)
	if err != nil {
		t.Fatalf("ListBrands: %v", err)
	}
	if len(brands) == 0 {
		t.Fatal("expected at least one brand from the seed data")
	}
	t.Logf("brands: %v", brands)

	total, err := repo.CountCatalog(ctx, repository.CatalogFilter{})
	if err != nil {
		t.Fatalf("CountCatalog: %v", err)
	}
	if total == 0 {
		t.Fatal("expected a non-zero catalog count")
	}

	// The seed always contains prada-lhomme.
	frag, err := repo.GetBySlug(ctx, "prada-lhomme")
	if err != nil {
		t.Fatalf("GetBySlug: %v", err)
	}
	if frag == nil || frag.Brand != "Prada" {
		t.Fatalf("expected Prada L'Homme, got %+v", frag)
	}
	if frag.Notes == nil {
		t.Error("notes should be a non-nil slice for JSON parity")
	}
	t.Logf("prada-lhomme id=%s notes=%v", frag.ID, frag.Notes)

	// Filtered page: gender=men is present in the seed.
	men := "men"
	page, err := repo.ListCatalog(ctx, repository.CatalogQuery{
		Filter: repository.CatalogFilter{Gender: &men},
		Limit:  5,
	})
	if err != nil {
		t.Fatalf("ListCatalog(gender=men): %v", err)
	}
	if len(page) == 0 {
		t.Fatal("expected at least one men's fragrance")
	}

	// Semantic-search path: exercises formatVector + ::vector cast. Seed rows
	// have NULL embeddings, so the distance is NULL and rows fall back to
	// rating order — the point is that the vector literal is accepted.
	vec := make([]float32, 1024)
	vec[0] = 1
	if _, err := repo.ListCatalog(ctx, repository.CatalogQuery{
		QueryEmbedding: vec,
		Limit:          3,
	}); err != nil {
		t.Fatalf("ListCatalog(embedding): %v", err)
	}

	// Relationship + featured paths must at least run cleanly.
	if _, err := repo.ListFeaturedOriginals(ctx, 5); err != nil {
		t.Fatalf("ListFeaturedOriginals: %v", err)
	}
	dupes, originalOf, flankers, err := repo.ListRelationships(ctx, frag.ID)
	if err != nil {
		t.Fatalf("ListRelationships: %v", err)
	}
	t.Logf("prada-lhomme relationships: dupes=%d original_of=%d flankers=%d",
		len(dupes), len(originalOf), len(flankers))

	if _, err := repo.ListSimilar(ctx, frag.ID, map[uuid.UUID]struct{}{}, 5); err != nil {
		t.Fatalf("ListSimilar: %v", err)
	}
}
