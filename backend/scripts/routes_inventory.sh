#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Mounted routers ==="
grep -RIn "app\.use" src | head -n 200 || true
echo ""

echo "=== Stores routes ==="
grep -RIn "router\.\(get\|post\|patch\|delete\|put\)" src/routes | grep -i "stores" || true
echo ""

echo "=== Products routes ==="
grep -RIn "router\.\(get\|post\|patch\|delete\|put\)" src/routes | grep -i "product" || true
echo ""

echo "=== Orders routes ==="
grep -RIn "router\.\(get\|post\|patch\|delete\|put\)" src/routes | grep -i "order" || true
echo ""

echo "=== Checkout/Payment routes ==="
grep -RIn "router\.\(get\|post\|patch\|delete\|put\)" src/routes | grep -Ei "checkout|payment|stripe" || true
echo ""

echo "=== Admin middleware references ==="
grep -RIn "admin\.middleware|requireAdmin|x-admin-key|ADMIN_KEY" src | head -n 200 || true
