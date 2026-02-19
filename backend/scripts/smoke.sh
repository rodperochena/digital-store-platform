#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:5051/api}"
ADMIN_KEY="${ADMIN_KEY:-}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing dependency: $1"; exit 1; }; }
need curl
need jq

if [[ -z "${ADMIN_KEY}" ]]; then
  echo "❌ Missing ADMIN_KEY env var."
  echo "Run: export ADMIN_KEY='supersecret123'"
  exit 1
fi

echo
echo "=== ENV ==="
echo "BASE=$BASE"
echo "ADMIN_KEY=***"
node -v 2>/dev/null || true
echo

echo "=== HEALTH ==="
curl -sS "$BASE/health" | jq
echo

echo "=== TENANCY / HOST ROUTING (should FAIL when no tenant) ==="
# Expect 400 when calling storefront/meta without a tenant subdomain
code="$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/storefront/meta" || true)"
echo "HTTP $code (expected 400)"
echo

echo "=== CREATE FAKE STORE (ADMIN) ==="
ts="$(date +%s)"
payload="$(jq -nc \
  --arg slug "smoke-$ts" \
  --arg name "Smoke Store $ts" \
  '{slug:$slug,name:$name,currency:"usd"}')"

create_res="$(curl -sS -X POST "$BASE/stores" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d "$payload")"

echo "$create_res" | jq

STORE_ID="$(echo "$create_res" | jq -r '.store.id // empty')"
SLUG="$(echo "$create_res" | jq -r '.store.slug // empty')"

if [[ -z "$STORE_ID" || -z "$SLUG" ]]; then
  echo "❌ Could not parse STORE_ID/SLUG from create response."
  exit 1
fi

echo "STORE_ID=$STORE_ID"
echo "SLUG=$SLUG"
echo

echo "=== PATCH STORE SETTINGS (ADMIN) currency=pen + enable ==="
patch_payload="$(jq -nc --arg currency "pen" '{currency:$currency,is_enabled:true}')"

patch_res="$(curl -sS -X PATCH "$BASE/stores/$STORE_ID/settings" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $ADMIN_KEY" \
  -d "$patch_payload")"

echo "$patch_res" | jq
echo

echo "=== PUBLIC: STOREFRONT META via param route (/store/:slug/meta) ==="
curl -sS "$BASE/store/$SLUG/meta" | jq
echo

echo "=== PUBLIC: STOREFRONT META via Host routing (slug.localhost) ==="
curl -sS -H "Host: $SLUG.localhost" "$BASE/storefront/meta" | jq
echo

echo "=== LOAD TEST: /health (autocannon optional) ==="
if command -v npx >/dev/null 2>&1; then
  set +e
  npx -y autocannon -c 25 -d 8 "$BASE/health"
  set -e
else
  echo "Skipping autocannon (npx not found)."
fi
echo

echo "DONE ✅"
