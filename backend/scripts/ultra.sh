#!/usr/bin/env bash
# Ultra tests for multi-tenant digital store backend (Bash).
# - English-only logs
# - Continues through failures and prints a final summary (even on Ctrl+C)
# - Safe logging: backend/docs/ultra_test_N.txt + ultra_latest.txt
# - Fixes curl arg-splitting by using ARRAYS (works with IFS=$'\n\t')
# - jq used to generate JSON when available; graceful fallback if not
# - Optional cleanup (best-effort): ULTRA_CLEANUP=1

set -o pipefail
IFS=$'\n\t'

############################################
# Config (override via env)
############################################
BASE="${BASE:-http://127.0.0.1:5051/api}"
ADMIN_KEY="${ADMIN_KEY:-}"

# Optional:
#   ULTRA_SKIP_LOAD=1
#   ULTRA_TIMEOUT=15
#   ULTRA_CONNECT=3
#   ULTRA_RETRY=1
#   ULTRA_RETRY_DELAY=0
#   ULTRA_CLEANUP=1               # best-effort cleanup at the end
#   ULTRA_CLEANUP_DRYRUN=1        # print cleanup actions, do not execute
ULTRA_TIMEOUT="${ULTRA_TIMEOUT:-15}"
ULTRA_CONNECT="${ULTRA_CONNECT:-3}"
ULTRA_RETRY="${ULTRA_RETRY:-1}"
ULTRA_RETRY_DELAY="${ULTRA_RETRY_DELAY:-0}"
ULTRA_CLEANUP="${ULTRA_CLEANUP:-0}"
ULTRA_CLEANUP_DRYRUN="${ULTRA_CLEANUP_DRYRUN:-0}"

############################################
# Path + log file setup (backend/docs)
############################################
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DOCS_DIR="${BACKEND_DIR}/docs"
mkdir -p "${DOCS_DIR}" 2>/dev/null || true

pick_log_file() {
  local i=1
  while [ "${i}" -le 9999 ]; do
    local f="${DOCS_DIR}/ultra_test_${i}.txt"
    if [ ! -e "${f}" ]; then
      echo "${f}"
      return 0
    fi
    i=$((i+1))
  done
  echo "${DOCS_DIR}/ultra_test_$(date +%s).txt"
}

LOG_FILE="$(pick_log_file)"
: > "${LOG_FILE}" 2>/dev/null || true

exec > >(tee -a "${LOG_FILE}") 2>&1

LATEST="${DOCS_DIR}/ultra_latest.txt"
START_TS="$(date +%s)"
MARKER="__ULTRA_HTTP_CODE_${RANDOM}_${START_TS}__"

############################################
# Counters + finalize (trap)
############################################
passes=0
failures=0

# Cleanup counters (do NOT affect test result)
cleanup_ok=0
cleanup_err=0

# Track created resources (for debug + cleanup)
A_ID=""; A_SLUG=""
B_ID=""; B_SLUG=""
C_ID=""; C_SLUG=""
PROD_A_ID=""; PROD_B_ID=""; PROD_C_ID=""
ORDER_A1_ID=""; ORDER_A2_ID=""; ORDER_B1_ID=""
PI=""

############################################
# Helpers
############################################
mask_key() { if [ -z "$1" ]; then echo "(missing)"; else echo "***"; fi; }
hr() { echo ""; }
section() { hr; echo "=== $* ==="; }

pass() { passes=$((passes+1)); echo "✅ $*"; }
fail() { failures=$((failures+1)); echo "❌ $*"; }
info() { echo "ℹ️  $*"; }

cleanup_pass() { cleanup_ok=$((cleanup_ok+1)); echo "🧹✅ $*"; }
cleanup_fail() { cleanup_err=$((cleanup_err+1)); echo "🧹⚠️  $*"; }

HAVE_JQ=0
HAVE_NPX=0

need_cmd_strict() {
  local cmd="$1"
  if command -v "${cmd}" >/dev/null 2>&1; then
    pass "Dependency found: ${cmd}"
    return 0
  fi
  fail "Missing dependency: ${cmd} (install it and re-run)"
  return 1
}

