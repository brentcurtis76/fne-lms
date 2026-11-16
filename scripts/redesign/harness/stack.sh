#!/usr/bin/env bash
# The private local copy the picture harness walks: a Supabase stack of its own
# (scripts/ci/e2e-local.sh: API 56321, database 56322), a production build and the
# app on port 3300. Local only; refuses anything that is not 127.0.0.1.
#
#   stack.sh up          start the stack, build, seed (kept running), then serve
#   stack.sh adopt LOG   take over a stack already started by e2e-local.sh (its log names the folder)
#   stack.sh serve [tests|pictures]  start the app on the port (production server, CI's settings); "pictures"
#                        makes the server's clock stand still at the harness's moment, as walk.mjs needs
#   stack.sh unserve     stop the app
#   stack.sh build       stop the app, build the checkout as it is now, start the app again
#   stack.sh snapshot N  save the database's contents under the name N
#   stack.sh restore N [tests|pictures|none]  put the database back to snapshot N and restart the app (none: leave it stopped)
#   stack.sh fingerprint one checksum per table (to see what a walk changed in the database)
#   stack.sh psql        open psql on the stack's database (reads stdin)
#   stack.sh status      what is running
#   stack.sh down        stop the app and remove the stack (only this one)
#
# State (the stack's folder, its keys, snapshots, logs) lives outside the repository in
# RD_STATE (default ~/.cache/genera-rd-safety). The keys are the local stack's own; they
# open nothing else.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
STATE="${RD_STATE:-$HOME/.cache/genera-rd-safety}"
APP_PORT="${E2E_PORT:-3300}"
BASE="${E2E_LOCAL_PORT_BASE:-56300}"
ENVF="$STATE/stack.env"
mkdir -p "$STATE/snapshots"

die() { echo "stack.sh: $*" >&2; exit 2; }

load() {
  [ -f "$ENVF" ] || die "no stack recorded in $ENVF (run: stack.sh up)"
  # shellcheck disable=SC1090
  . "$ENVF"
  [[ "$API_URL" == http://127.0.0.1:* ]] || die "recorded API URL is not local: $API_URL"
  DBC="supabase_db_$PROJECT_ID"
  STC="supabase_storage_$PROJECT_ID"
}

ci_env() {
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
}

# The same scrubbed environment e2e-local.sh gives the build, the seed and the specs.
run() {
  ci_env
  env -i PATH="$PATH" HOME="$HOME" LANG="${LANG:-C.UTF-8}" TMPDIR="${TMPDIR:-/tmp}" \
    CI=1 E2E_PORT="$APP_PORT" "${CI_ENV[@]}" "$@"
}

record() { # $1 = the stack's settings folder
  local work="$1" status
  [ -d "$work/supabase" ] || die "not a stack folder: $work"
  status="$(cd "$work" && supabase status -o json 2>/dev/null)" || die "the stack in $work is not running"
  {
    echo "WORK=$(printf %q "$work")"
    echo "PROJECT_ID=$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$work/supabase/config.toml")"
    echo "API_URL=$(jq -er .API_URL <<<"$status")"
    echo "ANON_KEY=$(jq -er .ANON_KEY <<<"$status")"
    echo "SERVICE_ROLE_KEY=$(jq -er .SERVICE_ROLE_KEY <<<"$status")"
    echo "DB_URL=$(jq -er .DB_URL <<<"$status")"
    echo "APP_PORT=$APP_PORT"
  } > "$ENVF"
  chmod 600 "$ENVF"
  load
  echo "Stack $PROJECT_ID recorded (API $API_URL)."
}

need_memory() { # $1 = MB that must be available
  local avail; avail="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
  [ "$avail" -ge "$1" ] || die "only ${avail} MB of memory available, $1 MB needed. Wait and run again."
}

# serve [tests|pictures]: "tests" is the plain server CI runs; "pictures" is the same server with its clock standing
# still at the harness's moment (server-clock.cjs), which is what walk.mjs needs.
serve() {
  local mode="${1:-tests}" extra=()
  load
  if ss -ltn | grep -q ":$APP_PORT "; then
    if [ "$(cat "$STATE/server.mode" 2>/dev/null)" = "$mode" ]; then echo "App already answers on $APP_PORT ($mode)."; return 0; fi
    unserve
  fi
  [ -d "$ROOT/.next" ] || die "no build in $ROOT/.next (run: stack.sh build)"
  mkdir -p "$ROOT/.e2e-outbox"
  if [ "$mode" = pictures ]; then
    local now; now="$(cd "$ROOT" && node -e "import('./scripts/redesign/harness/lib.mjs').then((l) => console.log(l.HARNESS_NOW))")"
    extra=("RD_SERVER_NOW=$now" "NODE_OPTIONS=--require=$ROOT/scripts/redesign/harness/server-clock.cjs")
  fi
  # Started so that nothing of this script's own output is kept open by the server (a pipe after stack.sh would hang).
  ci_env
  ( cd "$ROOT" && exec env -i PATH="$PATH" HOME="$HOME" LANG="${LANG:-C.UTF-8}" TMPDIR="${TMPDIR:-/tmp}" \
      CI=1 E2E_PORT="$APP_PORT" "${CI_ENV[@]}" E2E_MAIL_OUTBOX="$ROOT/.e2e-outbox/outbox.jsonl" "${extra[@]}" \
      setsid nohup node node_modules/next/dist/bin/next start -p "$APP_PORT" ) > "$STATE/server.log" 2>&1 < /dev/null &
  echo "$mode" > "$STATE/server.mode"
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "http://localhost:$APP_PORT/login" 2>/dev/null; then echo "App answers on http://localhost:$APP_PORT"; return 0; fi
    sleep 1
  done
  die "the app did not answer on port $APP_PORT; see $STATE/server.log"
}

# Stops the app on the port, but only if it is the server of this checkout.
unserve() {
  local pid
  pid="$(ss -ltnpH "sport = :$APP_PORT" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)"
  rm -f "$STATE/server.pid" "$STATE/server.mode"
  if [ -z "$pid" ]; then echo "App not running."; return 0; fi
  [ "$(readlink -f "/proc/$pid/cwd")" = "$ROOT" ] || die "port $APP_PORT is held by a process that is not this checkout's server (pid $pid)"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 40); do ss -ltnH "sport = :$APP_PORT" | grep -q . || { echo "App stopped."; return 0; }; sleep 0.25; done
  die "the app on port $APP_PORT did not stop"
}

