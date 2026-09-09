-- =============================================================================
-- 070-learning-path-governance.sql — W-B2c-01: migration
-- 20260907120000_learning_path_governance.sql, actor × table × operation and
-- actor × function, against the intended access model of
-- docs/reviews/w-b2c-01-learning-path-governance-correction-2026-08-29.md §5.
--
-- Actors: anonymous · literal admin · equipo_directivo · consultor · a docente
-- assigned directly · a docente assigned through a group · a docente whose
-- group membership is INACTIVE · an unassigned docente · a docente assigned to
-- a different path · service_role (privilege checks only).
--
-- What is proved:
--   1. catalog: RLS on, guard present, anon / PUBLIC hold nothing, TRUNCATE
--      revoked from authenticated, column-level progress UPDATE, policy sets,
--      function EXECUTE grants and pinned search_path
--   2. anonymous: every table read and every RPC is refused
--   3. admin: full template CRUD, assign / unassign, cross-user reads
--   4. equipo_directivo and consultor: no management authority at the RPC
--      boundary NOR at the table boundary, and no cross-user reads
--   5. assignees: read their assigned template / course links / assignment,
--      the courses_learning_path_member_view path still grants course
--      visibility, own progress can be updated, nothing else can
--   6. spoofing: every caller-supplied actor id that disagrees with auth.uid()
--      is rejected and writes nothing
--   7. unassigned / inactive-membership users see and can do nothing
--
-- Group fixture note: learning_path_assignments.group_id references
-- community_workspaces.id; a membership is user_roles.community_id, a
-- growth_communities.id. They are DIFFERENT uuids here on purpose (workspace
-- ...w001 over community ...c001). A second, unrelated community is created
-- whose uuid EQUALS the workspace uuid (...bb01) with an active member
-- (lp70_collide): under the retired id-comparison convention that member
-- would have resolved as a group member; under the workspace -> community
-- join they must not. lp70_wrongcomm is active in a third community that has
-- no assignment.
--
-- Session accounting: the client-writable session columns are exactly
-- (user_id, path_id, course_id, activity_type, session_data) on INSERT and
-- (course_id, activity_type, last_heartbeat, session_data) on UPDATE; timing
-- columns are server-side; a session's course must belong to its path; the
-- assignment credit comes only from settle_learning_path_sessions (at most
-- once per session, server-computed minutes).
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(284);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

-- Impersonated roles have no USAGE on schema tests; this SECURITY DEFINER shim
-- (owned by the session's postgres) resolves fixture uids on their behalf.
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

-- Runs a data-modifying statement WITH THE CALLER'S privileges (SECURITY
-- INVOKER) and returns the number of rows it touched — the shape of a "this
-- role's UPDATE / DELETE reaches nothing" assertion.
CREATE OR REPLACE FUNCTION pg_temp.rows_affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE TEMP TABLE lp_tables (tbl) AS VALUES
  ('learning_paths'), ('learning_path_courses'),
  ('learning_path_assignments'), ('learning_path_progress_sessions');
CREATE TEMP TABLE lp_ops (op) AS VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE');
GRANT SELECT ON lp_tables, lp_ops TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('lp70_admin');
SELECT tests.create_supabase_user('lp70_directivo');
SELECT tests.create_supabase_user('lp70_consultor');
SELECT tests.create_supabase_user('lp70_direct');
SELECT tests.create_supabase_user('lp70_groupmember');
SELECT tests.create_supabase_user('lp70_inactive');
SELECT tests.create_supabase_user('lp70_unassigned');
SELECT tests.create_supabase_user('lp70_other');
SELECT tests.create_supabase_user('lp70_collide');   -- active in the community whose uuid = the workspace uuid
SELECT tests.create_supabase_user('lp70_wrongcomm'); -- active in an unassigned community

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['lp70_admin','lp70_directivo','lp70_consultor','lp70_direct',
                    'lp70_groupmember','lp70_inactive','lp70_unassigned','lp70_other',
                    'lp70_collide','lp70_wrongcomm']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9701, 'LP70 school (pgTAP 070)')
ON CONFLICT (id) DO NOTHING;

-- Distinct uuids for the community (c001) and its workspace (bb01); an
-- unrelated community whose uuid equals the workspace uuid (bb01); a third,
-- unassigned community (c003). See header note.
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('70000000-0000-4000-8000-00000000c001', 9701, 'LP70 community'),
  ('70000000-0000-4000-8000-00000000bb01', 9701, 'LP70 colliding community (uuid = workspace uuid)'),
  ('70000000-0000-4000-8000-00000000c003', 9701, 'LP70 unassigned community');
