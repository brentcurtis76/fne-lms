-- =============================================================================
-- 101-lp-reporting-scope.sql — W-B2c-01 follow-on: learning-path reporting
-- scope + defined figures — migration 20261002120000_lp_reporting_scope.sql.
--
--   1. catalog: three SECURITY DEFINER helpers (search_path pinned, no PUBLIC /
--      anon EXECUTE), six security_barrier owner views, the five C3 views keep
--      their columns in the same order with new columns appended only
--   2. helper truth table per actor (active / inactive / NULL-school director,
--      active / inactive / NULL-active consultor, learner, admin, backend)
--   3. defined figures as a literal admin: finished (is_completed OR
--      progress >= 100; finished_at falls back to updated_at), at risk (13 vs 15
--      days, latest of path progress and lesson progress on the path's courses
--      only, never-active fallback to the assignment date, group member),
--      performance, distinct new assignees (empty group counts nobody)
--   4. director of school A: every view shows only school-A people; a group
--      member of a school-A community whose own role is in school B is out;
--      a path with only school-B assignees is invisible; exact daily /
--      monthly values (cumulative and monthly completion rate)
--   5. consultor = admin (all schools); inactive / NULL-school director,
--      inactive / NULL-active consultor see nothing
--   6. learners (docente, lider_comunidad, supervisor_de_red) only their own
--      rows, no aggregates; anon 42501 on all six views
--   7. no write widened: director / consultor still cannot write the four
--      learning-path tables or the grain; no policy references the helpers
--   8. forced-password-change: a flagged director reads nothing
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(116);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.set_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;
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

-- Fixture paths: P1 (now-relative: scope + at risk), P2 (school-B people only),
-- P3 (lider A + supervisor without school), P4 (literal calendar), P5 (empty).
CREATE OR REPLACE FUNCTION pg_temp.paths() RETURNS uuid[]
LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY[
  '10100000-0000-4000-8000-000000000001','10100000-0000-4000-8000-000000000002',
  '10100000-0000-4000-8000-000000000003','10100000-0000-4000-8000-000000000004',
  '10100000-0000-4000-8000-000000000005']::uuid[] $$;

CREATE OR REPLACE FUNCTION pg_temp.plabel(p uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'P' || right(p::text, 1) $$;

-- Row counts over the six views for the fixture paths:
-- assigned / user summary / performance / daily / monthly / report courses.
CREATE OR REPLACE FUNCTION pg_temp.view_counts() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.learning_path_assigned_users WHERE path_id = ANY (pg_temp.paths()))
    || '/' || (SELECT count(*) FROM public.user_learning_path_summary WHERE path_id = ANY (pg_temp.paths()))
    || '/' || (SELECT count(*) FROM public.learning_path_performance_summary WHERE path_id = ANY (pg_temp.paths()))
    || '/' || (SELECT count(*) FROM public.learning_path_daily_summary WHERE path_id = ANY (pg_temp.paths()))
    || '/' || (SELECT count(*) FROM public.learning_path_monthly_summary WHERE path_id = ANY (pg_temp.paths()))
    || '/' || (SELECT count(*) FROM public.learning_path_report_courses WHERE path_id = ANY (pg_temp.paths())) $$;

-- Every row of the six views for the fixture paths, as text (admin vs consultor).
CREATE OR REPLACE FUNCTION pg_temp.snapshot() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT string_agg(t::text, ';' ORDER BY t::text) FROM public.learning_path_assigned_users t WHERE path_id = ANY (pg_temp.paths())), '')
    || '|' || coalesce((SELECT string_agg(t::text, ';' ORDER BY t::text) FROM public.user_learning_path_summary t WHERE path_id = ANY (pg_temp.paths())), '')
    || '|' || coalesce((SELECT string_agg(t::text, ';' ORDER BY t::text) FROM public.learning_path_performance_summary t WHERE path_id = ANY (pg_temp.paths())), '')
    || '|' || coalesce((SELECT string_agg(t::text, ';' ORDER BY t::text) FROM public.learning_path_daily_summary t WHERE path_id = ANY (pg_temp.paths())), '')
    || '|' || coalesce((SELECT string_agg(t::text, ';' ORDER BY t::text) FROM public.learning_path_monthly_summary t WHERE path_id = ANY (pg_temp.paths())), '')
    || '|' || coalesce((SELECT string_agg(t::text, ';' ORDER BY t::text) FROM public.learning_path_report_courses t WHERE path_id = ANY (pg_temp.paths())), '') $$;

