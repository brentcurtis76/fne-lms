#!/usr/bin/env bash
# =============================================================================
# B3 round r2 — fail-on-mutant driver for supabase/tests/040-email-marketing-rls.sql
#
# Closes REVIEW-B3.md [B1] and [B2]. Round 1's suite stayed green under two
# security mutations Sol applied by hand, so this driver proves the r2 asserts
# actually bite: it applies each mutation to the LOCAL database, runs the full
# `supabase test db` gate, records the failing TAP lines, restores, and re-runs.
#
# Two mutation families:
#   ACL   — GRANT statements that widen the privilege posture without changing
#           any privilege NAME an old-style pin would compare.
#   CHECK — the two-shape identity constraint re-added with exactly one term
#           removed, once per term. The original definition is captured from
#           pg_get_constraintdef() before anything is touched and compared
#           byte-for-byte after each restore, so a botched restore cannot be
#           mistaken for a surviving mutant.
#
# LOCAL ONLY. It mutates the throwaway `supabase start` database and never the
# migration file, and the round ends with `supabase db reset` regardless.
#
# Usage (from the worktree root):  bash docs/plan/evidence/b3/mutation-driver-r2.sh
# =============================================================================
set -uo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_sxlogxqzmarhqsblxmtj}"
CONSTRAINT="email_contacts_identity_shape_check"

psql_run() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"
}

psql_val() {
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -tAc "$1"
}

# --- baseline capture ---------------------------------------------------------
ORIGINAL_DEF="$(psql_val "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '${CONSTRAINT}';")"
if [ -z "$ORIGINAL_DEF" ]; then
  echo "FATAL: ${CONSTRAINT} not found — reset the database first (supabase db reset)." >&2
  exit 1
fi

ACL_BASELINE="$(psql_val "
  SELECT string_agg(e, ' | ' ORDER BY e) FROM (
    SELECT DISTINCT c.relname || ' ' ||
           (CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) || ' ' ||
           a.privilege_type || CASE WHEN a.is_grantable THEN '*' ELSE '' END AS e
      FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname LIKE 'email\\_%'
  ) s;")"

# The two arms of the identity CHECK, one term per array element. A mutant is
# the same expression with a single element dropped.
LIVE_TERMS=(
  "anonymized_at IS NULL"
  "email IS NOT NULL"
  "email_normalized IS NOT NULL"
  "email_normalized = lower(btrim(email))"
  "email_normalized <> ''"
  "unsubscribe_token IS NOT NULL"
)
ANON_TERMS=(
  "anonymized_at IS NOT NULL"
  "email IS NULL"
  "email_normalized IS NULL"
  "first_name IS NULL"
  "last_name IS NULL"
  "organization IS NULL"
  "basis_note IS NULL"
  "unsubscribe_token IS NULL"
)

join_terms() {
  local out="" t
  for t in "$@"; do
    if [ -z "$out" ]; then out="$t"; else out="$out AND $t"; fi
  done
  printf '%s' "$out"
}

# build_mutant <arm: live|anon> <index-to-drop>
build_mutant() {
  local arm="$1" drop="$2" i kept=() live anon
  if [ "$arm" = "live" ]; then
    for i in "${!LIVE_TERMS[@]}"; do
      [ "$i" -eq "$drop" ] && continue
      kept+=("${LIVE_TERMS[$i]}")
    done
    live="$(join_terms "${kept[@]}")"
    anon="$(join_terms "${ANON_TERMS[@]}")"
  else
    for i in "${!ANON_TERMS[@]}"; do
      [ "$i" -eq "$drop" ] && continue
      kept+=("${ANON_TERMS[$i]}")
    done
    live="$(join_terms "${LIVE_TERMS[@]}")"
    anon="$(join_terms "${kept[@]}")"
  fi
  printf 'CHECK (( %s ) OR ( %s ))' "$live" "$anon"
}

# --- gate runner --------------------------------------------------------------
SUITE_OUT="$(mktemp)"