############################################
# Curl args (ARRAYS) - critical fix for IFS
############################################
CURL_BASE_ARGS=(--connect-timeout "${ULTRA_CONNECT}" --max-time "${ULTRA_TIMEOUT}")
CURL_RETRY_ARGS=()
if [ "${ULTRA_RETRY}" -gt 0 ] 2>/dev/null; then
  CURL_RETRY_ARGS=(--retry "${ULTRA_RETRY}" --retry-delay "${ULTRA_RETRY_DELAY}")
  if curl --help all 2>/dev/null | grep -q -- '--retry-connrefused'; then
    CURL_RETRY_ARGS+=(--retry-connrefused)
  fi
fi

############################################
# HTTP call + assertions
############################################
CODE="0"
BODY=""
CURL_EXIT="0"
LAST_METHOD=""
LAST_URL=""

call() {
  local method="$1"; shift
  local url="$1"; shift
  LAST_METHOD="${method}"
  LAST_URL="${url}"

  local out curl_rc
  curl_rc=0

  out="$(curl -sS \
    "${CURL_BASE_ARGS[@]}" \
    "${CURL_RETRY_ARGS[@]}" \
    -X "${method}" "${url}" \
    "$@" \
    -w $'\n'"${MARKER}:%{http_code}"$'\n' \
  )" || curl_rc=$?

  CURL_EXIT="${curl_rc}"
  CODE="$(printf "%s" "${out}" | sed -n "s/^${MARKER}://p" | tail -n 1)"
  BODY="$(printf "%s" "${out}" | sed "/^${MARKER}:/d")"
  if [ -z "${CODE}" ]; then CODE="0"; fi
}

json_pretty() {
  if [ "${HAVE_JQ}" = "1" ] && echo "${BODY}" | jq . >/dev/null 2>&1; then
    echo "${BODY}" | jq .
  else
    echo "${BODY}"
  fi
}

json_get() {
  local expr="$1"
  if [ "${HAVE_JQ}" = "1" ] && echo "${BODY}" | jq -e "${expr}" >/dev/null 2>&1; then
    echo "${BODY}" | jq -r "${expr}"
  else
    echo ""
  fi
}

assert_code() {
  local expected="$1"
  local msg="$2"
  if [ "${CODE}" = "${expected}" ]; then
    pass "${msg} (HTTP ${CODE})"
    return 0
  fi

  if [ "${CURL_EXIT}" != "0" ]; then
    fail "${msg}: curl failed (exit ${CURL_EXIT}). Expected HTTP ${expected}, got HTTP ${CODE}. [${LAST_METHOD} ${LAST_URL}]"
  else
    fail "${msg}: expected HTTP ${expected}, got HTTP ${CODE}. [${LAST_METHOD} ${LAST_URL}]"
  fi

  if [ -n "${BODY}" ]; then
    echo "----- response body (first 4000 chars) -----"
    echo "${BODY:0:4000}"
    echo "-------------------------------------------"
  fi
  return 1
}

assert_code_in() {
  local expected_list="$1" # e.g. "200 204"
  local msg="$2"

  for e in ${expected_list}; do
    if [ "${CODE}" = "${e}" ]; then
      pass "${msg} (HTTP ${CODE})"
      return 0
    fi
  done

  fail "${msg}: expected one of [${expected_list}], got ${CODE}. [${LAST_METHOD} ${LAST_URL}]"
  if [ -n "${BODY}" ]; then
    echo "----- response body (first 4000 chars) -----"
    echo "${BODY:0:4000}"
    echo "-------------------------------------------"
  fi
  return 1
}

assert_not_200() {
  local msg="$1"
  if [ "${CODE}" != "200" ]; then
    pass "${msg} (got ${CODE}, not 200)"
    return 0
  fi
  fail "${msg}: expected NOT 200, got 200 [${LAST_METHOD} ${LAST_URL}]"
  return 1
}

assert_json_eq() {
  local expr="$1"
  local expected="$2"
  local msg="$3"
  local got
  got="$(json_get "${expr}")"
  if [ "${got}" = "${expected}" ]; then
    pass "${msg} (${expr} == ${expected})"
    return 0
  fi
  fail "${msg}: expected ${expr} == '${expected}', got '${got}' [${LAST_METHOD} ${LAST_URL}]"
  return 1
}

