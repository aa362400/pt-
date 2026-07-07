#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/shopmate-${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

echo "[db-backup] creating backup at ${OUTPUT_FILE}"
pg_dump "${DATABASE_URL}" --format=plain --no-owner --no-privileges > "${OUTPUT_FILE}"

echo "[db-backup] done"
