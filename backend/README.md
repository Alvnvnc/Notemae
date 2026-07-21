# Backend service

Go service that owns catalog access and the browser-facing `/v1` API. It queries
PostgreSQL directly (pgx) and delegates grounded recommendation explanations to
`agent`. Built as a clean-architecture app — see [ARCHITECTURE.md](ARCHITECTURE.md).

The wire contract is identical to the FastAPI service it replaced: same routes,
same JSON shapes (verified byte-for-byte against a live database), so the
frontend and the scraping/ingestion service needed no changes at cutover.

## Environment

- `DATABASE_URL`: PostgreSQL connection URL.
- `AGENT_URL`: internal agent base URL.
- `SERVICE_SHARED_SECRET`: credential required by `/internal/fragrances`.
- `FRONTEND_ORIGINS`: comma-separated browser origins allowed by CORS.
- `PORT`: listen port (default `8000`).

Run through the root `docker-compose.yml`. Build/test the module directly with:

```
cd backend
go build ./... && go vet ./... && go test ./...
```

pgx v5 needs the Go 1.25 toolchain (pinned in `go.mod`); with `GOTOOLCHAIN=auto`
any Go 1.21+ install auto-downloads it. The Docker image is a static, distroless
build (~21 MB) — see `Dockerfile`.
