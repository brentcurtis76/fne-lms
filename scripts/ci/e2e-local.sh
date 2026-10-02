#!/usr/bin/env bash
# Run CI Gate 4 (mandatory Playwright e2e on a seeded, ephemeral Supabase stack)
# on a developer machine, the same way .github/workflows/ci.yml does — without
# touching the machine's other Supabase stacks, its default ports or its
# .env.local, and without inheriting the developer's credentials.
#
#   scripts/ci/e2e-local.sh                     # full run, then remove the stack
#   E2E_KEEP_STACK=1 scripts/ci/e2e-local.sh    # leave the stack running afterwards
#   scripts/ci/e2e-local.sh tests/e2e/x.spec.ts  # run only the named specs (no mandatory check)
#
# Differences from CI, all deliberate:
#   - the stack is a private copy of supabase/ with a project_id unique to this
#     run and its own ports (E2E_LOCAL_PORT_BASE, default 56300 → API 56321,
#     DB 56322), so no other stack is ever started, reset or stopped;
#   - like CI it writes .env.local (several specs read it directly), but only
#     when none exists, and removes it afterwards;
#   - build, seed and specs run in a scrubbed environment (env -i) holding only
#     PATH/HOME/locale plus CI's keys, and the run refuses any other dotenv
#     file Next.js would load (.env, .env.production, .env.production.local);
#   - the app port is E2E_PORT (default 3300) and NEXT_PUBLIC_BASE_URL follows it.
# Like CI it sets CI=1, so Playwright serves the production build with CI's
# retries, single worker and JSON report, and the skip guard runs at the end.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BASE="${E2E_LOCAL_PORT_BASE:-56300}"
APP_PORT="${E2E_PORT:-3300}"
# Decimal without leading zeros (bash reads 0-prefixed numbers as octal), and
# every derived port must stay inside 1024..65535.
[[ "$BASE" =~ ^[1-9][0-9]{3,4}$ ]] && (( BASE >= 1024 && BASE + 22 <= 65535 )) \
  || { echo "E2E_LOCAL_PORT_BASE must be a decimal port base between 1024 and 65513" >&2; exit 2; }
[[ "$APP_PORT" =~ ^[1-9][0-9]{3,4}$ ]] && (( APP_PORT >= 1024 && APP_PORT <= 65535 )) \
  || { echo "E2E_PORT must be a decimal port between 1024 and 65535" >&2; exit 2; }
PROJECT_ID="genera-e2e-$(date +%s)-$$"
SPECS=("$@")
for spec in "${SPECS[@]}"; do
  [[ "$spec" == tests/*.spec.ts && -f "$spec" ]] \
    || { echo "Not a spec file under tests/: $spec" >&2; exit 2; }
done

for f in .env.local .env .env.production .env.production.local; do
  if [ -e "$f" ] || [ -L "$f" ]; then
    echo "Refusing: $ROOT/$f exists; move it aside so the run sees exactly CI's settings." >&2
    exit 2
  fi
done
if docker ps -a --format '{{.Names}}' | grep -q -- "_$PROJECT_ID\$"; then
  echo "Refusing: a stack named $PROJECT_ID already exists." >&2
  exit 2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/genera-e2e-local.XXXXXX")"
STACK_OWNED=""
WROTE_ENV=""

cleanup() {
  local rc=$?
  [ -n "$WROTE_ENV" ] && rm -f "$ROOT/.env.local"
  if [ -n "$STACK_OWNED" ] && [ "${E2E_KEEP_STACK:-}" != "1" ]; then
    if ! (cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1); then
      echo "WARNING: could not stop stack $PROJECT_ID; its config is kept in $WORK" >&2
      [ "$rc" -eq 0 ] && rc=3
      exit "$rc"
    fi
  elif [ -n "$STACK_OWNED" ]; then
    echo "Stack kept running: (cd $WORK && supabase stop --no-backup) to remove it."
    exit "$rc"
  fi
  rm -rf "$WORK"
  exit "$rc"
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
grep -qx "project_id = \"$PROJECT_ID\"" "$CFG" && grep -qx "port = $((BASE + 21))" "$CFG" \
  || { echo "Refusing: could not isolate the stack configuration." >&2; exit 2; }

echo "== Starting private Supabase stack '$PROJECT_ID' (API $((BASE + 21)), DB $((BASE + 22)))"
STACK_OWNED=1
(cd "$WORK" && supabase start -x studio,logflare,vector,edge-runtime,imgproxy,mailpit,supavisor,pooler >/dev/null)
STATUS="$(cd "$WORK" && supabase status -o json 2>/dev/null)"

API_URL="$(jq -er '.API_URL' <<<"$STATUS")"
ANON_KEY="$(jq -er '.ANON_KEY' <<<"$STATUS")"
SERVICE_ROLE_KEY="$(jq -er '.SERVICE_ROLE_KEY' <<<"$STATUS")"
DB_URL="$(jq -er '.DB_URL' <<<"$STATUS")"
[ "$API_URL" = "http://127.0.0.1:$((BASE + 21))" ] || { echo "Unexpected API URL $API_URL" >&2; exit 2; }
[[ "$DB_URL" == *"@127.0.0.1:$((BASE + 22))/"* ]] || { echo "Unexpected database URL" >&2; exit 2; }

CI_ENV=(
  "NEXT_PUBLIC_SUPABASE_URL=$API_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
  "SUPABASE_DB_URL=$DB_URL"
  "ZOOM_MODE=mock"
  "CRON_SECRET=e2e-synthetic-cron-secret-not-a-real-credential"
  "NEXT_PUBLIC_BASE_URL=http://localhost:$APP_PORT"
  "FEATURE_ZOOM_MEETINGS=true"
  "NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS=true"
)
(set -o noclobber; printf '%s\n' "${CI_ENV[@]}" > .env.local) \
  || { echo "Refusing: .env.local appeared during the run." >&2; exit 2; }
WROTE_ENV=1

# Only the process basics plus CI's keys: nothing from the developer's shell.
run() {
  env -i PATH="$PATH" HOME="$HOME" LANG="${LANG:-C.UTF-8}" TMPDIR="${TMPDIR:-/tmp}" \
    CI=1 E2E_PORT="$APP_PORT" "${CI_ENV[@]}" "$@"
}

echo "== Production build"
run npm run build >/dev/null
run node scripts/check-price-leak.mjs
echo "== Seeding synthetic fixtures"
run node scripts/ci/seed-e2e.mjs >/dev/null
status=0
if [ "${#SPECS[@]}" -gt 0 ]; then
  # Explicit specs (e.g. the PROC pilot rehearsal): run only those, on this
  # private stack, without retries; E2E_LOCAL_EXPLICIT tells such specs they are on one.
  echo "== Explicit e2e specs: ${SPECS[*]} (port $APP_PORT)"
  run E2E_LOCAL_EXPLICIT=1 npx playwright test "${SPECS[@]}" --project=chromium --retries=0 || status=$?
  exit "$status"
fi
echo "== Mandatory e2e specs (port $APP_PORT)"
run npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium || status=$?
run node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json || status=$?
exit "$status"
