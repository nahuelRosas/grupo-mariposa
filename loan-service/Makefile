.PHONY: proto build test run docker migrate-up migrate-down migrate-version migrate-force

PROTO_ROOT := ../proto
PROTO_OUT  := proto/gen

proto:
	@mkdir -p $(PROTO_OUT)
	protoc \
	  --go_out=$(PROTO_OUT) --go_opt=paths=source_relative \
	  --go-grpc_out=$(PROTO_OUT) --go-grpc_opt=paths=source_relative \
	  -I $(PROTO_ROOT) $(PROTO_ROOT)/library.proto

build: build-server build-healthcheck build-migrate

build-server:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/loan-service ./cmd/server

build-healthcheck:
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/healthcheck ./cmd/healthcheck

build-migrate:
	CGO_ENABLED=0 go build -tags 'postgres' -trimpath -ldflags="-s -w" -o bin/migrate ./cmd/migrate

test:
	go test ./... -race -count=1

run:
	go run ./cmd/server

docker:
	docker build -t loan-service:latest .

# ---- migrations ----
# These targets shell out to the local `migrate` binary built by
# `make build-migrate`. Override DB_* and MIGRATIONS_PATH as needed.
MIGRATIONS_PATH ?= file://./migrations

migrate-up: build-migrate
	DB_HOST=$${DB_HOST:-localhost} DB_PORT=$${DB_PORT:-5432} \
	DB_USER=$${DB_USER:-library} DB_PASSWORD=$${DB_PASSWORD:-library_dev_pw} \
	DB_NAME=$${DB_NAME:-db_loans} DB_SSLMODE=$${DB_SSLMODE:-disable} \
	MIGRATIONS_PATH=$(MIGRATIONS_PATH) \
	./bin/migrate up

migrate-down: build-migrate
	DB_HOST=$${DB_HOST:-localhost} DB_PORT=$${DB_PORT:-5432} \
	DB_USER=$${DB_USER:-library} DB_PASSWORD=$${DB_PASSWORD:-library_dev_pw} \
	DB_NAME=$${DB_NAME:-db_loans} DB_SSLMODE=$${DB_SSLMODE:-disable} \
	MIGRATIONS_PATH=$(MIGRATIONS_PATH) \
	./bin/migrate down

migrate-version: build-migrate
	./bin/migrate version

migrate-force: build-migrate
	@test -n "$(V)" || (echo "usage: make migrate-force V=1" && exit 2)
	DB_HOST=$${DB_HOST:-localhost} DB_PORT=$${DB_PORT:-5432} \
	DB_USER=$${DB_USER:-library} DB_PASSWORD=$${DB_PASSWORD:-library_dev_pw} \
	DB_NAME=$${DB_NAME:-db_loans} DB_SSLMODE=$${DB_SSLMODE:-disable} \
	MIGRATIONS_PATH=$(MIGRATIONS_PATH) \
	./bin/migrate force $(V)
