#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
LATEST_BACKUP="$(ls -1t "${BACKUP_DIR}"/*.sql 2>/dev/null | head -n 1 || true)"

if [[ -z "${LATEST_BACKUP}" ]]; then
  echo "[db-refresh] no backup found in ${BACKUP_DIR}" >&2
  exit 1
fi

export BACKUP_FILE="${LATEST_BACKUP}"
echo "[db-refresh] latest backup: ${LATEST_BACKUP}"

./scripts/db-restore.sh