assert_body_not_contains() {
  local needle="$1"
  local msg="$2"
  if printf "%s" "${BODY}" | grep -Fq "${needle}"; then
    fail "${msg}: found '${needle}' in response [${LAST_METHOD} ${LAST_URL}]"
    echo "----- response body (first 4000 chars) -----"
    echo "${BODY:0:4000}"
    echo "-------------------------------------------"
    return 1
  fi
  pass "${msg}"
  return 0
}

assert_body_not_contains_value() {
  local value="$1"
  local msg="$2"
  if [ -z "${value}" ]; then
    pass "${msg} (value empty; skipped)"
    return 0
  fi
  if printf "%s" "${BODY}" | grep -Fq "${value}"; then
    fail "${msg}: found value '${value}' in response [${LAST_METHOD} ${LAST_URL}]"
    echo "----- response body (first 4000 chars) -----"
    echo "${BODY:0:4000}"
    echo "-------------------------------------------"
    return 1
  fi
  pass "${msg}"
  return 0
}

############################################
# JSON payload helpers (jq preferred)
############################################
mk_store_payload() {
  local slug="$1" name="$2" currency="$3"
  if [ "${HAVE_JQ}" = "1" ]; then
    jq -nc --arg slug "$slug" --arg name "$name" --arg currency "$currency" \
      '{slug:$slug,name:$name,currency:$currency}'
  else
    printf '{"slug":"%s","name":"%s","currency":"%s"}' "$slug" "$name" "$currency"
  fi
}

mk_settings_payload() {
  local currency="$1"
  if [ "${HAVE_JQ}" = "1" ]; then
    jq -nc --arg currency "$currency" '{currency:$currency}'
  else
    printf '{"currency":"%s"}' "$currency"
  fi
}

mk_disable_payload() {
  if [ "${HAVE_JQ}" = "1" ]; then
    jq -nc '{is_enabled:false}'
  else
    printf '{"is_enabled":false}'
  fi
}

mk_product_payload() {
  local title="$1" price_cents="$2" currency="$3" is_active="$4" delivery_url="$5"
  if [ "${HAVE_JQ}" = "1" ]; then
    jq -nc \
      --arg title "$title" \
      --arg currency "$currency" \
      --arg delivery_url "$delivery_url" \
      --argjson price_cents "$price_cents" \
      --argjson is_active "$is_active" \
      '{title:$title,price_cents:$price_cents,currency:$currency,is_active:$is_active,delivery_url:$delivery_url}'
  else
    printf '{"title":"%s","price_cents":%s,"currency":"%s","is_active":%s,"delivery_url":"%s"}' \
      "$title" "$price_cents" "$currency" "$is_active" "$delivery_url"
  fi
}

mk_order_payload() {
  local product_id="$1" qty="$2"
  if [ "${HAVE_JQ}" = "1" ]; then
    jq -nc --arg pid "$product_id" --argjson qty "$qty" \
      '{items:[{product_id:$pid,quantity:$qty}]}'
  else
    printf '{"items":[{"product_id":"%s","quantity":%s}]}' "$product_id" "$qty"
  fi
}

mk_attach_pi_payload() {
  local pi="$1"
  if [ "${HAVE_JQ}" = "1" ]; then
    jq -nc --arg pi "$pi" '{stripe_payment_intent_id:$pi}'
  else
    printf '{"stripe_payment_intent_id":"%s"}' "$pi"
  fi
}

############################################
# Cleanup (best-effort; never fails the run)
############################################
cleanup_call() {
  # Soft call: never increments test failures; updates cleanup counters only.
  local method="$1"; shift
  local url="$1"; shift
  local label="$1"; shift

  if [ "${ULTRA_CLEANUP_DRYRUN}" = "1" ]; then
    cleanup_pass "DRYRUN: would ${method} ${url} (${label})"
    return 0
  fi

  call "${method}" "${url}" "$@"

  # Consider these "ok" for cleanup:
  # - 200/204 success
  # - 404 not found (already gone / not supported)
  # - 405 method not allowed (endpoint not supported)
  if [ "${CODE}" = "200" ] || [ "${CODE}" = "204" ]; then
    cleanup_pass "${label} (HTTP ${CODE})"
    return 0
  fi
  if [ "${CODE}" = "404" ] || [ "${CODE}" = "405" ]; then
    cleanup_fail "${label}: endpoint not supported or resource missing (HTTP ${CODE})"
    return 0
  fi

  cleanup_fail "${label}: unexpected HTTP ${CODE}"
  if [ -n "${BODY}" ]; then
    echo "----- cleanup response body (first 2000 chars) -----"
    echo "${BODY:0:2000}"
    echo "---------------------------------------------------"
  fi
  return 0
}

