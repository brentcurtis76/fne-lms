#!/usr/bin/env bash
# Run CI Gate 4 (mandatory Playwright e2e on a seeded, ephemeral Supabase stack)
# on a developer machine, the same way .github/workflows/ci.yml does — without
# touching the machine's other Supabase stacks, its default ports or its
# .env.local.
#
#   scripts/ci/e2e-local.sh            # full run: stack, build, seed, mandatory specs, guard
#   E2E_KEEP_STACK=1 scripts/ci/e2e-local.sh   # leave the stack running afterwards
#
# Differences from CI, all deliberate:
#   - the stack is a private copy of supabase/ with its own project_id and ports
#     (E2E_LOCAL_PORT_BASE, default 56300 → API 56321, DB 56322), so a developer's
#     default stack on 54321/54322 is never reset;
#   - like CI it writes .env.local (several specs read it directly), but only
#     when none exists, and removes it afterwards;
#   - the app port is E2E_PORT (default 3300) and NEXT_PUBLIC_BASE_URL follows it.
# Like CI it sets CI=1, so Playwright serves the production build with CI's
# retries, single worker and JSON report, and the skip guard runs at the end.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
BASE="${E2E_LOCAL_PORT_BASE:-56300}"
export E2E_PORT="${E2E_PORT:-3300}"
PROJECT_ID="${E2E_LOCAL_PROJECT_ID:-genera-e2e-local}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/genera-e2e-local.XXXXXX")"

cleanup() {
  [ -n "${WROTE_ENV:-}" ] && rm -f "$ROOT/.env.local"
  if [ "${E2E_KEEP_STACK:-}" != "1" ]; then
    (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1) || true
    rm -rf "$WORK"
  else
    echo "Stack kept running: (cd $WORK && supabase stop --no-backup) to remove it."
  fi
}
trap cleanup EXIT

cp -r supabase "$WORK/supabase"
CFG="$WORK/supabase/config.toml"
sed -i "s/^project_id = .*/project_id = \"$PROJECT_ID\"/" "$CFG"
sed -i "0,/^port = 54321/s//port = $((BASE + 21))/" "$CFG"
cat >> "$CFG" <<TOML

[db]
port = $((BASE + 22))
shadow_port = $((BASE + 20))
major_version = 15
TOML

echo "== Starting private Supabase stack '$PROJECT_ID' (API $((BASE + 21)), DB $((BASE + 22)))"
(cd "$WORK" && supabase start -x studio,logflare,vector,edge-runtime,imgproxy,mailpit,supavisor,pooler >/dev/null)
STATUS="$(cd "$WORK" && supabase status -o json 2>/dev/null)"

export NEXT_PUBLIC_SUPABASE_URL="$(jq -er '.API_URL' <<<"$STATUS")"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(jq -er '.ANON_KEY' <<<"$STATUS")"
export SUPABASE_SERVICE_ROLE_KEY="$(jq -er '.SERVICE_ROLE_KEY' <<<"$STATUS")"
export SUPABASE_DB_URL="$(jq -er '.DB_URL' <<<"$STATUS")"
export ZOOM_MODE=mock
export CRON_SECRET=e2e-synthetic-cron-secret-not-a-real-credential
export NEXT_PUBLIC_BASE_URL="http://localhost:$E2E_PORT"
export FEATURE_ZOOM_MEETINGS=true
export NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS=true
export CI=1

# A developer .env.local would add keys CI never sets (or real credentials), so
# refuse to run with one; otherwise write CI's, as CI does.
if [ -f .env.local ]; then
  echo "Refusing: $ROOT/.env.local exists; move it aside so the run sees exactly CI's settings." >&2
  exit 2
fi
WROTE_ENV=1
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL \
  ZOOM_MODE CRON_SECRET NEXT_PUBLIC_BASE_URL FEATURE_ZOOM_MEETINGS NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS; do
  echo "$key=${!key}"
done > .env.local

echo "== Production build"
npm run build >/dev/null
node scripts/check-price-leak.mjs
echo "== Seeding synthetic fixtures"
node scripts/ci/seed-e2e.mjs >/dev/null
echo "== Mandatory e2e specs (port $E2E_PORT)"
status=0
npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium || status=$?
node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json || status=$?
exit "$status"
