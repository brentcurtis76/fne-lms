-- =============================================================================
-- 099-learning-path-actor-matrix.sql — W-B2c-01 gap G3 (reconciliation §2
-- clause 9, §3 G3): the COMPLETE runtime matrix
--
--   actors {anon, admin, equipo_directivo, consultor, direct assignee,
--           group assignee, unassigned authenticated}
--   × tables {learning_paths, learning_path_courses, learning_path_assignments,
--             learning_path_progress_sessions}
--   × {SELECT, INSERT, UPDATE, DELETE}
--
-- plus a runtime call of each of the 8 governed functions per actor
-- (create_full_learning_path, update_full_learning_path,
-- batch_assign_learning_path, start_learning_path_session,
-- update_session_heartbeat, end_learning_path_session,
-- auth_is_learning_path_member, increment_path_assignment_time).
--
-- Every expected outcome is derived from the migrations
-- (20260908180000_learning_path_governance.sql §2-§5, 20260908180300_r2_remediation.sql
-- session INSERT revoke + start_learning_path_session,
-- 20260908180500_c2_course_entitlement.sql batch_assign_learning_path):
--   * anon holds no table privilege and no EXECUTE           -> 42501 everywhere
--   * paths / course links: admin FOR ALL, assignee SELECT   -> others see 0,
--     INSERT fails WITH CHECK, UPDATE / DELETE silently reach 0 rows
--   * assignments: admin-only INSERT/UPDATE/DELETE policies; own-row progress
--     UPDATE limited to (last_activity_at, completed_at, current_course_sequence)
--   * sessions: no INSERT and no DELETE privilege for ANY application role
--     (admin included); UPDATE limited to (course_id, activity_type,
--     last_heartbeat, session_data, updated_at) on own open rows, or any row
--     for admin ("Admins full access sessions")
--   * increment_path_assignment_time: executable by no application role
-- Silent RLS filtering is asserted as a row count of 0 AND by an unchanged-
-- state block (section 9) before the admin, who runs last.
--
-- Cross-user progress: every non-admin actor attempts a direct INSERT /
-- UPDATE / column-forbidden UPDATE / DELETE of lp99_other's open session sO
-- on the SAME path A the assignees hold, and heartbeat / end of sO.
--
-- Fixture: path A (a) assigned to lp99_direct (a1), to a community
-- workspace (a2, group) and to lp99_other (a3); path B unassigned. Open
-- sessions sD / sG / sO for direct / group member / other on A.
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(190);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

-- Executes a DML statement with the CALLER's privileges and returns ROW_COUNT.
CREATE OR REPLACE FUNCTION pg_temp.rows_affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user(k)
  FROM unnest(ARRAY['lp99_admin','lp99_directivo','lp99_consultor','lp99_direct',
                    'lp99_groupmember','lp99_unassigned','lp99_other']) k;

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['lp99_admin','lp99_directivo','lp99_consultor','lp99_direct',
                    'lp99_groupmember','lp99_unassigned','lp99_other']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9909, 'LP99 school (pgTAP 099)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES ('99000000-0000-4000-8000-00000000c001', 9909, 'LP99 community');
