#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_ID?SUPABASE_PROJECT_ID is required}"

echo "🔎 Generating temporary types for project: $SUPABASE_PROJECT_ID"
npx supabase gen types typescript --project-id="$SUPABASE_PROJECT_ID" > types/database.generated.tmp.ts

echo "🔁 Diffing committed vs generated types"
if ! diff -u types/database.generated.ts types/database.generated.tmp.ts; then
  echo "\n⚠️ Type drift detected. Run 'npm run typegen' locally and commit updated types." >&2
  exit 1
fi

echo "✅ Types match committed snapshot"