# `supabase test db` shells out to pg_prove, whose failure diagnostics are
# `# Failed test N: "<description>"` followed by have/want, and whose verdict is
# the trailing `Result: PASS|FAIL`. Both are captured verbatim.
run_suite() {
  npm run test:db >"$SUITE_OUT" 2>&1
  grep -E '^(# Failed test|#[[:space:]]+(have|want):|# Looks like|Result:)' "$SUITE_OUT" || true
}

# report_probe <label> <mutation> [expect: red|green]  — default red.
report_probe() {
  local label="$1" mutation="$2" expect="${3:-red}" out n verdict
  out="$(run_suite)"
  n="$(printf '%s\n' "$out" | grep -c '^# Failed test' || true)"
  verdict="$(printf '%s\n' "$out" | grep '^Result:' | tail -1)"
  echo "### ${label}"
  echo "mutation: ${mutation}"
  if [ "$expect" = "green" ]; then
    if [ "$n" -eq 0 ]; then
      echo "green as expected (${verdict})"
    else
      echo "UNEXPECTED FAILURE — the unmutated schema is not green (${verdict})"
      printf '%s\n' "$out" | grep -E '^(# Failed test|#[[:space:]]+(have|want):)'
    fi
  elif [ "$n" -eq 0 ]; then
    echo "SURVIVED — the suite stayed green (${verdict}). This mutation is NOT killed."
  else
    echo "killed: ${n} assert(s) failed (${verdict})"
    printf '%s\n' "$out" | grep -E '^(# Failed test|#[[:space:]]+(have|want):)'
  fi
  echo
}

verify_restored() {
  local label="$1" def acl
  def="$(psql_val "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '${CONSTRAINT}';")"
  acl="$(psql_val "
    SELECT string_agg(e, ' | ' ORDER BY e) FROM (
      SELECT DISTINCT c.relname || ' ' ||
             (CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END) || ' ' ||
             a.privilege_type || CASE WHEN a.is_grantable THEN '*' ELSE '' END AS e
        FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relname LIKE 'email\\_%'
    ) s;")"
  if [ "$def" != "$ORIGINAL_DEF" ]; then
    echo "FATAL after ${label}: constraint definition did not restore byte-for-byte." >&2
    exit 1
  fi
  if [ "$acl" != "$ACL_BASELINE" ]; then
    echo "FATAL after ${label}: ACL did not restore to baseline." >&2
    exit 1
  fi
}

MIGRATION_HEAD_BEFORE="$(psql_val "SELECT max(version) FROM supabase_migrations.schema_migrations;")"

echo "# B3 r2 — fail-on-mutant evidence"
echo "# container: ${DB_CONTAINER}"
echo "# server:    $(psql_val "SELECT version();")"
echo "# migration head: ${MIGRATION_HEAD_BEFORE} (must be 20260803170000 — the local stack is shared"
echo "#   between worktrees, and a reset run from a branch without this migration silently"
echo "#   drops the five tables mid-run; the head is re-checked at the end)"
echo "# baseline constraint: ${ORIGINAL_DEF}"
echo
echo "## Baseline — unmutated schema"
report_probe "M0 — no mutation (baseline)" "(none)" green

# =============================================================================
# ACL mutations — REVIEW-B3.md [B1]
# =============================================================================
echo "## ACL mutations — REVIEW-B3.md [B1]"

# Sol's mutation 1, verbatim.
psql_run -c "GRANT SELECT ON public.email_contacts TO authenticated WITH GRANT OPTION;"
report_probe "M-A1 — authenticated's SELECT becomes re-grantable (Sol's mutation 1, verbatim)" \
  "GRANT SELECT ON public.email_contacts TO authenticated WITH GRANT OPTION;"
psql_run -c "REVOKE GRANT OPTION FOR SELECT ON public.email_contacts FROM authenticated;"
verify_restored "M-A1"

# Sol's mutation 2, verbatim.
psql_run -c "GRANT REFERENCES ON public.email_contacts TO PUBLIC;"
report_probe "M-A2 — REFERENCES reaches anon through PUBLIC (Sol's mutation 2, verbatim)" \
  "GRANT REFERENCES ON public.email_contacts TO PUBLIC;"
psql_run -c "REVOKE REFERENCES ON public.email_contacts FROM PUBLIC;"
verify_restored "M-A2"

