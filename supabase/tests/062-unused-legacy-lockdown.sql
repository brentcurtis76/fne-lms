-- =============================================================================
-- 062-unused-legacy-lockdown.sql — W-B2b-01 (lote B2b): the fourteen
-- repository-unused legacy tables are fully locked down by migration
-- 20260827170000_lockdown_unused_legacy_tables.sql.
--
-- Mechanically generated, table-by-table (and per operation where the gate
-- demands it) from one canonical probe list:
--   1. governance guards — exactly the approved fourteen tables; no B2c
--      learning-path table and no B10a referenced table is asserted here
--   2. RLS is enabled on every table
--   3. final-state policy shape: zero PERMISSIVE policies, and exactly one
--      policy per table — the repository-required restrictive
--      authentication-boundary guard (forced_password_change_guard,
--      AS RESTRICTIVE, FOR ALL, TO authenticated only, USING / WITH CHECK
--      calling password_change_gate_ok()). A restrictive policy grants
--      nothing; with zero grants and zero permissive policies the lockdown
--      is deny-by-default and the boundary stays uniform (see 053)
--   4. ACL layer: PUBLIC, anon and authenticated hold no SELECT / INSERT /
--      UPDATE / DELETE table privilege (has_table_privilege also folds in
--      anything inherited via PUBLIC)
--   5. real operations: SELECT / INSERT / UPDATE / DELETE issued by anon and
--      by an authenticated user fail with 42501 "permission denied" — the ACL
--      denial fires before any constraint, so the expected failure is uniform
--      across all fourteen tables and all four operations
--   6. service_role retains its SELECT / INSERT / UPDATE / DELETE table
--      privileges (baseline GRANT ALL untouched; service_role bypasses RLS)
--   7. RLS is still enabled on every table after the denial probes
--
-- Synthetic/local state only. The transaction rolls back — safe to run
-- repeatedly against a local database. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(479);

-- ----------------------------------------------------------------------------
-- Canonical probe list — the approved W-B2b-01 set, exactly these fourteen
-- (work-item gate_salida list; scripts/check-ledger.mjs pins the same set by
-- exact equality). upd_col names a real column per table so the UPDATE probes
-- are valid SQL that reaches the ACL check.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE w_b2b01_tables (tbl, upd_col) AS VALUES
  ('answers',              'text'),
  ('assignments',          'instructions'),
  ('course_prerequisites', 'is_required'),
  ('deleted_blocks',       'title'),
  ('deleted_courses',      'title'),
  ('deleted_lessons',      'title'),
  ('deleted_modules',      'title'),
  ('menu_permissions',     'can_view'),
  ('metadata_sync_log',    'sync_status'),
  ('profiles_role_backup', 'role'),
  ('questions',            'text'),
  ('quizzes',              'title'),
  ('student_answers',      'is_correct'),
  ('submissions',          'notes');

-- The impersonated roles must be able to read the probe list itself
-- (temp table, dies with the transaction).
GRANT SELECT ON w_b2b01_tables TO anon, authenticated;

CREATE TEMP TABLE w_b2b01_ops (op) AS VALUES
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE');

-- ----------------------------------------------------------------------------
-- 1. Governance guards (2)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM w_b2b01_tables),
  14,
  'W-B2b-01 probe set contains exactly fourteen tables');

SELECT is(
  (SELECT count(*)::int FROM w_b2b01_tables
    WHERE tbl = ANY (ARRAY[
      'learning_paths', 'learning_path_courses',
      'group_assignment_discussions', 'growth_community_transformation_access',
      'instructors', 'modules', 'propuesta_rate_limits', 'qa_tester_time_logs'
    ]::text[])),
  0,
  'probe set asserts nothing about B2c learning-path tables or B10a referenced tables');

-- ----------------------------------------------------------------------------
-- 2. RLS enabled, per table (14)
-- ----------------------------------------------------------------------------
SELECT tests.rls_enabled('public', tbl) FROM w_b2b01_tables ORDER BY tbl;