INSERT INTO public.community_workspaces (id, community_id)
VALUES ('70000000-0000-4000-8000-00000000bb01', '70000000-0000-4000-8000-00000000c001');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('lp70_admin'),       'admin',            NULL, NULL, true),
  (pg_temp.uid('lp70_directivo'),   'equipo_directivo', 9701, NULL, true),
  (pg_temp.uid('lp70_consultor'),   'consultor',        9701, NULL, true),
  (pg_temp.uid('lp70_direct'),      'docente',          9701, NULL, true),
  (pg_temp.uid('lp70_groupmember'), 'docente',          9701, '70000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('lp70_inactive'),    'docente',          9701, '70000000-0000-4000-8000-00000000c001', false),
  (pg_temp.uid('lp70_unassigned'),  'docente',          9701, NULL, true),
  (pg_temp.uid('lp70_other'),       'docente',          9701, NULL, true),
  (pg_temp.uid('lp70_collide'),     'docente',          9701, '70000000-0000-4000-8000-00000000bb01', true),
  (pg_temp.uid('lp70_wrongcomm'),   'docente',          9701, '70000000-0000-4000-8000-00000000c003', true);

INSERT INTO public.instructors (id, full_name)
VALUES ('70000000-0000-4000-8000-00000000f001', 'LP70 instructor');

INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('70000000-0000-4000-8000-000000000c01', 'LP70 course 1', 'LP70 course 1', '70000000-0000-4000-8000-00000000f001'),
  ('70000000-0000-4000-8000-000000000c02', 'LP70 course 2', 'LP70 course 2', '70000000-0000-4000-8000-00000000f001'),
  ('70000000-0000-4000-8000-000000000c03', 'LP70 course 3', 'LP70 course 3', '70000000-0000-4000-8000-00000000f001');

-- Path A: assigned to lp70_direct (user) and to the community workspace (group).
-- Path B: assigned to lp70_other only. Path C: unassigned.
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('70000000-0000-4000-8000-00000000000a', 'LP70 path A', 'assigned to direct + group', pg_temp.uid('lp70_admin')),
  ('70000000-0000-4000-8000-00000000000b', 'LP70 path B', 'assigned to other',          pg_temp.uid('lp70_admin')),
  ('70000000-0000-4000-8000-00000000000c', 'LP70 path C', 'unassigned',                 pg_temp.uid('lp70_admin'));

INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('70000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000c01', 1),
  ('70000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000c02', 2),
  ('70000000-0000-4000-8000-00000000000b', '70000000-0000-4000-8000-000000000c03', 1);

INSERT INTO public.learning_path_assignments (id, path_id, user_id, group_id, assigned_by) VALUES
  ('70000000-0000-4000-8000-0000000000a1', '70000000-0000-4000-8000-00000000000a', pg_temp.uid('lp70_direct'), NULL, pg_temp.uid('lp70_admin')),
  ('70000000-0000-4000-8000-0000000000a2', '70000000-0000-4000-8000-00000000000a', NULL, '70000000-0000-4000-8000-00000000bb01', pg_temp.uid('lp70_admin')),
  ('70000000-0000-4000-8000-0000000000b1', '70000000-0000-4000-8000-00000000000b', pg_temp.uid('lp70_other'), NULL, pg_temp.uid('lp70_admin'));

-- Sessions (R2-03: at most ONE open session per (user, path), enforced by a
-- trigger for every creator, so the fixture holds one open session per learner):
--   e3: an open 30-minute-old session for lp70_direct on A (closed and settled
--       when their next start closes it);
--   e2: a CLOSED, already-settled historical 10-minute session for lp70_other on
--       B (the shape the settled_at backfill leaves behind), non-overlapping
--       with e4 — it must never be credited again and never be reopened;
--   e4: a STALE open session for lp70_other on B (started 50 min ago, last
--       heartbeat 20 min ago) for the maintenance settlement.
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, last_heartbeat) VALUES
  ('70000000-0000-4000-8000-0000000000e3', pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a', 'course_progress', now() - interval '30 minutes', now()),
  ('70000000-0000-4000-8000-0000000000e4', pg_temp.uid('lp70_other'),  '70000000-0000-4000-8000-00000000000b', 'path_view',       now() - interval '50 minutes', now() - interval '20 minutes');
INSERT INTO public.learning_path_progress_sessions (id, user_id, path_id, activity_type, session_start, session_end, time_spent_minutes, last_heartbeat, settled_at) VALUES
  ('70000000-0000-4000-8000-0000000000e2', pg_temp.uid('lp70_other'),  '70000000-0000-4000-8000-00000000000b', 'path_view',
   now() - interval '100 minutes', now() - interval '90 minutes', 10, now() - interval '90 minutes', now() - interval '90 minutes');

-- ============================================================================
-- 1. Catalog
-- ============================================================================
SELECT tests.rls_enabled('public', tbl) FROM lp_tables ORDER BY tbl;                                  -- 4

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tbl
             AND policyname = 'forced_password_change_guard' AND permissive = 'RESTRICTIVE'),
  format('public.%s carries the restrictive forced_password_change_guard', t.tbl))
FROM lp_tables t ORDER BY t.tbl;                                                                      -- 4

SELECT ok(NOT has_table_privilege('anon', format('public.%I', t.tbl), o.op),
  format('anon holds no %s privilege on public.%s', o.op, t.tbl))
FROM lp_tables t CROSS JOIN lp_ops o ORDER BY t.tbl, o.op;                                            -- 16

SELECT is(
  (SELECT count(*)::int FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = t.tbl AND grantee = 'PUBLIC'),
  0, format('PUBLIC holds no privilege on public.%s', t.tbl))
FROM lp_tables t ORDER BY t.tbl;                                                                      -- 4

SELECT ok(NOT has_table_privilege('authenticated', format('public.%I', t.tbl), 'TRUNCATE'),
  format('authenticated cannot TRUNCATE public.%s (TRUNCATE is not governed by row security)', t.tbl))
FROM lp_tables t ORDER BY t.tbl;                                                                      -- 4

SELECT ok(has_table_privilege('service_role', format('public.%I', t.tbl), o.op),
  format('service_role retains %s on public.%s', o.op, t.tbl))
FROM lp_tables t CROSS JOIN lp_ops o ORDER BY t.tbl, o.op;                                            -- 16

SELECT ok(NOT has_table_privilege('authenticated', 'public.learning_path_assignments', 'UPDATE'),
  'authenticated holds no whole-table UPDATE on learning_path_assignments');                          -- 1

-- (the exact UPDATE column list is asserted with the function catalog below)

SELECT is(
  (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'learning_paths'),
  ARRAY['forced_password_change_guard','learning_paths_admin_manage','learning_paths_assignee_read'],
  'learning_paths policy set');                                                                       -- 1

SELECT is(
  (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'learning_path_courses'),
  ARRAY['forced_password_change_guard','learning_path_courses_admin_manage','learning_path_courses_assignee_read'],
  'learning_path_courses policy set');                                                                -- 1

