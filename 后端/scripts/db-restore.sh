#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[db-restore] backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

echo "[db-restore] restoring from ${BACKUP_FILE}"
psql "${DATABASE_URL}" < "${BACKUP_FILE}"

echo "[db-restore] done"
