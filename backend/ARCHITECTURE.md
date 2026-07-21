# Backend (Go) — Clean Architecture

Refactor of the FastAPI backend to Go using a 3-layer clean architecture. The
rewrite reached wire parity with the FastAPI service and the Python `app/` was
removed at cutover; Go is now the only backend the running server uses.

## Dependency rule

```
presentation ──▶ domain ◀── data
                   ▲
             (imports nothing outward)
```

`internal/domain` must never import `net/http`, `gin`, `pgx`, or any driver. The
data and presentation layers depend on the **interfaces** declared in
`internal/domain/repository`; concrete implementations are wired in `cmd/api`.

## Layout

| Layer | Package | Contents |
|---|---|---|
| Domain | `internal/domain/entity` | Pure models + domain errors |
| Domain | `internal/domain/repository` | Ports: `FragranceRepository`, `AgentPort`, filter/query value objects |
| Domain | `internal/domain/usecase` | `CatalogService`, `DupeService`, `RecommendationService` + pure logic (Rocchio, fallback, embedding document) |
| Data | `internal/data/postgres` | pgxpool impl of `FragranceRepository` |
| Data | `internal/data/agentclient` | HTTP impl of `AgentPort`, incl. SSE reader |
| Presentation | `internal/presentation/http` | net/http router, handlers, DTOs, auth + CORS middleware, SSE writer |
| — | `internal/config` | Env loader (replaces pydantic-settings) |
| — | `cmd/api` | Composition root |

The presentation layer uses the **standard library** `net/http` ServeMux (Go
1.22+ method + wildcard patterns), not Gin — it keeps the dependency surface to
pgx + uuid and matches the rest of the codebase's stdlib-first style.

## Task status

- [x] **Task 0** — module, config, composition-root skeleton
- [x] **Task 1** — Domain layer: entities, ports, use cases, pure-logic unit tests
- [x] **Task 2** — Data layer (both adapters verified live):
  - [x] `agentclient` — HTTP + streaming impl of `AgentPort`
  - [x] `postgres` — pgxpool impl of `FragranceRepository` (vectors as text + `::vector` cast, no pgvector dep)
- [x] **Task 3** — Presentation: net/http handlers for all 13 endpoints (2 SSE), auth, CORS + `InternalService` usecase for `/internal/embeddings/rebuild`
- [x] **Task 4** — Wiring, live parity test vs the FastAPI service (all read endpoints byte-identical), Go Dockerfile + compose swap, removed `app/`

### Cutover parity notes

- Verified byte-for-byte against a live database: `/health`, `/v1/fragrances`
  (+filters/tiers/price), `/v1/brands`, `/v1/fragrances/{slug}`, `.../dupes`,
  `/v1/featured`, 404s, and the deterministic first pass of the recommendation
  stream (identical slugs + scores).
- `entity.Score` reproduces the Python float rendering: NUMERIC(2,1) rating/
  scores print `4.0` (not Go's `4`) and REAL confidence prints `0.9` (not the
  float32→float64 widened `0.8999999761581421`). `semantic_similarity` is a
  float8 computed in-database and already renders identically, so it stays a
  plain float64.
- **Deliberate, safe difference**: the un-modeled Python `/internal/fragrances`
  list emitted scores as JSON strings (`"3.8"`, a Decimal-via-jsonable_encoder
  quirk). Go emits numbers (`3.8`). The only consumer — the scraping enrichment
  worker — passes the value straight back into an upsert, which Go accepts as a
  number, so the Go-only pipeline is self-consistent.

## Build / test

pgx v5 requires the Go 1.25 toolchain (`go.mod` pins `go 1.25.0`); with the
default `GOTOOLCHAIN=auto`, any Go 1.21+ install auto-downloads it. Then:

```
cd backend
go mod tidy && go build ./... && go vet ./... && go test ./...

# live adapter checks (services must be running):
AGENT_URL=http://localhost:8001 \
  go test ./internal/data/agentclient -run Integration -v
DATABASE_URL=postgresql://scent:scent@localhost:5432/scentsphere \
  go test ./internal/data/postgres -run Integration -v
```

## Parity notes for later layers

- **Nil slices**: a nil Go slice marshals to `null`, but the Python API returned
  `[]`. The postgres repo must materialize empty slices, never leave them nil.
- **Auth**: compare `x-service-key` with `hmac.Equal` (constant-time), matching
  Python's `secrets.compare_digest`.
- **SSE**: set `Cache-Control: no-store`, `X-Accel-Buffering: no`, and call
  `http.Flusher.Flush()` after every event. The fallback sentinel hold-back is
  already handled in the domain (`streamExplanation`).
- **Vectors**: pgvector columns are `float32`; the domain math is `float32` end
  to end. Format as `[v1,v2,...]` when binding, as the Python `%.8g` join did.