SELECT is(
  (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'learning_path_assignments'),
  ARRAY['forced_password_change_guard','learning_path_assignments_delete_policy',
        'learning_path_assignments_insert_policy','learning_path_assignments_select_policy',
        'learning_path_assignments_update_policy','learning_path_assignments_user_progress_update'],
  'learning_path_assignments policy set (names preserved, meaning rewritten)');                       -- 1

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public'
     AND tablename IN ('learning_paths','learning_path_courses','learning_path_assignments','learning_path_progress_sessions')
     AND (roles::text LIKE '%anon%' OR roles::text = '{public}')),
  0, 'no policy on the four tables targets anon or PUBLIC');                                          -- 1

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public'
     AND tablename IN ('learning_paths','learning_path_courses','learning_path_assignments','learning_path_progress_sessions')
     AND permissive = 'PERMISSIVE' AND (qual = 'true' OR with_check = 'true')
     AND roles::text <> '{service_role}'),
  0, 'no permissive USING (true) / WITH CHECK (true) policy remains for an application role');        -- 1

-- Functions: eight + helpers + settlement. anon and PUBLIC never; authenticated
-- exactly where an application caller exists (increment_path_assignment_time
-- took caller-supplied minutes and has no caller left; the settlement pair is
-- internal / service_role); service_role only where a backend caller exists.
CREATE TEMP TABLE lp_fns (sig, auth_exec, svc) AS VALUES
  ('public.create_full_learning_path(text, text, uuid[], uuid)',              true,  false),
  ('public.update_full_learning_path(uuid, text, text, uuid[], uuid)',        true,  false),
  ('public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid)',           true,  false),
  ('public.start_learning_path_session(uuid, uuid, uuid, character varying)', true,  false),
  ('public.end_learning_path_session(uuid)',                                  true,  false),
  ('public.auth_is_learning_path_member(uuid)',                               true,  true),
  ('public.increment_path_assignment_time(uuid, uuid, integer)',              false, false),
  ('public.update_session_heartbeat(uuid)',                                   true,  false),
  ('public.auth_is_learning_path_assignee(uuid)',                             true,  true),
  ('public.auth_is_assigned_group_member(uuid)',                              true,  true),
  ('public.learning_path_has_course(uuid, uuid)',                             true,  true),
  ('public.settle_learning_path_sessions(uuid[])',                            false, false),
  ('public.close_stale_learning_path_sessions(timestamp with time zone)',     false, true);

SELECT ok(NOT has_function_privilege('anon', f.sig, 'EXECUTE'), format('anon cannot execute %s', f.sig))
FROM lp_fns f ORDER BY f.sig;                                                                         -- 13
SELECT is(has_function_privilege('authenticated', f.sig, 'EXECUTE'), f.auth_exec,
  format('authenticated EXECUTE on %s is %s', f.sig, f.auth_exec))
FROM lp_fns f ORDER BY f.sig;                                                                         -- 13
SELECT is(has_function_privilege('service_role', f.sig, 'EXECUTE'), f.svc,
  format('service_role EXECUTE on %s is %s', f.sig, f.svc))
FROM lp_fns f ORDER BY f.sig;                                                                         -- 13
SELECT ok(
  NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = f.sig::regprocedure)) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  format('PUBLIC holds no EXECUTE on %s', f.sig))
FROM lp_fns f ORDER BY f.sig;                                                                         -- 13
SELECT ok(
  EXISTS (SELECT 1 FROM unnest((SELECT proconfig FROM pg_proc WHERE oid = f.sig::regprocedure)) c
           WHERE c = 'search_path=public, pg_temp'),
  format('%s runs with search_path pinned to public, pg_temp', f.sig))
FROM lp_fns f ORDER BY f.sig;                                                                         -- 13
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = f.sig::regprocedure),
  format('%s is SECURITY DEFINER', f.sig))
FROM lp_fns f ORDER BY f.sig;                                                                         -- 13

-- Column privileges of the application role (the table-level ones are revoked).
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'learning_path_assignments'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'),
  ARRAY['completed_at','current_course_sequence','last_activity_at'],
  'authenticated UPDATE on learning_path_assignments is exactly the three client-written progress columns'); -- 1
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'learning_path_progress_sessions'
      AND grantee = 'authenticated' AND privilege_type = 'INSERT'),
  NULL,
  'authenticated holds NO INSERT column on learning_path_progress_sessions (R2-03: the start RPC is the only creator)'); -- 1
SELECT ok(NOT has_table_privilege('authenticated', 'public.learning_path_progress_sessions', 'INSERT'),
  'authenticated holds no table-level INSERT on learning_path_progress_sessions');                    -- 1
SELECT is(
  (SELECT array_agg(column_name::text ORDER BY column_name) FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'learning_path_progress_sessions'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'),
  ARRAY['activity_type','course_id','last_heartbeat','session_data','updated_at'],
  'authenticated UPDATE on learning_path_progress_sessions: activity, course, heartbeat (+ updated_at, trigger-overwritten, kept for the previous app version)'); -- 1
SELECT ok(NOT has_table_privilege('authenticated', 'public.learning_path_progress_sessions', 'DELETE'),
  'authenticated cannot DELETE progress sessions');                                                   -- 1

-- ============================================================================
-- 2. Anonymous: nothing
-- ============================================================================
SELECT pg_temp.set_anon();

SELECT throws_ok(format('SELECT count(*) FROM public.%I', t.tbl), '42501',
  format('permission denied for table %s', t.tbl),
  format('anon: SELECT on public.%s denied', t.tbl))
FROM lp_tables t ORDER BY t.tbl;                                                                      -- 4

SELECT throws_ok(
  $$SELECT public.create_full_learning_path('x', 'y', '{}'::uuid[], NULL)$$, '42501',
  NULL, 'anon: create_full_learning_path is not executable');                                        -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session('70000000-0000-4000-8000-000000000000', '70000000-0000-4000-8000-00000000000a')$$, '42501',
  NULL, 'anon: start_learning_path_session is not executable');                                      -- 1
