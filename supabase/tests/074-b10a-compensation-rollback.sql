-- =============================================================================
-- 074-b10a-compensation-rollback.sql — W-B10a-01 gate clause C4 (B10A-G2).
--
-- Proves the operator compensation artifact
--   supabase/compensation/20261001180000_b10a_restore_authenticated_reads.sql
-- restores the reads B10a narrowed, and nothing else:
--   1. before: an authenticated outsider reads none of the fixture rows
--   2. the artifact's own SQL runs (embedded verbatim between the markers;
--      __tests__/supabase/b10a-compensation-sync.test.ts fails if it drifts —
--      `supabase test db` mounts only supabase/tests, so `\ir` cannot reach it)
--   3. after: the outsider reads them; writes are still refused; a flagged
--      (must_change_password) account still reads nothing (the restrictive
--      guard holds); anon / PUBLIC hold nothing; row security stays on; the
--      new policies are SELECT-only, TO authenticated, permissive
--   4. re-running a block is a no-op (idempotent)
--   5. instructors and propuesta_rate_limits are untouched
--
-- Synthetic/local state only. Rolls back: this is the "rollback-only" proof
-- Brent's decision 94d02887658014cb asked for. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(33);

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

CREATE OR REPLACE FUNCTION pg_temp.rows_affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.visible() RETURNS TABLE (tbl text, n int)
LANGUAGE sql AS $$
  SELECT 'group_assignment_discussions', count(*)::int FROM public.group_assignment_discussions WHERE id::text LIKE '74000000-%'
  UNION ALL SELECT 'growth_community_transformation_access', count(*)::int FROM public.growth_community_transformation_access WHERE growth_community_id::text LIKE '74000000-%'
  UNION ALL SELECT 'modules', count(*)::int FROM public.modules WHERE id::text LIKE '74000000-%'
  UNION ALL SELECT 'qa_tester_time_logs', count(*)::int FROM public.qa_tester_time_logs WHERE tester_id = pg_temp.uid('b10c_tester')
$$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('b10c_admin');
SELECT tests.create_supabase_user('b10c_member');    -- in the group: creates the thread
SELECT tests.create_supabase_user('b10c_tester');    -- owns the QA time log
SELECT tests.create_supabase_user('b10c_outsider');  -- docente of another school, no memberships
SELECT tests.create_supabase_user('b10c_flagged');   -- must change password

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved', k = 'b10c_flagged'
  FROM unnest(ARRAY['b10c_admin','b10c_member','b10c_tester','b10c_outsider','b10c_flagged']) k
ON CONFLICT (id) DO UPDATE SET must_change_password = EXCLUDED.must_change_password;

INSERT INTO public.schools (id, name) VALUES (9741, 'B10a comp school (pgTAP 074)'), (9742, 'B10a comp other school (pgTAP 074)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name)
VALUES ('74000000-0000-4000-8000-00000000c001', 9741, 'B10a comp community');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('b10c_admin'),    'admin',   NULL, NULL, true),
  (pg_temp.uid('b10c_member'),   'docente', 9741, '74000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('b10c_tester'),   'docente', 9741, NULL, true),
  (pg_temp.uid('b10c_outsider'), 'docente', 9742, NULL, true),
  (pg_temp.uid('b10c_flagged'),  'docente', 9742, NULL, true);

INSERT INTO public.instructors (id, full_name, bio)
VALUES ('74000000-0000-4000-8000-00000000f001', 'B10a comp instructor', 'synthetic');
INSERT INTO public.courses (id, title, description, instructor_id)
VALUES ('74000000-0000-4000-8000-000000000c01', 'B10a comp course', 'nobody is enrolled', '74000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number)
VALUES ('74000000-0000-4000-8000-00000000e001', '74000000-0000-4000-8000-000000000c01', 'B10a comp module', 1);

INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id)
VALUES ('74000000-0000-4000-8000-00000000b001', 'b10c-assignment', '74000000-0000-4000-8000-00000000c001', 'B10a comp group', 9741);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id)
VALUES ('74000000-0000-4000-8000-00000000b001', 'b10c-assignment', pg_temp.uid('b10c_member'));
INSERT INTO public.message_threads (id, thread_title, created_by, workspace_id)
VALUES ('74000000-0000-4000-8000-00000000d101', 'B10a comp thread', pg_temp.uid('b10c_member'), NULL);
INSERT INTO public.group_assignment_discussions (id, assignment_id, group_id, thread_id)
VALUES ('74000000-0000-4000-8000-00000000d001', 'b10c-assignment', '74000000-0000-4000-8000-00000000b001', '74000000-0000-4000-8000-00000000d101');

INSERT INTO public.growth_community_transformation_access (growth_community_id, assigned_by, is_active)
VALUES ('74000000-0000-4000-8000-00000000c001', pg_temp.uid('b10c_admin'), true);

