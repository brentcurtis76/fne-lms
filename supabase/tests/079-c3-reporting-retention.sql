-- =============================================================================
-- 079-c3-reporting-retention.sql — RLS closure C3 (reporting, decision D2)
-- and C4 (retention) — migration 20260907120600_c3_reporting_retention.sql.
--
--   1. catalog: the durable grain table (RLS, grants, policies), the five
--      views (security_invoker, grants), the retention / timezone helpers
--   2. settlement writes the grain exactly once per settled session, in the
--      reporting timezone (America/Santiago day boundary), union-clipped
--   3. known-value metrics through the views as a literal admin: deduplicated
--      population, course / path completion, credited time, daily distinct
--      users, monthly distinct users (not the sum of days), unavailable
--      metrics are NULL not 0
--   4. exposure: a non-admin sees only their own summary row and nothing from
--      the cross-user views; anon cannot read; the backend reads everything
--   5. retention: bounded deletion of old settled sessions with has_more;
--      evidence still needed by settlement (open overlapping session) or by
--      reporting (no grain) is retained and reported; the boundary must be at
--      least 7 days old; the views survive the deletion; authenticated / anon
--      cannot execute; close_stale still settles and reports on an idle run
--   6. backlog drainage: more than 500 stale sessions are closed in bounded
--      batches of 500 per maintenance run until none remain
--   7. concurrent-start race (found by an E2E retry in the closure round): a
--      predecessor whose session_start is later than this transaction's
--      now() is closed at its own start with zero minutes instead of
--      violating learning_path_progress_sessions_time_valid
----   8. C-R1-02 (closure review 2026-09-08): the owner views bypass the
--      restrictive forced_password_change_guard of the tables they read, so
--      each view applies password_change_gate_ok() itself — actual SELECTs as
--      a flagged / unflagged admin and learner across all five views, plus the
--      definer readers get_school_user_counts and auth_accessible_course_ids,
--      with anon and backend controls; clearing the flag restores the reads
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(121);

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

-- closed, unsettled session as postgres (triggers: the heartbeat guard clamps
-- to now(); the historical-close guard only fires on UPDATE OF session_end)
CREATE OR REPLACE FUNCTION pg_temp.closed_session(k text, p uuid, s timestamptz, e timestamptz) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat)
  VALUES (pg_temp.uid(k), p, 'path_view', s, e, greatest(0, floor(extract(epoch FROM (e - s)) / 60))::int, e)
  RETURNING id INTO v;
  RETURN v;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Catalog