SELECT throws_ok(
  $$SELECT public.auth_is_learning_path_member('70000000-0000-4000-8000-000000000c01')$$, '42501',
  NULL, 'anon: auth_is_learning_path_member is not executable');                                     -- 1

RESET ROLE;

-- ============================================================================
-- 3. Literal admin: template CRUD, assignment, cross-user reads
-- ============================================================================
SELECT tests.authenticate_as('lp70_admin');

SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE name LIKE 'LP70 %'), 3,
  'admin sees every template');                                                                       -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments WHERE path_id::text LIKE '70000000-%'), 3,
  'admin sees every assignment');                                                                     -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE id::text LIKE '70000000-%'), 3,
  'admin sees every progress session');                                                               -- 1

SELECT lives_ok(
  $$SELECT public.create_full_learning_path('LP70 created', 'by admin',
      ARRAY['70000000-0000-4000-8000-000000000c01']::uuid[], pg_temp.uid('lp70_admin'))$$,
  'admin: create_full_learning_path with p_created_by = self succeeds');                              -- 1
SELECT is(
  (SELECT count(*)::int FROM public.learning_path_courses lpc
     JOIN public.learning_paths lp ON lp.id = lpc.learning_path_id WHERE lp.name = 'LP70 created'),
  1, 'admin: the created template carries its course link');                                          -- 1
SELECT is(
  (SELECT created_by FROM public.learning_paths WHERE name = 'LP70 created'),
  pg_temp.uid('lp70_admin'), 'admin: created_by is the authenticated actor');              -- 1
SELECT lives_ok(
  $$SELECT public.create_full_learning_path('LP70 created null', 'p_created_by NULL is tolerated', '{}'::uuid[], NULL)$$,
  'admin: create_full_learning_path with p_created_by NULL succeeds (actor still auth.uid())');       -- 1
SELECT is(
  (SELECT created_by FROM public.learning_paths WHERE name = 'LP70 created null'),
  pg_temp.uid('lp70_admin'), 'admin: created_by falls back to auth.uid(), never NULL');    -- 1
SELECT throws_ok(
  $$SELECT public.create_full_learning_path('LP70 spoof', 'x', '{}'::uuid[], pg_temp.uid('lp70_other'))$$,
  '42501', 'Caller-supplied actor does not match the authenticated user',
  'admin: a p_created_by naming another user is rejected even for an admin');                         -- 1
SELECT is((SELECT count(*)::int FROM public.learning_paths WHERE name = 'LP70 spoof'), 0,
  'admin: the spoofed create wrote nothing');                                                         -- 1

SELECT lives_ok(
  $$SELECT public.update_full_learning_path('70000000-0000-4000-8000-00000000000c', 'LP70 path C renamed', 'still unassigned',
      ARRAY['70000000-0000-4000-8000-000000000c03']::uuid[], pg_temp.uid('lp70_admin'))$$,
  'admin: update_full_learning_path succeeds');                                                       -- 1
SELECT is((SELECT name FROM public.learning_paths WHERE id = '70000000-0000-4000-8000-00000000000c'),
  'LP70 path C renamed', 'admin: the template was renamed');                                          -- 1

SELECT is(
  (SELECT (public.batch_assign_learning_path('70000000-0000-4000-8000-00000000000c',
      ARRAY[pg_temp.uid('lp70_unassigned')]::uuid[], '{}'::uuid[],
      pg_temp.uid('lp70_admin')))->>'assignments_created'),
  '1', 'admin: batch_assign_learning_path creates the assignment');                                   -- 1
SELECT is(
  (SELECT assigned_by FROM public.learning_path_assignments
    WHERE path_id = '70000000-0000-4000-8000-00000000000c' AND user_id = pg_temp.uid('lp70_unassigned')),
  pg_temp.uid('lp70_admin'), 'admin: assigned_by is the authenticated actor');             -- 1
SELECT is(
  (SELECT enrolled_by FROM public.course_enrollments
    WHERE course_id = '70000000-0000-4000-8000-000000000c03' AND user_id = pg_temp.uid('lp70_unassigned')),
  pg_temp.uid('lp70_admin'), 'admin: the auto-enrolment side effect records the authenticated actor');  -- 1
SELECT throws_ok(
  $$SELECT public.batch_assign_learning_path('70000000-0000-4000-8000-00000000000c',
      ARRAY[pg_temp.uid('lp70_other')]::uuid[], '{}'::uuid[], pg_temp.uid('lp70_directivo'))$$,
  '42501', 'Caller-supplied actor does not match the authenticated user',
  'admin: a p_assigned_by naming another user is rejected');                                          -- 1

SELECT lives_ok(
  $$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
    VALUES ('70000000-0000-4000-8000-00000000000c', pg_temp.uid('lp70_other'), pg_temp.uid('lp70_admin'))$$,
  'admin: direct INSERT of an assignment is allowed');                                                -- 1
SELECT is(
  pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = '70000000-0000-4000-8000-00000000000c' AND user_id = pg_temp.uid('lp70_other')$$),
  1, 'admin: direct DELETE of an assignment (unassign) is allowed');                                  -- 1
SELECT lives_ok(
  $$UPDATE public.learning_paths SET description = 'admin edit' WHERE id = '70000000-0000-4000-8000-00000000000b'$$,
  'admin: direct UPDATE of a template is allowed');                                                   -- 1
SELECT is(
  pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE name = 'LP70 created null'$$),
  1, 'admin: direct DELETE of a template is allowed');                                                -- 1

RESET ROLE;

-- ============================================================================
-- 4. equipo_directivo and consultor: no management, no cross-user reads
-- ============================================================================
SELECT tests.authenticate_as('lp70_directivo');

