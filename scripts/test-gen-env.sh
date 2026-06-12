#!/usr/bin/env bash
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$TMP/catalog-service" "$TMP/loan-service" "$TMP/scripts"
cp "$REPO_ROOT/.env.example" "$TMP/.env.example"
cp "$REPO_ROOT/catalog-service/.env.example" "$TMP/catalog-service/.env.example"
cp "$REPO_ROOT/loan-service/.env.example" "$TMP/loan-service/.env.example"
cp "$REPO_ROOT/scripts/gen-env.sh" "$TMP/scripts/gen-env.sh"
chmod +x "$TMP/scripts/gen-env.sh"

bash "$TMP/scripts/gen-env.sh" > "$TMP/run1.log" 2>&1

assert_file() {
  local f="$1"
  if [ ! -f "$f" ]; then
    echo "FAIL: expected $f to exist"
    cat "$TMP/run1.log"
    exit 1
  fi
  if [ ! -s "$f" ]; then
    echo "FAIL: $f is empty"
    exit 1
  fi
  local mode
  mode="$(stat -c %a "$f")"
  if [ "$mode" != "600" ]; then
    echo "FAIL: $f mode is $mode, expected 600"
    exit 1
  fi
}

assert_file "$TMP/.env"
assert_file "$TMP/catalog-service/.env"
assert_file "$TMP/loan-service/.env"

if grep -q "replace-me-with-" "$TMP/.env"; then
  echo "FAIL: root .env still has placeholders"
  grep "replace-me-" "$TMP/.env"
  exit 1
fi
if grep -q "replace-me-with-" "$TMP/catalog-service/.env"; then
  echo "FAIL: catalog .env still has placeholders"
  grep "replace-me-" "$TMP/catalog-service/.env"
  exit 1
fi
if grep -q "replace-me-with-" "$TMP/loan-service/.env"; then
  echo "FAIL: loan .env still has placeholders"
  grep "replace-me-" "$TMP/loan-service/.env"
  exit 1
fi

root_pw="$(grep -E '^POSTGRES_PASSWORD=' "$TMP/.env" | head -1 | cut -d= -f2-)"
catalog_pw="$(grep -oE 'postgresql://library:[^@]+@' "$TMP/catalog-service/.env" | head -1 | sed 's|postgresql://library:||;s|@||')"
loan_pw="$(grep -E '^DB_PASSWORD=' "$TMP/loan-service/.env" | head -1 | cut -d= -f2-)"
if [ "$root_pw" != "$catalog_pw" ] || [ "$root_pw" != "$loan_pw" ]; then
  echo "FAIL: passwords differ:"
  echo "  root=$root_pw"
  echo "  catalog=$catalog_pw"
  echo "  loan=$loan_pw"
  exit 1
fi

before="$(sha256sum "$TMP/.env" | cut -d' ' -f1)"
bash "$TMP/scripts/gen-env.sh" > "$TMP/run2.log" 2>&1
after="$(sha256sum "$TMP/.env" | cut -d' ' -f1)"
if [ "$before" != "$after" ]; then
  echo "FAIL: re-run mutated .env"
  exit 1
fi

rm "$TMP/.env"
bash "$TMP/scripts/gen-env.sh" > "$TMP/run3.log" 2>&1
new_pw="$(grep -E '^POSTGRES_PASSWORD=' "$TMP/.env" | head -1 | cut -d= -f2-)"
if [ "$new_pw" = "$root_pw" ]; then
  echo "FAIL: rotation did not produce a new password"
  exit 1
fi

echo "OK: gen-env tests passed"
