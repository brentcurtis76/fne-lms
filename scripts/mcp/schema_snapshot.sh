#!/usr/bin/env bash
set -euo pipefail

# Dumps schema-only for public and auth from the target DB (staging preferred)
# Requires: SUPABASE_DB_URL_STAGING or a provided --db-url

DB_URL="${SUPABASE_DB_URL_STAGING:-}"
DATESTAMP="$(date +%Y%m%d)"
OUT_FILE="schema_snapshot_${DATESTAMP}.sql"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)
      DB_URL="$2"; shift 2;;
    --out)
      OUT_FILE="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "${DB_URL}" ]]; then
  echo "[snapshot] ERROR: Set SUPABASE_DB_URL_STAGING or pass --db-url" >&2
  exit 1
fi

echo "[snapshot] Dumping schema from ${DB_URL} -> ${OUT_FILE}"
npx --yes supabase db dump --db-url "${DB_URL}" --schema-only --schema public --schema auth > "${OUT_FILE}"
echo "[snapshot] Done: ${OUT_FILE}"