# The prompt's variant: SELECT to PUBLIC.
psql_run -c "GRANT SELECT ON public.email_suppression TO PUBLIC;"
report_probe "M-A3 — SELECT on the tombstones granted to PUBLIC" \
  "GRANT SELECT ON public.email_suppression TO PUBLIC;"
psql_run -c "REVOKE SELECT ON public.email_suppression FROM PUBLIC;"
verify_restored "M-A3"

# Grantability is asserted for every holder, not just authenticated.
psql_run -c "GRANT INSERT ON public.email_suppression TO service_role WITH GRANT OPTION;"
report_probe "M-A4 — service_role's INSERT on the tombstones becomes re-grantable" \
  "GRANT INSERT ON public.email_suppression TO service_role WITH GRANT OPTION;"
psql_run -c "REVOKE GRANT OPTION FOR INSERT ON public.email_suppression FROM service_role;"
verify_restored "M-A4"

# =============================================================================
# Identity CHECK mutations — REVIEW-B3.md [B2], one term at a time
# =============================================================================
echo "## Identity CHECK mutations — REVIEW-B3.md [B2] (one term dropped per probe)"

mutate_check() {
  local label="$1" arm="$2" idx="$3" term="$4" mutant
  mutant="$(build_mutant "$arm" "$idx")"
  psql_run -c "ALTER TABLE public.email_contacts DROP CONSTRAINT ${CONSTRAINT};"
  psql_run -c "ALTER TABLE public.email_contacts ADD CONSTRAINT ${CONSTRAINT} ${mutant};"
  report_probe "$label" "identity CHECK re-added without \`${term}\` (${arm} arm)"
  psql_run -c "ALTER TABLE public.email_contacts DROP CONSTRAINT ${CONSTRAINT};"
  psql_run -c "ALTER TABLE public.email_contacts ADD CONSTRAINT ${CONSTRAINT} ${ORIGINAL_DEF};"
  verify_restored "$label"
}

n=1
for i in "${!ANON_TERMS[@]}"; do
  mutate_check "M-C${n} — anonymized arm drops \`${ANON_TERMS[$i]}\`" anon "$i" "${ANON_TERMS[$i]}"
  n=$((n + 1))
done

for i in "${!LIVE_TERMS[@]}"; do
  mutate_check "M-C${n} — live arm drops \`${LIVE_TERMS[$i]}\`" live "$i" "${LIVE_TERMS[$i]}"
  n=$((n + 1))
done

# =============================================================================
# Disagreement census for the live arm's two `IS NOT NULL` guards.
#
# These two terms LOOK redundant beside their sibling
# `email_normalized = lower(btrim(email))` — if either side is NULL that
# comparison is NULL, so the guard seems to add nothing. That reading is wrong,
# and this census is what proved it: a CHECK constraint rejects a row only when
# its expression is FALSE; a NULL result ADMITS the row. Dropping either guard
# turns the arm from false to NULL for the half-identified shapes, which means
# the mutant COMMITS rows the shipped constraint rejects.
#
# The census enumerates a candidate grid and counts the rows on which each
# mutant disagrees with the original, then prints the disagreeing shapes. A
# count of zero would mean a genuinely equivalent mutant (unkillable, and not a
# proof gap); a non-zero count is a live exposure and names the fixture needed
# to kill it. It found 3 and 5 respectively, which is where the two
# half-identified live cases in the suite came from.
# =============================================================================
echo "## Disagreement census — do the live arm's two IS NOT NULL guards do real work?"

