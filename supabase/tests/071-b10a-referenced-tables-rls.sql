-- =============================================================================
-- 071-b10a-referenced-tables-rls.sql — W-B10a-01: migration
-- 20260907120100_b10a_referenced_tables_rls.sql, role × table × operation for
-- exactly the six repository-referenced legacy tables:
--   group_assignment_discussions, growth_community_transformation_access,
--   instructors, modules, propuesta_rate_limits, qa_tester_time_logs.
--
--   1. governance guard: exactly these six, none of the B2b or B2c tables
--   2. catalog: RLS on, guard present, anon / PUBLIC hold nothing, no
--      TRUNCATE for authenticated, service_role retains everything
--   3. anon: SELECT / INSERT / UPDATE / DELETE denied on all six
--   4. propuesta_rate_limits: full lockdown (authenticated denied too), the
--      sequence included
--   5. per table, the legitimate reads survive and the illegitimate ones do
--      not: admin, consultor, a community member, an enrolled docente, a
--      learning-path assignee, an outsider
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(164);

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

CREATE TEMP TABLE b10a_tables (tbl, upd_col) AS VALUES
  ('group_assignment_discussions',           'assignment_id'),
  ('growth_community_transformation_access', 'notes'),
  ('instructors',                            'bio'),
  ('modules',                                'title'),
  ('propuesta_rate_limits',                  'slug'),
  ('qa_tester_time_logs',                    'total_seconds');
CREATE TEMP TABLE b10a_ops (op) AS VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE');
GRANT SELECT ON b10a_tables, b10a_ops TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Governance guards (2)
-- ----------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM b10a_tables), 6, 'W-B10a-01 probe set contains exactly six tables');
SELECT is(
  (SELECT count(*)::int FROM b10a_tables WHERE tbl = ANY (ARRAY[
     'answers','assignments','course_prerequisites','deleted_blocks','deleted_courses','deleted_lessons',
     'deleted_modules','menu_permissions','metadata_sync_log','profiles_role_backup','questions','quizzes',
     'student_answers','submissions','learning_paths','learning_path_courses','learning_path_assignments',
     'learning_path_progress_sessions']::text[])),
  0, 'probe set asserts nothing about B2b or B2c tables');