cleanup_disable_store_if_needed() {
  local store_id="$1"
  local label="$2"
  if [ -z "${store_id}" ]; then return 0; fi

  cleanup_call PATCH "${BASE}/stores/${store_id}/settings" "${label}: disable store" \
    -H "x-admin-key: ${ADMIN_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(mk_disable_payload)"
}

cleanup_best_effort() {
  if [ "${ULTRA_CLEANUP}" != "1" ]; then
    return 0
  fi

  section "CLEANUP (BEST-EFFORT)"

  info "Cleanup enabled (ULTRA_CLEANUP=1). This does not affect test pass/fail."
  if [ "${ULTRA_CLEANUP_DRYRUN}" = "1" ]; then
    info "Cleanup DRYRUN enabled (ULTRA_CLEANUP_DRYRUN=1). No deletions will be executed."
  fi

  # Try deleting products first (if DELETE endpoints exist)
  if [ -n "${A_ID}" ] && [ -n "${PROD_A_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${A_ID}/products/${PROD_A_ID}" "Delete product A" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi
  if [ -n "${B_ID}" ] && [ -n "${PROD_B_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${B_ID}/products/${PROD_B_ID}" "Delete product B" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi

  # Try deleting orders (optional; only if your API supports it)
  if [ -n "${A_ID}" ] && [ -n "${ORDER_A1_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${A_ID}/orders/${ORDER_A1_ID}" "Delete order A1" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi
  if [ -n "${A_ID}" ] && [ -n "${ORDER_A2_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${A_ID}/orders/${ORDER_A2_ID}" "Delete order A2" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi
  if [ -n "${B_ID}" ] && [ -n "${ORDER_B1_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${B_ID}/orders/${ORDER_B1_ID}" "Delete order B1" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi

  # Try deleting stores (if supported)
  if [ -n "${A_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${A_ID}" "Delete store A" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi
  if [ -n "${B_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${B_ID}" "Delete store B" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi
  if [ -n "${C_ID}" ]; then
    cleanup_call DELETE "${BASE}/stores/${C_ID}" "Delete store C" \
      -H "x-admin-key: ${ADMIN_KEY}"
  fi

  # If store deletion isn't supported, at least disable them so they do not remain enabled.
  cleanup_disable_store_if_needed "${A_ID}" "Fallback"
  cleanup_disable_store_if_needed "${B_ID}" "Fallback"
  cleanup_disable_store_if_needed "${C_ID}" "Fallback"

  info "Cleanup finished. Results: cleanup_ok=${cleanup_ok} cleanup_err=${cleanup_err}"
}

finalize() {
  # Run cleanup before summary/exit (best-effort)
  cleanup_best_effort

  local end_ts dur
  end_ts="$(date +%s)"
  dur=$((end_ts - START_TS))

  echo ""
  echo "=== SUMMARY ==="
  echo "Passes: ${passes}"
  echo "Failures: ${failures}"
  echo "Cleanup: ok=${cleanup_ok} warn=${cleanup_err}"
  echo "Duration: ${dur}s"
  echo ""
  echo "Created resources (if any):"
  echo "  Store A: id=${A_ID:-} slug=${A_SLUG:-}"
  echo "  Store B: id=${B_ID:-} slug=${B_SLUG:-}"
  echo "  Store C: id=${C_ID:-} slug=${C_SLUG:-}"
  echo "  Products: A=${PROD_A_ID:-} B=${PROD_B_ID:-}"
  echo "  Orders: A1=${ORDER_A1_ID:-} A2=${ORDER_A2_ID:-} B1=${ORDER_B1_ID:-}"
  echo "  PaymentIntent: ${PI:-}"
  echo ""

  cp -f "${LOG_FILE}" "${LATEST}" 2>/dev/null || true

  echo "ULTRA DONE ✅"
  echo "📝 Log saved to: ${LOG_FILE}"
  echo "🧷 Latest copy: ${LATEST}"

  if [ "${failures}" -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
}
trap finalize EXIT INT TERM

############################################
# Header
############################################
echo "=== ULTRA TESTS ==="
echo "BASE=${BASE}"
echo "ADMIN_KEY=$(mask_key "${ADMIN_KEY}")"
echo "ULTRA_CLEANUP=${ULTRA_CLEANUP}"
echo "ULTRA_CLEANUP_DRYRUN=${ULTRA_CLEANUP_DRYRUN}"
echo "LOG_FILE=${LOG_FILE}"
echo "BACKEND_DIR=${BACKEND_DIR}"
echo "DOCS_DIR=${DOCS_DIR}"
echo "START_TS=${START_TS}"

node -v 2>/dev/null || true
if command -v git >/dev/null 2>&1 && [ -d "${BACKEND_DIR}/.git" ]; then
  (cd "${BACKEND_DIR}" && echo "GIT=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)@$(git rev-parse --short HEAD 2>/dev/null || true)")
fi

############################################
# Dependencies
############################################
section "DEPENDENCIES"
need_cmd_strict curl || exit 1
if need_cmd_strict jq; then HAVE_JQ=1; else HAVE_JQ=0; fi

if command -v npx >/dev/null 2>&1; then
  HAVE_NPX=1
  pass "Dependency found: npx (load test enabled)"
else
  HAVE_NPX=0
  pass "Dependency not found: npx (load test will be skipped)"
fi

if [ -z "${ADMIN_KEY}" ]; then
  fail "Missing ADMIN_KEY env var (export ADMIN_KEY=...)"
  exit 1
fi

############################################
# 1) Health
############################################
section "HEALTH"
call GET "${BASE}/health"
assert_code 200 "/health should return 200" || true
json_pretty

############################################
# 2) Tenancy negatives
############################################
section "TENANCY NEGATIVES"
call GET "${BASE}/storefront/meta"
assert_code 400 "storefront/meta without Host should be 400" || true

call GET "${BASE}/storefront/meta" -H "Host: foo.bar.localhost"
assert_code 400 "foo.bar.localhost should be rejected (strict subdomain)" || true

############################################
# 3) Auth negatives (baseline)
############################################
section "AUTH NEGATIVES (BASELINE)"
ts="$(date +%s)"
suffix="${ts}-${RANDOM}"

call POST "${BASE}/stores" \
  -H "Content-Type: application/json" \
  -d "$(mk_store_payload "noauth-${suffix}" "No Auth" "usd")"
assert_code 401 "POST /stores without x-admin-key should be 401" || true

############################################
# 4) Store validation negatives
############################################
section "STORE VALIDATION NEGATIVES"
call POST "${BASE}/stores" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_store_payload "Bad Slug" "Bad" "usd")"
assert_code 400 "Invalid slug should be rejected (400)" || true

############################################
# 5) Create stores A/B
############################################
section "CREATE STORES A/B"
A_SLUG="a-${suffix}"
B_SLUG="b-${suffix}"

call POST "${BASE}/stores" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_store_payload "${A_SLUG}" "Store A ${suffix}" "usd")"
assert_code 201 "Create store A" || true
A_ID="$(json_get '.store.id')"

call POST "${BASE}/stores" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_store_payload "${B_SLUG}" "Store B ${suffix}" "pen")"
assert_code 201 "Create store B" || true
B_ID="$(json_get '.store.id')"

echo "A_ID=${A_ID}  A_SLUG=${A_SLUG}"
echo "B_ID=${B_ID}  B_SLUG=${B_SLUG}"

if [ -z "${A_ID}" ] || [ -z "${B_ID}" ]; then
  fail "Store IDs are missing; downstream tests may fail. Check ADMIN_KEY and server logs."
fi

############################################
# 6) Admin protection (additional 401 checks)
############################################
section "ADMIN PROTECTION (ADDITIONAL 401 CHECKS)"
if [ -n "${A_ID}" ]; then
  call PATCH "${BASE}/stores/${A_ID}/settings" \
    -H "Content-Type: application/json" \
    -d "$(mk_settings_payload "usd")"
  assert_code 401 "PATCH /stores/:id/settings without x-admin-key should be 401" || true

  call PATCH "${BASE}/stores/${A_ID}/enable"
  assert_code 401 "PATCH /stores/:id/enable without x-admin-key should be 401" || true
else
  fail "Skipping admin protection checks: missing A_ID"
fi

############################################
# 7) Duplicate slug
############################################
section "DUPLICATE SLUG"
call POST "${BASE}/stores" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_store_payload "${A_SLUG}" "Dup" "usd")"
assert_code 409 "Duplicate slug should return 409" || true

############################################
# 8) Enable + settings
############################################
section "ENABLE + SETTINGS"
if [ -n "${A_ID}" ]; then
  call PATCH "${BASE}/stores/${A_ID}/enable" -H "x-admin-key: ${ADMIN_KEY}"
  assert_code 200 "Enable store A" || true

  call PATCH "${BASE}/stores/${A_ID}/settings" \
    -H "x-admin-key: ${ADMIN_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(mk_settings_payload "usd")"
  assert_code 200 "Patch store A settings currency=usd" || true
else
  fail "Skipping store A enable/settings: missing A_ID"
fi

if [ -n "${B_ID}" ]; then
  call PATCH "${BASE}/stores/${B_ID}/enable" -H "x-admin-key: ${ADMIN_KEY}"
  assert_code 200 "Enable store B" || true

  call PATCH "${BASE}/stores/${B_ID}/settings" \
    -H "x-admin-key: ${ADMIN_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(mk_settings_payload "pen")"
  assert_code 200 "Patch store B settings currency=pen" || true
else
  fail "Skipping store B enable/settings: missing B_ID"
fi

if [ -n "${A_ID}" ]; then
  call GET "${BASE}/stores/${A_ID}/settings" -H "x-admin-key: ${ADMIN_KEY}"
  assert_code 200 "Get store A settings" || true
  assert_json_eq '.store.currency' 'usd' "Store A currency should be usd" || true
fi

if [ -n "${B_ID}" ]; then
  call GET "${BASE}/stores/${B_ID}/settings" -H "x-admin-key: ${ADMIN_KEY}"
  assert_code 200 "Get store B settings" || true
  assert_json_eq '.store.currency' 'pen' "Store B currency should be pen" || true
fi

############################################
# 9) Storefront meta (Host routing)
############################################
section "STOREFRONT META (HOST ROUTING)"
host_ok=1

call GET "${BASE}/storefront/meta" -H "Host: ${A_SLUG}.localhost"
assert_code 200 "Host meta A should be 200" || host_ok=0
assert_json_eq '.store.slug' "${A_SLUG}" "Host meta A should resolve correct slug" || host_ok=0

call GET "${BASE}/storefront/meta" -H "Host: ${B_SLUG}.localhost"
assert_code 200 "Host meta B should be 200" || host_ok=0
assert_json_eq '.store.slug' "${B_SLUG}" "Host meta B should resolve correct slug" || host_ok=0

if [ "${host_ok}" = "1" ]; then
  pass "Host routing isolation A/B verified"
else
  fail "Host routing isolation A/B failed (see errors above)"
fi

############################################
# 10) Tenancy Host parsing (strict + ports)
############################################
section "TENANCY HOST PARSING (STRICT + PORTS)"
call GET "${BASE}/storefront/meta" -H "Host: ${A_SLUG}.localhost.evil.com"
assert_code 400 "Host <slug>.localhost.evil.com should be rejected (400)" || true

call GET "${BASE}/storefront/meta" -H "Host: ${A_SLUG}.localhost:5051"
assert_code 200 "Host <slug>.localhost:5051 should still resolve tenant (200)" || true
assert_json_eq '.store.slug' "${A_SLUG}" "Host with port should resolve correct slug" || true

############################################
# 11) Disabled store behavior (public must fail)
############################################
section "DISABLED STORE BEHAVIOR (PUBLIC MUST FAIL)"
C_SLUG="c-${suffix}"

call POST "${BASE}/stores" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_store_payload "${C_SLUG}" "Store C ${suffix}" "usd")"
assert_code 201 "Create store C (leave disabled)" || true
C_ID="$(json_get '.store.id')"
echo "C_ID=${C_ID}  C_SLUG=${C_SLUG}"

call GET "${BASE}/storefront/meta" -H "Host: ${C_SLUG}.localhost"
assert_not_200 "Disabled store C: /storefront/meta must NOT return 200" || true

call GET "${BASE}/storefront/products" -H "Host: ${C_SLUG}.localhost"
assert_not_200 "Disabled store C: /storefront/products must NOT return 200" || true

############################################
# 12) Products (auth check + create)
############################################
section "PRODUCTS (AUTH CHECK + CREATE)"
call POST "${BASE}/stores/${A_ID}/products" \
  -H "Content-Type: application/json" \
  -d "$(mk_product_payload "NoAuth Product" 1000 "usd" true "https://example.com/dl")"
assert_code 401 "Create product without x-admin-key should be 401" || true

call POST "${BASE}/stores/${A_ID}/products" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_product_payload "Ultra Product A ${suffix}" 1990 "usd" true "https://example.com/dl")"
assert_code 201 "Create product A" || true
PROD_A_ID="$(json_get '.product.id')"

call POST "${BASE}/stores/${B_ID}/products" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_product_payload "Ultra Product B ${suffix}" 2590 "pen" true "https://example.com/dl")"
assert_code 201 "Create product B" || true
PROD_B_ID="$(json_get '.product.id')"

echo "PROD_A_ID=${PROD_A_ID}"
echo "PROD_B_ID=${PROD_B_ID}"

call POST "${BASE}/stores/${C_ID}/products" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_product_payload "Ultra Product C ${suffix}" 1490 "usd" true "https://example.com/dl")"
assert_code 201 "Create product C (store disabled)" || true
PROD_C_ID="$(json_get '.product.id')"