psql_c() { load; docker exec -i "$DBC" psql -v ON_ERROR_STOP=1 -q -U supabase_admin -d postgres "$@"; }

cmd="${1:-status}"; shift || true
case "$cmd" in
  up)
    need_memory 4500
    for f in .env.local .env .env.production .env.production.local; do
      [ ! -e "$ROOT/$f" ] || die "$ROOT/$f exists; e2e-local.sh would refuse."
    done
    ( cd "$ROOT" && TMPDIR="$STATE" E2E_KEEP_STACK=1 scripts/ci/e2e-local.sh tests/e2e/smoke.spec.ts ) 2>&1 | tee "$STATE/stack-up.log"
    "$0" adopt "$STATE/stack-up.log"
    "$0" serve
    ;;
  adopt)
    log="${1:?the log of e2e-local.sh}"
    work="$(sed -n 's/^Stack kept running: (cd \(.*\) && supabase stop --no-backup) to remove it\.$/\1/p' "$log" | tail -1)"
    [ -n "$work" ] || die "the log does not name a kept stack"
    record "$work"
    ;;
  serve) serve "${1:-tests}" ;;
  unserve) unserve ;;
  build)
    load; unserve; need_memory 3500
    ( cd "$ROOT" && run npm run build > "$STATE/build.log" 2>&1 ) || die "the build failed; see $STATE/build.log"
    ( cd "$ROOT" && git rev-parse HEAD > "$STATE/built-commit"; git status --porcelain | grep -v '^??' > "$STATE/built-dirty" || true )
    echo "Built $(cut -c1-9 "$STATE/built-commit")$([ -s "$STATE/built-dirty" ] && echo ' plus uncommitted changes')."
    serve
    ;;
  seed)
    load; ( cd "$ROOT" && run node scripts/ci/seed-e2e.mjs >/dev/null ) && echo "Seeded."
    ;;
  run) load; cd "$ROOT"; run "$@" ;;
  snapshot)
    name="${1:?a name}"; load
    out="$STATE/snapshots/$name.sql"
    docker exec "$DBC" pg_dump -U supabase_admin -d postgres --data-only --schema=public --schema=auth --schema=storage 2>"$STATE/snapshots/$name.log" > "$out.tmp"
    grep -q '^COPY ' "$out.tmp" || die "the snapshot is empty; see $STATE/snapshots/$name.log"
    mv "$out.tmp" "$out"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$STATE/snapshots/$name.time"
    # Materialized views are not in a data dump: remember which ones were filled.
    psql_c -At <<< "select format('%I.%I', schemaname, matviewname) from pg_matviews where schemaname = 'public' and ispopulated" > "$STATE/snapshots/$name.matviews"
    # The stored files themselves (pictures, PDFs) are not in the database: the database only holds, per file, which
    # version on the storage service's disk is the current one. Uploading a file again replaces that version, and a
    # database put back afterwards would point at a version that is gone (the file then answers with an error).
    docker exec "$STC" tar -C /mnt -cf - . > "$STATE/snapshots/$name.files.tar" || die "could not copy the stored files"
    echo "Snapshot $name: $(grep -c '^COPY ' "$out") tables, $(du -h "$out" | cut -f1), stored files $(du -h "$STATE/snapshots/$name.files.tar" | cut -f1), taken $(cat "$STATE/snapshots/$name.time")."
    ;;
  restore)
    name="${1:?a name}"; load
    f="$STATE/snapshots/$name.sql"; [ -f "$f" ] || die "no snapshot $name"
    unserve
    tables="$(sed -n 's/^COPY \([^ ]*\) (.*$/\1/p' "$f" | paste -sd, -)"
    { echo "BEGIN;"; echo "SET LOCAL session_replication_role = replica;"; echo "TRUNCATE $tables CASCADE;"; cat "$f"; echo "COMMIT;"; } \
      | psql_c >/dev/null
    # Materialized views: filled again if they were filled when the snapshot was taken, emptied if they were not.
    psql_c -At <<< "select format('%I.%I', schemaname, matviewname) from pg_matviews where schemaname = 'public'" | while read -r mv; do
      if grep -qxF "$mv" "$STATE/snapshots/$name.matviews" 2>/dev/null; then echo "REFRESH MATERIALIZED VIEW $mv;"; else echo "REFRESH MATERIALIZED VIEW $mv WITH NO DATA;"; fi
    done | psql_c >/dev/null
    # Fresh statistics now, so the database does not change its mind about how to read a table halfway through a run
    # (rows that tie in a list's order would then come back in another order).
    psql_c <<< "ANALYZE;" >/dev/null
    # The stored files of the snapshot, put back over what is there (versions made since stay on disk, unused).
    if [ -f "$STATE/snapshots/$name.files.tar" ]; then
      docker exec -i "$STC" tar -C /mnt -xf - < "$STATE/snapshots/$name.files.tar" || die "could not put the stored files back"
    else
      echo "NOTE: snapshot $name was taken without its stored files; files uploaded again since then will not answer."
    fi
    echo "$name" > "$STATE/restored"
    echo "Database put back to snapshot $name ($(cat "$STATE/snapshots/$name.time"))."
    [ "${2:-tests}" = none ] || serve "${2:-tests}"
    ;;
  fingerprint) # one checksum per table, as JSON: what a walk changed in the database shows as a changed checksum
    psql_c -At <<'SQL'