-- ----------------------------------------------------------------------------
SELECT has_table('public', 'learning_path_daily_user_activity', 'grain table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.learning_path_daily_user_activity'::regclass), 'grain table has RLS enabled');
SELECT is(has_table_privilege('anon', 'public.learning_path_daily_user_activity', 'SELECT'), false, 'grain: anon cannot SELECT');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_daily_user_activity', 'SELECT'), true, 'grain: authenticated may SELECT (own rows by policy)');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_daily_user_activity', 'INSERT'), false, 'grain: authenticated cannot INSERT');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_daily_user_activity', 'UPDATE'), false, 'grain: authenticated cannot UPDATE');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_daily_user_activity', 'DELETE'), false, 'grain: authenticated cannot DELETE');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename = 'learning_path_daily_user_activity'), 3, 'grain: own-read, service and forced-password-change-guard policies');
SELECT has_view('public', 'learning_path_assigned_users', 'view learning_path_assigned_users exists');
SELECT has_view('public', 'user_learning_path_summary', 'view user_learning_path_summary exists');
SELECT has_view('public', 'learning_path_performance_summary', 'view learning_path_performance_summary exists');
SELECT has_view('public', 'learning_path_daily_summary', 'view learning_path_daily_summary exists');
SELECT has_view('public', 'learning_path_monthly_summary', 'view learning_path_monthly_summary exists');
SELECT is((SELECT count(*)::int FROM pg_class c WHERE c.relkind = 'v' AND c.relname IN ('learning_path_assigned_users','user_learning_path_summary','learning_path_performance_summary','learning_path_daily_summary','learning_path_monthly_summary') AND 'security_barrier=true' = ANY (c.reloptions)), 5, 'all five views are security_barrier owner views (privacy enforced inside)');
SELECT is(has_table_privilege('anon', 'public.user_learning_path_summary', 'SELECT'), false, 'views: anon cannot SELECT user_learning_path_summary');
SELECT is(has_table_privilege('anon', 'public.learning_path_performance_summary', 'SELECT'), false, 'views: anon cannot SELECT learning_path_performance_summary');
SELECT is(has_table_privilege('authenticated', 'public.learning_path_daily_summary', 'SELECT'), true, 'views: authenticated may SELECT learning_path_daily_summary (filtered inside)');
SELECT is(has_function_privilege('service_role', 'public.archive_settled_learning_path_sessions(timestamptz, integer)', 'EXECUTE'), true, 'archive: service_role may execute');
SELECT is(has_function_privilege('authenticated', 'public.archive_settled_learning_path_sessions(timestamptz, integer)', 'EXECUTE'), false, 'archive: authenticated cannot execute');
SELECT is(has_function_privilege('anon', 'public.archive_settled_learning_path_sessions(timestamptz, integer)', 'EXECUTE'), false, 'archive: anon cannot execute');
SELECT is(public.lp_reporting_timezone(), 'America/Santiago', 'reporting timezone is America/Santiago');
SELECT is(public.lp_activity_date('2026-01-01T02:30:00Z'::timestamptz), '2025-12-31'::date, 'lp_activity_date: 02:30 UTC on Jan 1 is Dec 31 in Santiago');
SELECT is(public.lp_activity_date('2026-01-01T03:30:00Z'::timestamptz), '2026-01-01'::date, 'lp_activity_date: 03:30 UTC on Jan 1 is Jan 1 in Santiago (summer, UTC-3)');
SELECT is(has_function_privilege('authenticated', 'public.settle_learning_path_sessions(uuid[])', 'EXECUTE'), false, 'settle_learning_path_sessions stays internal');

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('c3_admin');
SELECT tests.create_supabase_user('c3_u1');   -- direct assignee AND group member (dedupe)
SELECT tests.create_supabase_user('c3_u2');   -- group member only
SELECT tests.create_supabase_user('c3_u3');   -- direct assignee, completed the path
SELECT tests.create_supabase_user('c3_out');  -- nothing
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved' FROM unnest(ARRAY['c3_admin','c3_u1','c3_u2','c3_u3','c3_out']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (9791, 'C3 school (pgTAP 079)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES ('79000000-0000-4000-8000-00000000c001', 9791, 'C3 community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES ('79000000-0000-4000-8000-00000000bb01', '79000000-0000-4000-8000-00000000c001', 'C3 workspace');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('c3_admin'), 'admin',   NULL, NULL, true),
  (pg_temp.uid('c3_u1'),    'docente', 9791, '79000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('c3_u2'),    'docente', 9791, '79000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('c3_u3'),    'docente', 9791, NULL, true),
  (pg_temp.uid('c3_out'),   'docente', 9791, NULL, true);
INSERT INTO public.instructors (id, full_name) VALUES ('79000000-0000-4000-8000-00000000f001', 'C3 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('79000000-0000-4000-8000-000000000c01', 'C3 K1', 'x', '79000000-0000-4000-8000-00000000f001'),
  ('79000000-0000-4000-8000-000000000c02', 'C3 K2', 'x', '79000000-0000-4000-8000-00000000f001');
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('79000000-0000-4000-8000-00000000000a', 'C3 path', 'K1 + K2', pg_temp.uid('c3_admin')),
  ('79000000-0000-4000-8000-00000000000b', 'C3 empty path', 'no courses, no users', pg_temp.uid('c3_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('79000000-0000-4000-8000-00000000000a', '79000000-0000-4000-8000-000000000c01', 1),
  ('79000000-0000-4000-8000-00000000000a', '79000000-0000-4000-8000-000000000c02', 2);
INSERT INTO public.learning_path_assignments (path_id, user_id, group_id, assigned_by, assigned_at) VALUES
  ('79000000-0000-4000-8000-00000000000a', pg_temp.uid('c3_u1'), NULL, pg_temp.uid('c3_admin'), now() - interval '40 days'),
  ('79000000-0000-4000-8000-00000000000a', pg_temp.uid('c3_u3'), NULL, pg_temp.uid('c3_admin'), now() - interval '2 days'),
  ('79000000-0000-4000-8000-00000000000a', NULL, '79000000-0000-4000-8000-00000000bb01', pg_temp.uid('c3_admin'), now() - interval '10 days');
-- u1 completed K1 (course completion), u3 completed both courses and the path
INSERT INTO public.course_enrollments (user_id, course_id, is_completed, progress_percentage, completed_at, access_origin) VALUES
  (pg_temp.uid('c3_u1'), '79000000-0000-4000-8000-000000000c01', true, 100, '2026-03-10T15:00:00Z', 'learning_path'),
  (pg_temp.uid('c3_u1'), '79000000-0000-4000-8000-000000000c02', false, 30, NULL, 'learning_path'),
  (pg_temp.uid('c3_u3'), '79000000-0000-4000-8000-000000000c01', true, 100, '2026-03-11T15:00:00Z', 'learning_path'),
  (pg_temp.uid('c3_u3'), '79000000-0000-4000-8000-000000000c02', true, 100, '2026-03-12T15:00:00Z', 'learning_path');
UPDATE public.learning_path_user_progress SET started_at = '2026-03-01T12:00:00Z', completed_at = '2026-03-12T15:00:00Z', total_time_spent_minutes = 200
 WHERE user_id = pg_temp.uid('c3_u3') AND path_id = '79000000-0000-4000-8000-00000000000a';

-- ----------------------------------------------------------------------------
-- 2. Settlement writes the grain
-- ----------------------------------------------------------------------------
-- u1: two disjoint sessions on 2026-03-10 (Santiago), 30 + 20 minutes; one
-- session on 2026-03-11 that overlaps the first by 10 minutes → credited 20
-- of its 30; one session at 02:30Z on 2026-03-12 = 23:30 Santiago on the 11th.
SELECT pg_temp.closed_session('c3_u1', '79000000-0000-4000-8000-00000000000a', '2026-03-10T13:00:00Z', '2026-03-10T13:30:00Z') AS s1 \gset
SELECT pg_temp.closed_session('c3_u1', '79000000-0000-4000-8000-00000000000a', '2026-03-10T14:00:00Z', '2026-03-10T14:20:00Z') AS s2 \gset
SELECT is(public.settle_learning_path_sessions(ARRAY[:'s1'::uuid, :'s2'::uuid]), 2, '2: two disjoint sessions settle');
SELECT is((SELECT sessions_count || '/' || credited_minutes || '/' || session_minutes FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u1') AND activity_date = '2026-03-10'), '2/50/50', '2: grain 2026-03-10 = 2 sessions, 50 credited, 50 recorded');
SELECT pg_temp.closed_session('c3_u1', '79000000-0000-4000-8000-00000000000a', '2026-03-10T13:20:00Z', '2026-03-10T13:50:00Z') AS s3 \gset
SELECT is(public.settle_learning_path_sessions(ARRAY[:'s3'::uuid]), 1, '2: an overlapping session settles');
SELECT is((SELECT sessions_count || '/' || credited_minutes || '/' || session_minutes FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u1') AND activity_date = '2026-03-10'), '3/70/80', '2: grain now 3 sessions, 70 credited (union-clipped), 80 recorded');
SELECT is(public.settle_learning_path_sessions(ARRAY[:'s3'::uuid]), 0, '2: settling again credits nothing');
SELECT is((SELECT sessions_count FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u1') AND activity_date = '2026-03-10'), 3, '2: grain unchanged by the repeat');
SELECT pg_temp.closed_session('c3_u1', '79000000-0000-4000-8000-00000000000a', '2026-03-12T02:30:00Z', '2026-03-12T02:45:00Z') AS s4 \gset
SELECT is(public.settle_learning_path_sessions(ARRAY[:'s4'::uuid]), 1, '2: a late-evening session settles');
SELECT is((SELECT credited_minutes FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u1') AND activity_date = '2026-03-11'), 15, '2: 02:30Z on the 12th lands on 2026-03-11 (Santiago day boundary)');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u1')), 2, '2: u1 has two grain days');
-- u2 (group only): one session on the 10th
SELECT pg_temp.closed_session('c3_u2', '79000000-0000-4000-8000-00000000000a', '2026-03-10T16:00:00Z', '2026-03-10T16:40:00Z') AS s5 \gset
SELECT is(public.settle_learning_path_sessions(ARRAY[:'s5'::uuid]), 1, '2: group member session settles');
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_user_progress WHERE user_id = pg_temp.uid('c3_u1') AND path_id = '79000000-0000-4000-8000-00000000000a'), 85, '2: u1 progress total = 70 + 15 (union credit unchanged by the grain)');

-- ----------------------------------------------------------------------------
-- 3. Known-value metrics as a literal admin
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c3_admin');
SELECT is((SELECT count(*)::int FROM public.learning_path_assigned_users WHERE path_id = '79000000-0000-4000-8000-00000000000a'), 3, '3: assigned population = u1, u2, u3 (u1 direct AND member counted once)');
SELECT is((SELECT via_direct::text || '/' || via_group::text FROM public.learning_path_assigned_users WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND user_id = pg_temp.uid('c3_u1')), 'true/true', '3: u1 is both direct and group');
SELECT is((SELECT first_assigned_at::date FROM public.learning_path_assigned_users WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND user_id = pg_temp.uid('c3_u1')), (now() - interval '40 days')::date, '3: first_assigned_at is the earliest source');
SELECT is((SELECT status || '/' || total_courses || '/' || completed_courses || '/' || overall_progress_percentage || '/' || total_time_spent_minutes
             FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('c3_u1') AND path_id = '79000000-0000-4000-8000-00000000000a'),
          'in_progress/2/1/50.00/85', '3: u1 summary: in_progress, 1 of 2 courses, 50 %, 85 credited minutes');
SELECT is((SELECT status || '/' || completed_courses || '/' || overall_progress_percentage FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('c3_u3') AND path_id = '79000000-0000-4000-8000-00000000000a'), 'completed/2/100.00', '3: u3 summary: completed, 2 of 2, 100 %');
SELECT is((SELECT status || '/' || completed_courses || '/' || total_time_spent_minutes FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('c3_u2') AND path_id = '79000000-0000-4000-8000-00000000000a'), 'in_progress/0/40', '3: u2 (group only): in_progress from credited time, 0 courses, 40 minutes');
SELECT is((SELECT is_at_risk FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('c3_u1') AND path_id = '79000000-0000-4000-8000-00000000000a'), NULL, '3: is_at_risk is NULL (unavailable, no definition)');
SELECT is((SELECT total_enrolled_users || '/' || total_completed_users || '/' || total_in_progress_users || '/' || overall_completion_rate || '/' || total_time_spent_hours || '/' || total_courses
             FROM public.learning_path_performance_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a'),
          '3/1/2/33.33/5.42/2', '3: performance: 3 enrolled, 1 completed, 2 in progress, 33.33 %, 5.42 h (325 min), 2 courses');
SELECT is((SELECT avg_completion_time_days FROM public.learning_path_performance_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a'), 11.13, '3: avg completion time 11.13 days (u3: Mar 1 12:00 → Mar 12 15:00)');
SELECT is((SELECT engagement_score FROM public.learning_path_performance_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a'), NULL, '3: engagement_score is NULL (unavailable)');
SELECT is((SELECT recent_enrollments FROM public.learning_path_performance_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a'), 2, '3: recent_enrollments = 2 (u3 direct 2 days ago; u2 via the group 10 days ago; u1 counts by its earliest source at 40 days → not recent)');
SELECT is((SELECT total_enrolled_users || '/' || coalesce(overall_completion_rate::text, 'NULL') FROM public.learning_path_performance_summary WHERE path_id = '79000000-0000-4000-8000-00000000000b'), '0/NULL', '3: empty path: 0 users and a NULL rate (not 0)');
SELECT is((SELECT total_active_users || '/' || total_sessions_count || '/' || total_session_time_minutes || '/' || course_completions
             FROM public.learning_path_daily_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND summary_date = '2026-03-10'),
          '2/4/110/1', '3: daily 2026-03-10: 2 distinct users, 4 sessions, 110 credited minutes, 1 course completion (u1 K1)');
SELECT is((SELECT total_active_users || '/' || course_completions FROM public.learning_path_daily_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND summary_date = '2026-03-11'), '1/1', '3: daily 2026-03-11: 1 user (u1 late evening), 1 completion (u3 K1)');
SELECT is((SELECT total_active_users || '/' || course_completions FROM public.learning_path_daily_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND summary_date = '2026-03-12'), '0/1', '3: daily 2026-03-12: no activity, 1 completion (a completion-only day still appears)');
SELECT is((SELECT completion_rate FROM public.learning_path_daily_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND summary_date = '2026-03-10'), NULL, '3: daily completion_rate is NULL (unavailable)');
SELECT is((SELECT total_active_users || '/' || total_sessions || '/' || total_session_time_minutes || '/' || total_completions || '/' || avg_daily_active_users || '/' || avg_session_duration_minutes
             FROM public.learning_path_monthly_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND summary_month = '2026-03-01'),
          '2/5/125/3/0.10/25.00', '3: monthly 2026-03: 2 DISTINCT users (not 3 = 2 + 1 summed from days), 5 sessions, 125 min, 3 completions, 3 user-days / 31 = 0.10, 25 min per session');
SELECT is((SELECT avg_completion_rate FROM public.learning_path_monthly_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND summary_month = '2026-03-01'), NULL, '3: monthly avg_completion_rate is NULL (unavailable)');

-- ----------------------------------------------------------------------------
-- 4. Exposure
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c3_u1');
SELECT is((SELECT count(*)::int FROM public.user_learning_path_summary), 1, '4: a learner sees exactly their own summary row');
SELECT is((SELECT total_time_spent_minutes FROM public.user_learning_path_summary), 85, '4: and it is their own figure');
SELECT is((SELECT count(*)::int FROM public.learning_path_assigned_users), 1, '4: a learner sees only themselves in the assigned population');
SELECT is((SELECT count(*)::int FROM public.learning_path_performance_summary), 0, '4: a learner sees no path performance row (cross-user: admin only)');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_summary), 0, '4: a learner sees no daily summary');
SELECT is((SELECT count(*)::int FROM public.learning_path_monthly_summary), 0, '4: a learner sees no monthly summary');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity), 2, '4: a learner reads only their own grain rows');
SELECT throws_ok($$INSERT INTO public.learning_path_daily_user_activity (path_id, user_id, activity_date) VALUES ('79000000-0000-4000-8000-00000000000a', auth.uid(), current_date)$$, '42501', NULL, '4: a learner cannot write grain');
RESET ROLE;
SELECT tests.authenticate_as('c3_out');
SELECT is((SELECT count(*)::int FROM public.user_learning_path_summary), 0, '4: an unassigned user sees nothing');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity), 0, '4: an unassigned user reads no grain');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT count(*) FROM public.user_learning_path_summary$$, '42501', NULL, '4: anon cannot read user_learning_path_summary');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_daily_user_activity$$, '42501', NULL, '4: anon cannot read the grain');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT is((SELECT count(*)::int FROM public.user_learning_path_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a'), 3, '4: the backend reads every summary row');
SELECT is((SELECT count(*)::int FROM public.learning_path_performance_summary WHERE path_id IN ('79000000-0000-4000-8000-00000000000a','79000000-0000-4000-8000-00000000000b')), 2, '4: the backend reads the performance rows');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 5. Retention
-- ----------------------------------------------------------------------------
-- Everything settled above (the five March sessions) is already older than
-- the 7-day boundary. Add: three old sessions for u3 (20, 21, 22 days ago);
-- one for u1 (30 days ago) whose (user, path) also has an OPEN session started
-- 31 days ago (still settlement evidence → retained); one for u2 (25 days ago)
-- whose grain row is removed to simulate missing reporting evidence
-- (→ retained).
SELECT pg_temp.closed_session('c3_u3', '79000000-0000-4000-8000-00000000000a', now() - interval '20 days', now() - interval '20 days' + interval '10 minutes') AS o1 \gset
SELECT pg_temp.closed_session('c3_u3', '79000000-0000-4000-8000-00000000000a', now() - interval '21 days', now() - interval '21 days' + interval '10 minutes') AS o2 \gset
SELECT pg_temp.closed_session('c3_u3', '79000000-0000-4000-8000-00000000000a', now() - interval '22 days', now() - interval '22 days' + interval '10 minutes') AS o3 \gset
SELECT pg_temp.closed_session('c3_u1', '79000000-0000-4000-8000-00000000000a', now() - interval '30 days', now() - interval '30 days' + interval '10 minutes') AS o4 \gset
SELECT pg_temp.closed_session('c3_u2', '79000000-0000-4000-8000-00000000000a', now() - interval '25 days', now() - interval '25 days' + interval '10 minutes') AS o5 \gset
SELECT is(public.settle_learning_path_sessions(ARRAY[:'o1'::uuid, :'o2'::uuid, :'o3'::uuid, :'o4'::uuid, :'o5'::uuid]), 5, '5: five old sessions settled (grain written)');
INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type, session_start, last_heartbeat)
VALUES (pg_temp.uid('c3_u1'), '79000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '31 days', now() - interval '31 days');
DELETE FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u2') AND activity_date = public.lp_activity_date(now() - interval '25 days');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u3')), 3, '5: u3 has three grain days before retention');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE session_end < now() - interval '7 days' AND settled_at IS NOT NULL), 10, '5: ten settled sessions are older than the boundary (5 March + 5 old)');

RESET ROLE;
SELECT pg_temp.set_service();
SELECT throws_ok($$SELECT public.archive_settled_learning_path_sessions(now() - interval '6 days', 10)$$, '22023', NULL, '5: a boundary newer than 7 days is refused');
SELECT throws_ok($$SELECT public.archive_settled_learning_path_sessions(NULL, 10)$$, '22023', NULL, '5: a NULL boundary is refused');
SELECT is((SELECT r ->> 'deleted' || '/' || (r ->> 'has_more') FROM public.archive_settled_learning_path_sessions(now() - interval '7 days', 3) r), '3/true', '5: first bounded run deletes 3 and reports a remaining backlog');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN (:'o1'::uuid, :'o2'::uuid, :'o3'::uuid)), 3, '5: the oldest sessions go first (March): u3''s three still remain after the first batch');
SELECT is((SELECT r ->> 'deleted' || '/' || (r ->> 'has_more') || '/' || (r ->> 'retained_open_overlap') || '/' || (r ->> 'retained_missing_evidence')
             FROM public.archive_settled_learning_path_sessions(now() - interval '7 days', 10) r), '5/false/1/1', '5: second run drains the backlog: 5 deleted, has_more false, 1 retained for an open overlapping session, 1 for missing grain evidence');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN (:'o1'::uuid, :'o2'::uuid, :'o3'::uuid)), 0, '5: u3''s old sessions are gone');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id = :'o4'::uuid), 1, '5: u1''s old session is retained (an unsettled overlapping session of the pair exists)');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id = :'o5'::uuid), 1, '5: u2''s old session is retained (no grain evidence)');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_u3')), 3, '5: the grain is untouched by the deletion');
