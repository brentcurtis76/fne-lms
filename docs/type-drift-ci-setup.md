# Type‑Drift CI Setup (Supabase Typegen)

Goal: Catch schema/type drift automatically.

## Prereqs
- GitHub Actions (or your CI)
- Secret `SUPABASE_PROJECT_ID` set in CI (project ref)
- CI has access to generate types via Supabase CLI or API

## Scripts
Add `scripts/typegen-check.sh`:

```
#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_PROJECT_ID?SUPABASE_PROJECT_ID is required}"

# Generate to temp and diff
npx supabase gen types typescript --project-id="$SUPABASE_PROJECT_ID" > types/database.generated.tmp.ts

diff -u types/database.generated.ts types/database.generated.tmp.ts || {
  echo "\n⚠️ Type drift detected. Commit regenerated types if expected." >&2
  exit 1
}

echo "✅ Types match committed snapshot"
```

Add to package.json:

```
{
  "scripts": {
    "typegen": "npx supabase gen types typescript --project-id=$SUPABASE_PROJECT_ID > types/database.generated.ts",
    "typegen:check": "bash scripts/typegen-check.sh"
  }
}
```

## CI Snippet (GitHub Actions)

```
name: Type Drift Check
on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run typegen:check
        env:
          SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
```

## Notes
- This is read-only; no DB writes in CI.
- If you expect schema changes, run `npm run typegen` locally and commit the updated `types/database.generated.ts`.
