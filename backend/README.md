# Backend service

FastAPI service that owns catalog access and the browser-facing `/v1` API. It queries PostgreSQL directly and delegates grounded recommendation explanations to `agent`.

## Environment

- `DATABASE_URL`: PostgreSQL connection URL.
- `AGENT_URL`: internal agent base URL.
- `SERVICE_SHARED_SECRET`: credential required by `/internal/fragrances`.
- `FRONTEND_ORIGINS`: comma-separated browser origins allowed by CORS.

Run through the root `docker-compose.yml`. Interactive API documentation is served at `/docs`.
