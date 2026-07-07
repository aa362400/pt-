#!/bin/bash
# Full gitleaks scan + secret remediation
set -euo pipefail

echo "=== Gitleaks Secret Scan ==="
cd "$(dirname "$0")/.."

# Check if gitleaks is installed
if ! command -v gitleaks &> /dev/null; then
  echo "⚠️  gitleaks not found. Installing..."
  go install github.com/gitleaks/gitleaks/v8@latest 2>/dev/null || {
    echo "Install from: https://github.com/gitleaks/gitleaks/releases"
    exit 1
  }
fi

# Run scan
gitleaks detect --source . --verbose --no-git

# If any secrets found, list them
echo ""
echo "=== Remediation ==="
echo "If secrets were found:"
echo "1. Rotate the secret immediately"
echo "2. Remove from git: git filter-branch --force --index-filter ..."
echo "3. Add to .gitignore or .gitleaks.toml allowlist if false positive"
echo "4. Force push to clean remote history"
