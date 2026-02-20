#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="digital-store-test-db"
POSTGRES_IMAGE="postgres:16"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
POSTGRES_DB="digital_store_test"
HOST_PORT="54321"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cleanup() {
  echo
  echo "========== [cleanup] Stopping and removing disposable Postgres container =========="
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "========== [start db] Starting disposable Postgres container (${CONTAINER_NAME}) =========="
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker run --name "${CONTAINER_NAME}" \
  -e POSTGRES_USER="${POSTGRES_USER}" \
  -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  -e POSTGRES_DB="${POSTGRES_DB}" \
  -p "${HOST_PORT}:5432" \
  -d "${POSTGRES_IMAGE}" >/dev/null

echo "========== [wait for db] Waiting for Postgres readiness (max 30s) =========="
for _ in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  sleep 1
done

if ! docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1; then
  echo "ERROR: Postgres did not become ready within 30 seconds." >&2
  exit 1
fi

export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:54321/digital_store_test"
export ADMIN_KEY="test_admin_key"

echo "DATABASE_URL=${DATABASE_URL}"
echo "========== [run tests] Running migrations + Jest via npm test =========="
cd "${BACKEND_DIR}"
npm test
