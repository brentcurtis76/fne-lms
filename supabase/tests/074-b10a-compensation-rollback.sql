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
--   3. after: the outsider reads the three unaffected tables; the later
--      approved group-private restrictive boundary still denies discussion
--      mappings even when legacy permissive compensation is activated.
--      Writes are still refused; a flagged
--      (must_change_password) account still reads nothing (the restrictive
--      guard holds); anon / PUBLIC hold nothing; row security stays on; the
--      new policies are SELECT-only, TO authenticated, permissive
--   4. re-running the whole artifact is a no-op (idempotent)
--   5. the later W-B10a-02 school boundary still holds
--   6. stand-down (ALTER POLICY … USING (false)) works, a re-run then raises,
--      and ALTER POLICY … USING (true) reactivates it
--   instructors and propuesta_rate_limits are untouched throughout
--
-- Synthetic/local state only. Rolls back: this is the "rollback-only" proof
-- Brent's decision 94d02887658014cb asked for. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(38);

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
SELECT tests.create_supabase_user('b10c_directivo_same');   -- equipo_directivo of school 9741
SELECT tests.create_supabase_user('b10c_directivo_other');  -- equipo_directivo of school 9742

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved', k = 'b10c_flagged'
  FROM unnest(ARRAY['b10c_admin','b10c_member','b10c_tester','b10c_outsider','b10c_flagged','b10c_directivo_same','b10c_directivo_other']) k
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
  (pg_temp.uid('b10c_flagged'),  'docente', 9742, NULL, true),
  (pg_temp.uid('b10c_directivo_same'),  'equipo_directivo', 9741, NULL, true),
  (pg_temp.uid('b10c_directivo_other'), 'equipo_directivo', 9742, NULL, true);

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
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 2. Apply the artifact (as the database owner) — verbatim copy
-- ----------------------------------------------------------------------------
-- BEGIN COMPENSATION
-- ---- public.group_assignment_discussions ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'group_assignment_discussions') THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'group_assignment_discussions'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.group_assignment_discussions
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.group_assignment_discussions USING (true);';
  END IF;
END
$compensation$;

-- ---- public.growth_community_transformation_access ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'growth_community_transformation_access') THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'growth_community_transformation_access'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.growth_community_transformation_access
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.growth_community_transformation_access USING (true);';
  END IF;
END
$compensation$;

-- ---- public.modules ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'modules') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'modules'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.modules
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.modules has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.modules USING (true);';
  END IF;
END
$compensation$;

-- ---- public.qa_tester_time_logs ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'qa_tester_time_logs') THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'qa_tester_time_logs'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.qa_tester_time_logs
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.qa_tester_time_logs USING (true);';
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
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = t),
  CASE WHEN t = 'group_assignment_discussions' THEN 0 ELSE 1 END,
  CASE WHEN t = 'group_assignment_discussions'
    THEN 'after: legacy compensation cannot override the later approved group-private boundary'
    ELSE 'after: outsider reads the ' || t || ' fixture row' END)
  FROM unnest(ARRAY['group_assignment_discussions','growth_community_transformation_access','modules','qa_tester_time_logs']) t;
SELECT is(pg_temp.rows_affected($$UPDATE public.modules SET title = 'rogue' WHERE id = '74000000-0000-4000-8000-00000000e001'$$), 0, 'after: outsider still cannot update a module');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.qa_tester_time_logs WHERE tester_id = pg_temp.uid('b10c_tester')$$), 0, 'after: outsider still cannot delete a QA time log');
SELECT is(pg_temp.rows_affected($$UPDATE public.growth_community_transformation_access SET is_active = false WHERE growth_community_id = '74000000-0000-4000-8000-00000000c001'$$), 0, 'after: outsider still cannot revoke transformation access');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, thread_id) VALUES ('rogue', '74000000-0000-4000-8000-00000000b001', '74000000-0000-4000-8000-00000000d101')$$, '42501', NULL, 'after: outsider still cannot create a discussion mapping');