SELECT is((SELECT count(*)::int FROM public.learning_paths), 0, 'equipo_directivo: sees no template');                    -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_courses), 0, 'equipo_directivo: sees no course link');          -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments), 0, 'equipo_directivo: sees no assignment');       -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions), 0, 'equipo_directivo: sees no session');    -- 1
SELECT throws_ok(
  $$SELECT public.create_full_learning_path('LP70 ed', 'x', '{}'::uuid[], pg_temp.uid('lp70_directivo'))$$,
  '42501', 'User does not have permission to create learning paths',
  'equipo_directivo: create_full_learning_path refused');                                             -- 1
SELECT throws_ok(
  $$SELECT public.update_full_learning_path('70000000-0000-4000-8000-00000000000a', 'x', 'y', '{}'::uuid[], pg_temp.uid('lp70_directivo'))$$,
  '42501', 'User does not have permission to update learning paths',
  'equipo_directivo: update_full_learning_path refused');                                             -- 1
SELECT throws_ok(
  $$SELECT public.batch_assign_learning_path('70000000-0000-4000-8000-00000000000a',
      ARRAY[pg_temp.uid('lp70_unassigned')]::uuid[], '{}'::uuid[], pg_temp.uid('lp70_directivo'))$$,
  '42501', 'User does not have permission to assign learning paths',
  'equipo_directivo: batch_assign_learning_path refused');                                            -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_paths (name, description) VALUES ('LP70 ed direct', 'x')$$,
  '42501', NULL, 'equipo_directivo: direct INSERT into learning_paths refused by row security');      -- 1
SELECT is(
  pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE name LIKE 'LP70 %'$$),
  0, 'equipo_directivo: direct UPDATE of templates touches no row');                                  -- 1
SELECT is(
  pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE name LIKE 'LP70 %'$$),
  0, 'equipo_directivo: direct DELETE of templates touches no row');                                  -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
    VALUES ('70000000-0000-4000-8000-00000000000a', pg_temp.uid('lp70_directivo'), pg_temp.uid('lp70_directivo'))$$,
  '42501', NULL, 'equipo_directivo: cannot self-assign through a direct INSERT');                     -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order)
    VALUES ('70000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000c03', 9)$$,
  '42501', NULL, 'equipo_directivo: cannot alter template composition');                              -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_directivo'), '70000000-0000-4000-8000-00000000000a')$$,
  '42501', 'User is not assigned to this learning path',
  'equipo_directivo: the former role bypass for session start is gone');                              -- 1

RESET ROLE;
SELECT tests.authenticate_as('lp70_consultor');

SELECT is((SELECT count(*)::int FROM public.learning_paths), 0, 'consultor: sees no template');                            -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments), 0, 'consultor: sees no assignment');               -- 1
SELECT throws_ok(
  $$SELECT public.create_full_learning_path('LP70 con', 'x', '{}'::uuid[], pg_temp.uid('lp70_consultor'))$$,
  '42501', 'User does not have permission to create learning paths',
  'consultor: create_full_learning_path refused');                                                    -- 1
SELECT throws_ok(
  $$SELECT public.batch_assign_learning_path('70000000-0000-4000-8000-00000000000a',
      ARRAY[pg_temp.uid('lp70_unassigned')]::uuid[], '{}'::uuid[], pg_temp.uid('lp70_consultor'))$$,
  '42501', 'User does not have permission to assign learning paths',
  'consultor: batch_assign_learning_path refused');                                                   -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_paths (name, description) VALUES ('LP70 con direct', 'x')$$,
  '42501', NULL, 'consultor: direct INSERT into learning_paths refused');                             -- 1
SELECT is(
  pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments$$),
  0, 'consultor: direct DELETE of assignments touches no row');                                       -- 1
SELECT throws_ok(
  $$SELECT public.update_full_learning_path('70000000-0000-4000-8000-00000000000a', 'x', 'y', '{}'::uuid[], pg_temp.uid('lp70_admin'))$$,
  '42501', 'Caller-supplied actor does not match the authenticated user',
  'consultor: naming the admin as p_updated_by grants nothing');                                      -- 1

RESET ROLE;

-- ============================================================================
-- 5. Directly assigned docente: consumption and own progress only
-- ============================================================================
SELECT tests.authenticate_as('lp70_direct');

SELECT is((SELECT array_agg(name::text ORDER BY name) FROM public.learning_paths), ARRAY['LP70 path A'],
  'direct assignee: sees exactly the assigned template');                                             -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_courses), 2,
  'direct assignee: sees exactly the assigned template''s course links');                             -- 1
SELECT is((SELECT array_agg(id::text ORDER BY id) FROM public.learning_path_assignments),
  ARRAY['70000000-0000-4000-8000-0000000000a1'],
  'direct assignee: sees only their own assignment row (not the group row, not others)');             -- 1
SELECT ok(public.auth_is_learning_path_member('70000000-0000-4000-8000-000000000c01'),
  'direct assignee: auth_is_learning_path_member is TRUE for a course of the assigned path');         -- 1
SELECT ok(NOT public.auth_is_learning_path_member('70000000-0000-4000-8000-000000000c03'),
  'direct assignee: auth_is_learning_path_member is FALSE for a course of another path');             -- 1
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '70000000-0000-4000-8000-000000000c01'), 1,
  'direct assignee: courses_learning_path_member_view still grants the course row');                  -- 1
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '70000000-0000-4000-8000-000000000c03'), 0,
  'direct assignee: a course outside the assigned path stays invisible');                             -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions), 1,
  'direct assignee: sees only their own session (e3)');                                          -- 1

