#!/usr/bin/env bash
set -uo pipefail

A="${A:-http://localhost:3000}"
B="${B:-http://localhost:8080}"

PASS=0
FAIL=0

ok() { echo "  PASS  $*"; PASS=$((PASS+1)); }
nok() { echo "  FAIL  $*"; FAIL=$((FAIL+1)); }
section() { echo; echo "=== $* ==="; }

require_status() {
  local expected="$1" actual="$2" label="$3"
  if [ "$actual" = "$expected" ]; then
    ok "$label -> $actual"
  else
    nok "$label expected $expected, got $actual"
  fi
}

section "Liveness"
A_HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "$A/health" || true)
require_status 200 "$A_HEALTH" "GET /health (A)"
B_HEALTH=$(curl -s -o /dev/null -w '%{http_code}' "$B/healthz" || true)
require_status 200 "$B_HEALTH" "GET /healthz (B)"

section "Auth"
LOGIN_BODY=$(curl -s -X POST "$A/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"P@ssw0rd!"}' || true)
TOKEN=$(echo "$LOGIN_BODY" | jq -r .accessToken 2>/dev/null)
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  nok "login did not return a token; body=$LOGIN_BODY"
  TOKEN=""
else
  ok "login alice -> token len=${#TOKEN}"
fi

section "Book CRUD"
ISBN="S-$(date +%s)-$RANDOM"
BOOK_BODY=$(curl -s -X POST "$A/books" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"isbn\":\"$ISBN\",\"title\":\"Smoke Test Book\",\"author\":\"Smoke\",\"totalStock\":2}" || true)
BOOK_ID=$(echo "$BOOK_BODY" | jq -r .id 2>/dev/null)
if [ -z "$BOOK_ID" ] || [ "$BOOK_ID" = "null" ]; then
  nok "create book failed: $BOOK_BODY"
  BOOK_ID=""
else
  ok "created book $BOOK_ID"
fi

section "Loan saga"
if [ -n "$BOOK_ID" ]; then
  LOAN_BODY=$(curl -s -X POST "$A/loans" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"bookId\":\"$BOOK_ID\"}" || true)
  LOAN_ID=$(echo "$LOAN_BODY" | jq -r .id 2>/dev/null)
  REMOTE_ID=$(echo "$LOAN_BODY" | jq -r .remoteLoanId 2>/dev/null)
  if [ -n "$LOAN_ID" ] && [ "$LOAN_ID" != "null" ]; then
    ok "created loan $LOAN_ID, remote=$REMOTE_ID"
  else
    nok "create loan failed: $LOAN_BODY"
  fi

  LIST_BODY=$(curl -s -H "Authorization: Bearer $TOKEN" "$A/loans" || true)
  TOTAL=$(echo "$LIST_BODY" | jq -r .total 2>/dev/null)
  if [ -n "$TOTAL" ] && [ "$TOTAL" != "null" ]; then
    ok "list loans total=$TOTAL"
  else
    nok "list loans failed: $LIST_BODY"
  fi

  if [ -n "$REMOTE_ID" ] && [ "$REMOTE_ID" != "null" ]; then
    RETURN_BODY=$(curl -s -X POST "$B/loans/$REMOTE_ID/return" || true)
    RSTATUS=$(echo "$RETURN_BODY" | jq -r .status 2>/dev/null)
    if [ "$RSTATUS" = "returned" ]; then
      ok "return loan -> returned"
    else
      nok "return loan failed: $RETURN_BODY"
    fi
  fi
fi

section "Auth boundaries"
NO_TOKEN_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$A/books" || true)
require_status 401 "$NO_TOKEN_STATUS" "GET /books without token -> 401"

echo
echo "=== Summary ==="
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