INSERT INTO public.qa_tester_time_logs (tester_id, date, total_seconds)
VALUES (pg_temp.uid('b10c_tester'), current_date, 60);

-- ----------------------------------------------------------------------------
-- 1. Before compensation: the outsider reads none of the four (4)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('b10c_outsider');
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = t), 0, 'before: outsider reads no ' || t || ' fixture row')
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 2. Apply the artifact (as the database owner) — verbatim copy
-- ----------------------------------------------------------------------------
-- BEGIN COMPENSATION
-- ---- public.group_assignment_discussions -------------------------------------------------------
DO $compensation$
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'group_assignment_discussions') THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions does not have row security on; stop and investigate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'group_assignment_discussions'
                    AND policyname = 'b10a_compensation_authenticated_read') THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.group_assignment_discussions
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  END IF;
END
$compensation$;

-- ---- public.growth_community_transformation_access -------------------------------------------------------
DO $compensation$
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'growth_community_transformation_access') THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access does not have row security on; stop and investigate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'growth_community_transformation_access'
                    AND policyname = 'b10a_compensation_authenticated_read') THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.growth_community_transformation_access
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  END IF;
END
$compensation$;

-- ---- public.modules -------------------------------------------------------
DO $compensation$
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'modules') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules does not have row security on; stop and investigate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'modules'
                    AND policyname = 'b10a_compensation_authenticated_read') THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.modules
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  END IF;
END
$compensation$;

-- ---- public.qa_tester_time_logs -------------------------------------------------------
DO $compensation$
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'qa_tester_time_logs') THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs does not have row security on; stop and investigate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'qa_tester_time_logs'
                    AND policyname = 'b10a_compensation_authenticated_read') THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.qa_tester_time_logs
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  END IF;
END
$compensation$;
-- END COMPENSATION

-- ----------------------------------------------------------------------------
-- 3a. Catalog after (4 tables × 4 = 16, + 2 untouched = 18)
-- ----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t AND policyname = 'b10a_compensation_authenticated_read'
      AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[] AND permissive = 'PERMISSIVE' AND qual = 'true'),
  1, t || ': exactly one SELECT-only, TO authenticated, permissive compensation policy')
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT tests.rls_enabled('public', t)
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = t AND policyname = 'forced_password_change_guard' AND permissive = 'RESTRICTIVE'),
  1, t || ': restrictive forced_password_change_guard still present')
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT ok(
  NOT has_table_privilege('anon', 'public.' || t, 'SELECT'),
  t || ': anon still has no SELECT privilege')
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('instructors', 'propuesta_rate_limits')
      AND policyname = 'b10a_compensation_authenticated_read'),
  0, 'instructors and propuesta_rate_limits get no compensation policy');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.propuesta_rate_limits', 'SELECT'),
  'propuesta_rate_limits stays closed to authenticated');

-- ----------------------------------------------------------------------------
-- 3b. The outsider reads again, and still cannot write (4 + 4 = 8)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('b10c_outsider');
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = t), 1, 'after: outsider reads the ' || t || ' fixture row')
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT is(pg_temp.rows_affected($$UPDATE public.modules SET title = 'rogue' WHERE id = '74000000-0000-4000-8000-00000000e001'$$), 0, 'after: outsider still cannot update a module');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.qa_tester_time_logs WHERE tester_id = pg_temp.uid('b10c_tester')$$), 0, 'after: outsider still cannot delete a QA time log');
SELECT is(pg_temp.rows_affected($$UPDATE public.growth_community_transformation_access SET is_active = false WHERE growth_community_id = '74000000-0000-4000-8000-00000000c001'$$), 0, 'after: outsider still cannot revoke transformation access');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, thread_id) VALUES ('rogue', '74000000-0000-4000-8000-00000000b001', '74000000-0000-4000-8000-00000000d101')$$, '42501', NULL, 'after: outsider still cannot create a discussion mapping');

-- ----------------------------------------------------------------------------
-- 3c. A flagged account still reads nothing: the guard is ANDed on top (1)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('b10c_flagged');
SELECT is((SELECT sum(n)::int FROM pg_temp.visible()), 0, 'after: a must-change-password account still reads none of the four');
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 4. Idempotent: re-running a block changes nothing (2)
-- ----------------------------------------------------------------------------
SELECT lives_ok($rerun$
DO $compensation$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'modules'
                    AND policyname = 'b10a_compensation_authenticated_read') THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.modules
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  END IF;
END
$compensation$;
$rerun$, 're-running the modules block raises nothing');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND policyname = 'b10a_compensation_authenticated_read'),
  4, 'still exactly four compensation policies');

-- 4 (before) + 18 (catalog) + 8 (outsider) + 1 (flagged) + 2 (idempotent) = 33
SELECT * FROM finish();

ROLLBACK;