-- own progress: exactly the columns the activity route writes
SELECT lives_ok(
  $$UPDATE public.learning_path_assignments SET current_course_sequence = 2, last_activity_at = now(), completed_at = NULL
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  'direct assignee: can update own progress columns (current_course_sequence, last_activity_at, completed_at)'); -- 1
SELECT is((SELECT current_course_sequence FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000a1'), 2,
  'direct assignee: the progress update took effect');                                                -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_assignments SET total_time_spent_minutes = 999999
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'permission denied for table learning_path_assignments',
  'direct assignee: cannot write total_time_spent_minutes (authoritative timing, column privilege)'); -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_assignments SET started_at = now() - interval '20 days'
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'permission denied for table learning_path_assignments',
  'direct assignee: cannot write started_at (column privilege)');                                     -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_assignments SET progress_percentage = 100
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'permission denied for table learning_path_assignments',
  'direct assignee: cannot write progress_percentage (no application writer; server-side only)');    -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_assignments SET path_id = '70000000-0000-4000-8000-00000000000b'
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'permission denied for table learning_path_assignments',
  'direct assignee: cannot re-point own assignment at another path (column privilege)');              -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_assignments SET assigned_by = pg_temp.uid('lp70_direct')
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'permission denied for table learning_path_assignments',
  'direct assignee: cannot forge assigned_by');                                                       -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_assignments SET user_id = pg_temp.uid('lp70_other')
     WHERE id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', 'permission denied for table learning_path_assignments',
  'direct assignee: cannot hand own assignment to another user');                                     -- 1
SELECT is(
  pg_temp.rows_affected($$UPDATE public.learning_path_assignments SET current_course_sequence = 9 WHERE id = '70000000-0000-4000-8000-0000000000b1'$$),
  0, 'direct assignee: another user''s progress is untouched');                                      -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
    VALUES ('70000000-0000-4000-8000-00000000000c', pg_temp.uid('lp70_direct'), pg_temp.uid('lp70_direct'))$$,
  '42501', NULL, 'direct assignee: cannot self-assign to another path');                              -- 1
SELECT is(
  pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000a1'$$),
  0, 'direct assignee: cannot delete own assignment');                                                -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_paths (name, description) VALUES ('LP70 docente', 'x')$$,
  '42501', NULL, 'direct assignee: cannot create a template');                                        -- 1
SELECT is(
  pg_temp.rows_affected($$UPDATE public.learning_paths SET name = 'hijacked' WHERE id = '70000000-0000-4000-8000-00000000000a'$$),
  0, 'direct assignee: cannot edit the assigned template');                                           -- 1
SELECT is(
  pg_temp.rows_affected($$DELETE FROM public.learning_path_courses$$),
  0, 'direct assignee: cannot remove course links');                                                  -- 1

-- sessions through the RPCs
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a',
      '70000000-0000-4000-8000-000000000c01', 'course_start')$$,
  'direct assignee: start_learning_path_session for self on the assigned path succeeds');             -- 1
SELECT isnt((SELECT session_end FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e3'), NULL,
  'direct assignee: starting a new session closed the previous open one');                            -- 1
SELECT isnt((SELECT settled_at FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e3'), NULL,
  'direct assignee: the auto-closed 30-minute session was settled');                                  -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000a1'), 30,
  'direct assignee: its server-computed 30 minutes were credited to the assignment');                -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a',
      '70000000-0000-4000-8000-000000000c03', 'course_start')$$,
  '22023', 'Course is not part of this learning path',
  'direct assignee: cannot start a session on path A attributed to a course of path B');             -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL), 1,
  'direct assignee: exactly one open session remains');                                               -- 1
SELECT isnt((SELECT started_at FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000a1'), NULL,
  'direct assignee: the assignment was marked started');                                              -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_other'), '70000000-0000-4000-8000-00000000000b')$$,
  '42501', 'Caller-supplied user does not match the authenticated user',
  'direct assignee: cannot start a session in another user''s name');                                 -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp70_other')), 0,
  'direct assignee: (as seen by them) nothing was written for the other user');                       -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000c')$$,
  '42501', 'User is not assigned to this learning path',
  'direct assignee: cannot start a session on an unassigned path');                                   -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(NULL, '70000000-0000-4000-8000-00000000000a')$$,
  '42501', 'Caller-supplied user does not match the authenticated user',
  'direct assignee: a NULL p_user_id is not a wildcard');                                             -- 1

SELECT ok(
  public.update_session_heartbeat((SELECT id FROM public.learning_path_progress_sessions
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL)),
  'direct assignee: heartbeat on own open session returns TRUE');                                     -- 1
SELECT ok(NOT public.update_session_heartbeat('70000000-0000-4000-8000-0000000000e2'),
  'direct assignee: heartbeat on another user''s session returns FALSE');                             -- 1
SELECT ok(NOT public.end_learning_path_session('70000000-0000-4000-8000-0000000000e2'),
  'direct assignee: ending another user''s session returns FALSE');                                   -- 1
SELECT ok(
  public.end_learning_path_session((SELECT id FROM public.learning_path_progress_sessions
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL)),
  'direct assignee: ending own open session returns TRUE');                                           -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL), 0,
  'direct assignee: own session is closed');                                                          -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NOT NULL AND settled_at IS NULL), 0,
  'direct assignee: every closed session of theirs is settled');                                      -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000a1'), 30,
  'direct assignee: ending a just-started session credits 0 extra minutes');                          -- 1
SELECT ok(public.end_learning_path_session('70000000-0000-4000-8000-0000000000e3'),
  'direct assignee: ending an already-ended session returns TRUE');                                   -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000a1'), 30,
  'direct assignee: a repeated end never credits a session twice');                                   -- 1