-- Figures of one user summary row: status / is_finished / is_at_risk.
CREATE OR REPLACE FUNCTION pg_temp.fig(k text, p uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT status || '/' || coalesce(is_finished::text, 'NULL') || '/' || coalesce(is_at_risk::text, 'NULL')
    FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid(k) AND path_id = p $$;

CREATE OR REPLACE FUNCTION pg_temp.perf(p uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT total_enrolled_users || '/' || total_completed_users || '/' || total_in_progress_users || '/'
      || coalesce(overall_completion_rate::text, 'NULL') || '/' || total_time_spent_hours || '/' || total_courses || '/'
      || at_risk_users || '/' || coalesce(avg_completion_time_days::text, 'NULL') || '/' || recent_enrollments || '/'
      || recent_completions || '/' || recent_session_time_hours || '/' || coalesce(engagement_score::text, 'NULL')
    FROM public.learning_path_performance_summary WHERE path_id = p $$;

CREATE OR REPLACE FUNCTION pg_temp.daily(p uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT string_agg(to_char(summary_date, 'MM-DD') || ' ' || total_active_users || '/' || total_sessions_count || '/'
                    || total_session_time_minutes || '/' || course_completions || '/' || new_enrollments || '/'
                    || coalesce(completion_rate::text, 'NULL'), ', ' ORDER BY summary_date)
    FROM public.learning_path_daily_summary WHERE path_id = p $$;

CREATE OR REPLACE FUNCTION pg_temp.monthly(p uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT string_agg(to_char(summary_month, 'YYYY-MM') || ' ' || total_active_users || '/' || total_sessions || '/'
                    || total_session_time_minutes || '/' || total_completions || '/' || total_new_enrollments || '/'
                    || coalesce(avg_completion_rate::text, 'NULL'), ', ' ORDER BY summary_month)
    FROM public.learning_path_monthly_summary WHERE path_id = p $$;

-- ----------------------------------------------------------------------------
-- 1. Catalog
-- ----------------------------------------------------------------------------
SELECT has_view('public', 'learning_path_report_courses', '1: view learning_path_report_courses exists');
SELECT is((SELECT count(*)::int FROM pg_class c
            WHERE c.relkind = 'v' AND c.relnamespace = 'public'::regnamespace
              AND c.relname IN ('learning_path_assigned_users','user_learning_path_summary','learning_path_performance_summary',
                                'learning_path_daily_summary','learning_path_monthly_summary','learning_path_report_courses')
              AND 'security_barrier=true' = ANY (c.reloptions)
              AND c.relowner = 'postgres'::regrole), 6, '1: all six views are security_barrier views owned by postgres');
SELECT is((SELECT count(*)::int FROM pg_proc
            WHERE oid IN ('public.auth_lp_report_all()'::regprocedure, 'public.auth_lp_report_sees_user(uuid)'::regprocedure, 'public.auth_lp_reporter()'::regprocedure)
              AND prosecdef AND provolatile = 's'
              AND proconfig @> ARRAY['search_path=public, pg_temp']), 3, '1: the three helpers are SECURITY DEFINER, STABLE, search_path pinned');
SELECT is((SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
            WHERE p.oid IN ('public.auth_lp_report_all()'::regprocedure, 'public.auth_lp_report_sees_user(uuid)'::regprocedure, 'public.auth_lp_reporter()'::regprocedure)
              AND a.grantee = 0), 0, '1: no helper is executable by PUBLIC');
SELECT is(has_function_privilege('anon', 'public.auth_lp_report_all()', 'EXECUTE'), false, '1: anon cannot execute auth_lp_report_all');
SELECT is(has_function_privilege('anon', 'public.auth_lp_report_sees_user(uuid)', 'EXECUTE'), false, '1: anon cannot execute auth_lp_report_sees_user');
SELECT is(has_function_privilege('anon', 'public.auth_lp_reporter()', 'EXECUTE'), false, '1: anon cannot execute auth_lp_reporter');
SELECT is(has_function_privilege('authenticated', 'public.auth_lp_report_sees_user(uuid)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.auth_lp_reporter()', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.auth_lp_report_all()', 'EXECUTE'), true, '1: authenticated may execute the helpers (the views call them as the caller)');
SELECT is(has_table_privilege('anon', 'public.learning_path_report_courses', 'SELECT'), false, '1: anon cannot SELECT learning_path_report_courses');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_report_courses', 'SELECT'), true, '1: authenticated may SELECT learning_path_report_courses (filtered inside)');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_report_courses', 'INSERT')
          OR has_table_privilege('authenticated', 'public.learning_path_report_courses', 'UPDATE')
          OR has_table_privilege('authenticated', 'public.learning_path_report_courses', 'DELETE')
          OR has_table_privilege('authenticated', 'public.learning_path_report_courses', 'TRUNCATE'), false, '1: authenticated holds only SELECT on learning_path_report_courses');
SELECT is((SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.learning_path_assigned_users'::regclass AND attnum > 0),
          'path_id,user_id,via_direct,via_group,first_assigned_at', '1: learning_path_assigned_users columns unchanged');
SELECT is((SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.user_learning_path_summary'::regclass AND attnum > 0),
          'user_id,path_id,via_direct,via_group,first_assigned_at,status,current_course_sequence,started_at,completed_at,last_session_date,total_time_spent_minutes,total_courses,completed_courses,overall_progress_percentage,is_at_risk,is_finished,finished_at,last_activity_effective_at',
          '1: user_learning_path_summary keeps its 15 columns in order; is_finished, finished_at, last_activity_effective_at appended');
SELECT is((SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.learning_path_performance_summary'::regclass AND attnum > 0),
          'path_id,path_name,path_description,is_active,total_courses,total_enrolled_users,total_completed_users,total_in_progress_users,total_time_spent_hours,overall_completion_rate,avg_completion_time_days,engagement_score,recent_enrollments,recent_completions,recent_session_time_hours,at_risk_users',
          '1: learning_path_performance_summary keeps its columns (engagement_score retired in place); at_risk_users appended');
SELECT is((SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.learning_path_daily_summary'::regclass AND attnum > 0),
          'path_id,summary_date,total_active_users,total_sessions_count,total_session_time_minutes,course_completions,new_enrollments,completion_rate',
          '1: learning_path_daily_summary columns unchanged');
SELECT is((SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.learning_path_monthly_summary'::regclass AND attnum > 0),
          'path_id,summary_month,total_active_users,total_sessions,total_session_time_minutes,total_session_time_hours,total_completions,total_new_enrollments,avg_daily_active_users,avg_session_duration_minutes,avg_completion_rate',
          '1: learning_path_monthly_summary columns unchanged');
SELECT is((SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ',' ORDER BY attnum) FROM pg_attribute WHERE attrelid = 'public.learning_path_report_courses'::regclass AND attnum > 0),
          'path_id:uuid,course_id:uuid,sequence_order:integer,course_title:text', '1: learning_path_report_courses columns');
SELECT ok((SELECT obj_description('public.learning_path_performance_summary'::regclass, 'pg_class') LIKE '%engagement_score is RETIRED%'), '1: the performance view documents engagement_score as retired');

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres). School A = 10101, school B = 10102.
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user(k)
  FROM unnest(ARRAY['lp101_admin','lp101_dirA','lp101_dirA_off','lp101_dirNull','lp101_cons','lp101_cons_off','lp101_cons_null',
                    'lp101_a1','lp101_a2','lp101_a3','lp101_a4','lp101_b1','lp101_b2','lp101_b3','lp101_lider','lp101_sup',
                    'lp101_dirB','lp101_dirAB','lp101_dual','lp101_xin']) k;
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['lp101_admin','lp101_dirA','lp101_dirA_off','lp101_dirNull','lp101_cons','lp101_cons_off','lp101_cons_null',
                    'lp101_a1','lp101_a2','lp101_a3','lp101_a4','lp101_b1','lp101_b2','lp101_b3','lp101_lider','lp101_sup',
                    'lp101_dirB','lp101_dirAB','lp101_dual','lp101_xin']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (10101, 'LP101 school A (pgTAP 101)'), (10102, 'LP101 school B (pgTAP 101)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.redes_de_colegios (id, nombre, descripcion, created_by)
VALUES ('10100000-0000-4000-8000-00000000ed01', 'LP101 red sintetica', 'Red sintetica para pgTAP 101.', pg_temp.uid('lp101_admin'));
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('10100000-0000-4000-8000-00000000c00a', 10101, 'LP101 community A'),
  ('10100000-0000-4000-8000-00000000c00b', 10102, 'LP101 community B'),
  ('10100000-0000-4000-8000-00000000c00e', 10101, 'LP101 empty community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('10100000-0000-4000-8000-00000000bb0a', '10100000-0000-4000-8000-00000000c00a', 'LP101 workspace A'),
  ('10100000-0000-4000-8000-00000000bb0b', '10100000-0000-4000-8000-00000000c00b', 'LP101 workspace B'),
  ('10100000-0000-4000-8000-00000000bb0e', '10100000-0000-4000-8000-00000000c00e', 'LP101 empty workspace');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('lp101_admin'),     'admin',             NULL,  NULL, true),
  (pg_temp.uid('lp101_dirA'),      'equipo_directivo',  10101, NULL, true),
  (pg_temp.uid('lp101_dirA'),      'docente',           10102, NULL, true),   -- a second role elsewhere never widens
  (pg_temp.uid('lp101_dirA_off'),  'equipo_directivo',  10101, NULL, false),
  (pg_temp.uid('lp101_dirNull'),   'equipo_directivo',  NULL,  NULL, true),
  (pg_temp.uid('lp101_cons'),      'consultor',         NULL,  NULL, true),
  (pg_temp.uid('lp101_cons_off'),  'consultor',         NULL,  NULL, false),
  (pg_temp.uid('lp101_cons_null'), 'consultor',         NULL,  NULL, NULL),
  (pg_temp.uid('lp101_a1'),        'docente',           10101, NULL, true),
  (pg_temp.uid('lp101_a2'),        'docente',           10101, '10100000-0000-4000-8000-00000000c00a', true),
  (pg_temp.uid('lp101_a3'),        'docente',           10101, NULL, true),
  (pg_temp.uid('lp101_a4'),        'docente',           10101, '10100000-0000-4000-8000-00000000c00a', true),
  (pg_temp.uid('lp101_b1'),        'docente',           10102, NULL, true),
  (pg_temp.uid('lp101_b2'),        'docente',           10102, '10100000-0000-4000-8000-00000000c00b', true),
  -- member of the school-A community, but their own role is in school B
  (pg_temp.uid('lp101_b3'),        'docente',           10102, '10100000-0000-4000-8000-00000000c00a', true),
  (pg_temp.uid('lp101_lider'),     'lider_comunidad',   10101, NULL, true),
  -- scope edge cases (no assignments: helper-level checks only)
  (pg_temp.uid('lp101_dirB'),      'equipo_directivo',  10102, NULL, true),
  (pg_temp.uid('lp101_dirAB'),     'equipo_directivo',  10101, NULL, true),   -- director of two schools
  (pg_temp.uid('lp101_dirAB'),     'equipo_directivo',  10102, NULL, true),
  (pg_temp.uid('lp101_dual'),      'docente',           10101, NULL, true),   -- active in both schools
  (pg_temp.uid('lp101_dual'),      'docente',           10102, NULL, true),
  (pg_temp.uid('lp101_xin'),       'docente',           10101, NULL, false),  -- membership of A is inactive
  (pg_temp.uid('lp101_xin'),       'docente',           10102, NULL, true);
-- supervisor_de_red: no school, active rows need a network (red_id)
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active, red_id) VALUES
  (pg_temp.uid('lp101_sup'), 'supervisor_de_red', NULL, NULL, true, '10100000-0000-4000-8000-00000000ed01');
INSERT INTO public.instructors (id, full_name) VALUES ('10100000-0000-4000-8000-00000000f001', 'LP101 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('10100000-0000-4000-8000-000000000c01', 'LP101 K1', 'x', '10100000-0000-4000-8000-00000000f001'),
  ('10100000-0000-4000-8000-000000000c02', 'LP101 K2', 'x', '10100000-0000-4000-8000-00000000f001'),
  ('10100000-0000-4000-8000-000000000c03', 'LP101 K3', 'x', '10100000-0000-4000-8000-00000000f001'),
  ('10100000-0000-4000-8000-000000000c04', 'LP101 K4', 'x', '10100000-0000-4000-8000-00000000f001'),
  ('10100000-0000-4000-8000-000000000c05', 'LP101 K5', 'x', '10100000-0000-4000-8000-00000000f001');
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('10100000-0000-4000-8000-000000000001', 'LP101 P1', 'scope + at risk',          pg_temp.uid('lp101_admin')),
  ('10100000-0000-4000-8000-000000000002', 'LP101 P2', 'school-B people only',     pg_temp.uid('lp101_admin')),
  ('10100000-0000-4000-8000-000000000003', 'LP101 P3', 'lider A + supervisor',     pg_temp.uid('lp101_admin')),
  ('10100000-0000-4000-8000-000000000004', 'LP101 P4', 'literal calendar',         pg_temp.uid('lp101_admin')),
  ('10100000-0000-4000-8000-000000000005', 'LP101 P5', 'no courses, no people',    pg_temp.uid('lp101_admin')),
  -- P6 (outside pg_temp.paths()): no courses, one assignee 30 days ago, no activity
  ('10100000-0000-4000-8000-000000000006', 'LP101 P6', 'no courses, one person',   pg_temp.uid('lp101_admin')),
  -- P7 (outside pg_temp.paths()): finish dated only by updated_at, nothing else that month
  ('10100000-0000-4000-8000-000000000007', 'LP101 P7', 'fallback-dated finish',    pg_temp.uid('lp101_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('10100000-0000-4000-8000-000000000001', '10100000-0000-4000-8000-000000000c01', 1),
  ('10100000-0000-4000-8000-000000000001', '10100000-0000-4000-8000-000000000c02', 2),
  ('10100000-0000-4000-8000-000000000002', '10100000-0000-4000-8000-000000000c03', 1),
  ('10100000-0000-4000-8000-000000000003', '10100000-0000-4000-8000-000000000c01', 1),
  ('10100000-0000-4000-8000-000000000004', '10100000-0000-4000-8000-000000000c04', 1),
  ('10100000-0000-4000-8000-000000000007', '10100000-0000-4000-8000-000000000c05', 1);
INSERT INTO public.learning_path_assignments (path_id, user_id, group_id, assigned_by, assigned_at) VALUES
  -- P1: a1, a3, b1 direct; workspace A (a2, a4, b3) 28 days ago; an EMPTY workspace 25 days ago
  ('10100000-0000-4000-8000-000000000001', pg_temp.uid('lp101_a1'), NULL, pg_temp.uid('lp101_admin'), now() - interval '40 days'),
  ('10100000-0000-4000-8000-000000000001', pg_temp.uid('lp101_a3'), NULL, pg_temp.uid('lp101_admin'), now() - interval '20 days'),
  ('10100000-0000-4000-8000-000000000001', pg_temp.uid('lp101_b1'), NULL, pg_temp.uid('lp101_admin'), now() - interval '5 days'),
  ('10100000-0000-4000-8000-000000000001', NULL, '10100000-0000-4000-8000-00000000bb0a', pg_temp.uid('lp101_admin'), now() - interval '28 days'),
  ('10100000-0000-4000-8000-000000000001', NULL, '10100000-0000-4000-8000-00000000bb0e', pg_temp.uid('lp101_admin'), now() - interval '25 days'),
  -- P2: workspace B (b2) only
  ('10100000-0000-4000-8000-000000000002', NULL, '10100000-0000-4000-8000-00000000bb0b', pg_temp.uid('lp101_admin'), now() - interval '10 days'),
  -- P3: lider (school A) and supervisor (no school), 3 days ago, never active
  ('10100000-0000-4000-8000-000000000003', pg_temp.uid('lp101_lider'), NULL, pg_temp.uid('lp101_admin'), now() - interval '3 days'),
  ('10100000-0000-4000-8000-000000000003', pg_temp.uid('lp101_sup'),   NULL, pg_temp.uid('lp101_admin'), now() - interval '3 days'),
  -- P4: literal instants (15:00Z = 11:00 Santiago, winter UTC-4)
  ('10100000-0000-4000-8000-000000000004', pg_temp.uid('lp101_a1'), NULL, pg_temp.uid('lp101_admin'), '2026-05-10T15:00:00Z'),
  ('10100000-0000-4000-8000-000000000004', pg_temp.uid('lp101_b1'), NULL, pg_temp.uid('lp101_admin'), '2026-05-10T15:00:00Z'),
  ('10100000-0000-4000-8000-000000000004', pg_temp.uid('lp101_a2'), NULL, pg_temp.uid('lp101_admin'), '2026-06-05T15:00:00Z'),
  ('10100000-0000-4000-8000-000000000006', pg_temp.uid('lp101_sup'), NULL, pg_temp.uid('lp101_admin'), now() - interval '30 days'),
  ('10100000-0000-4000-8000-000000000007', pg_temp.uid('lp101_a3'),  NULL, pg_temp.uid('lp101_admin'), '2026-07-10T15:00:00Z');
-- Course completion: a1 finished P1 (completed_at); b1 finished P1 with K1 at
-- progress 100 (not flagged) and K2 flagged without completed_at (finished_at
-- falls back to updated_at); a2 half of K1. P4: a1 May 20, b1 Jun 10, a2 May 1
-- (BEFORE being assigned on Jun 5 → counts as finishing on Jun 5).
INSERT INTO public.course_enrollments (user_id, course_id, is_completed, progress_percentage, completed_at, updated_at, access_origin) VALUES
  (pg_temp.uid('lp101_a1'), '10100000-0000-4000-8000-000000000c01', true,  100, now() - interval '35 days', now() - interval '35 days', 'learning_path'),
  (pg_temp.uid('lp101_a1'), '10100000-0000-4000-8000-000000000c02', true,  100, now() - interval '32 days', now() - interval '32 days', 'learning_path'),
  (pg_temp.uid('lp101_b1'), '10100000-0000-4000-8000-000000000c01', false, 100, now() - interval '4 days',  now() - interval '4 days',  'learning_path'),
  (pg_temp.uid('lp101_b1'), '10100000-0000-4000-8000-000000000c02', true,  100, NULL,                       now() - interval '3 days',  'learning_path'),
  (pg_temp.uid('lp101_a2'), '10100000-0000-4000-8000-000000000c01', false, 50,  NULL,                       now() - interval '13 days', 'learning_path'),
  (pg_temp.uid('lp101_a1'), '10100000-0000-4000-8000-000000000c04', true,  100, '2026-05-20T15:00:00Z',     '2026-05-20T15:00:00Z',     'learning_path'),
  (pg_temp.uid('lp101_b1'), '10100000-0000-4000-8000-000000000c04', true,  100, '2026-06-10T15:00:00Z',     '2026-06-10T15:00:00Z',     'learning_path'),
  (pg_temp.uid('lp101_a2'), '10100000-0000-4000-8000-000000000c04', true,  100, '2026-05-01T15:00:00Z',     '2026-05-01T15:00:00Z',     'learning_path'),
  -- P7: flagged complete, completed_at NULL, only updated_at (Aug 12, 11:00 Santiago) dates it
  (pg_temp.uid('lp101_a3'), '10100000-0000-4000-8000-000000000c05', true,  100, NULL,                       '2026-08-12T15:00:00Z',     'learning_path')
ON CONFLICT (user_id, course_id) DO UPDATE
  SET is_completed = EXCLUDED.is_completed, progress_percentage = EXCLUDED.progress_percentage,
      completed_at = EXCLUDED.completed_at, updated_at = EXCLUDED.updated_at;
-- Path progress (time + last activity). a2 last active 13 days ago.
INSERT INTO public.learning_path_user_progress (user_id, path_id, started_at, last_activity_at, total_time_spent_minutes) VALUES
  (pg_temp.uid('lp101_a1'), '10100000-0000-4000-8000-000000000001', now() - interval '38 days', now() - interval '33 days', 30),
  (pg_temp.uid('lp101_a2'), '10100000-0000-4000-8000-000000000001', now() - interval '28 days', now() - interval '13 days', 20),
  (pg_temp.uid('lp101_b1'), '10100000-0000-4000-8000-000000000001', now() - interval '5 days',  now() - interval '4 days',  60)
ON CONFLICT (path_id, user_id) DO UPDATE
  SET started_at = EXCLUDED.started_at, last_activity_at = EXCLUDED.last_activity_at,
      total_time_spent_minutes = EXCLUDED.total_time_spent_minutes;
-- Lesson activity: L1 belongs to K1 through its module (lesson.course_id NULL);
-- L3 belongs to K3 directly (not a P1 course).
INSERT INTO public.modules (id, course_id, title) VALUES ('10100000-0000-4000-8000-0000000000e1', '10100000-0000-4000-8000-000000000c01', 'LP101 M1');
INSERT INTO public.lessons (id, title, module_id, course_id) VALUES
  ('10100000-0000-4000-8000-0000000000d1', 'LP101 L1', '10100000-0000-4000-8000-0000000000e1', NULL),
  ('10100000-0000-4000-8000-0000000000d3', 'LP101 L3', NULL, '10100000-0000-4000-8000-000000000c03');
INSERT INTO public.blocks (id, course_id, lesson_id, type, position) VALUES
  ('10100000-0000-4000-8000-0000000000b1', '10100000-0000-4000-8000-000000000c01', '10100000-0000-4000-8000-0000000000d1', 'text', 1),
  ('10100000-0000-4000-8000-0000000000b3', '10100000-0000-4000-8000-000000000c03', '10100000-0000-4000-8000-0000000000d3', 'text', 1);
INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, updated_at) VALUES
  (pg_temp.uid('lp101_a4'), '10100000-0000-4000-8000-0000000000d1', '10100000-0000-4000-8000-0000000000b1', now() - interval '15 days'),  -- a4: 15 days → at risk
  (pg_temp.uid('lp101_a2'), '10100000-0000-4000-8000-0000000000d1', '10100000-0000-4000-8000-0000000000b1', now() - interval '20 days'),  -- older than a2's path activity
  (pg_temp.uid('lp101_a3'), '10100000-0000-4000-8000-0000000000d3', '10100000-0000-4000-8000-0000000000b3', now() - interval '1 day');    -- not a P1 course
-- Durable grain (settled time).
INSERT INTO public.learning_path_daily_user_activity (path_id, user_id, activity_date, sessions_count, credited_minutes, session_minutes) VALUES
  ('10100000-0000-4000-8000-000000000001', pg_temp.uid('lp101_a2'), public.lp_activity_date(now() - interval '13 days'), 1, 20, 20),
  ('10100000-0000-4000-8000-000000000001', pg_temp.uid('lp101_b1'), public.lp_activity_date(now() - interval '4 days'),  1, 50, 50),
  ('10100000-0000-4000-8000-000000000002', pg_temp.uid('lp101_b2'), public.lp_activity_date(now() - interval '2 days'),  1, 40, 40),
  ('10100000-0000-4000-8000-000000000004', pg_temp.uid('lp101_a1'), '2026-05-20', 1, 30, 30),
  ('10100000-0000-4000-8000-000000000004', pg_temp.uid('lp101_b1'), '2026-05-20', 1, 45, 45),
  ('10100000-0000-4000-8000-000000000004', pg_temp.uid('lp101_a2'), '2026-06-05', 2, 25, 25);

-- ----------------------------------------------------------------------------
-- 2. Helper truth table
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('lp101_dirA');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_reporter()::text, 'false/true', '2: active director of A: not report-all, is a reporter');
SELECT is(public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_lider'))::text,
          'true/true', '2: director A sees school-A people (docente, lider)');
SELECT is(public.auth_lp_report_sees_user(pg_temp.uid('lp101_b1'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_b3'))::text
          || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_sup'))::text || '/' || public.auth_lp_report_sees_user(NULL)::text,
          'false/false/false/false', '2: director A does not see school B (despite their own docente role in B), a school-A community member whose role is in B, a school-less supervisor, or NULL');
SELECT is(public.auth_lp_report_sees_user(pg_temp.uid('lp101_dual'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_xin'))::text,
          'true/false', '2: director A sees a person active in both schools, not one whose school-A membership is inactive');
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirB');
SELECT is(public.auth_lp_report_sees_user(pg_temp.uid('lp101_dual'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_xin'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text,
          'true/true/false', '2: director B sees the dual-school person and the B member, not school-A people');
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirAB');
SELECT is(public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_b1'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_sup'))::text,
          'true/true/false', '2: a director of two schools sees people of both, not the school-less supervisor');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_b1'))::text, 'true/true', '2: active consultor: report-all, sees school B');
RESET ROLE;
SELECT tests.authenticate_as('lp101_admin');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_sup'))::text, 'true/true', '2: admin: report-all');
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirA_off');
SELECT is(public.auth_lp_reporter()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text, 'false/false', '2: inactive director: nothing');
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirNull');
SELECT is(public.auth_lp_reporter()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text, 'false/false', '2: director without a school: nothing');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons_off');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_reporter()::text, 'false/false', '2: inactive consultor: nothing');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons_null');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_reporter()::text, 'false/false', '2: consultor with is_active NULL: nothing (IS TRUE)');
RESET ROLE;
SELECT tests.authenticate_as('lp101_a1');
SELECT is(public.auth_lp_reporter()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_a2'))::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text,
          'false/false/false', '2: a docente is no reporter and sees nobody through the helper (own rows come from the views)');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT is(public.auth_lp_report_all(), true, '2: backend (service_role, no end-user identity): report-all');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.auth_lp_report_sees_user(NULL)$$, '42501', NULL, '2: anon cannot call auth_lp_report_sees_user');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 3. Defined figures as a literal admin
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('lp101_admin');
SELECT is((SELECT count(*)::int FROM public.learning_path_assigned_users WHERE path_id = '10100000-0000-4000-8000-000000000001'), 6,
          '3: P1 population = a1, a3, b1 direct + a2, a4, b3 via workspace A; the empty workspace adds nobody');
SELECT is(pg_temp.fig('lp101_a1', '10100000-0000-4000-8000-000000000001'), 'completed/true/false', '3: a1 finished P1 (both courses completed) → completed, not at risk');
SELECT is((SELECT finished_at = now() - interval '32 days' FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('lp101_a1') AND path_id = '10100000-0000-4000-8000-000000000001'), true,
          '3: a1 finished_at = latest course completion (32 days ago)');
SELECT is(pg_temp.fig('lp101_b1', '10100000-0000-4000-8000-000000000001'), 'completed/true/false', '3: b1 finished P1 (K1 by progress 100, K2 flagged)');
SELECT is((SELECT finished_at = now() - interval '3 days' FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('lp101_b1') AND path_id = '10100000-0000-4000-8000-000000000001'), true,
          '3: b1 finished_at falls back to updated_at of the flagged course without completed_at (3 days ago)');
SELECT is(pg_temp.fig('lp101_a2', '10100000-0000-4000-8000-000000000001'), 'in_progress/false/false', '3: a2 (group): in progress, last active 13 days ago → NOT at risk');
SELECT is((SELECT (last_activity_effective_at = now() - interval '13 days')::text || '/' || coalesce(finished_at::text, 'NULL') FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('lp101_a2') AND path_id = '10100000-0000-4000-8000-000000000001'),
          'true/NULL', '3: a2 last activity = the later of path progress (13 days) and lesson progress (20 days); no finished_at');
SELECT is(pg_temp.fig('lp101_a4', '10100000-0000-4000-8000-000000000001'), 'not_started/false/true', '3: a4 (group member): last lesson activity 15 days ago → at risk');
SELECT is((SELECT last_activity_effective_at = now() - interval '15 days' FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('lp101_a4') AND path_id = '10100000-0000-4000-8000-000000000001'), true,
          '3: a4 last activity comes from lesson progress on a lesson of a P1 course (through its module)');
SELECT is(pg_temp.fig('lp101_a3', '10100000-0000-4000-8000-000000000001'), 'not_started/false/true', '3: a3 never active on P1, assigned 20 days ago → at risk (assignment-date fallback)');
SELECT is((SELECT last_activity_effective_at = now() - interval '20 days' FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('lp101_a3') AND path_id = '10100000-0000-4000-8000-000000000001'), true,
          '3: a3 lesson activity on a course outside P1 (1 day ago) does not count; fallback = assignment date');
SELECT is(pg_temp.fig('lp101_b3', '10100000-0000-4000-8000-000000000001'), 'not_started/false/true', '3: b3 (group member, never active, group assigned 28 days ago) → at risk');
SELECT is(pg_temp.fig('lp101_lider', '10100000-0000-4000-8000-000000000003'), 'not_started/false/false', '3: lider never active, assigned 3 days ago → not at risk');
SELECT is(pg_temp.perf('10100000-0000-4000-8000-000000000001'), '6/2/1/33.33/1.83/2/3/4.00/5/1/1.17/NULL',
          '3: P1 admin: 6 assigned, 2 finished, 1 in progress, 33.33 %, 110 min = 1.83 h, 2 courses, 3 at risk, avg 4.00 days (6 + 2), 5 assigned in 30 days, 1 finished in 30 days, 70 recent grain minutes, engagement NULL');
SELECT is(pg_temp.fig('lp101_sup', '10100000-0000-4000-8000-000000000006'), 'not_started/false/false',
          '3: P6 has no courses: its assignee (30 days, never active) is not finished and NEVER at risk');
SELECT is(pg_temp.perf('10100000-0000-4000-8000-000000000006'), '1/0/0/0.00/0.00/0/0/NULL/1/0/0.00/NULL',
          '3: P6 (courseless): 1 assigned stays in the rate denominator (0.00 %), at_risk_users 0 (assigned exactly 30 days ago = recent boundary, inclusive)');
SELECT is(pg_temp.perf('10100000-0000-4000-8000-000000000005'), '0/0/0/NULL/0.00/0/0/NULL/0/0/0.00/NULL', '3: P5 (empty) is listed for an admin with a NULL rate (not 0)');
SELECT is((SELECT new_enrollments FROM public.learning_path_daily_summary WHERE path_id = '10100000-0000-4000-8000-000000000001' AND summary_date = public.lp_activity_date(now() - interval '28 days')), 3,
          '3: new assignees on the workspace-A day = 3 distinct people (was 1 assignment row) — documented admin figure change');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_summary WHERE path_id = '10100000-0000-4000-8000-000000000001' AND summary_date = public.lp_activity_date(now() - interval '25 days')), 0,
          '3: the empty workspace assignment creates no daily row (nobody was assigned) — documented admin figure change');
SELECT is(pg_temp.daily('10100000-0000-4000-8000-000000000004'),
          '05-01 0/0/0/1/0/NULL, 05-10 0/0/0/0/2/0.00, 05-20 2/2/75/1/0/50.00, 06-05 1/2/25/0/1/66.67, 06-10 0/0/0/1/0/100.00',
          '3: P4 admin daily (users/sessions/minutes/completions/new/cumulative rate): May 1 nobody assigned yet → NULL; a2 (done May 1) enters numerator and denominator on its assignment day Jun 5');
SELECT is(pg_temp.monthly('10100000-0000-4000-8000-000000000004'),
          '2026-05 2/2/75/2/2/50.00, 2026-06 1/2/25/1/1/33.33',
          '3: P4 admin monthly: May a1 of 2 assigned = 50 %; June b1 of 3 = 33.33 % (a2 finished May 1, before being assigned: in no month''s numerator)');
SELECT is(pg_temp.daily('10100000-0000-4000-8000-000000000007'), '07-10 0/0/0/0/1/0.00, 08-12 0/0/0/0/0/100.00',
          '3: P7 daily: a finish dated only by updated_at (completed_at NULL), with no other event that day, still has its own row (100 %)');
SELECT is(pg_temp.monthly('10100000-0000-4000-8000-000000000007'), '2026-07 0/0/0/0/1/0.00, 2026-08 0/0/0/0/0/100.00',
          '3: P7 monthly: the otherwise empty finish month (August) appears with 1 of 1 = 100 %');

-- ----------------------------------------------------------------------------
-- 4. Director of school A
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirA');
SELECT is((SELECT string_agg(pg_temp.plabel(au.path_id) || ':' || u.k, ',' ORDER BY pg_temp.plabel(au.path_id), u.k)
             FROM public.learning_path_assigned_users au
             JOIN (SELECT k, pg_temp.uid(k) AS id FROM unnest(ARRAY['lp101_a1','lp101_a2','lp101_a3','lp101_a4','lp101_b1','lp101_b2','lp101_b3','lp101_lider','lp101_sup']) k) u ON u.id = au.user_id
            WHERE au.path_id = ANY (pg_temp.paths())),
          'P1:lp101_a1,P1:lp101_a2,P1:lp101_a3,P1:lp101_a4,P3:lp101_lider,P4:lp101_a1,P4:lp101_a2',
          '4: director A: the assigned population is exactly the school-A people (direct and group), on P1, P3 and P4');
SELECT is((SELECT count(*)::int FROM public.user_learning_path_summary WHERE path_id = ANY (pg_temp.paths())), 7, '4: director A: 7 user summary rows');
SELECT is((SELECT count(*)::int FROM public.user_learning_path_summary
            WHERE user_id IN (pg_temp.uid('lp101_b1'), pg_temp.uid('lp101_b2'), pg_temp.uid('lp101_b3'), pg_temp.uid('lp101_sup'))), 0,
          '4: director A: 0 summary rows of school-B people, the B-role community member, or the school-less supervisor');
SELECT is((SELECT count(*)::int FROM public.learning_path_assigned_users
            WHERE user_id IN (pg_temp.uid('lp101_b1'), pg_temp.uid('lp101_b2'), pg_temp.uid('lp101_b3'), pg_temp.uid('lp101_sup'))), 0,
          '4: director A: 0 assigned-population rows of those people');
SELECT is(pg_temp.fig('lp101_a4', '10100000-0000-4000-8000-000000000001'), 'not_started/false/true', '4: director A reads a4''s at-risk figure');
SELECT is((SELECT string_agg(path_name, ',' ORDER BY path_name) FROM public.learning_path_performance_summary WHERE path_id = ANY (pg_temp.paths())),
          'LP101 P1,LP101 P3,LP101 P4', '4: director A: performance rows only for paths with a school-A assignee (P2 B-only and P5 empty are invisible)');
SELECT is(pg_temp.perf('10100000-0000-4000-8000-000000000001'), '4/1/1/25.00/0.83/2/2/6.00/3/0/0.33/NULL',
          '4: director A P1: 4 assigned, 1 finished, 1 in progress, 25 %, 50 min = 0.83 h, 2 at risk, avg 6.00 days, 3 recent, 0 recent finished, 20 recent grain minutes');
SELECT is(pg_temp.perf('10100000-0000-4000-8000-000000000003'), '1/0/0/0.00/0.00/1/0/NULL/1/0/0.00/NULL', '4: director A P3: only the lider counts (supervisor without school excluded)');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_summary WHERE path_id = '10100000-0000-4000-8000-000000000002')
          + (SELECT count(*)::int FROM public.learning_path_monthly_summary WHERE path_id = '10100000-0000-4000-8000-000000000002')
          + (SELECT count(*)::int FROM public.learning_path_report_courses WHERE path_id = '10100000-0000-4000-8000-000000000002')
          + (SELECT count(*)::int FROM public.user_learning_path_summary WHERE path_id = '10100000-0000-4000-8000-000000000002'), 0,
          '4: director A: P2 (school-B assignees only) is absent from daily, monthly, report courses and user summary');
SELECT is((SELECT new_enrollments FROM public.learning_path_daily_summary WHERE path_id = '10100000-0000-4000-8000-000000000001' AND summary_date = public.lp_activity_date(now() - interval '28 days')), 2,
          '4: director A: the workspace-A day counts 2 new assignees (a2, a4), not b3 (role in school B)');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_summary WHERE path_id = '10100000-0000-4000-8000-000000000001' AND summary_date IN (public.lp_activity_date(now() - interval '5 days'), public.lp_activity_date(now() - interval '4 days'), public.lp_activity_date(now() - interval '3 days'))), 0,
          '4: director A: no daily row on b1''s assignment / completion / activity days (only school-B events there)');
SELECT is((SELECT total_active_users || '/' || total_session_time_minutes FROM public.learning_path_daily_summary WHERE path_id = '10100000-0000-4000-8000-000000000001' AND summary_date = public.lp_activity_date(now() - interval '13 days')), '1/20',
          '4: director A: a2''s activity day shows 1 user / 20 minutes');
SELECT is(pg_temp.daily('10100000-0000-4000-8000-000000000004'),
          '05-01 0/0/0/1/0/NULL, 05-10 0/0/0/0/1/0.00, 05-20 1/1/30/1/0/100.00, 06-05 1/2/25/0/1/100.00',
          '4: director A P4 daily: only a1 and a2 (b1''s 45 minutes, its assignment and its Jun 10 completion are absent); cumulative rate over A people');
SELECT is(pg_temp.monthly('10100000-0000-4000-8000-000000000004'),
          '2026-05 1/1/30/2/1/100.00, 2026-06 1/2/25/0/1/0.00',
          '4: director A P4 monthly: May a1 of 1 = 100 %; June nobody in scope finished in June = 0 %');
SELECT is(pg_temp.monthly('10100000-0000-4000-8000-000000000007'), '2026-07 0/0/0/0/1/0.00, 2026-08 0/0/0/0/0/100.00',
          '4: director A P7 monthly (a3 is a school-A person): the finish month appears');
SELECT is((SELECT string_agg(pg_temp.plabel(rc.path_id) || ':' || rc.sequence_order || ':' || rc.course_title, ',' ORDER BY pg_temp.plabel(rc.path_id), rc.sequence_order)
             FROM public.learning_path_report_courses rc
            WHERE rc.path_id = ANY (pg_temp.paths())),
          'P1:1:LP101 K1,P1:2:LP101 K2,P3:1:LP101 K1,P4:1:LP101 K4', '4: director A: report courses only of P1, P3, P4 (with titles, although the director cannot read learning_paths / learning_path_courses directly)');
SELECT is(pg_temp.view_counts(), '7/7/3/' || (SELECT count(*) FROM public.learning_path_daily_summary WHERE path_id = ANY (pg_temp.paths()))
                                  || '/' || (SELECT count(*) FROM public.learning_path_monthly_summary WHERE path_id = ANY (pg_temp.paths())) || '/4',
          '4: director A view counts (assigned 7 / summary 7 / performance 3 / … / report courses 4)');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity WHERE path_id = ANY (pg_temp.paths())), 0,
          '4: the grain TABLE itself is unchanged: director A reads no other person''s grain row directly');

-- ----------------------------------------------------------------------------
-- 5. Consultor = admin; inactive / NULL directors and consultors see nothing
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('lp101_admin');
SELECT pg_temp.snapshot() AS admin_snapshot, pg_temp.view_counts() AS admin_counts \gset
SELECT is(:'admin_counts', '12/12/5/' || (SELECT count(*) FROM public.learning_path_daily_summary WHERE path_id = ANY (pg_temp.paths()))
                            || '/' || (SELECT count(*) FROM public.learning_path_monthly_summary WHERE path_id = ANY (pg_temp.paths())) || '/5',
          '5: admin view counts (assigned 12 / summary 12 / performance 5 / … / report courses 5)');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons');
SELECT is(pg_temp.view_counts(), :'admin_counts', '5: consultor: the same row counts as an admin in all six views');
SELECT is(md5(pg_temp.snapshot()), md5(:'admin_snapshot'), '5: consultor: every row of all six views identical to the admin''s (all schools)');
SELECT is(pg_temp.perf('10100000-0000-4000-8000-000000000002'), '1/0/0/0.00/0.00/1/0/NULL/1/0/0.67/NULL', '5: consultor reads P2 (school B): 1 person, 40 recent minutes');
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirA_off');
SELECT is(pg_temp.view_counts(), '0/0/0/0/0/0', '5: inactive director: nothing in any of the six views');
RESET ROLE;
SELECT tests.authenticate_as('lp101_dirNull');
SELECT is(pg_temp.view_counts(), '0/0/0/0/0/0', '5: director without a school: nothing');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons_off');
SELECT is(pg_temp.view_counts(), '0/0/0/0/0/0', '5: inactive consultor: nothing');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons_null');
SELECT is(pg_temp.view_counts(), '0/0/0/0/0/0', '5: consultor with is_active NULL: nothing');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT is(pg_temp.view_counts(), :'admin_counts', '5: backend reads what an admin reads');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 6. Learners: own rows only, no aggregates; anon refused
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('lp101_a1');
SELECT is(pg_temp.view_counts(), '2/2/0/0/0/0', '6: docente a1: own rows on P1 and P4 only, no aggregate, no report courses');
SELECT is((SELECT count(*)::int FROM public.user_learning_path_summary WHERE user_id <> auth.uid()), 0, '6: docente a1: no other person''s summary row');
SELECT is(pg_temp.fig('lp101_a1', '10100000-0000-4000-8000-000000000001'), 'completed/true/false', '6: docente a1 reads their own figures');
RESET ROLE;
SELECT tests.authenticate_as('lp101_a2');
SELECT is(pg_temp.view_counts(), '2/2/0/0/0/0', '6: docente a2 (group + direct): own rows only');
RESET ROLE;
SELECT tests.authenticate_as('lp101_lider');
SELECT is(pg_temp.view_counts(), '1/1/0/0/0/0', '6: lider_comunidad: own row only');
RESET ROLE;
SELECT tests.authenticate_as('lp101_sup');
SELECT is(pg_temp.view_counts(), '1/1/0/0/0/0', '6: supervisor_de_red: own row only');
RESET ROLE;
SELECT tests.authenticate_as('lp101_b2');
SELECT is(pg_temp.view_counts(), '1/1/0/0/0/0', '6: school-B docente: own row only');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_assigned_users$$, '42501', NULL, '6: anon cannot read learning_path_assigned_users');
SELECT throws_ok($$SELECT count(*) FROM public.user_learning_path_summary$$, '42501', NULL, '6: anon cannot read user_learning_path_summary');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_performance_summary$$, '42501', NULL, '6: anon cannot read learning_path_performance_summary');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_daily_summary$$, '42501', NULL, '6: anon cannot read learning_path_daily_summary');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_monthly_summary$$, '42501', NULL, '6: anon cannot read learning_path_monthly_summary');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_report_courses$$, '42501', NULL, '6: anon cannot read learning_path_report_courses');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 7. No write widened (managing stays literal-admin-only)
-- ----------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('learning_paths','learning_path_courses','learning_path_assignments','learning_path_progress_sessions','learning_path_daily_user_activity','learning_path_user_progress')
              AND (coalesce(qual, '') LIKE '%auth_lp_%' OR coalesce(with_check, '') LIKE '%auth_lp_%')), 0,
          '7: no table policy references the reporting helpers');
