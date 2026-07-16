#!/usr/bin/env bash
# Destructive recovery drill for an isolated non-production database only.
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL must be set explicitly}"
: "${BACKUP_DIR:?BACKUP_DIR must be set explicitly}"
: "${DRILL_CONFIRM_DATABASE:?DRILL_CONFIRM_DATABASE must name the target database}"

if [[ "${DRILL_CONFIRM:-}" != "DROP_AND_RESTORE" ]]; then
  echo "Refusing destructive drill. Set DRILL_CONFIRM=DROP_AND_RESTORE." >&2
  exit 2
fi

for command_name in pg_dump pg_restore psql; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is missing: ${command_name}" >&2
    exit 3
  fi
done

CURRENT_DATABASE="$(psql "${DATABASE_URL}" -Atqc "SELECT current_database();")"
if [[ -z "${CURRENT_DATABASE}" || "${CURRENT_DATABASE}" != "${DRILL_CONFIRM_DATABASE}" ]]; then
  echo "Database confirmation mismatch; refusing to continue." >&2
  exit 4
fi

LOWER_DATABASE="$(printf '%s' "${CURRENT_DATABASE}" | tr '[:upper:]' '[:lower:]')"
if [[ "${LOWER_DATABASE}" =~ (prod|production|live) ]]; then
  echo "Recovery drills must run against an isolated non-production database." >&2
  exit 5
fi

mkdir -p "${BACKUP_DIR}"
STARTED_AT="$(date +%s)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/drill_backup_${TIMESTAMP}.dump"
RESTORE_REQUIRED=0

declare -A BEFORE_COUNTS
for table in users organizations memberships; do
  PRESENT="$(psql "${DATABASE_URL}" -Atqc "SELECT to_regclass('public.${table}') IS NOT NULL;")"
  if [[ "${PRESENT}" != "t" ]]; then
    echo "Required verification table is missing: ${table}" >&2
    exit 6
  fi
  BEFORE_COUNTS["${table}"]="$(psql "${DATABASE_URL}" -Atqc "SELECT count(*) FROM \"${table}\";")"
done

emergency_restore() {
  local exit_code=$?
  if [[ ${RESTORE_REQUIRED} -eq 1 && -s "${BACKUP_FILE}" ]]; then
    echo "Drill failed after schema removal; attempting emergency restore." >&2
    pg_restore --dbname="${DATABASE_URL}" --clean --if-exists --no-owner "${BACKUP_FILE}" || true
  fi
  exit "${exit_code}"
}
trap emergency_restore EXIT

echo "[1/4] Creating and validating backup"
pg_dump "${DATABASE_URL}" --no-owner --format=custom --file="${BACKUP_FILE}"
test -s "${BACKUP_FILE}"
pg_restore --list "${BACKUP_FILE}" >/dev/null

echo "[2/4] Removing the isolated drill schema"
RESTORE_REQUIRED=1
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "[3/4] Restoring the validated backup"
pg_restore --dbname="${DATABASE_URL}" --no-owner "${BACKUP_FILE}"
RESTORE_REQUIRED=0

echo "[4/4] Verifying restored row counts"
for table in users organizations memberships; do
  AFTER_COUNT="$(psql "${DATABASE_URL}" -Atqc "SELECT count(*) FROM \"${table}\";")"
  if [[ "${AFTER_COUNT}" != "${BEFORE_COUNTS[${table}]}" ]]; then
    echo "Row-count mismatch for ${table}: ${BEFORE_COUNTS[${table}]} -> ${AFTER_COUNT}" >&2
    exit 7
  fi
  echo "  ${table}: ${AFTER_COUNT} rows"
done

FINISHED_AT="$(date +%s)"
echo "Recovery drill completed."
echo "Backup: ${BACKUP_FILE}"
echo "Measured RPO checkpoint: ${TIMESTAMP}"
echo "Measured RTO seconds: $((FINISHED_AT - STARTED_AT))"
