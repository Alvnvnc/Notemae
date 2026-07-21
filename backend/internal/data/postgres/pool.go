// Package postgres is the data-layer adapter that implements
// repository.FragranceRepository against PostgreSQL (with pgvector) using
// pgxpool. It ports the SQL from the former Python backend verbatim, including
// the vectors-as-text approach (`[v1,v2,...]::vector`) so no extra pgvector
// dependency is needed.
package postgres

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool opens a connection pool sized like the Python psycopg pool
// (min 1, max 10). The caller owns the pool and must Close it on shutdown.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: parse config: %w", err)
	}
	cfg.MinConns = 1
	cfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("postgres: connect: %w", err)
	}
	return pool, nil
}