SELECT tests.authenticate_as('lp101_dirA');
SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id = '10100000-0000-4000-8000-000000000002'), 0, '7: director A still reads no learning_paths row of P2 directly');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('10100000-0000-4000-8000-000000000003', auth.uid(), auth.uid())$$, '42501', NULL, '7: director A cannot INSERT an assignment');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id = ANY (pg_temp.paths())$$), 0, '7: director A UPDATE of learning_paths reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id = ANY (pg_temp.paths())$$), 0, '7: director A DELETE of learning_path_courses reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = ANY (pg_temp.paths())$$), 0, '7: director A DELETE of assignments reaches 0 rows');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE path_id = '10100000-0000-4000-8000-000000000001'$$, '42501', NULL, '7: director A cannot DELETE sessions');
SELECT throws_ok($$INSERT INTO public.learning_path_daily_user_activity (path_id, user_id, activity_date) VALUES ('10100000-0000-4000-8000-000000000001', auth.uid(), current_date)$$, '42501', NULL, '7: director A cannot write the grain');
SELECT throws_ok($$INSERT INTO public.learning_path_report_courses (path_id, course_id, sequence_order, course_title) VALUES ('10100000-0000-4000-8000-000000000001', '10100000-0000-4000-8000-000000000c03', 9, 'x')$$, '55000', NULL, '7: director A cannot write through learning_path_report_courses (a join view is not insertable; it also holds SELECT only, see 1)');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('10100000-0000-4000-8000-000000000003', auth.uid(), auth.uid())$$, '42501', NULL, '7: consultor cannot INSERT an assignment');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id = ANY (pg_temp.paths())$$), 0, '7: consultor UPDATE of learning_paths reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id = ANY (pg_temp.paths())$$), 0, '7: consultor DELETE of learning_path_courses reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = ANY (pg_temp.paths())$$), 0, '7: consultor DELETE of assignments reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity WHERE path_id = ANY (pg_temp.paths())), 0, '7: consultor reads no grain row directly (table policy unchanged)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id = ANY (pg_temp.paths()) AND name LIKE 'LP101 P%')
          + (SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id = ANY (pg_temp.paths()))
          + (SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id = ANY (pg_temp.paths())), 5 + 5 + 11,
          '7: unchanged state: 5 paths with their names, 5 course links, 11 assignments');