select json_object_agg(n, h) from (
  select format('%I.%I', schemaname, tablename) as n,
         (xpath('/row/h/text()', query_to_xml(format(
           'select md5(coalesce(string_agg(t::text, chr(10) order by t::text), '''')) as h from %I.%I t',
           schemaname, tablename), false, true, '')))[1]::text as h
  from pg_tables where schemaname in ('public', 'auth', 'storage')) x;
SQL
    ;;
  psql) psql_c "$@" ;;
  status)
    if [ -f "$ENVF" ]; then load; echo "Stack: $PROJECT_ID (folder $WORK)"; docker ps --format '{{.Names}} {{.Status}}' | grep -F -- "_$PROJECT_ID" || echo "  no containers running"; else echo "No stack recorded."; fi
    ss -ltn | grep -q ":$APP_PORT " && echo "App: answering on $APP_PORT ($(cat "$STATE/server.mode" 2>/dev/null || echo '?'))" || echo "App: not running"
    [ -f "$STATE/built-commit" ] && echo "Build: $(cut -c1-9 "$STATE/built-commit")$([ -s "$STATE/built-dirty" ] && echo ' plus uncommitted changes')"
    [ -f "$STATE/restored" ] && echo "Last restore: snapshot $(cat "$STATE/restored")"
    ls "$STATE/snapshots"/*.sql 2>/dev/null | sed 's/^/Snapshot: /' || true
    ;;
  down)
    load; unserve || true
    ( cd "$WORK" && supabase stop --no-backup >/dev/null 2>&1 ) || die "could not stop stack $PROJECT_ID (folder $WORK)"
    left_c="$(docker ps -aq --filter "label=com.supabase.cli.project=$PROJECT_ID" | wc -l)"
    left_v="$(docker volume ls -q | grep -cF -- "$PROJECT_ID" || true)"
    left_n="$(docker network ls --format '{{.Name}}' | grep -cF -- "$PROJECT_ID" || true)"
    echo "Stack $PROJECT_ID removed: containers $left_c, volumes $left_v, networks $left_n left."
    [ "$left_c$left_v$left_n" = "000" ] || die "stack $PROJECT_ID was not fully removed"
    rm -rf "$WORK"; mv "$ENVF" "$ENVF.removed"
    ;;
  *) die "unknown command: $cmd" ;;
esac