-- ----------------------------------------------------------------------------
-- 2. Catalog (6 + 6 + 24 + 6 + 6 + 24 = 72)
-- ----------------------------------------------------------------------------
SELECT tests.rls_enabled('public', tbl) FROM b10a_tables ORDER BY tbl;

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tbl
             AND policyname = 'forced_password_change_guard' AND permissive = 'RESTRICTIVE'),
  format('public.%s carries the restrictive forced_password_change_guard', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;

SELECT ok(NOT has_table_privilege('anon', format('public.%I', t.tbl), o.op),
  format('anon holds no %s privilege on public.%s', o.op, t.tbl))
FROM b10a_tables t CROSS JOIN b10a_ops o ORDER BY t.tbl, o.op;

SELECT is(
  (SELECT count(*)::int FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND table_name = t.tbl AND grantee = 'PUBLIC'),
  0, format('PUBLIC holds no privilege on public.%s', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;

SELECT ok(NOT has_table_privilege('authenticated', format('public.%I', t.tbl), 'TRUNCATE'),
  format('authenticated cannot TRUNCATE public.%s', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;

SELECT ok(has_table_privilege('service_role', format('public.%I', t.tbl), o.op),
  format('service_role retains %s on public.%s', o.op, t.tbl))
FROM b10a_tables t CROSS JOIN b10a_ops o ORDER BY t.tbl, o.op;

-- ----------------------------------------------------------------------------
-- 3. anon: every operation denied (24)
-- ----------------------------------------------------------------------------
SELECT pg_temp.set_anon();
SELECT throws_ok(format('SELECT count(*) FROM public.%I', t.tbl), '42501',
  format('permission denied for table %s', t.tbl), format('anon: SELECT on public.%s denied', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;
SELECT throws_ok(format('INSERT INTO public.%I DEFAULT VALUES', t.tbl), '42501',
  format('permission denied for table %s', t.tbl), format('anon: INSERT on public.%s denied', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;
SELECT throws_ok(format('UPDATE public.%I SET %I = %I', t.tbl, t.upd_col, t.upd_col), '42501',
  format('permission denied for table %s', t.tbl), format('anon: UPDATE on public.%s denied', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;
SELECT throws_ok(format('DELETE FROM public.%I', t.tbl), '42501',
  format('permission denied for table %s', t.tbl), format('anon: DELETE on public.%s denied', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('b10a_admin');
SELECT tests.create_supabase_user('b10a_consultor');
SELECT tests.create_supabase_user('b10a_member');     -- active member of the community, in the assignment group
SELECT tests.create_supabase_user('b10a_enrolled');   -- enrolled docente of course 1
SELECT tests.create_supabase_user('b10a_lpuser');     -- assigned to a learning path containing course 2
SELECT tests.create_supabase_user('b10a_outsider');   -- docente of another school, no memberships

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['b10a_admin','b10a_consultor','b10a_member','b10a_enrolled','b10a_lpuser','b10a_outsider']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9711, 'B10a school (pgTAP 071)'), (9712, 'B10a other school (pgTAP 071)')
ON CONFLICT (id) DO NOTHING;

-- Distinct uuids: community c001 / its workspace bb01; a second community
-- c002 (other school) with workspace bb02 for the mismatched-workspace probes.
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('71000000-0000-4000-8000-00000000c001', 9711, 'B10a community'),
  ('71000000-0000-4000-8000-00000000c002', 9712, 'B10a other community');
INSERT INTO public.community_workspaces (id, community_id) VALUES
  ('71000000-0000-4000-8000-00000000bb01', '71000000-0000-4000-8000-00000000c001'),
  ('71000000-0000-4000-8000-00000000bb02', '71000000-0000-4000-8000-00000000c002');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('b10a_admin'),     'admin',     NULL, NULL, true),
  (pg_temp.uid('b10a_consultor'), 'consultor', 9711, NULL, true),
  (pg_temp.uid('b10a_member'),    'docente',   9711, '71000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('b10a_enrolled'),  'docente',   9711, NULL, true),
  (pg_temp.uid('b10a_lpuser'),    'docente',   9711, NULL, true),
  (pg_temp.uid('b10a_outsider'),  'docente',   9712, NULL, true);

INSERT INTO public.instructors (id, full_name, bio)
VALUES ('71000000-0000-4000-8000-00000000f001', 'B10a instructor', 'synthetic');

INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('71000000-0000-4000-8000-000000000c01', 'B10a course 1', 'enrolled docente', '71000000-0000-4000-8000-00000000f001'),
  ('71000000-0000-4000-8000-000000000c02', 'B10a course 2', 'learning-path course', '71000000-0000-4000-8000-00000000f001');

INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('71000000-0000-4000-8000-00000000e001', '71000000-0000-4000-8000-000000000c01', 'B10a module 1', 1),
  ('71000000-0000-4000-8000-00000000e002', '71000000-0000-4000-8000-000000000c02', 'B10a module 2', 1);
-- Real content inside each module: the assigned-content chain is proved on
-- lessons, not on an empty module.
INSERT INTO public.lessons (id, module_id, title) VALUES
  ('71000000-0000-4000-8000-00000000ee01', '71000000-0000-4000-8000-00000000e001', 'B10a lesson 1 (course 1)'),
  ('71000000-0000-4000-8000-00000000ee02', '71000000-0000-4000-8000-00000000e002', 'B10a lesson 2 (course 2)');

INSERT INTO public.course_enrollments (user_id, course_id, enrollment_type, status)
VALUES (pg_temp.uid('b10a_enrolled'), '71000000-0000-4000-8000-000000000c01', 'assigned', 'active');

INSERT INTO public.learning_paths (id, name, description)
VALUES ('71000000-0000-4000-8000-00000000000a', 'B10a path', 'contains course 2');
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order)
VALUES ('71000000-0000-4000-8000-00000000000a', '71000000-0000-4000-8000-000000000c02', 1);
INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
VALUES ('71000000-0000-4000-8000-00000000000a', pg_temp.uid('b10a_lpuser'), pg_temp.uid('b10a_admin'));

INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id)
VALUES ('71000000-0000-4000-8000-00000000b001', 'b10a-assignment', '71000000-0000-4000-8000-00000000c001', 'B10a group', 9711);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id)
VALUES ('71000000-0000-4000-8000-00000000b001', 'b10a-assignment', pg_temp.uid('b10a_member'));
INSERT INTO public.message_threads (id, thread_title, created_by, workspace_id) VALUES
  ('71000000-0000-4000-8000-00000000d101', 'B10a thread',                  pg_temp.uid('b10a_member'),   NULL),
  ('71000000-0000-4000-8000-00000000d103', 'B10a thread by someone else',  pg_temp.uid('b10a_enrolled'), '71000000-0000-4000-8000-00000000bb01'),
  ('71000000-0000-4000-8000-00000000d104', 'B10a thread in other workspace', pg_temp.uid('b10a_member'), '71000000-0000-4000-8000-00000000bb02');
INSERT INTO public.group_assignment_discussions (id, assignment_id, group_id, thread_id)
VALUES ('71000000-0000-4000-8000-00000000d001', 'b10a-assignment', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000d101');

INSERT INTO public.growth_community_transformation_access (growth_community_id, assigned_by, is_active)
VALUES ('71000000-0000-4000-8000-00000000c001', pg_temp.uid('b10a_admin'), true);

INSERT INTO public.qa_tester_time_logs (tester_id, date, total_seconds)
VALUES (pg_temp.uid('b10a_enrolled'), current_date, 60);

INSERT INTO public.propuesta_rate_limits (ip_address, slug) VALUES ('203.0.113.1', 'b10a');

-- ----------------------------------------------------------------------------
-- 4. propuesta_rate_limits: authenticated denied at the ACL layer (4 + 2)
-- ----------------------------------------------------------------------------
SELECT ok(NOT has_table_privilege('authenticated', 'public.propuesta_rate_limits', o.op),
  format('authenticated holds no %s privilege on public.propuesta_rate_limits', o.op))
FROM b10a_ops o ORDER BY o.op;
SELECT ok(NOT has_sequence_privilege('anon', 'public.propuesta_rate_limits_id_seq', 'USAGE'),
  'anon holds no USAGE on propuesta_rate_limits_id_seq');
SELECT ok(NOT has_sequence_privilege('authenticated', 'public.propuesta_rate_limits_id_seq', 'USAGE'),
  'authenticated holds no USAGE on propuesta_rate_limits_id_seq');

-- ----------------------------------------------------------------------------
-- 5. Behaviour per persona
-- ----------------------------------------------------------------------------

-- admin (12)
SELECT tests.authenticate_as('b10a_admin');
SELECT is((SELECT count(*)::int FROM public.group_assignment_discussions WHERE id = '71000000-0000-4000-8000-00000000d001'), 1, 'admin: reads the discussion mapping');
SELECT is((SELECT count(*)::int FROM public.growth_community_transformation_access WHERE growth_community_id = '71000000-0000-4000-8000-00000000c001'), 1, 'admin: reads transformation access');
SELECT lives_ok($$UPDATE public.growth_community_transformation_access SET notes = 'admin note' WHERE growth_community_id = '71000000-0000-4000-8000-00000000c001'$$, 'admin: updates transformation access');
SELECT lives_ok($$INSERT INTO public.instructors (full_name) VALUES ('B10a instructor 2')$$, 'admin: inserts an instructor');
SELECT is((SELECT count(*)::int FROM public.instructors WHERE full_name LIKE 'B10a instructor%'), 2, 'admin: reads instructors');
SELECT is((SELECT count(*)::int FROM public.modules WHERE id::text LIKE '71000000-%'), 2, 'admin: reads every module');
SELECT lives_ok($$UPDATE public.modules SET title = 'B10a module 1 (edited)' WHERE id = '71000000-0000-4000-8000-00000000e001'$$, 'admin: edits a module');
SELECT is((SELECT count(*)::int FROM public.qa_tester_time_logs WHERE tester_id = pg_temp.uid('b10a_enrolled')), 1, 'admin: reads QA time logs');
SELECT throws_ok($$SELECT count(*) FROM public.propuesta_rate_limits$$, '42501', 'permission denied for table propuesta_rate_limits', 'admin (an authenticated user): cannot read the rate-limit table');
SELECT throws_ok($$INSERT INTO public.propuesta_rate_limits (ip_address, slug) VALUES ('203.0.113.2', 'x')$$, '42501', 'permission denied for table propuesta_rate_limits', 'admin: cannot write the rate-limit table');
SELECT throws_ok($$SELECT public.cleanup_propuesta_rate_limits()$$, '42501', NULL, 'admin: cannot execute cleanup_propuesta_rate_limits');
SELECT lives_ok($$INSERT INTO public.qa_tester_time_logs (tester_id, date, total_seconds) VALUES (pg_temp.uid('b10a_member'), current_date, 5)$$, 'admin: writes QA time logs');
RESET ROLE;

-- consultor of the school (7)
SELECT tests.authenticate_as('b10a_consultor');
SELECT is((SELECT count(*)::int FROM public.growth_community_transformation_access WHERE growth_community_id = '71000000-0000-4000-8000-00000000c001'), 1, 'consultor: reads transformation access');
SELECT is(pg_temp.rows_affected($$UPDATE public.growth_community_transformation_access SET is_active = false WHERE growth_community_id = '71000000-0000-4000-8000-00000000c001'$$), 0, 'consultor: cannot revoke transformation access');
SELECT throws_ok($$INSERT INTO public.growth_community_transformation_access (growth_community_id) VALUES ('71000000-0000-4000-8000-00000000c001')$$, '42501', NULL, 'consultor: cannot grant transformation access');
SELECT is((SELECT count(*)::int FROM public.instructors WHERE full_name LIKE 'B10a instructor%'), 2, 'consultor: reads instructors');
SELECT throws_ok($$INSERT INTO public.instructors (full_name) VALUES ('B10a rogue')$$, '42501', NULL, 'consultor: cannot insert an instructor');
SELECT is((SELECT count(*)::int FROM public.qa_tester_time_logs), 0, 'consultor: sees no QA time log');
SELECT is((SELECT count(*)::int FROM public.modules WHERE id::text LIKE '71000000-%'), 0, 'consultor: sees no module (same shape lessons already enforce)');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id::text LIKE '71000000-%'), 0, 'consultor: sees no lesson');
RESET ROLE;

-- community member in the assignment group (8)
SELECT tests.authenticate_as('b10a_member');
SELECT is((SELECT count(*)::int FROM public.group_assignment_discussions WHERE id = '71000000-0000-4000-8000-00000000d001'), 1, 'group member: reads the discussion mapping of a visible group');
SELECT lives_ok($$INSERT INTO public.message_threads (id, thread_title, created_by, workspace_id) VALUES ('71000000-0000-4000-8000-00000000d102', 'B10a thread 2', pg_temp.uid('b10a_member'), '71000000-0000-4000-8000-00000000bb01')$$, 'group member: creates the thread first, in their community''s workspace (as getOrCreateDiscussion does)');
SELECT lives_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, workspace_id, thread_id) VALUES ('b10a-assignment', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000bb01', '71000000-0000-4000-8000-00000000d102')$$, 'group member: creates a consistent discussion mapping (own group, its assignment, its community''s workspace, own thread there)');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, workspace_id, thread_id) VALUES ('b10a-assignment-2', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000bb01', '71000000-0000-4000-8000-00000000d102')$$, '42501', NULL, 'group member: cannot map an assignment_id that is not the group''s assignment');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, workspace_id, thread_id) VALUES ('b10a-assignment', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000bb02', '71000000-0000-4000-8000-00000000d104')$$, '42501', NULL, 'group member: cannot map the group to another community''s workspace');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, workspace_id, thread_id) VALUES ('b10a-assignment', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000bb01', '71000000-0000-4000-8000-00000000d103')$$, '42501', NULL, 'group member: cannot attach a thread created by someone else');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, workspace_id, thread_id) VALUES ('b10a-assignment', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000bb01', '71000000-0000-4000-8000-00000000d104')$$, '42501', NULL, 'group member: cannot attach a thread that lives in a different workspace than the mapping');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, workspace_id, thread_id) VALUES ('b10a-assignment', '71000000-0000-4000-8000-00000000b001', NULL, '71000000-0000-4000-8000-00000000d102')$$, '42501', NULL, 'group member: a NULL-workspace mapping cannot point at a thread that has a workspace');
SELECT is(pg_temp.rows_affected($$UPDATE public.group_assignment_discussions SET assignment_id = 'hijack' WHERE id = '71000000-0000-4000-8000-00000000d001'$$), 0, 'group member: cannot update a mapping');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.group_assignment_discussions WHERE id = '71000000-0000-4000-8000-00000000d001'$$), 0, 'group member: cannot delete a mapping');
SELECT is((SELECT count(*)::int FROM public.growth_community_transformation_access WHERE growth_community_id = '71000000-0000-4000-8000-00000000c001'), 1, 'community member: reads their own community''s transformation access');
SELECT is(pg_temp.rows_affected($$UPDATE public.growth_community_transformation_access SET notes = 'x' WHERE growth_community_id = '71000000-0000-4000-8000-00000000c001'$$), 0, 'community member: cannot edit transformation access');
SELECT is((SELECT count(*)::int FROM public.qa_tester_time_logs), 0, 'community member: sees no QA time log (not even the row about them)');
RESET ROLE;

-- enrolled docente (4)
SELECT tests.authenticate_as('b10a_enrolled');
SELECT is((SELECT array_agg(id::text) FROM public.modules WHERE id::text LIKE '71000000-%'), ARRAY['71000000-0000-4000-8000-00000000e001'], 'enrolled docente: sees the modules of the enrolled course only');
SELECT is((SELECT array_agg(id::text) FROM public.lessons WHERE id::text LIKE '71000000-%'), ARRAY['71000000-0000-4000-8000-00000000ee01'], 'enrolled docente: sees the lessons of the enrolled course only');
SELECT is(pg_temp.rows_affected($$UPDATE public.modules SET title = 'x' WHERE id = '71000000-0000-4000-8000-00000000e001'$$), 0, 'enrolled docente: cannot edit a module');
SELECT throws_ok($$INSERT INTO public.modules (course_id, title) VALUES ('71000000-0000-4000-8000-000000000c01', 'rogue')$$, '42501', NULL, 'enrolled docente: cannot add a module');
SELECT is((SELECT count(*)::int FROM public.qa_tester_time_logs), 0, 'enrolled docente: sees no QA time log about themselves (admin-only reporting)');
RESET ROLE;

-- learning-path assignee (3)
SELECT tests.authenticate_as('b10a_lpuser');
SELECT is((SELECT array_agg(id::text) FROM public.modules WHERE id::text LIKE '71000000-%'), ARRAY['71000000-0000-4000-8000-00000000e002'], 'learning-path assignee: sees the modules of the assigned path''s course (modules_learning_path_member_view)');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '71000000-0000-4000-8000-000000000c02'), 1, 'learning-path assignee: still sees the course itself');
SELECT is((SELECT array_agg(id::text) FROM public.lessons WHERE id::text LIKE '71000000-%'), ARRAY['71000000-0000-4000-8000-00000000ee02'], 'learning-path assignee: sees the LESSON inside the assigned course''s module without an enrolment row (lessons_learning_path_member_view), and not the other course''s lesson');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid('b10a_lpuser')), 0, 'learning-path assignee: (control) holds no course_enrollments row — the access came from the assignment');
SELECT is((SELECT count(*)::int FROM public.group_assignment_discussions), 0, 'learning-path assignee: sees no discussion mapping (not in any visible group)');
RESET ROLE;