-- ----------------------------------------------------------------------------
-- 3c. A flagged account still reads nothing: the guard is ANDed on top (1)
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('b10c_flagged');
SELECT is((SELECT sum(n)::int FROM pg_temp.visible()), 0, 'after: a must-change-password account still reads none of the four');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 4. Idempotent: the whole artifact region again, verbatim. If any block
--    raised here the file would abort and the plan count would fail. (1)
-- ----------------------------------------------------------------------------
-- BEGIN COMPENSATION
-- ---- public.group_assignment_discussions ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'group_assignment_discussions') THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'group_assignment_discussions'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.group_assignment_discussions
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.group_assignment_discussions USING (true);';
  END IF;
END
$compensation$;

-- ---- public.growth_community_transformation_access ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'growth_community_transformation_access') THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'growth_community_transformation_access'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.growth_community_transformation_access
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.growth_community_transformation_access USING (true);';
  END IF;
END
$compensation$;

-- ---- public.modules ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'modules') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'modules'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.modules
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.modules has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.modules USING (true);';
  END IF;
END
$compensation$;

-- ---- public.qa_tester_time_logs ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'qa_tester_time_logs') THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'qa_tester_time_logs'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.qa_tester_time_logs
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.qa_tester_time_logs USING (true);';
  END IF;
END
$compensation$;
-- END COMPENSATION
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND policyname = 'b10a_compensation_authenticated_read'),
  4, 're-running the whole artifact leaves exactly four compensation policies');

-- ----------------------------------------------------------------------------
-- 5. The later school boundary (W-B10a-02, RESTRICTIVE) still holds after
--    compensation for an equipo_directivo-only actor (2)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('b10c_directivo_same');
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = 'growth_community_transformation_access'), 1,
  'after: equipo_directivo of the same school reads its community transformation access');
RESET ROLE;
SELECT tests.authenticate_as('b10c_directivo_other');
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = 'growth_community_transformation_access'), 0,
  'after: equipo_directivo of another school still reads nothing (school scope survives)');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 6. Stand-down -> re-run raises -> reactivate (4)
-- ----------------------------------------------------------------------------
ALTER POLICY b10a_compensation_authenticated_read ON public.modules USING (false);
SELECT tests.authenticate_as('b10c_outsider');
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = 'modules'), 0, 'stood down: outsider reads no module again');
RESET ROLE;
SELECT throws_like($standdown$
-- BEGIN MODULES BLOCK
-- ---- public.modules ----
DO $compensation$
DECLARE
  existing record;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'modules') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules does not have row security on; stop and investigate';
  END IF;
  SELECT cmd, roles, permissive, qual INTO existing FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'modules'
     AND policyname = 'b10a_compensation_authenticated_read';
  IF NOT FOUND THEN
    CREATE POLICY b10a_compensation_authenticated_read ON public.modules
      AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  ELSIF existing.cmd <> 'SELECT' OR existing.roles <> ARRAY['authenticated']::name[]
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'b10a compensation: public.modules has a b10a_compensation_authenticated_read policy with an unexpected definition (%, %, %, %); do NOT reactivate it — stop and investigate',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  ELSIF existing.qual = 'false' THEN
    RAISE EXCEPTION 'b10a compensation: public.modules has b10a_compensation_authenticated_read stood down; to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.modules USING (true);';
  END IF;
END
$compensation$;
-- END MODULES BLOCK
$standdown$, '%stood down; to reactivate%', 're-running the modules block on a stood-down policy raises with the reactivation command');
ALTER POLICY b10a_compensation_authenticated_read ON public.modules USING (true);
SELECT tests.authenticate_as('b10c_outsider');
SELECT is((SELECT n FROM pg_temp.visible() WHERE tbl = 'modules'), 1, 'reactivated: outsider reads the module again');
RESET ROLE;
SELECT is(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'modules' AND policyname = 'b10a_compensation_authenticated_read'),
  'true', 'reactivated policy is the original USING (true)');

-- 4 (before) + 18 (catalog) + 8 (outsider) + 1 (flagged) + 1 (idempotent) + 2 (school scope) + 4 (stand-down) = 38
SELECT * FROM finish();

ROLLBACK;