SELECT throws_ok(
  $$SELECT public.increment_path_assignment_time(pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a', 999999)$$,
  '42501', 'permission denied for function increment_path_assignment_time',
  'direct assignee: cannot credit themselves caller-supplied minutes (function not executable)');    -- 1
SELECT throws_ok(
  $$SELECT public.settle_learning_path_sessions(ARRAY['70000000-0000-4000-8000-0000000000e3']::uuid[])$$,
  '42501', 'permission denied for function settle_learning_path_sessions',
  'direct assignee: cannot call the internal settlement function');                                   -- 1
SELECT throws_ok(
  $$SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes')$$,
  '42501', 'permission denied for function close_stale_learning_path_sessions',
  'direct assignee: cannot run the maintenance settlement');                                          -- 1

-- sessions through the table (a fresh open session is created through the
-- RPC first, so the UPDATE probes below have a row to reach)
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a')$$,
  'direct assignee: a fresh session for the table probes is started through the RPC');                -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
    VALUES (pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a', 'path_view')$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: direct INSERT of an own session is refused even on the assigned path (R2-03: the RPC is the only creator)'); -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
    VALUES (pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000c', 'path_view')$$,
  '42501', NULL, 'direct assignee: direct INSERT of an own session on an UNASSIGNED path is refused'); -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type)
    VALUES (pg_temp.uid('lp70_other'), '70000000-0000-4000-8000-00000000000b', 'path_view')$$,
  '42501', NULL, 'direct assignee: direct INSERT of a session for another user is refused');          -- 1
SELECT is(
  pg_temp.rows_affected($$UPDATE public.learning_path_progress_sessions SET last_heartbeat = now() WHERE id = '70000000-0000-4000-8000-0000000000e2'$$),
  0, 'direct assignee: direct UPDATE of another user''s session touches no row');                    -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, activity_type, session_start, time_spent_minutes)
    VALUES (pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a', 'path_view', now() - interval '20 days', 999999)$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: cannot INSERT a session with forged timing (column privilege)');                  -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_progress_sessions (user_id, path_id, course_id, activity_type)
    VALUES (pg_temp.uid('lp70_direct'), '70000000-0000-4000-8000-00000000000a', '70000000-0000-4000-8000-000000000c03', 'course_start')$$,
  '42501', NULL, 'direct assignee: cannot INSERT a session on path A attributed to a course of path B');          -- 1
SELECT lives_ok(
  $$UPDATE public.learning_path_progress_sessions SET course_id = '70000000-0000-4000-8000-000000000c02', activity_type = 'course_start', last_heartbeat = now()
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL$$,
  'direct assignee: the activity route''s update (course of the path, activity, heartbeat) is allowed'); -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_progress_sessions SET course_id = '70000000-0000-4000-8000-000000000c03'
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL$$,
  '42501', NULL, 'direct assignee: cannot re-attribute an open session to a course outside its path'); -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_progress_sessions SET session_start = now() - interval '20 days'
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: cannot backdate session_start (column privilege)');                               -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_progress_sessions SET time_spent_minutes = 999999
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: cannot write time_spent_minutes (column privilege)');                             -- 1
SELECT throws_ok(
  $$UPDATE public.learning_path_progress_sessions SET session_end = now(), settled_at = now()
     WHERE user_id = pg_temp.uid('lp70_direct') AND session_end IS NULL$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: cannot close or settle a session directly (column privilege)');                   -- 1
SELECT throws_ok(
  $$DELETE FROM public.learning_path_progress_sessions WHERE user_id = pg_temp.uid('lp70_direct')$$,
  '42501', 'permission denied for table learning_path_progress_sessions',
  'direct assignee: cannot delete own sessions');                                                     -- 1

RESET ROLE;

-- ============================================================================
-- 6. Group-assigned docente, inactive membership, unassigned, other-path
-- ============================================================================
SELECT tests.authenticate_as('lp70_groupmember');
SELECT is((SELECT array_agg(name::text ORDER BY name) FROM public.learning_paths), ARRAY['LP70 path A'],
  'group member: sees the template assigned to their group');                                         -- 1
SELECT is((SELECT array_agg(id::text ORDER BY id) FROM public.learning_path_assignments),
  ARRAY['70000000-0000-4000-8000-0000000000a2'],
  'group member: sees the group assignment row only');                                                -- 1
SELECT ok(public.auth_is_learning_path_assignee('70000000-0000-4000-8000-00000000000a'),
  'group member: auth_is_learning_path_assignee is TRUE via the group');                              -- 1
SELECT ok(public.auth_is_learning_path_member('70000000-0000-4000-8000-000000000c02'),
  'group member: auth_is_learning_path_member grants the course through the group');                  -- 1
SELECT lives_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_groupmember'), '70000000-0000-4000-8000-00000000000a')$$,
  'group member: can start a session on the group-assigned path');                                    -- 1
SELECT throws_ok(
  $$INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
    VALUES ('70000000-0000-4000-8000-00000000000b', pg_temp.uid('lp70_groupmember'), pg_temp.uid('lp70_groupmember'))$$,
  '42501', NULL, 'group member: cannot self-assign');                                                 -- 1
RESET ROLE;

SELECT tests.authenticate_as('lp70_inactive');
SELECT is((SELECT count(*)::int FROM public.learning_paths), 0,
  'inactive group membership: sees no template');                                                     -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments), 0,
  'inactive group membership: sees no assignment');                                                   -- 1
SELECT ok(NOT public.auth_is_assigned_group_member('70000000-0000-4000-8000-00000000bb01'),
  'inactive group membership: auth_is_assigned_group_member is FALSE');                               -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_inactive'), '70000000-0000-4000-8000-00000000000a')$$,
  '42501', 'User is not assigned to this learning path',
  'inactive group membership: cannot start a session');                                               -- 1
RESET ROLE;

-- Active member of an UNRELATED community whose uuid equals the assigned
-- workspace uuid: the retired id comparison would have admitted them.
SELECT tests.authenticate_as('lp70_collide');
SELECT is((SELECT count(*)::int FROM public.learning_paths), 0,
  'colliding-uuid community member: sees no template');                                               -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_assignments), 0,
  'colliding-uuid community member: sees no assignment');                                             -- 1