-- outsider (10)
SELECT tests.authenticate_as('b10a_outsider');
SELECT is((SELECT count(*)::int FROM public.group_assignment_discussions), 0, 'outsider: sees no discussion mapping');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id::text LIKE '71000000-%'), 0, 'outsider: sees no lesson');
SELECT throws_ok($$INSERT INTO public.group_assignment_discussions (assignment_id, group_id, thread_id) VALUES ('rogue', '71000000-0000-4000-8000-00000000b001', '71000000-0000-4000-8000-00000000d101')$$, '42501', NULL, 'outsider: cannot create a mapping for a group they are not in');
SELECT is((SELECT count(*)::int FROM public.growth_community_transformation_access), 0, 'outsider: sees no transformation access');
SELECT is((SELECT count(*)::int FROM public.instructors WHERE full_name LIKE 'B10a instructor%'), 2, 'outsider (any authenticated user): reads instructors');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.instructors WHERE full_name LIKE 'B10a instructor%'$$), 0, 'outsider: cannot delete instructors');
SELECT is((SELECT count(*)::int FROM public.modules WHERE id::text LIKE '71000000-%'), 0, 'outsider: sees no module');
SELECT is((SELECT count(*)::int FROM public.qa_tester_time_logs), 0, 'outsider: sees no QA time log');
SELECT throws_ok($$INSERT INTO public.qa_tester_time_logs (tester_id, date) VALUES (pg_temp.uid('b10a_outsider'), current_date)$$, '42501', NULL, 'outsider: cannot write QA time logs');
SELECT throws_ok($$SELECT count(*) FROM public.propuesta_rate_limits$$, '42501', 'permission denied for table propuesta_rate_limits', 'outsider: cannot read the rate-limit table');
SELECT throws_ok($$SELECT nextval('public.propuesta_rate_limits_id_seq')$$, '42501', NULL, 'outsider: cannot advance the rate-limit sequence');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 6. Still enabled (6)
-- ----------------------------------------------------------------------------
SELECT ok((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = t.tbl),
  format('RLS remains enabled on public.%s after the probes', t.tbl))
FROM b10a_tables t ORDER BY t.tbl;

SELECT * FROM finish();

ROLLBACK;