INSERT INTO public.community_workspaces (id, community_id) VALUES ('99000000-0000-4000-8000-00000000bb01', '99000000-0000-4000-8000-00000000c001');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('lp99_admin'),       'admin',            NULL, NULL, true),
  (pg_temp.uid('lp99_directivo'),   'equipo_directivo', 9909, NULL, true),
  (pg_temp.uid('lp99_consultor'),   'consultor',        9909, NULL, true),
  (pg_temp.uid('lp99_direct'),      'docente',          9909, NULL, true),
  (pg_temp.uid('lp99_groupmember'), 'docente',          9909, '99000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('lp99_unassigned'),  'docente',          9909, NULL, true),
  (pg_temp.uid('lp99_other'),       'docente',          9909, NULL, true);

INSERT INTO public.instructors (id, full_name) VALUES ('99000000-0000-4000-8000-00000000f001', 'LP99 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('99000000-0000-4000-8000-000000000c01', 'LP99 course 1', 'LP99 course 1', '99000000-0000-4000-8000-00000000f001'),
  ('99000000-0000-4000-8000-000000000c02', 'LP99 course 2', 'LP99 course 2', '99000000-0000-4000-8000-00000000f001'),
  ('99000000-0000-4000-8000-000000000c03', 'LP99 course 3', 'LP99 course 3', '99000000-0000-4000-8000-00000000f001');

INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('99000000-0000-4000-8000-00000000000a', 'LP99 path A', 'assigned: direct + group + other', pg_temp.uid('lp99_admin')),
  ('99000000-0000-4000-8000-00000000000b', 'LP99 path B', 'unassigned',                       pg_temp.uid('lp99_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c01', 1), ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c02', 2), ('99000000-0000-4000-8000-00000000000b', '99000000-0000-4000-8000-000000000c03', 1);
INSERT INTO public.learning_path_assignments (id, path_id, user_id, group_id, assigned_by) VALUES
  ('99000000-0000-4000-8000-0000000000a1', '99000000-0000-4000-8000-00000000000a', pg_temp.uid('lp99_direct'), NULL,   pg_temp.uid('lp99_admin')),
  ('99000000-0000-4000-8000-0000000000a2', '99000000-0000-4000-8000-00000000000a', NULL,                       '99000000-0000-4000-8000-00000000bb01', pg_temp.uid('lp99_admin')),
  ('99000000-0000-4000-8000-0000000000a3', '99000000-0000-4000-8000-00000000000a', pg_temp.uid('lp99_other'),  NULL,   pg_temp.uid('lp99_admin'));
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat) VALUES
  ('99000000-0000-4000-8000-0000000000d1', pg_temp.uid('lp99_direct'),      '99000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '10 minutes', now()),
  ('99000000-0000-4000-8000-0000000000d2', pg_temp.uid('lp99_groupmember'), '99000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '10 minutes', now()),
  ('99000000-0000-4000-8000-0000000000d3', pg_temp.uid('lp99_other'),       '99000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '10 minutes', now());


-- ============================================================================
-- 1. anon: no table privilege, no EXECUTE (16 table cells + 8 functions)
-- ============================================================================
SELECT pg_temp.set_anon();

SELECT throws_ok($$SELECT count(*) FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_paths', 'anon | learning_paths | SELECT: refused (no privilege)');
SELECT throws_ok($$INSERT INTO public.learning_paths (name, description) VALUES ('LP99 anon', 'x')$$, '42501', 'permission denied for table learning_paths', 'anon | learning_paths | INSERT: refused (no privilege)');
SELECT throws_ok($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_paths', 'anon | learning_paths | UPDATE: refused (no privilege)');
SELECT throws_ok($$DELETE FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_paths', 'anon | learning_paths | DELETE: refused (no privilege)');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_path_courses', 'anon | learning_path_courses | SELECT: refused (no privilege)');
SELECT throws_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000b', '99000000-0000-4000-8000-000000000c01', 9)$$, '42501', 'permission denied for table learning_path_courses', 'anon | learning_path_courses | INSERT: refused (no privilege)');
SELECT throws_ok($$UPDATE public.learning_path_courses SET sequence_order = sequence_order WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_path_courses', 'anon | learning_path_courses | UPDATE: refused (no privilege)');
SELECT throws_ok($$DELETE FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_path_courses', 'anon | learning_path_courses | DELETE: refused (no privilege)');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_path_assignments', 'anon | learning_path_assignments | SELECT: refused (no privilege)');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, group_id) VALUES ('99000000-0000-4000-8000-00000000000b', '99000000-0000-4000-8000-00000000bb01')$$, '42501', 'permission denied for table learning_path_assignments', 'anon | learning_path_assignments | INSERT: refused (no privilege)');
SELECT throws_ok($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_path_assignments', 'anon | learning_path_assignments | UPDATE: refused (no privilege)');
SELECT throws_ok($$DELETE FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$, '42501', 'permission denied for table learning_path_assignments', 'anon | learning_path_assignments | DELETE: refused (no privilege)');
SELECT throws_ok($$SELECT count(*) FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'anon | learning_path_progress_sessions | SELECT: refused (no privilege)');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES ('99000000-0000-4000-8000-000000000000', '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'anon | learning_path_progress_sessions | INSERT: refused (no privilege)');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":1}' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'anon | learning_path_progress_sessions | UPDATE: refused (no privilege)');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'anon | learning_path_progress_sessions | DELETE: refused (no privilege)');
SELECT throws_ok($$SELECT public.create_full_learning_path('x', 'y', '{}'::uuid[], NULL)$$, '42501', 'permission denied for function create_full_learning_path', 'anon | fn create_full_learning_path: not executable');
SELECT throws_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000a', 'x', 'y', '{}'::uuid[], NULL)$$, '42501', 'permission denied for function update_full_learning_path', 'anon | fn update_full_learning_path: not executable');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', '{}'::uuid[], '{}'::uuid[], NULL)$$, '42501', 'permission denied for function batch_assign_learning_path', 'anon | fn batch_assign_learning_path: not executable');
SELECT throws_ok($$SELECT public.start_learning_path_session('99000000-0000-4000-8000-000000000000', '99000000-0000-4000-8000-00000000000a')$$, '42501', 'permission denied for function start_learning_path_session', 'anon | fn start_learning_path_session: not executable');
SELECT throws_ok($$SELECT public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3')$$, '42501', 'permission denied for function update_session_heartbeat', 'anon | fn update_session_heartbeat: not executable');
SELECT throws_ok($$SELECT public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3')$$, '42501', 'permission denied for function end_learning_path_session', 'anon | fn end_learning_path_session: not executable');
SELECT throws_ok($$SELECT public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01')$$, '42501', 'permission denied for function auth_is_learning_path_member', 'anon | fn auth_is_learning_path_member: not executable');
SELECT throws_ok($$SELECT public.increment_path_assignment_time('99000000-0000-4000-8000-000000000000', '99000000-0000-4000-8000-00000000000a', 5)$$, '42501', 'permission denied for function increment_path_assignment_time', 'anon | fn increment_path_assignment_time: not executable');
RESET ROLE;

-- Sections 2-7: authenticated non-admin actors.

-- ============================================================================
-- equipo_directivo (lp99_directivo)
-- ============================================================================
SELECT tests.authenticate_as('lp99_directivo');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'equipo_directivo | learning_paths | SELECT: sees 0 of 2 fixture templates');
SELECT throws_ok($$INSERT INTO public.learning_paths (name, description) VALUES ('LP99 by lp99_directivo', 'x')$$, '42501', 'new row violates row-level security policy for table "learning_paths"', 'equipo_directivo | learning_paths | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'equipo_directivo | learning_paths | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'equipo_directivo | learning_paths | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'equipo_directivo | learning_path_courses | SELECT: sees 0 of 3 fixture links');
SELECT throws_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c03', 9)$$, '42501', 'new row violates row-level security policy for table "learning_path_courses"', 'equipo_directivo | learning_path_courses | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_courses SET sequence_order = sequence_order + 10 WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'equipo_directivo | learning_path_courses | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'equipo_directivo | learning_path_courses | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'equipo_directivo | learning_path_assignments | SELECT: sees 0 of 3 fixture assignments');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('99000000-0000-4000-8000-00000000000b', pg_temp.uid('lp99_directivo'), pg_temp.uid('lp99_directivo'))$$, '42501', 'new row violates row-level security policy for table "learning_path_assignments"', 'equipo_directivo | learning_path_assignments | INSERT: self-assign refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'equipo_directivo | learning_path_assignments | UPDATE (progress column, all fixture rows): reaches 0 rows (incl. other users progress)');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'equipo_directivo | learning_path_assignments | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')), 0, 'equipo_directivo | learning_path_progress_sessions | SELECT: sees no session');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES (pg_temp.uid('lp99_other'), '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'equipo_directivo | learning_path_progress_sessions | INSERT for another user: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"lp99_directivo"}', activity_type = 'course_progress' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$), 0, 'equipo_directivo | learning_path_progress_sessions | UPDATE of another user''s open session: reaches 0 rows');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999 WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'equipo_directivo | learning_path_progress_sessions | UPDATE timing column of another user''s session: no column privilege');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'equipo_directivo | learning_path_progress_sessions | DELETE of another user''s session: no privilege');
SELECT throws_ok($$SELECT public.create_full_learning_path('LP99 fn lp99_directivo', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to create learning paths', 'equipo_directivo | fn create_full_learning_path: refused');
SELECT throws_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000a', 'hijacked', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to update learning paths', 'equipo_directivo | fn update_full_learning_path: refused');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('lp99_directivo')]::uuid[], '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to assign learning paths', 'equipo_directivo | fn batch_assign_learning_path: refused');
SELECT throws_ok($$SELECT public.increment_path_assignment_time(pg_temp.uid('lp99_directivo'), '99000000-0000-4000-8000-00000000000a', 999)$$, '42501', 'permission denied for function increment_path_assignment_time', 'equipo_directivo | fn increment_path_assignment_time: not executable');
SELECT is(public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01'), false, 'equipo_directivo | fn auth_is_learning_path_member(course of A): FALSE');
SELECT throws_ok($$SELECT public.start_learning_path_session(pg_temp.uid('lp99_directivo'), '99000000-0000-4000-8000-00000000000a')$$, '42501', 'User is not assigned to this learning path', 'equipo_directivo | fn start_learning_path_session(self, A): refused');
SELECT is(public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3'), false, 'equipo_directivo | fn update_session_heartbeat(other user''s session): FALSE, nothing written');
SELECT is(public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3'), false, 'equipo_directivo | fn end_learning_path_session(other user''s session): FALSE, nothing written');
RESET ROLE;

-- ============================================================================
-- consultor (lp99_consultor)
-- ============================================================================
SELECT tests.authenticate_as('lp99_consultor');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'consultor | learning_paths | SELECT: sees 0 of 2 fixture templates');
SELECT throws_ok($$INSERT INTO public.learning_paths (name, description) VALUES ('LP99 by lp99_consultor', 'x')$$, '42501', 'new row violates row-level security policy for table "learning_paths"', 'consultor | learning_paths | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'consultor | learning_paths | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'consultor | learning_paths | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'consultor | learning_path_courses | SELECT: sees 0 of 3 fixture links');
SELECT throws_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c03', 9)$$, '42501', 'new row violates row-level security policy for table "learning_path_courses"', 'consultor | learning_path_courses | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_courses SET sequence_order = sequence_order + 10 WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'consultor | learning_path_courses | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'consultor | learning_path_courses | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'consultor | learning_path_assignments | SELECT: sees 0 of 3 fixture assignments');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('99000000-0000-4000-8000-00000000000b', pg_temp.uid('lp99_consultor'), pg_temp.uid('lp99_consultor'))$$, '42501', 'new row violates row-level security policy for table "learning_path_assignments"', 'consultor | learning_path_assignments | INSERT: self-assign refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'consultor | learning_path_assignments | UPDATE (progress column, all fixture rows): reaches 0 rows (incl. other users progress)');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'consultor | learning_path_assignments | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')), 0, 'consultor | learning_path_progress_sessions | SELECT: sees no session');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES (pg_temp.uid('lp99_other'), '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'consultor | learning_path_progress_sessions | INSERT for another user: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"lp99_consultor"}', activity_type = 'course_progress' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$), 0, 'consultor | learning_path_progress_sessions | UPDATE of another user''s open session: reaches 0 rows');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999 WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'consultor | learning_path_progress_sessions | UPDATE timing column of another user''s session: no column privilege');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'consultor | learning_path_progress_sessions | DELETE of another user''s session: no privilege');
SELECT throws_ok($$SELECT public.create_full_learning_path('LP99 fn lp99_consultor', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to create learning paths', 'consultor | fn create_full_learning_path: refused');
SELECT throws_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000a', 'hijacked', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to update learning paths', 'consultor | fn update_full_learning_path: refused');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('lp99_consultor')]::uuid[], '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to assign learning paths', 'consultor | fn batch_assign_learning_path: refused');
SELECT throws_ok($$SELECT public.increment_path_assignment_time(pg_temp.uid('lp99_consultor'), '99000000-0000-4000-8000-00000000000a', 999)$$, '42501', 'permission denied for function increment_path_assignment_time', 'consultor | fn increment_path_assignment_time: not executable');
SELECT is(public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01'), false, 'consultor | fn auth_is_learning_path_member(course of A): FALSE');
SELECT throws_ok($$SELECT public.start_learning_path_session(pg_temp.uid('lp99_consultor'), '99000000-0000-4000-8000-00000000000a')$$, '42501', 'User is not assigned to this learning path', 'consultor | fn start_learning_path_session(self, A): refused');
SELECT is(public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3'), false, 'consultor | fn update_session_heartbeat(other user''s session): FALSE, nothing written');
SELECT is(public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3'), false, 'consultor | fn end_learning_path_session(other user''s session): FALSE, nothing written');
RESET ROLE;

-- ============================================================================
-- unassigned (lp99_unassigned)
-- ============================================================================
SELECT tests.authenticate_as('lp99_unassigned');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'unassigned | learning_paths | SELECT: sees 0 of 2 fixture templates');
SELECT throws_ok($$INSERT INTO public.learning_paths (name, description) VALUES ('LP99 by lp99_unassigned', 'x')$$, '42501', 'new row violates row-level security policy for table "learning_paths"', 'unassigned | learning_paths | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'unassigned | learning_paths | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'unassigned | learning_paths | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'unassigned | learning_path_courses | SELECT: sees 0 of 3 fixture links');
SELECT throws_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c03', 9)$$, '42501', 'new row violates row-level security policy for table "learning_path_courses"', 'unassigned | learning_path_courses | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_courses SET sequence_order = sequence_order + 10 WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'unassigned | learning_path_courses | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'unassigned | learning_path_courses | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 0, 'unassigned | learning_path_assignments | SELECT: sees 0 of 3 fixture assignments');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('99000000-0000-4000-8000-00000000000b', pg_temp.uid('lp99_unassigned'), pg_temp.uid('lp99_unassigned'))$$, '42501', 'new row violates row-level security policy for table "learning_path_assignments"', 'unassigned | learning_path_assignments | INSERT: self-assign refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'unassigned | learning_path_assignments | UPDATE (progress column, all fixture rows): reaches 0 rows (incl. other users progress)');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'unassigned | learning_path_assignments | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')), 0, 'unassigned | learning_path_progress_sessions | SELECT: sees no session');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES (pg_temp.uid('lp99_other'), '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'unassigned | learning_path_progress_sessions | INSERT for another user: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"lp99_unassigned"}', activity_type = 'course_progress' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$), 0, 'unassigned | learning_path_progress_sessions | UPDATE of another user''s open session: reaches 0 rows');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999 WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'unassigned | learning_path_progress_sessions | UPDATE timing column of another user''s session: no column privilege');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'unassigned | learning_path_progress_sessions | DELETE of another user''s session: no privilege');
SELECT throws_ok($$SELECT public.create_full_learning_path('LP99 fn lp99_unassigned', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to create learning paths', 'unassigned | fn create_full_learning_path: refused');
SELECT throws_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000a', 'hijacked', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to update learning paths', 'unassigned | fn update_full_learning_path: refused');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('lp99_unassigned')]::uuid[], '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to assign learning paths', 'unassigned | fn batch_assign_learning_path: refused');
SELECT throws_ok($$SELECT public.increment_path_assignment_time(pg_temp.uid('lp99_unassigned'), '99000000-0000-4000-8000-00000000000a', 999)$$, '42501', 'permission denied for function increment_path_assignment_time', 'unassigned | fn increment_path_assignment_time: not executable');
SELECT is(public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01'), false, 'unassigned | fn auth_is_learning_path_member(course of A): FALSE');
SELECT throws_ok($$SELECT public.start_learning_path_session(pg_temp.uid('lp99_unassigned'), '99000000-0000-4000-8000-00000000000a')$$, '42501', 'User is not assigned to this learning path', 'unassigned | fn start_learning_path_session(self, A): refused');
SELECT is(public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3'), false, 'unassigned | fn update_session_heartbeat(other user''s session): FALSE, nothing written');
SELECT is(public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3'), false, 'unassigned | fn end_learning_path_session(other user''s session): FALSE, nothing written');
RESET ROLE;

-- ============================================================================
-- direct assignee (lp99_direct)
-- ============================================================================
SELECT tests.authenticate_as('lp99_direct');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 1, 'direct assignee | learning_paths | SELECT: sees 1 of 2 fixture templates');
SELECT throws_ok($$INSERT INTO public.learning_paths (name, description) VALUES ('LP99 by lp99_direct', 'x')$$, '42501', 'new row violates row-level security policy for table "learning_paths"', 'direct assignee | learning_paths | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'direct assignee | learning_paths | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'direct assignee | learning_paths | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 2, 'direct assignee | learning_path_courses | SELECT: sees 2 of 3 fixture links');
SELECT throws_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c03', 9)$$, '42501', 'new row violates row-level security policy for table "learning_path_courses"', 'direct assignee | learning_path_courses | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_courses SET sequence_order = sequence_order + 10 WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'direct assignee | learning_path_courses | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'direct assignee | learning_path_courses | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 1, 'direct assignee | learning_path_assignments | SELECT: sees 1 of 3 fixture assignments');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('99000000-0000-4000-8000-00000000000b', pg_temp.uid('lp99_direct'), pg_temp.uid('lp99_direct'))$$, '42501', 'new row violates row-level security policy for table "learning_path_assignments"', 'direct assignee | learning_path_assignments | INSERT: self-assign refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 1, 'direct assignee | learning_path_assignments | UPDATE (progress column, all fixture rows): reaches only own row (1)');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'direct assignee | learning_path_assignments | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')), 1, 'direct assignee | learning_path_progress_sessions | SELECT: sees only own session');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES (pg_temp.uid('lp99_other'), '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'direct assignee | learning_path_progress_sessions | INSERT for another user: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"lp99_direct"}', activity_type = 'course_progress' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$), 0, 'direct assignee | learning_path_progress_sessions | UPDATE of another user''s open session: reaches 0 rows');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999 WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'direct assignee | learning_path_progress_sessions | UPDATE timing column of another user''s session: no column privilege');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'direct assignee | learning_path_progress_sessions | DELETE of another user''s session: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"own"}' WHERE id = '99000000-0000-4000-8000-0000000000d1'$$), 1, 'direct assignee | learning_path_progress_sessions | UPDATE of own open session (granted columns): allowed, 1 row');
SELECT throws_ok($$SELECT public.create_full_learning_path('LP99 fn lp99_direct', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to create learning paths', 'direct assignee | fn create_full_learning_path: refused');
SELECT throws_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000a', 'hijacked', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to update learning paths', 'direct assignee | fn update_full_learning_path: refused');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('lp99_direct')]::uuid[], '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to assign learning paths', 'direct assignee | fn batch_assign_learning_path: refused');
SELECT throws_ok($$SELECT public.increment_path_assignment_time(pg_temp.uid('lp99_direct'), '99000000-0000-4000-8000-00000000000a', 999)$$, '42501', 'permission denied for function increment_path_assignment_time', 'direct assignee | fn increment_path_assignment_time: not executable');
SELECT is(public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01'), true, 'direct assignee | fn auth_is_learning_path_member(course of A): TRUE');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('lp99_direct'), '99000000-0000-4000-8000-00000000000a')$$, 'direct assignee | fn start_learning_path_session(self, A): allowed');
SELECT is(public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3'), false, 'direct assignee | fn update_session_heartbeat(other user''s session): FALSE, nothing written');
SELECT is(public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3'), false, 'direct assignee | fn end_learning_path_session(other user''s session): FALSE, nothing written');
SELECT is(public.update_session_heartbeat((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp99_direct') AND session_end IS NULL)), true, 'direct assignee | fn update_session_heartbeat(own open session): TRUE');
SELECT is(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp99_direct') AND session_end IS NULL)), true, 'direct assignee | fn end_learning_path_session(own open session): TRUE');
RESET ROLE;

-- ============================================================================
-- group assignee (lp99_groupmember)
-- ============================================================================
SELECT tests.authenticate_as('lp99_groupmember');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 1, 'group assignee | learning_paths | SELECT: sees 1 of 2 fixture templates');
SELECT throws_ok($$INSERT INTO public.learning_paths (name, description) VALUES ('LP99 by lp99_groupmember', 'x')$$, '42501', 'new row violates row-level security policy for table "learning_paths"', 'group assignee | learning_paths | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'group assignee | learning_paths | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'group assignee | learning_paths | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 2, 'group assignee | learning_path_courses | SELECT: sees 2 of 3 fixture links');
SELECT throws_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000a', '99000000-0000-4000-8000-000000000c03', 9)$$, '42501', 'new row violates row-level security policy for table "learning_path_courses"', 'group assignee | learning_path_courses | INSERT: refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_courses SET sequence_order = sequence_order + 10 WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'group assignee | learning_path_courses | UPDATE: reaches 0 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'group assignee | learning_path_courses | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 1, 'group assignee | learning_path_assignments | SELECT: sees 1 of 3 fixture assignments');
SELECT throws_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('99000000-0000-4000-8000-00000000000b', pg_temp.uid('lp99_groupmember'), pg_temp.uid('lp99_groupmember'))$$, '42501', 'new row violates row-level security policy for table "learning_path_assignments"', 'group assignee | learning_path_assignments | INSERT: self-assign refused by WITH CHECK');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'group assignee | learning_path_assignments | UPDATE (progress column, all fixture rows): reaches 0 rows (incl. other users progress)');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 0, 'group assignee | learning_path_assignments | DELETE: reaches 0 rows');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')), 1, 'group assignee | learning_path_progress_sessions | SELECT: sees only own session');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES (pg_temp.uid('lp99_other'), '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'group assignee | learning_path_progress_sessions | INSERT for another user: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"lp99_groupmember"}', activity_type = 'course_progress' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$), 0, 'group assignee | learning_path_progress_sessions | UPDATE of another user''s open session: reaches 0 rows');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999 WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'group assignee | learning_path_progress_sessions | UPDATE timing column of another user''s session: no column privilege');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'group assignee | learning_path_progress_sessions | DELETE of another user''s session: no privilege');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"own"}' WHERE id = '99000000-0000-4000-8000-0000000000d2'$$), 1, 'group assignee | learning_path_progress_sessions | UPDATE of own open session (granted columns): allowed, 1 row');
SELECT throws_ok($$SELECT public.create_full_learning_path('LP99 fn lp99_groupmember', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to create learning paths', 'group assignee | fn create_full_learning_path: refused');
SELECT throws_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000a', 'hijacked', 'x', '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to update learning paths', 'group assignee | fn update_full_learning_path: refused');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('lp99_groupmember')]::uuid[], '{}'::uuid[], NULL)$$, '42501', 'User does not have permission to assign learning paths', 'group assignee | fn batch_assign_learning_path: refused');
SELECT throws_ok($$SELECT public.increment_path_assignment_time(pg_temp.uid('lp99_groupmember'), '99000000-0000-4000-8000-00000000000a', 999)$$, '42501', 'permission denied for function increment_path_assignment_time', 'group assignee | fn increment_path_assignment_time: not executable');
SELECT is(public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01'), true, 'group assignee | fn auth_is_learning_path_member(course of A): TRUE');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('lp99_groupmember'), '99000000-0000-4000-8000-00000000000a')$$, 'group assignee | fn start_learning_path_session(self, A): allowed');
SELECT is(public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3'), false, 'group assignee | fn update_session_heartbeat(other user''s session): FALSE, nothing written');
SELECT is(public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3'), false, 'group assignee | fn end_learning_path_session(other user''s session): FALSE, nothing written');
SELECT is(public.update_session_heartbeat((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp99_groupmember') AND session_end IS NULL)), true, 'group assignee | fn update_session_heartbeat(own open session): TRUE');
SELECT is(public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp99_groupmember') AND session_end IS NULL)), true, 'group assignee | fn end_learning_path_session(own open session): TRUE');
RESET ROLE;

-- ============================================================================
-- 8. Unchanged state after every non-admin actor (as postgres)
-- ============================================================================
SELECT is((SELECT session_end FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'), NULL, 'state: other user''s session sO is still open (no non-admin ended it)');
SELECT is((SELECT session_data::text || '/' || activity_type FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'), '{}/path_view', 'state: sO session_data / activity_type untouched');
SELECT is((SELECT time_spent_minutes FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'), 0, 'state: sO time_spent_minutes untouched');
SELECT is((SELECT last_activity_at FROM public.learning_path_assignments WHERE id = '99000000-0000-4000-8000-0000000000a3'), NULL, 'state: other user''s assignment progress untouched');
SELECT is((SELECT last_activity_at FROM public.learning_path_assignments WHERE id = '99000000-0000-4000-8000-0000000000a2'), NULL, 'state: group assignment row untouched (no user owns it)');
SELECT is((SELECT array_agg(name::text ORDER BY name) FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b') OR name LIKE 'LP99 %'), ARRAY['LP99 path A','LP99 path B'], 'state: templates unrenamed, none created');
SELECT is((SELECT string_agg(course_id::text || ':' || sequence_order, ',' ORDER BY course_id) FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), '99000000-0000-4000-8000-000000000c01:1,99000000-0000-4000-8000-000000000c02:2,99000000-0000-4000-8000-000000000c03:1', 'state: course links unchanged');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 3, 'state: no assignment added or removed');

-- ============================================================================
-- 9. admin (runs last; mutations are allowed and checked by row count)
-- ============================================================================
SELECT tests.authenticate_as('lp99_admin');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 2, 'admin | learning_paths | SELECT: sees both fixture templates');
SELECT lives_ok($$INSERT INTO public.learning_paths (id, name, description) VALUES ('99000000-0000-4000-8000-0000000000e1', 'LP99 admin new', 'x')$$, 'admin | learning_paths | INSERT: allowed');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_paths SET description = 'admin edit' WHERE id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b','99000000-0000-4000-8000-0000000000e1')$$), 3, 'admin | learning_paths | UPDATE: reaches all 3 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id = '99000000-0000-4000-8000-0000000000e1'$$), 1, 'admin | learning_paths | DELETE: allowed, 1 row');
SELECT is((SELECT count(*)::int FROM public.learning_path_courses WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 3, 'admin | learning_path_courses | SELECT: sees all 3 links');
SELECT lives_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('99000000-0000-4000-8000-00000000000b', '99000000-0000-4000-8000-000000000c01', 9)$$, 'admin | learning_path_courses | INSERT: allowed');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_courses SET is_required = is_required WHERE learning_path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 4, 'admin | learning_path_courses | UPDATE: reaches all 4 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id = '99000000-0000-4000-8000-00000000000b' AND course_id = '99000000-0000-4000-8000-000000000c01'$$), 1, 'admin | learning_path_courses | DELETE: allowed, 1 row');
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')), 3, 'admin | learning_path_assignments | SELECT: sees all 3');
SELECT lives_ok($$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by) VALUES ('99000000-0000-4000-8000-00000000000b', pg_temp.uid('lp99_other'), pg_temp.uid('lp99_admin'))$$, 'admin | learning_path_assignments | INSERT: allowed');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET last_activity_at = now() WHERE path_id IN ('99000000-0000-4000-8000-00000000000a','99000000-0000-4000-8000-00000000000b')$$), 4, 'admin | learning_path_assignments | UPDATE (progress column): reaches all 4 rows');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = '99000000-0000-4000-8000-00000000000b' AND user_id = pg_temp.uid('lp99_other')$$), 1, 'admin | learning_path_assignments | DELETE: allowed, 1 row');
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id IN ('99000000-0000-4000-8000-0000000000d1','99000000-0000-4000-8000-0000000000d2','99000000-0000-4000-8000-0000000000d3')), 3, 'admin | learning_path_progress_sessions | SELECT: sees all 3 fixture sessions');
SELECT throws_ok($$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type) VALUES (pg_temp.uid('lp99_admin'), '99000000-0000-4000-8000-00000000000a', 'path_view')$$, '42501', 'permission denied for table learning_path_progress_sessions', 'admin | learning_path_progress_sessions | INSERT: no privilege even for admin (RPC is the only creator)');
SELECT is(pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET session_data = '{"lp99":"admin"}' WHERE id = '99000000-0000-4000-8000-0000000000d3'$$), 1, 'admin | learning_path_progress_sessions | UPDATE of another user''s open session (granted columns): allowed, 1 row');
SELECT throws_ok($$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999 WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'admin | learning_path_progress_sessions | UPDATE timing column: no column privilege even for admin');
SELECT throws_ok($$DELETE FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'$$, '42501', 'permission denied for table learning_path_progress_sessions', 'admin | learning_path_progress_sessions | DELETE: no privilege even for admin');
SELECT lives_ok($$SELECT public.create_full_learning_path('LP99 fn admin', 'x', ARRAY['99000000-0000-4000-8000-000000000c01']::uuid[], NULL)$$, 'admin | fn create_full_learning_path: allowed');
SELECT lives_ok($$SELECT public.update_full_learning_path('99000000-0000-4000-8000-00000000000b', 'LP99 path B', 'admin rpc', ARRAY['99000000-0000-4000-8000-000000000c03']::uuid[], NULL)$$, 'admin | fn update_full_learning_path: allowed');
SELECT is((public.batch_assign_learning_path('99000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('lp99_unassigned')]::uuid[], '{}'::uuid[], NULL))->>'assignments_created', '1', 'admin | fn batch_assign_learning_path: allowed, 1 assignment');
SELECT throws_ok($$SELECT public.increment_path_assignment_time(pg_temp.uid('lp99_admin'), '99000000-0000-4000-8000-00000000000a', 999)$$, '42501', 'permission denied for function increment_path_assignment_time', 'admin | fn increment_path_assignment_time: not executable even for admin');
SELECT is(public.auth_is_learning_path_member('99000000-0000-4000-8000-000000000c01'), false, 'admin | fn auth_is_learning_path_member(course of A): FALSE (membership is assignment-based, not role-based)');
SELECT lives_ok($$SELECT public.start_learning_path_session(pg_temp.uid('lp99_admin'), '99000000-0000-4000-8000-00000000000a')$$, 'admin | fn start_learning_path_session(self, A): allowed via admin bypass');
SELECT is(public.update_session_heartbeat('99000000-0000-4000-8000-0000000000d3'), false, 'admin | fn update_session_heartbeat(other user''s session): FALSE (own sessions only)');
SELECT is(public.update_session_heartbeat((SELECT id FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp99_admin') AND session_end IS NULL)), true, 'admin | fn update_session_heartbeat(own open session): TRUE');
SELECT is(public.end_learning_path_session('99000000-0000-4000-8000-0000000000d3'), true, 'admin | fn end_learning_path_session(other user''s session): TRUE (admin may close any session)');
SELECT isnt((SELECT session_end FROM public.learning_path_progress_sessions WHERE id = '99000000-0000-4000-8000-0000000000d3'), NULL, 'admin | the other user''s session is now closed');
RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
