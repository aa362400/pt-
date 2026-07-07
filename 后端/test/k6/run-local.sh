#!/usr/bin/env bash
# =============================================================================
# ShopMate AI — k6 Load Test Runner
# =============================================================================
# Usage:
#   ./run-local.sh                          # Use default BASE_URL
#   BASE_URL=https://staging.example.com ./run-local.sh
#   TEST_EMAIL=user@example.com TEST_PASSWORD=secret ./run-local.sh
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_EMAIL="${TEST_EMAIL:-}"
TEST_PASSWORD="${TEST_PASSWORD:-}"

export BASE_URL
export TEST_EMAIL
export TEST_PASSWORD

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
mkdir -p "${RESULTS_DIR}"

echo "==========================================="
echo " ShopMate AI k6 Load Tests"
echo " Base URL: ${BASE_URL}"
echo " Results:  ${RESULTS_DIR}"
echo "==========================================="
echo ""

# ── Smoke Test ──────────────────────────────────────────────────────────────
echo "=== [1/3] Running smoke tests ==="
k6 run --out json="${RESULTS_DIR}/smoke-test.json" \
  "${SCRIPT_DIR}/scenarios/smoke-test.js"
echo "Smoke test completed."
echo ""

# ── Auth Scenario ───────────────────────────────────────────────────────────
echo "=== [2/3] Running auth tests ==="
k6 run --out json="${RESULTS_DIR}/auth-scenario.json" \
  "${SCRIPT_DIR}/scenarios/auth-scenario.js"
echo "Auth test completed."
echo ""

# ── API Scenario ────────────────────────────────────────────────────────────
echo "=== [3/3] Running API tests ==="
k6 run --out json="${RESULTS_DIR}/api-scenario.json" \
  "${SCRIPT_DIR}/scenarios/api-scenario.js"
echo "API test completed."
echo ""

echo "==========================================="
echo " All tests completed."
echo " Results saved to: ${RESULTS_DIR}"
echo "==========================================="