SELECT is((public.archive_settled_learning_path_sessions(now() - interval '7 days', 10) ->> 'deleted')::int, 0, '5: an idle run deletes nothing');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('c3_u1')), 2, '5: u1 keeps the retained evidence session and the open one');
RESET ROLE;
SELECT tests.authenticate_as('c3_admin');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a' AND total_sessions_count > 0), 6, '5: after retention the daily summary still shows every activity day with grain (2 March days + 3 u3 days + u1''s 30-day-old day)');
SELECT is((SELECT sum(total_sessions_count)::int FROM public.learning_path_daily_summary WHERE path_id = '79000000-0000-4000-8000-00000000000a'), 9, '5: and every settled session with grain (5 March + 3 u3 + 1 u1) is still counted although 8 session rows were deleted');
SELECT is((SELECT total_time_spent_minutes FROM public.user_learning_path_summary WHERE user_id = pg_temp.uid('c3_u3') AND path_id = '79000000-0000-4000-8000-00000000000a'), 230, '5: u3''s credited total (200 + 3 × 10) survives the deletion of its sessions');
RESET ROLE;
SELECT tests.authenticate_as('c3_u1');
SELECT throws_ok($$SELECT public.archive_settled_learning_path_sessions(now() - interval '8 days', 10)$$, '42501', NULL, '5: authenticated cannot execute the archive');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.archive_settled_learning_path_sessions(now() - interval '8 days', 10)$$, '42501', NULL, '5: anon cannot execute the archive');
RESET ROLE;
-- maintenance: the 31-day-old open session (a backend writer may backdate a
-- heartbeat) is stale → the first close_stale run closes and settles it; the
-- next run is idle and says so; the retained overlap evidence is then free.
SELECT pg_temp.set_service();
SELECT is((SELECT r ->> 'closed' || '/' || (r ->> 'settled') FROM public.close_stale_learning_path_sessions(now() - interval '15 minutes') r), '1/1', '5: a stale open session is closed and settled by maintenance');
SELECT is((SELECT r ->> 'closed' || '/' || (r ->> 'settled') FROM public.close_stale_learning_path_sessions(now() - interval '15 minutes') r), '0/0', '5: an idle maintenance run closes and settles nothing');
SELECT is((public.archive_settled_learning_path_sessions(now() - interval '7 days', 10) ->> 'deleted')::int, 2, '5: once the overlapping session is settled, both old u1 sessions become archivable');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 6. Backlog drainage: > 500 stale candidates
-- ----------------------------------------------------------------------------
-- 620 paths, each with one stale OPEN session of c3_out (the single-open guard
-- allows one open session per (user, path); a backend writer may backdate the
-- heartbeat). close_stale is bounded to 500 candidates per run.
RESET ROLE;
INSERT INTO public.learning_paths (id, name, description, created_by)
SELECT ('79000000-0000-4000-8000-1' || lpad(g::text, 11, '0'))::uuid, 'C3 backlog path ' || g, 'x', pg_temp.uid('c3_admin')
  FROM generate_series(1, 620) g;
INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
SELECT ('79000000-0000-4000-8000-1' || lpad(g::text, 11, '0'))::uuid, pg_temp.uid('c3_out'), pg_temp.uid('c3_admin')
  FROM generate_series(1, 620) g;
INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type, session_start, last_heartbeat)
SELECT pg_temp.uid('c3_out'), ('79000000-0000-4000-8000-1' || lpad(g::text, 11, '0'))::uuid, 'path_view', now() - interval '3 hours', now() - interval '2 hours'
  FROM generate_series(1, 620) g;
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('c3_out') AND session_end IS NULL), 620, '6: 620 stale open sessions seeded');
SELECT pg_temp.set_service();
SELECT is((SELECT r ->> 'closed' || '/' || (r ->> 'settled') FROM public.close_stale_learning_path_sessions(now() - interval '15 minutes') r), '500/500', '6: first run closes and settles the 500-session batch bound');
SELECT is((SELECT r ->> 'closed' || '/' || (r ->> 'settled') FROM public.close_stale_learning_path_sessions(now() - interval '15 minutes') r), '120/120', '6: second run drains the remaining 120');
SELECT is((SELECT r ->> 'closed' || '/' || (r ->> 'settled') FROM public.close_stale_learning_path_sessions(now() - interval '15 minutes') r), '0/0', '6: third run is idle');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('c3_out') AND (session_end IS NULL OR settled_at IS NULL)), 0, '6: nothing open or unsettled remains');
SELECT is((SELECT count(*)::int FROM public.learning_path_daily_user_activity WHERE user_id = pg_temp.uid('c3_out')), 620, '6: one grain row per (path, day) was written for the whole backlog');

