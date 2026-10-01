-- =============================================================================
-- 20261001180000_b10a_restore_authenticated_reads.sql
-- W-B10a-01 compensation artifact (gate clause C4 / blocker B10A-G2,
-- Brent's decision 94d02887658014cb, 2026-09-30: option (a)).
--
-- NOT A MIGRATION. This file lives outside supabase/migrations on purpose, so
-- no `supabase db push`, `db reset` or CI run ever applies it. It is an
-- operator's emergency tool for ONE situation: after
-- 20260908180100_b10a_referenced_tables_rls.sql is applied in an environment,
-- a legitimate signed-in user can no longer READ rows they need from one of the
-- B10a tables. Applying the block for that table restores the read.
--
-- What each block does (additive only):
--   CREATE POLICY b10a_compensation_authenticated_read ... FOR SELECT
--   TO authenticated USING (true)
-- i.e. signed-in users may read the table again, which is the read access
-- `authenticated` had before B10a (GRANT ALL, row security off) — with one
-- deliberate exception: on growth_community_transformation_access the later
-- RESTRICTIVE policy growth_community_transformation_access_school_scope
-- (20260921003500, W-B10a-02) still keeps an equipo_directivo-only actor to
-- their own schools' communities. Restrictive policies are ANDed with this one,
-- so that school boundary and the forced-password guard both survive.
--
-- What it never does: DROP, TRUNCATE, DISABLE ROW LEVEL SECURITY, any GRANT,
-- anything for anon or PUBLIC, any INSERT / UPDATE / DELETE policy. Row
-- security stays ON, so the restrictive forced_password_change_guard (the 053
-- invariant) still applies on top of the restored read, and every write rule
-- of B10a stays exactly as it is.
--
-- Deliberately NOT covered:
--   instructors            — already readable by every authenticated user
--                            (instructors_authenticated_read); nothing to restore.
--   propuesta_rate_limits  — only the service-role client reads it (unaffected
--                            by row security); it holds IP addresses, so opening
--                            it to signed-in users would widen access, not
--                            restore a legitimate read.
--
-- How to apply: run ONLY the block for the table whose read broke, as the
-- database owner, inside a transaction. Each block checks that the table has
-- row security on, and is idempotent: re-running it on an active policy is a
-- no-op.
--
-- How to stand it down (no DROP, ever): neutralise the policy,
--   ALTER POLICY b10a_compensation_authenticated_read ON public.<table> USING (false);
-- Re-running the block on a stood-down or altered policy RAISES instead of
-- silently doing nothing; to reactivate it, run exactly
--   ALTER POLICY b10a_compensation_authenticated_read ON public.<table> USING (true);
-- A neutralised policy stays in place until a separately reviewed forward
-- migration supersedes it.
--
-- Tested by supabase/tests/074-b10a-compensation-rollback.sql, which embeds
-- the region between the BEGIN/END COMPENSATION markers below verbatim (twice,
-- to prove idempotency) and the modules block once more (to prove a stood-down
-- policy raises). A Vitest check (__tests__/supabase/b10a-compensation-sync.test.ts)
-- fails if any copy differs, or if this file holds anything but comments
-- outside the markers.
-- =============================================================================

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
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'b10a compensation: public.group_assignment_discussions already has b10a_compensation_authenticated_read but it is stood down or altered (%, %, %, %); to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.group_assignment_discussions USING (true);',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
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
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'b10a compensation: public.growth_community_transformation_access already has b10a_compensation_authenticated_read but it is stood down or altered (%, %, %, %); to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.growth_community_transformation_access USING (true);',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
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
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'b10a compensation: public.modules already has b10a_compensation_authenticated_read but it is stood down or altered (%, %, %, %); to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.modules USING (true);',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
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
     OR existing.permissive <> 'PERMISSIVE' OR existing.qual IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'b10a compensation: public.qa_tester_time_logs already has b10a_compensation_authenticated_read but it is stood down or altered (%, %, %, %); to reactivate it run: ALTER POLICY b10a_compensation_authenticated_read ON public.qa_tester_time_logs USING (true);',
      existing.cmd, existing.roles, existing.permissive, existing.qual;
  END IF;
END
$compensation$;
-- END COMPENSATION