EQUIV_SQL="
WITH grid AS (
  SELECT e.v AS email, n.v AS email_normalized, a.v AS anonymized_at, t.v AS unsubscribe_token
    FROM (VALUES (NULL::text), (''), ('   '), ('A@B.C'), ('a@b.c'), (' a@b.c ')) e(v)
   CROSS JOIN (VALUES (NULL::text), (''), ('a@b.c'), ('A@B.C'), ('x')) n(v)
   CROSS JOIN (VALUES (NULL::timestamptz), (now())) a(v)
   CROSS JOIN (VALUES (NULL::uuid), ('77777777-0000-0000-0000-0000000000ff'::uuid)) t(v)
), evaluated AS (
  SELECT
    -- the live arm as shipped
    (anonymized_at IS NULL AND email IS NOT NULL AND email_normalized IS NOT NULL
     AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
     AND unsubscribe_token IS NOT NULL) AS original,
    -- mutant M-C10: \`email IS NOT NULL\` dropped
    (anonymized_at IS NULL AND email_normalized IS NOT NULL
     AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
     AND unsubscribe_token IS NOT NULL) AS without_email_not_null,
    -- mutant M-C11: \`email_normalized IS NOT NULL\` dropped
    (anonymized_at IS NULL AND email IS NOT NULL
     AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
     AND unsubscribe_token IS NOT NULL) AS without_normalized_not_null
  FROM grid
)
SELECT count(*) || ' candidate rows; '
       || count(*) FILTER (WHERE original IS DISTINCT FROM without_email_not_null)
       || ' disagree with M-C10; '
       || count(*) FILTER (WHERE original IS DISTINCT FROM without_normalized_not_null)
       || ' disagree with M-C11; '
       || count(*) FILTER (WHERE original) || ' rows satisfy the live arm (grid is not vacuous)'
  FROM evaluated;"

echo "census (a CHECK rejects only on FALSE — a NULL result ADMITS the row):"
echo "  $(psql_val "$EQUIV_SQL")"
echo "disagreeing shapes (original=false → rejected; mutant=NULL → admitted):"
psql_val "
WITH grid AS (
  SELECT e.v AS email, n.v AS email_normalized, a.v AS anonymized_at, t.v AS unsubscribe_token
    FROM (VALUES (NULL::text), (''), ('   '), ('A@B.C'), ('a@b.c'), (' a@b.c ')) e(v)
   CROSS JOIN (VALUES (NULL::text), (''), ('a@b.c'), ('A@B.C'), ('x')) n(v)
   CROSS JOIN (VALUES (NULL::timestamptz), (now())) a(v)
   CROSS JOIN (VALUES (NULL::uuid), ('77777777-0000-0000-0000-0000000000ff'::uuid)) t(v)
)
SELECT DISTINCT 'mutant=' || m || '  email=' || coalesce(quote_literal(email), 'NULL')
       || '  email_normalized=' || coalesce(quote_literal(email_normalized), 'NULL')
  FROM grid,
  LATERAL (VALUES
    ('M-C10',
     (anonymized_at IS NULL AND email IS NOT NULL AND email_normalized IS NOT NULL
      AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
      AND unsubscribe_token IS NOT NULL),
     (anonymized_at IS NULL AND email_normalized IS NOT NULL
      AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
      AND unsubscribe_token IS NOT NULL)),
    ('M-C11',
     (anonymized_at IS NULL AND email IS NOT NULL AND email_normalized IS NOT NULL
      AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
      AND unsubscribe_token IS NOT NULL),
     (anonymized_at IS NULL AND email IS NOT NULL
      AND email_normalized = lower(btrim(email)) AND email_normalized <> ''
      AND unsubscribe_token IS NOT NULL))
  ) AS v(m, orig, mut)
 WHERE orig IS DISTINCT FROM mut
 ORDER BY 1;" | sed 's/^/  /'
echo

# =============================================================================
echo "## Final state — schema restored"
report_probe "M-Z — restored schema (constraint and ACL byte-identical to baseline)" "(reverted)" green
echo "# restored constraint: $(psql_val "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '${CONSTRAINT}';")"

MIGRATION_HEAD_AFTER="$(psql_val "SELECT max(version) FROM supabase_migrations.schema_migrations;")"
echo "# migration head at start: ${MIGRATION_HEAD_BEFORE}"
echo "# migration head at end:   ${MIGRATION_HEAD_AFTER}"
if [ "$MIGRATION_HEAD_BEFORE" != "$MIGRATION_HEAD_AFTER" ]; then
  echo "FATAL: the shared local stack was re-migrated by another session mid-run — this evidence is void." >&2
  exit 1
fi

rm -f "$SUITE_OUT"