-- ----------------------------------------------------------------------------
-- 7. Concurrent-start race: the earlier-begun transaction runs second
-- ----------------------------------------------------------------------------
-- pgTAP runs in one transaction, so now() is fixed at its start; a session
-- inserted with session_start = clock_timestamp() + 1 s reproduces "the other
-- transaction's session started after my now()".
RESET ROLE;
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat)
VALUES ('79000000-0000-4000-8000-00000000f7a1', pg_temp.uid('c3_u2'), '79000000-0000-4000-8000-00000000000a', 'path_view', clock_timestamp() + interval '1 second', clock_timestamp() + interval '1 second');
SELECT ok((SELECT session_start > now() FROM public.learning_path_progress_sessions WHERE id = '79000000-0000-4000-8000-00000000f7a1'), '7: the open predecessor started after this transaction''s now()');
RESET ROLE;
SELECT tests.authenticate_as('c3_u2');
SELECT lives_ok($$SELECT public.start_learning_path_session(auth.uid(), '79000000-0000-4000-8000-00000000000a', NULL, 'path_view')$$, '7: start succeeds instead of failing the time_valid check (the R2-03 E2E race)');
SELECT is((SELECT session_end = session_start AND time_spent_minutes = 0 AND settled_at IS NOT NULL FROM public.learning_path_progress_sessions WHERE id = '79000000-0000-4000-8000-00000000f7a1'), true, '7: the later-started predecessor is closed at its own start with zero minutes and settled');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = auth.uid() AND path_id = '79000000-0000-4000-8000-00000000000a' AND session_end IS NULL), 1, '7: exactly one open session remains');
SELECT is((SELECT credited_minutes FROM public.learning_path_progress_sessions WHERE id = '79000000-0000-4000-8000-00000000f7a1'), 0, '7: nothing was credited for the zero-length predecessor');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 8. C-R1-02 — forced-password-change isolation through the owner views
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
CREATE OR REPLACE FUNCTION pg_temp.view_counts(p uuid) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT (SELECT count(*) FROM public.learning_path_assigned_users WHERE path_id = p)
    || '/' || (SELECT count(*) FROM public.user_learning_path_summary WHERE path_id = p)
    || '/' || (SELECT count(*) FROM public.learning_path_performance_summary WHERE path_id = p)
    || '/' || (SELECT count(*) FROM public.learning_path_daily_summary WHERE path_id = p)
    || '/' || (SELECT count(*) FROM public.learning_path_monthly_summary WHERE path_id = p) $$;