SELECT ok(NOT public.auth_is_assigned_group_member('70000000-0000-4000-8000-00000000bb01'),
  'colliding-uuid community member: auth_is_assigned_group_member is FALSE');                         -- 1
SELECT ok(NOT public.auth_is_learning_path_assignee('70000000-0000-4000-8000-00000000000a'),
  'colliding-uuid community member: auth_is_learning_path_assignee is FALSE');                        -- 1
SELECT ok(NOT public.auth_is_learning_path_member('70000000-0000-4000-8000-000000000c01'),
  'colliding-uuid community member: auth_is_learning_path_member is FALSE');                          -- 1
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '70000000-0000-4000-8000-000000000c01'), 0,
  'colliding-uuid community member: the path''s course stays invisible');                             -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_collide'), '70000000-0000-4000-8000-00000000000a')$$,
  '42501', 'User is not assigned to this learning path',
  'colliding-uuid community member: cannot start a session');                                         -- 1
RESET ROLE;

-- Active member of a community that has no assignment.
SELECT tests.authenticate_as('lp70_wrongcomm');
SELECT is((SELECT count(*)::int FROM public.learning_paths), 0,
  'wrong-community member: sees no template');                                                        -- 1
SELECT ok(NOT public.auth_is_learning_path_assignee('70000000-0000-4000-8000-00000000000a'),
  'wrong-community member: auth_is_learning_path_assignee is FALSE');                                 -- 1
SELECT throws_ok(
  $$SELECT public.start_learning_path_session(pg_temp.uid('lp70_wrongcomm'), '70000000-0000-4000-8000-00000000000a')$$,
  '42501', 'User is not assigned to this learning path',
  'wrong-community member: cannot start a session');                                                  -- 1
RESET ROLE;

-- lp70_unassigned was assigned to path C by the admin in §3 — so they see C and only C.
SELECT tests.authenticate_as('lp70_unassigned');
SELECT is((SELECT array_agg(name::text ORDER BY name) FROM public.learning_paths), ARRAY['LP70 path C renamed'],
  'newly assigned user: sees the template the admin just assigned, and nothing else');                -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_courses), 1,
  'newly assigned user: sees that template''s single course link');                                   -- 1
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '70000000-0000-4000-8000-000000000c01'), 0,
  'newly assigned user: a course of a path they are not assigned to stays invisible');                -- 1
RESET ROLE;

SELECT tests.authenticate_as('lp70_other');
SELECT is((SELECT array_agg(name::text ORDER BY name) FROM public.learning_paths), ARRAY['LP70 path B'],
  'other-path user: sees only their own template');                                                   -- 1
SELECT is((SELECT count(*)::int FROM public.learning_path_progress_sessions), 2,
  'other-path user: sees only their own sessions (e2, e4)');                                          -- 1
SELECT is((SELECT time_spent_minutes FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e2'), 10,
  'other-path user: their settled session survived the direct assignee''s heartbeat / end attempts'); -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000b1'), 0,
  'other-path user: their assignment time survived the direct assignee''s increment attempt');        -- 1
SELECT is((SELECT progress_percentage FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000b1'), 0,
  'other-path user: their progress survived the direct assignee''s update attempt');                  -- 1
RESET ROLE;

-- ============================================================================
-- 6b. Maintenance settlement as service_role (the cleanup route's principal)
-- ============================================================================
SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT is(
  (SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes')),
  '{"closed": 1, "settled": 1}'::jsonb,
  'service_role: the stale session (e4) is closed and settled; fresh open sessions are untouched');    -- 1
SELECT is((SELECT session_end FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e4'),
  (SELECT last_heartbeat FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e4'),
  'service_role: the stale session ended at its last heartbeat');                                     -- 1
SELECT is((SELECT time_spent_minutes FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e4'), 30,
  'service_role: minutes = heartbeat - start (30), never the wall clock');                            -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000b1'), 30,
  'service_role: the 30 minutes were credited to the other user''s assignment');                      -- 1
SELECT is((SELECT last_activity_at FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000b1'),
  (SELECT last_heartbeat FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e4'),
  'service_role: last_activity_at is the session''s last heartbeat, not now()');                      -- 1
SELECT is((SELECT credited_minutes FROM public.learning_path_progress_sessions WHERE id = '70000000-0000-4000-8000-0000000000e2'), NULL,
  'service_role: the already-settled historical session (e2) was not settled again');                -- 1
SELECT is(
  (SELECT public.close_stale_learning_path_sessions(now() - interval '15 minutes')),
  '{"closed": 0, "settled": 0}'::jsonb,
  'service_role: a repeated run closes and credits nothing (idempotent)');                            -- 1
SELECT is((SELECT total_time_spent_minutes FROM public.learning_path_assignments WHERE id = '70000000-0000-4000-8000-0000000000b1'), 30,
  'service_role: the assignment total is unchanged after the repeated run');                          -- 1
SELECT throws_ok(
  $$SELECT public.close_stale_learning_path_sessions(now() + interval '1 hour')$$,
  '22023', NULL, 'service_role: a future cutoff is rejected (would close live sessions)');            -- 1
SELECT throws_ok(
  $$SELECT public.settle_learning_path_sessions(ARRAY['70000000-0000-4000-8000-0000000000e4']::uuid[])$$,
  '42501', 'permission denied for function settle_learning_path_sessions',
  'service_role: the internal settlement function is not directly executable');                      -- 1
RESET ROLE;

-- ============================================================================
-- 7. Still enabled after all probes
-- ============================================================================
SELECT ok((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = t.tbl),
  format('RLS remains enabled on public.%s after the probes', t.tbl))
FROM lp_tables t ORDER BY t.tbl;                                                                      -- 4

SELECT * FROM finish();

ROLLBACK;
