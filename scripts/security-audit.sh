#!/bin/bash
# Security audit script for ShopMate AI
set -euo pipefail

echo "=== ShopMate AI Security Audit ==="
echo ""

# 1. Check for .env files committed (should not be)
echo "--- Checking for .env in staging ---"
if git ls-files --error-unmatch 2>/dev/null | grep -q '\.env$'; then
  echo "❌ .env files found in git tracking!"
  git ls-files | grep '\.env$'
else
  echo "✅ No .env files tracked in git"
fi

# 2. Check dependencies for vulnerabilities
echo ""
echo "--- Backend dependency audit ---"
cd "$(dirname "$0")/../后端"
pnpm audit --audit-level=high 2>/dev/null || echo "⚠️  High severity vulnerabilities found"

echo ""
echo "--- Frontend dependency audit ---"
cd "$(dirname "$0")/../智能体前端"
pnpm audit --audit-level=high 2>/dev/null || echo "⚠️  High severity vulnerabilities found"

# 3. Check for hardcoded secrets
echo ""
echo "--- Grep for potential hardcoded secrets ---"
cd "$(dirname "$0")/.."
for PATTERN in '-----BEGIN.*PRIVATE KEY' 'AKIA[0-9A-Z]{16}' 'sk-[a-zA-Z0-9]{32,}' 'ghp_[a-zA-Z0-9]{36}'; do
  FOUND=$(grep -r "$PATTERN" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.py' --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | grep -v '.env.example' | grep -v 'test' || true)
  if [ -n "$FOUND" ]; then
    echo "❌ Potential secret found matching: $PATTERN"
    echo "$FOUND"
  fi
done

echo ""
echo "=== Audit Complete ==="
