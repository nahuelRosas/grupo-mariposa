#!/usr/bin/env bash
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cp "$REPO_ROOT/scripts/postgres-entrypoint.sh" "$TMP/wrapper.sh"
cp "$REPO_ROOT/init.sql.template" "$TMP/init.sql.template"
chmod +x "$TMP/wrapper.sh"

assert_no_placeholders() {
  local f="$1"
  if grep -qE '@POSTGRES_(USER|PASSWORD)@' "$f"; then
    echo "FAIL: $f still has unexpanded placeholders:"
    grep -E '@POSTGRES_(USER|PASSWORD)@' "$f" || true
    exit 1
  fi
}

POSTGRES_USER=alice POSTGRES_PASSWORD=s3cretpw \
  INIT_STANDALONE=1 \
  INIT_SQL_SRC="$TMP/init.sql.template" \
  INIT_SQL_DST="$TMP/out.sql" \
  bash "$TMP/wrapper.sh" > "$TMP/log1.txt" 2>&1

[ -f "$TMP/out.sql" ] || { echo "FAIL: out.sql not produced"; cat "$TMP/log1.txt"; exit 1; }
assert_no_placeholders "$TMP/out.sql"
grep -q "CREATE ROLE \"alice\" WITH LOGIN PASSWORD 's3cretpw'" "$TMP/out.sql" \
  || { echo "FAIL: CREATE ROLE line missing or wrong"; cat "$TMP/out.sql"; exit 1; }
grep -q "ALTER ROLE \"alice\" WITH PASSWORD 's3cretpw'" "$TMP/out.sql" \
  || { echo "FAIL: ALTER ROLE line missing or wrong"; cat "$TMP/out.sql"; exit 1; }
grep -q "OWNER = \"alice\"" "$TMP/out.sql" \
  || { echo "FAIL: CREATE DATABASE owner missing"; exit 1; }

if POSTGRES_USER=alice INIT_STANDALONE=1 \
     INIT_SQL_SRC="$TMP/init.sql.template" \
     INIT_SQL_DST="$TMP/out2.sql" \
     bash "$TMP/wrapper.sh" > /dev/null 2>&1; then
  echo "FAIL: wrapper should have refused empty POSTGRES_PASSWORD"
  exit 1
fi

POSTGRES_PASSWORD=pw INIT_STANDALONE=1 \
  INIT_SQL_SRC="$TMP/init.sql.template" \
  INIT_SQL_DST="$TMP/out3.sql" \
  bash "$TMP/wrapper.sh" > /dev/null 2>&1
assert_no_placeholders "$TMP/out3.sql"
grep -q "CREATE ROLE \"library\"" "$TMP/out3.sql" \
  || { echo "FAIL: default user should be library"; exit 1; }

if POSTGRES_USER=alice POSTGRES_PASSWORD=pw INIT_STANDALONE=1 \
     INIT_SQL_SRC="$TMP/does-not-exist.sql" \
     INIT_SQL_DST="$TMP/out4.sql" \
     bash "$TMP/wrapper.sh" > /dev/null 2>&1; then
  echo "FAIL: wrapper should have refused missing template"
  exit 1
fi

rm -f "$TMP/out5.sql"
POSTGRES_USER=alice POSTGRES_PASSWORD=once \
  INIT_STANDALONE=1 \
  INIT_SQL_SRC="$TMP/init.sql.template" \
  INIT_SQL_DST="$TMP/out5.sql" \
  bash "$TMP/wrapper.sh" > /dev/null 2>&1
sha1="$(sha256sum "$TMP/out5.sql" | cut -d' ' -f1)"
POSTGRES_USER=alice POSTGRES_PASSWORD=once \
  INIT_STANDALONE=1 \
  INIT_SQL_SRC="$TMP/init.sql.template" \
  INIT_SQL_DST="$TMP/out5.sql" \
  bash "$TMP/wrapper.sh" > /dev/null 2>&1
sha2="$(sha256sum "$TMP/out5.sql" | cut -d' ' -f1)"
[ "$sha1" = "$sha2" ] || { echo "FAIL: idempotency broken"; exit 1; }

echo "OK: postgres-entrypoint tests passed"