-- ----------------------------------------------------------------------------
-- 3. Final-state policy shape, per table (8 x 14 = 112): exactly one policy —
--    the restrictive authentication-boundary guard — and zero permissive
--    policies. Scalar lookups use aggregates so a wrong policy count fails the
--    matching assertion instead of erroring the file.
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl),
  1,
  format('public.%s carries exactly one final-state policy', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT is(
  (SELECT min(p.policyname) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl),
  'forced_password_change_guard',
  format('the policy on public.%s is forced_password_change_guard', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT is(
  (SELECT min(p.permissive) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl
      AND p.policyname = 'forced_password_change_guard'),
  'RESTRICTIVE',
  format('the guard on public.%s is RESTRICTIVE, not permissive', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT is(
  (SELECT min(p.cmd) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl
      AND p.policyname = 'forced_password_change_guard'),
  'ALL',
  format('the guard on public.%s is FOR ALL', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT is(
  (SELECT min(p.roles::text) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl
      AND p.policyname = 'forced_password_change_guard'),
  '{authenticated}',
  format('the guard on public.%s targets exactly authenticated (not anon, not service_role)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT ok(
  (SELECT bool_and(p.qual LIKE '%password_change_gate_ok()%') FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl
      AND p.policyname = 'forced_password_change_guard'),
  format('the guard USING on public.%s calls password_change_gate_ok()', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT ok(
  (SELECT bool_and(p.with_check LIKE '%password_change_gate_ok()%') FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl
      AND p.policyname = 'forced_password_change_guard'),
  format('the guard WITH CHECK on public.%s calls password_change_gate_ok()', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT is(
  (SELECT count(*)::int FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = t.tbl
      AND p.permissive = 'PERMISSIVE'),
  0,
  format('public.%s has no permissive policy (nothing grants access back)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

-- ----------------------------------------------------------------------------
-- 4. ACL layer, per table x operation (3 roles x 56 = 168)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM information_schema.table_privileges tp
    WHERE tp.table_schema = 'public' AND tp.table_name = t.tbl
      AND tp.grantee = 'PUBLIC' AND tp.privilege_type = o.op),
  0,
  format('PUBLIC holds no %s privilege on public.%s', o.op, t.tbl))
FROM w_b2b01_tables t CROSS JOIN w_b2b01_ops o ORDER BY t.tbl, o.op;

SELECT ok(
  NOT has_table_privilege('anon', format('public.%I', t.tbl), o.op),
  format('anon holds no %s privilege on public.%s', o.op, t.tbl))
FROM w_b2b01_tables t CROSS JOIN w_b2b01_ops o ORDER BY t.tbl, o.op;

SELECT ok(
  NOT has_table_privilege('authenticated', format('public.%I', t.tbl), o.op),
  format('authenticated holds no %s privilege on public.%s', o.op, t.tbl))
FROM w_b2b01_tables t CROSS JOIN w_b2b01_ops o ORDER BY t.tbl, o.op;

-- ----------------------------------------------------------------------------
-- 6. service_role retains its required table privileges (56)
--    (checked before the denial probes; RLS re-checked after them in §7)
-- ----------------------------------------------------------------------------
SELECT ok(
  has_table_privilege('service_role', format('public.%I', t.tbl), o.op),
  format('service_role retains %s privilege on public.%s', o.op, t.tbl))
FROM w_b2b01_tables t CROSS JOIN w_b2b01_ops o ORDER BY t.tbl, o.op;

-- ----------------------------------------------------------------------------
-- Impersonation helper (house style; authenticated uses the tests.* helpers)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 5a. Real operations as anon: every table x operation is rejected with the
--     expected authorization failure (4 x 14 = 56)
-- ----------------------------------------------------------------------------
SELECT pg_temp.set_anon();

SELECT throws_ok(
  format('SELECT count(*) FROM public.%I', t.tbl),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('anon: SELECT on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT throws_ok(
  format('INSERT INTO public.%I DEFAULT VALUES', t.tbl),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('anon: INSERT on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT throws_ok(
  format('UPDATE public.%I SET %I = %I', t.tbl, t.upd_col, t.upd_col),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('anon: UPDATE on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT throws_ok(
  format('DELETE FROM public.%I', t.tbl),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('anon: DELETE on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 5b. Real operations as an authenticated user: every table x operation is
--     rejected with the expected authorization failure (1 fixture + 56)
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT tests.create_supabase_user('w_b2b01_locked_probe') $$,
  'fixture: synthetic authenticated user created for the denial probes');

SELECT tests.authenticate_as('w_b2b01_locked_probe');

SELECT throws_ok(
  format('SELECT count(*) FROM public.%I', t.tbl),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('authenticated: SELECT on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT throws_ok(
  format('INSERT INTO public.%I DEFAULT VALUES', t.tbl),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('authenticated: INSERT on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT throws_ok(
  format('UPDATE public.%I SET %I = %I', t.tbl, t.upd_col, t.upd_col),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('authenticated: UPDATE on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT throws_ok(
  format('DELETE FROM public.%I', t.tbl),
  '42501',
  format('permission denied for table %s', t.tbl),
  format('authenticated: DELETE on public.%s denied (42501)', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 7. RLS is still enabled on every table after the denial probes (14)
-- ----------------------------------------------------------------------------
SELECT ok(
  (SELECT c.relrowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t.tbl AND c.relkind = 'r'),
  format('RLS remains enabled on public.%s after the denial probes', t.tbl))
FROM w_b2b01_tables t ORDER BY t.tbl;

SELECT * FROM finish();

ROLLBACK;
