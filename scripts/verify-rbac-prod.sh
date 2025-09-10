#!/usr/bin/env bash
set -euo pipefail

# Production RBAC Read-Only Verification
# Usage:
#   BASE="https://fne-lms.vercel.app" TOKEN="<PROD_SUPERADMIN_TOKEN>" bash scripts/verify-rbac-prod.sh
# Notes:
#   - Do NOT echo or log the token value.
#   - Script is read-only; only performs GETs.

if [[ -z "${BASE:-}" || -z "${TOKEN:-}" ]]; then
  echo "ERROR: Please set BASE and TOKEN environment variables." >&2
  echo "Example: BASE='https://fne-lms.vercel.app' TOKEN='…' bash $0" >&2
  exit 1
fi

TODAY="$(date +%Y%m%d)"
OUTDIR="logs/mcp/${TODAY}/prod-finalization"
mkdir -p "${OUTDIR}"
LOG="${OUTDIR}/test-results.log"
FMT="\nHTTP:%{http_code} TIME:%{time_total}s SIZE:%{size_download}B\n"

{
  echo "=== RBAC PROD Read-Only Verify ==="
  echo "Date: $(date)"
  echo "Base: ${BASE}"
  echo

  echo "=== GET /api/admin/auth/is-superadmin ==="
  curl -sS -H "Authorization: Bearer ${TOKEN}" \
    "${BASE}/api/admin/auth/is-superadmin" -w "$FMT"

  echo
  echo "=== GET /api/admin/roles/permissions ==="
  RESP=$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
    "${BASE}/api/admin/roles/permissions" -w "$FMT")
  echo "$RESP"

  # Optional parsing if jq is available
  if command -v jq >/dev/null 2>&1; then
    echo
    echo "=== Parsed fields (jq) ==="
    echo "$RESP" | head -n 1 | jq '{is_mock, roles: (.roles // [] | .[0:6])}' || true
  fi
} | tee -a "$LOG"

echo
echo "Saved: ${LOG}"