echo "PROD_C_ID=${PROD_C_ID}"

############################################
# Disabled store: public order creation must 404
############################################
section "DISABLED STORE: PUBLIC ORDER CREATION MUST 404"

call POST "${BASE}/stores/${C_ID}/orders" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_C_ID}" 1)"
assert_code 404 "Disabled store C (legacy): POST /stores/:id/orders must be 404" || true

call POST "${BASE}/store/${C_SLUG}/orders" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_C_ID}" 1)"
assert_code 404 "Disabled store C (slug): POST /store/:slug/orders must be 404" || true

call POST "${BASE}/storefront/orders" \
  -H "Host: ${C_SLUG}.localhost" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_C_ID}" 1)"
assert_code 404 "Disabled store C (host): POST /storefront/orders must be 404" || true

############################################
# 13) Public storefront products should NOT leak delivery_url
############################################
section "PUBLIC STOREFRONT PRODUCTS (NO delivery_url LEAK)"
call GET "${BASE}/storefront/products" -H "Host: ${A_SLUG}.localhost"
if [ "${CODE}" = "200" ]; then
  assert_body_not_contains '"delivery_url"' "Public storefront/products should NOT include delivery_url" || true
else
  fail "GET /storefront/products not returning 200 (got ${CODE}). If this route exists, fix it; if not required, ignore."
  json_pretty