-- ----------------------------------------------------------------------------
-- 8. Forced password change
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET must_change_password = true WHERE id IN (pg_temp.uid('lp101_dirA'), pg_temp.uid('lp101_cons'));
SELECT tests.authenticate_as('lp101_dirA');
SELECT is(pg_temp.view_counts(), '0/0/0/0/0/0', '8: a flagged director reads nothing through the six views');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_reporter()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_a1'))::text,
          'false/false/false', '8: a flagged director calling the helpers directly (RPC) gets false from all three (no membership probing)');
RESET ROLE;
SELECT tests.authenticate_as('lp101_cons');
SELECT is(pg_temp.view_counts(), '0/0/0/0/0/0', '8: a flagged consultor reads nothing through the six views');
SELECT is(public.auth_lp_report_all()::text || '/' || public.auth_lp_report_sees_user(pg_temp.uid('lp101_b1'))::text,
          'false/false', '8: a flagged consultor calling the helpers directly gets false');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET must_change_password = false WHERE id IN (pg_temp.uid('lp101_dirA'), pg_temp.uid('lp101_cons'));
SELECT tests.authenticate_as('lp101_dirA');
SELECT is((SELECT count(*)::int FROM public.learning_path_assigned_users WHERE path_id = ANY (pg_temp.paths())), 7, '8: clearing the flag restores the director''s reads');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
