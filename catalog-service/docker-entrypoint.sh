#!/bin/sh
set -eu

echo "[entrypoint] running prisma migrate deploy"
npx prisma migrate deploy

echo "[entrypoint] running seed (idempotent)"
if ! node dist/seed.js; then
  echo "[entrypoint] WARN: seed failed, continuing. See logs above."
fi

echo "[entrypoint] starting catalog-service"
exec node dist/main