fi

############################################
# 14) Orders (public) + cross-tenant product block
############################################
section "ORDERS (PUBLIC) + CROSS-TENANT BLOCK"
call POST "${BASE}/stores/${A_ID}/orders" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_A_ID}" 1)"
assert_code 201 "Create public order A1" || true
ORDER_A1_ID="$(json_get '.order.id')"

call POST "${BASE}/stores/${B_ID}/orders" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_A_ID}" 1)"
if [ "${CODE}" = "400" ]; then
  pass "Cross-tenant product usage is blocked in orders (HTTP 400)"
else
  fail "Cross-tenant product usage should be blocked (expected 400, got ${CODE})"
  json_pretty
fi

############################################
# 15) Admin protection (order patch endpoints 401)
############################################
section "ADMIN PROTECTION (ORDER PATCH ENDPOINTS 401)"
call PATCH "${BASE}/stores/${A_ID}/orders/${ORDER_A1_ID}/attach-payment-intent" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "pi_test")"
assert_code 401 "PATCH .../attach-payment-intent without x-admin-key should be 401" || true

call PATCH "${BASE}/stores/${A_ID}/orders/mark-paid-by-payment-intent" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "pi_test")"
assert_code 401 "PATCH .../mark-paid-by-payment-intent without x-admin-key should be 401" || true

