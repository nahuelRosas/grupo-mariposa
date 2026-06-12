#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

random_hex() {
  local n="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$n"
  elif [ -r /dev/urandom ]; then
    head -c "$((n*2))" /dev/urandom | od -An -tx1 | tr -d ' \n'
  else
    s=""
    while [ "${#s}" -lt $((n * 2)) ]; do
      nanos=$(date +%s%N 2>/dev/null || echo "0")
      pid="$$"
      s="${s}$(printf '%016x' "$nanos")$(printf '%05x' "$pid")"
    done
    printf '%s' "${s:0:$((n * 2))}"
  fi
}

needs_rotation() {
  case "$1" in
    "replace-me-with-strong-password"|\
    "replace-me-with-strong-jwt-secret"|\
    "replace-me-with-32-bytes-minimum-secret"|\
    "changeme"|\
    "")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

process_file() {
  local example="$1"
  local output="$2"
  local mode="${3:-all}"
  local secret_bytes="${4:-32}"

  if [ ! -f "$example" ]; then
    echo "[gen-env] WARN: $example not found, skipping" >&2
    return 0
  fi

  if [ -f "$output" ]; then
    echo "[gen-env] $output already exists, leaving it alone"
    return 0
  fi

  echo "[gen-env] generating $output (mode=$mode)"
  : > "$output"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
      printf '%s\n' "$line" >> "$output"
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local val="${BASH_REMATCH[2]}"
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      local new_val="$val"
      if [ "$mode" != "none" ] && needs_rotation "$val"; then
        if [[ "$key" == "JWT_SECRET" ]]; then
          new_val="$(random_hex "$secret_bytes")"
        elif [[ "$key" == *SECRET* ]]; then
          new_val="$(random_hex "$secret_bytes")"
        elif [[ "$key" == *PASSWORD* ]]; then
          if [ "$mode" = "all" ]; then
            new_val="$(random_hex "$secret_bytes")"
          else
            new_val="$val"
          fi
        fi
      fi
      printf '%s=%s\n' "$key" "$new_val" >> "$output"
    else
      printf '%s\n' "$line" >> "$output"
    fi
  done < "$example"
  chmod 600 "$output"
}

process_file "$ROOT/.env.example" "$ROOT/.env" "all" 32

process_file "$ROOT/catalog-service/.env.example" "$ROOT/catalog-service/.env" "passwords" 32
process_file "$ROOT/loan-service/.env.example" "$ROOT/loan-service/.env" "passwords" 32

if [ -f "$ROOT/.env" ]; then
  pw="$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/.env" | head -1 | cut -d= -f2-)"
  if [ -n "$pw" ]; then
    for sub in catalog-service loan-service; do
      f="$ROOT/$sub/.env"
      [ -f "$f" ] || continue
      if ! grep -qE 'replace-me-with-strong-password' "$f"; then
        continue
      fi
      if [ "$sub" = "catalog-service" ]; then
        sed -i.bak -E "s|postgresql://library:replace-me-with-strong-password@|postgresql://library:${pw}@|g" "$f" && rm -f "$f.bak"
      else
        sed -i.bak -E "s|^DB_PASSWORD=replace-me-with-strong-password|DB_PASSWORD=${pw}|g" "$f" && rm -f "$f.bak"
      fi
      echo "[gen-env] synced POSTGRES_PASSWORD into $f"
    done
  fi
fi

echo "[gen-env] done"
