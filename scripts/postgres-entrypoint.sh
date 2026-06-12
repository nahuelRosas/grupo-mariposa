#!/bin/bash
set -euo pipefail

DOCKER_ENTRYPOINT="/usr/local/bin/docker-entrypoint.sh"
if [ ! -x "$DOCKER_ENTRYPOINT" ] || [ "${INIT_STANDALONE:-0}" = "1" ]; then
  MODE="standalone"
else
  MODE="docker"
fi

case "$MODE" in
  docker)
    : "${INIT_SQL_SRC:=/tmp/init.sql.template}"
    : "${INIT_SQL_DST:=/docker-entrypoint-initdb.d/01-init.sql}"
    if [ -s /var/lib/postgresql/data/PG_VERSION ]; then
      echo "[init-wrapper] data volume already initialised, skipping templating"
      exec "$DOCKER_ENTRYPOINT" "$@"
    fi
    ;;
  standalone)
    : "${INIT_SQL_SRC:=./init.sql.template}"
    : "${INIT_SQL_DST:=./init.sql}"
    ;;
esac

if [ -z "${POSTGRES_USER:-}" ]; then
  POSTGRES_USER="library"
fi

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "[init-wrapper] FATAL: POSTGRES_PASSWORD must be set" >&2
  exit 1
fi

if [ ! -f "$INIT_SQL_SRC" ]; then
  echo "[init-wrapper] FATAL: template not found at $INIT_SQL_SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$INIT_SQL_DST")"

sed -e "s|@POSTGRES_USER@|${POSTGRES_USER}|g" \
    -e "s|@POSTGRES_PASSWORD@|${POSTGRES_PASSWORD}|g" \
    "$INIT_SQL_SRC" > "$INIT_SQL_DST"

echo "[init-wrapper] templated $INIT_SQL_SRC -> $INIT_SQL_DST (user=$POSTGRES_USER)"

if [ "$MODE" = "docker" ]; then
  exec "$DOCKER_ENTRYPOINT" "$@"
fi