############################################
# 16) Payment intent uniqueness + ambiguity bug check
############################################
section "PAYMENT INTENT UNIQUENESS + AMBIGUITY BUG CHECK"
call POST "${BASE}/stores/${A_ID}/orders" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_A_ID}" 1)"
assert_code 201 "Create public order A2" || true
ORDER_A2_ID="$(json_get '.order.id')"

call POST "${BASE}/stores/${B_ID}/orders" \
  -H "Content-Type: application/json" \
  -d "$(mk_order_payload "${PROD_B_ID}" 1)"
assert_code 201 "Create public order B1" || true
ORDER_B1_ID="$(json_get '.order.id')"

PI="pi_ultra_${suffix}"

call PATCH "${BASE}/stores/${A_ID}/orders/${ORDER_A1_ID}/attach-payment-intent" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "${PI}")"
assert_code 200 "Attach PI to A1" || true

call PATCH "${BASE}/stores/${A_ID}/orders/${ORDER_A2_ID}/attach-payment-intent" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "${PI}")"
if [ "${CODE}" = "409" ]; then
  pass "Same-store PI uniqueness enforced (409)"
else
  fail "Same-store PI uniqueness should be 409, got ${CODE}"
  json_pretty
fi

call PATCH "${BASE}/stores/${B_ID}/orders/${ORDER_B1_ID}/attach-payment-intent" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "${PI}")"
assert_code 200 "Cross-store PI reuse allowed" || true

