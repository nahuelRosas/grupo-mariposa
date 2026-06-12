# syntax=docker/dockerfile:1.7
#
# Build context: the repo root (see docker-compose.yml). The Go module
# lives at loan-service/, the proto contract at proto/, and the migration
# SQL at loan-service/migrations/.

# ---- Stage 1: build ----
FROM golang:1.24-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates protobuf
COPY loan-service/go.mod loan-service/go.sum ./loan-service/
WORKDIR /src/loan-service
RUN go mod download
# Bring in the rest of the loan-service sources.
COPY loan-service/ ./
# Bring in the proto contract from the repo root.
COPY proto /src/proto
# Generate proto stubs (assumes protoc and go plugins are present in the image).
RUN mkdir -p proto/gen && \
    go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.34.2 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.4.0 && \
    protoc \
      --go_out=proto/gen --go_opt=paths=source_relative \
      --go-grpc_out=proto/gen --go-grpc_opt=paths=source_relative \
      -I /src/proto /src/proto/library.proto
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/loan-service ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/healthcheck ./cmd/healthcheck && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -tags 'postgres' -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# ---- Stage 2: runtime ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates bash && \
    addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /out/loan-service /app/loan-service
COPY --from=builder /out/healthcheck /app/healthcheck
COPY --from=builder /out/migrate /app/migrate
# Migrations are read at runtime; bake them into the image so the
# entrypoint can find them with a fixed MIGRATIONS_PATH.
COPY --from=builder /src/loan-service/migrations /app/migrations
COPY --from=builder /src/loan-service/scripts/entrypoint-server.sh /app/entrypoint-server.sh
RUN chmod +x /app/entrypoint-server.sh
USER app
EXPOSE 8080 50051
# entrypoint runs migrations then execs the server. The server process
# inherits PID 1 so it still receives SIGTERM directly.
ENTRYPOINT ["/app/entrypoint-server.sh"]
CMD []
