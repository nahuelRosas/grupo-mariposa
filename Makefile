# Library Management System — top-level Makefile
#
# All common workflows in one place. The heavy lifting is delegated
# to docker compose and the per-service scripts; this file is a thin
# facade so you don't have to remember the incantations.

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# Pick the right compose binary: prefer v2 (`docker compose`), fall
# back to v1 (`docker-compose`). The user can override with
# `make COMPOSE=...`.
COMPOSE := $(shell \
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
    echo "docker compose"; \
  elif command -v docker-compose >/dev/null 2>&1; then \
    echo "docker-compose"; \
  else \
    echo "docker compose"; \
  fi)

.PHONY: help env up up-dev down stop ps logs build rebuild validate test test-go \
        test-node test-e2e smoke seed migrate-reset sh-catalog sh-loans sh-db clean \
        test-scripts format format-check install-tools install

help:  ## Show this help.
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[1m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

env:  ## Generate .env from .env.example if missing (idempotent).
	@bash scripts/gen-env.sh

validate: env  ## Validate docker-compose.yml + override (catches schema errors).
	@$(COMPOSE) -f docker-compose.yml config > /dev/null
	@$(COMPOSE) -f docker-compose.yml -f docker-compose.override.yml config > /dev/null
	@echo "[validate] compose config OK"

up: env validate  ## Bring the whole stack up (builds images on first run).
	$(COMPOSE) up --build -d

up-dev: env validate  ## Bring the stack up with the dev override (bind mounts, hot reload).
	$(COMPOSE) -f docker-compose.yml -f docker-compose.override.yml up --build

down:  ## Stop and remove containers (keeps the named volume).
	$(COMPOSE) down

stop:  ## Stop containers but keep the volume + images.
	$(COMPOSE) stop

ps:  ## List running containers.
	$(COMPOSE) ps

logs:  ## Tail logs from all services.
	$(COMPOSE) logs -f --tail=200

build: env  ## Build all images without starting them.
	$(COMPOSE) build

rebuild: env  ## Build with --no-cache and bring the stack up.
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

migrate-reset:  ## Drop the postgres volume and re-create everything.
	$(COMPOSE) down -v
	$(MAKE) up

test: format-check test-scripts test-go test-node  ## Run all tests (format check + shell + Go + Nest unit).

test-scripts:  ## Run the bash script tests (gen-env, init wrapper).
	@bash scripts/test-gen-env.sh
	@bash scripts/test-postgres-entrypoint.sh

test-go:  ## Run Go tests in loan-service (with -race).
	cd loan-service && go test ./... -race -count=1

test-node:  ## Run Nest unit tests in catalog-service.
	cd catalog-service && npm test -- --runInBand

test-e2e:  ## Run the catalog e2e suite (requires up + healthy DB).
	cd catalog-service && npm run test:e2e

smoke:  ## Run a full HTTP smoke test against the running stack.
	@bash scripts/smoke.sh

seed:  ## Re-run the idempotent seed against the running DB.
	@docker exec catalog-service node dist/seed.js || true

sh-catalog:  ## Open a shell in the catalog container.
	$(COMPOSE) exec catalog sh

sh-loans:  ## Open a shell in the loans container.
	$(COMPOSE) exec loans sh

sh-db:  ## Open psql against the running postgres.
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-library} -d $${POSTGRES_DB:-postgres}

clean:  ## Remove generated env files, build artefacts, and volumes.
	rm -f .env catalog-service/.env loan-service/.env
	rm -rf catalog-service/dist catalog-service/.seed-build catalog-service/node_modules
	rm -rf loan-service/bin loan-service/proto/gen
	$(COMPOSE) down -v

GOFUMPT ?= $(shell command -v gofumpt 2>/dev/null || echo "$$HOME/go/bin/gofumpt")

format: install-tools  ## Auto-format catalog (prettier) and loan-service (gofmt + gofumpt).
	cd catalog-service && npm run format
	cd loan-service && gofmt -w -s .
	@if [ -x "$(GOFUMPT)" ]; then \
		$(GOFUMPT) -w -extra .; \
	else \
		echo "[format] gofumpt not installed (run 'make install-tools'); skipping gofumpt pass"; \
	fi

format-check: install-tools  ## Verify formatting (fails if any file is not formatted).
	cd catalog-service && npm run format:check
	@cd loan-service && gofmt -l . > /tmp/gofmt-out.txt
	@if [ -s /tmp/gofmt-out.txt ]; then \
		echo "[format-check] gofmt issues:"; cat /tmp/gofmt-out.txt; exit 1; \
	fi
	@if [ -x "$(GOFUMPT)" ]; then \
		cd loan-service && $(GOFUMPT) -l -extra . > /tmp/gofumpt-out.txt; \
		if [ -s /tmp/gofumpt-out.txt ]; then \
			echo "[format-check] gofumpt issues:"; cat /tmp/gofumpt-out.txt; exit 1; \
		fi; \
	else \
		echo "[format-check] gofumpt not installed (run 'make install-tools'); skipping gofumpt pass"; \
	fi
	@echo "[format-check] OK"

install-tools:  ## Install optional dev tools (gofumpt). Go toolchain ships gofmt.
	@if ! command -v gofumpt >/dev/null 2>&1 && [ ! -x "$$HOME/go/bin/gofumpt" ]; then \
		echo "[install-tools] installing gofumpt..."; \
		go install mvdan.cc/gofumpt@latest; \
		echo "[install-tools] gofumpt installed at $$HOME/go/bin/gofumpt"; \
	else \
		echo "[install-tools] gofumpt already available"; \
	fi

install: install-tools  ## Install TS and Go dependencies.
	cd catalog-service && npm install
	cd loan-service && go mod download