-- unflagged controls first (the data the flagged reads must NOT return)
SELECT tests.authenticate_as('c3_admin');
SELECT ok(public.password_change_gate_ok(), '8: control — the unflagged admin passes the gate');
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '3/3/1/12/4', '8: control — the unflagged admin reads every view (assigned 3 / user 3 / performance 1 / daily 12 / monthly 4)');
SELECT lives_ok($$SELECT * FROM public.get_school_user_counts()$$, '8: control — the unflagged admin may call get_school_user_counts');
RESET ROLE;
SELECT tests.authenticate_as('c3_u1');
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '1/1/0/0/0', '8: control — the unflagged learner reads their own row through the two own-row views only');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()), 2, '8: control — the unflagged learner has 2 accessible course ids');
RESET ROLE;
-- flag both
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET must_change_password = true WHERE id IN (pg_temp.uid('c3_admin'), pg_temp.uid('c3_u1'));
SELECT tests.authenticate_as('c3_admin');
SELECT ok(NOT public.password_change_gate_ok(), '8: the flagged admin is held by the gate');
SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id = '79000000-0000-4000-8000-00000000000a'), 0, '8: the flagged admin reads no learning_paths row directly (restrictive policy)');
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '0/0/0/0/0', '8: the flagged admin reads NOTHING through any of the five owner views (Codex reproduction closed)');
SELECT is((SELECT count(*)::int FROM public.learning_path_performance_summary), 0, '8: … nor any other path in the performance view');
SELECT throws_ok($$SELECT * FROM public.get_school_user_counts()$$, '42501', 'Password change required', '8: the flagged admin cannot read the definer aggregate get_school_user_counts');
RESET ROLE;
SELECT tests.authenticate_as('c3_u1');
SELECT ok(NOT public.password_change_gate_ok(), '8: the flagged learner is held by the gate');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE user_id = auth.uid()), 0, '8: the flagged learner reads no assignment row directly');
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '0/0/0/0/0', '8: the flagged learner reads NOTHING through the views (their own summary row included)');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()), 0, '8: the flagged learner gets no accessible course ids from the definer reader');
RESET ROLE;
-- anon and backend controls while the flags are set
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_performance_summary$$, '42501', NULL, '8: anon is refused by the view grant (not by an empty result)');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '3/3/1/12/4', '8: the backend (service_role, no end-user identity) still reads every view — legitimate maintenance / reporting');
SELECT lives_ok($$SELECT * FROM public.get_school_user_counts()$$, '8: the backend may still call get_school_user_counts');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '3/3/1/12/4', '8: a direct database session (postgres, no claims) reads every view');
-- the established way out: the flag is cleared (the change-password completion runs on the service role)
UPDATE public.profiles SET must_change_password = false WHERE id IN (pg_temp.uid('c3_admin'), pg_temp.uid('c3_u1'));
SELECT tests.authenticate_as('c3_admin');
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '3/3/1/12/4', '8: clearing the flag restores the admin''s reads through every view');
RESET ROLE;
SELECT tests.authenticate_as('c3_u1');
SELECT is(pg_temp.view_counts('79000000-0000-4000-8000-00000000000a'), '1/1/0/0/0', '8: clearing the flag restores the learner''s own-row reads');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()), 2, '8: … and the accessible course ids');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
