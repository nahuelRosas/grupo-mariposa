#!/bin/bash

set -euo pipefail

: "${MIGRATIONS_PATH:=file:///app/migrations}"

echo "[entrypoint] running migrations from ${MIGRATIONS_PATH}"
/app/migrate up

echo "[entrypoint] starting loan-service"
exec /app/loan-service
