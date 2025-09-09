#!/usr/bin/env bash
set -euo pipefail

# Compares a fresh schema snapshot to a committed canonical snapshot file.
# Usage: scripts/mcp/drift_check.sh <canonical_snapshot.sql> [--db-url <url>]

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <canonical_snapshot.sql> [--db-url <url>]" >&2
  exit 2
fi

CANONICAL="$1"; shift
DB_URL="${SUPABASE_DB_URL_STAGING:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-url)
      DB_URL="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ -z "${DB_URL}" ]]; then
  echo "[drift] ERROR: Set SUPABASE_DB_URL_STAGING or pass --db-url" >&2
  exit 1
fi

TMP_SNAPSHOT="schema_snapshot_$(date +%Y%m%d%H%M%S).sql"

echo "[drift] Creating fresh snapshot from ${DB_URL}"
npx --yes supabase db dump --db-url "${DB_URL}" --schema-only --schema public --schema auth > "${TMP_SNAPSHOT}"

echo "[drift] Diffing ${TMP_SNAPSHOT} against canonical ${CANONICAL}"
if diff -u "${CANONICAL}" "${TMP_SNAPSHOT}"; then
  echo "[drift] No drift detected."
  rm -f "${TMP_SNAPSHOT}"
  exit 0
else
  echo "[drift] DRIFT DETECTED. Investigate differences above." >&2
  echo "[drift] Keeping snapshot: ${TMP_SNAPSHOT}"
  exit 3
fi