call PATCH "${BASE}/stores/${A_ID}/orders/mark-paid-by-payment-intent" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "${PI}")"
assert_code 200 "Mark paid by PI in store A" || true
assert_json_eq '.order.id' "${ORDER_A1_ID}" "Store A mark-paid should update A1 (not B1)" || true
assert_json_eq '.order.status' 'paid' "Store A updated order should be paid" || true

call PATCH "${BASE}/stores/${B_ID}/orders/mark-paid-by-payment-intent" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(mk_attach_pi_payload "${PI}")"
assert_code 200 "Mark paid by same PI in store B" || true
assert_json_eq '.order.id' "${ORDER_B1_ID}" "Store B mark-paid should update B1 (not A1)" || true
assert_json_eq '.order.status' 'paid' "Store B updated order should be paid" || true

############################################
# 17) Cross-tenant order read/list isolation
############################################
section "CROSS-TENANT ORDER READ/LIST ISOLATION"
call GET "${BASE}/stores/${A_ID}/orders" -H "x-admin-key: ${ADMIN_KEY}"
assert_code 200 "Admin list orders for store A should be 200" || true
assert_body_not_contains_value "${ORDER_B1_ID}" "Store A orders list must NOT include Store B order ids" || true

call GET "${BASE}/stores/${B_ID}/orders" -H "x-admin-key: ${ADMIN_KEY}"
assert_code 200 "Admin list orders for store B should be 200" || true
assert_body_not_contains_value "${ORDER_A1_ID}" "Store B orders list must NOT include Store A order ids" || true

call GET "${BASE}/stores/${A_ID}/orders/${ORDER_A1_ID}" -H "x-admin-key: ${ADMIN_KEY}"
assert_code 200 "Admin read Store A order A1 should be 200" || true

call GET "${BASE}/stores/${B_ID}/orders/${ORDER_A1_ID}" -H "x-admin-key: ${ADMIN_KEY}"
assert_code 404 "Reading Store A order via Store B storeId should be 404" || true

############################################
# 18) Load test (optional)
############################################
section "LOAD TEST (OPTIONAL)"
if [ "${ULTRA_SKIP_LOAD:-0}" = "1" ]; then
  pass "Skipped load test (ULTRA_SKIP_LOAD=1)"
elif [ "${HAVE_NPX}" != "1" ]; then
  pass "Skipped load test (npx not installed)"
else
  npx -y autocannon -c 25 -d 8 "${BASE}/health" || true
  pass "Load test completed (informational)"
fi

exit 0
