#!/usr/bin/env bash
set -euo pipefail

# Generates TypeScript types from Supabase (prod project) into types/database.generated.ts
# Safety: read-only operation. Requires Supabase CLI installed locally.

PROJECT_ID="${SUPABASE_PROJECT_ID:-sxlogxqzmarhqsblxmtj}"
OUT_FILE="types/database.generated.ts"

echo "[typegen] Generating types for project: ${PROJECT_ID} -> ${OUT_FILE}"
npx --yes supabase gen types typescript --project-id "${PROJECT_ID}" > "${OUT_FILE}"
echo "[typegen] Done: ${OUT_FILE}"

