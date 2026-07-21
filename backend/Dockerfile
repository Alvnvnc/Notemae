# syntax=docker/dockerfile:1

# --- build stage -----------------------------------------------------------
# pgx v5 wants the Go 1.25 toolchain (pinned in go.mod). A static, CGO-free
# binary lets the runtime image be distroless/static.
FROM golang:1.25 AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# --- runtime stage ---------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/api /api
EXPOSE 8000
USER nonroot:nonroot
ENTRYPOINT ["/api"]
