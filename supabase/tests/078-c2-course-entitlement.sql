-- =============================================================================
-- 078-c2-course-entitlement.sql — RLS closure C2 / decision D1 (2026-09-07):
-- migration 20260907120500_c2_course_entitlement.sql.
--
--   1. catalog: provenance columns, CHECK, the three triggers, grants of the
--      new helpers, batch_assign_learning_path still authenticated-only
--   2. batch_assign records provenance: new rows are 'learning_path' with the
--      source path; an existing 'independent' row is NOT reclassified; an
--      existing 'unknown' row is NOT reclassified
--   3. access through the REAL policies (courses row, lesson row) and the
--      predicate: an entitled assignee reads; an outsider does not
--   4. D1: the last valid path entitlement ends course access obtained solely
--      through the path — direct unassignment, membership deactivation,
--      course removal from the path, path deletion; independent and unknown
--      rows keep access; other active sources (a second path, the group
--      behind a removed direct row) keep access; reassignment / reactivation
--      restore it; joins and course additions create the rows; the enrolment
--      row and its progress survive every transition
--   5. provenance is not client-writable (own-row UPDATE keeps working for
--      progress); admin (through admin_grant_course_access) and backend may
--      change it
--   6. the aggregate-only reconciliation report: admin / backend only, counts
--      only
--   7. C-R1-01 (closure review 2026-09-08): enrolment IDENTITY and grant
--      authority are not client-writable either — independent, unknown and
--      path-origin rows cannot be re-associated to another course or user,
--      provenance cannot be forged, multi-field attempts are refused as a
--      whole, the same holds inside a SECURITY DEFINER writer acting for a
--      learner (trigger layer, independent of the column privileges), and the
--      actual course / lesson rows stay unreadable after every refused attempt;
--      ordinary progress updates and trusted administrative writes still work
--   8. C-R1-03: admin_grant_course_access — literal active admin only, atomic,
--      idempotent, promotes an existing row without touching progress;
--      batch_assign_courses (admin / consultor) declares its provenance and no
--      longer rewrites grant provenance on conflict
--   9. C-R1-02: the C2 definer readers / writers apply the forced-password-
--      change gate themselves
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(163);

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
-- origin / source of a (user, course) enrolment, read as postgres
CREATE OR REPLACE FUNCTION pg_temp.origin(k text, c uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT access_origin || ':' || coalesce(source_path_id::text, '-') FROM public.course_enrollments WHERE user_id = pg_temp.uid(k) AND course_id = c $$;
CREATE OR REPLACE FUNCTION pg_temp.enrol_count(k text) RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid(k) $$;

-- ----------------------------------------------------------------------------
-- 1. Catalog
-- ----------------------------------------------------------------------------
SELECT has_column('public', 'course_enrollments', 'access_origin', 'course_enrollments.access_origin exists');
SELECT has_column('public', 'course_enrollments', 'source_path_id', 'course_enrollments.source_path_id exists');
SELECT has_column('public', 'course_enrollments', 'access_origin_set_at', 'course_enrollments.access_origin_set_at exists');
SELECT is((SELECT column_default FROM information_schema.columns WHERE table_name = 'course_enrollments' AND column_name = 'access_origin'), '''unknown''::text', 'access_origin defaults to unknown (an undeclared writer stays explicitly unresolved)');
SELECT throws_ok($$INSERT INTO public.course_enrollments (user_id, course_id, access_origin) VALUES (gen_random_uuid(), gen_random_uuid(), 'guessed')$$, '23514', NULL, 'access_origin CHECK rejects values outside independent / learning_path / unknown');
SELECT is((SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('course_enrollments_origin_guard', 'learning_path_courses_enroll_assignees', 'user_roles_enroll_group_paths') AND tgenabled = 'O'), 3, 'the three C2 triggers are installed and enabled');
SELECT is(has_function_privilege('anon', 'public.auth_is_course_student(uuid)', 'EXECUTE'), true, 'auth_is_course_student: anon EXECUTE kept (policy predicate on public-targeted courses policy)');
SELECT is(has_function_privilege('authenticated', 'public.auth_is_course_student(uuid)', 'EXECUTE'), true, 'auth_is_course_student: authenticated EXECUTE kept');
SELECT is(has_function_privilege('authenticated', 'public.auth_accessible_course_ids()', 'EXECUTE'), true, 'auth_accessible_course_ids: authenticated may execute');
SELECT is(has_function_privilege('anon', 'public.auth_accessible_course_ids()', 'EXECUTE'), false, 'auth_accessible_course_ids: anon cannot execute');
SELECT is(has_function_privilege('authenticated', 'public.lp_user_entitled_to_course(uuid, uuid)', 'EXECUTE'), false, 'lp_user_entitled_to_course: internal');
SELECT is(has_function_privilege('service_role', 'public.lp_ensure_path_enrollments(uuid, uuid[], uuid)', 'EXECUTE'), false, 'lp_ensure_path_enrollments: internal (not even service_role)');
SELECT is(has_function_privilege('authenticated', 'public.course_enrollment_grants_access(uuid, uuid)', 'EXECUTE'), false, 'course_enrollment_grants_access: internal');
SELECT is(has_function_privilege('authenticated', 'public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid)', 'EXECUTE'), true, 'batch_assign_learning_path: authenticated EXECUTE kept');
SELECT is(has_function_privilege('anon', 'public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid)', 'EXECUTE'), false, 'batch_assign_learning_path: anon cannot execute');
SELECT is(has_function_privilege('anon', 'public.lp_enrollment_origin_report()', 'EXECUTE'), false, 'lp_enrollment_origin_report: anon cannot execute');
SELECT is((SELECT pg_get_expr(polqual, polrelid) ~ 'auth_is_course_student' FROM pg_policy WHERE polname = 'enrolled_or_owner_can_read_courses'), true, 'courses policy enrolled_or_owner_can_read_courses now uses the entitlement-aware predicate');
-- C-R1-01 layer (a): column privileges
SELECT ok((SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'course_enrollments_origin_guard') ~ 'BEFORE INSERT OR UPDATE ON', '1: the guard trigger fires on EVERY update, not on a column list');
SELECT is(has_table_privilege('anon', 'public.course_enrollments', 'UPDATE'), false, '1: anon holds no UPDATE on course_enrollments');
SELECT is(has_table_privilege('authenticated', 'public.course_enrollments', 'UPDATE'), false, '1: authenticated holds no TABLE-level UPDATE on course_enrollments');
SELECT is((SELECT count(*)::int FROM (VALUES ('id'),('user_id'),('course_id'),('access_origin'),('source_path_id'),('access_origin_set_at')) v(c) WHERE has_column_privilege('authenticated', 'public.course_enrollments', v.c, 'UPDATE')), 0, '1: authenticated cannot UPDATE any identity / provenance column');
SELECT is((SELECT count(*)::int FROM (VALUES ('progress_percentage'),('lessons_completed'),('total_lessons'),('is_completed'),('completed_at'),('total_time_spent_seconds'),('status'),('updated_at'),('has_passed'),('overall_score'),('enrollment_data'),('completion_certificate_url')) v(c) WHERE has_column_privilege('authenticated', 'public.course_enrollments', v.c, 'UPDATE')), 12, '1: authenticated keeps UPDATE on the progress / completion / status columns (old-app writers)');
SELECT is((SELECT count(*)::int FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'course_enrollments' AND c.column_name NOT IN ('id','user_id','course_id','access_origin','source_path_id','access_origin_set_at') AND NOT has_column_privilege('authenticated', 'public.course_enrollments', c.column_name, 'UPDATE')), 0, '1: every other column of course_enrollments is in the authenticated UPDATE grant (a new column must be granted explicitly)');
SELECT is(has_table_privilege('service_role', 'public.course_enrollments', 'UPDATE'), true, '1: service_role keeps table-level UPDATE');
SELECT is(has_function_privilege('authenticated', 'public.admin_grant_course_access(uuid, uuid[])', 'EXECUTE'), true, '1: admin_grant_course_access: authenticated may execute (the body decides)');
SELECT is(has_function_privilege('anon', 'public.admin_grant_course_access(uuid, uuid[])', 'EXECUTE'), false, '1: admin_grant_course_access: anon cannot execute');
SELECT ok((SELECT prosecdef AND 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = 'public.admin_grant_course_access(uuid, uuid[])'::regprocedure), '1: admin_grant_course_access is SECURITY DEFINER with a pinned search_path');
SELECT ok((SELECT 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = 'public.batch_assign_courses(uuid, uuid[])'::regprocedure), '1: batch_assign_courses search_path pinned');

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('c2_admin');
SELECT tests.create_supabase_user('c2_direct');    -- direct assignee of P1 (and later P2)
SELECT tests.create_supabase_user('c2_member');    -- community member (group assignment of P1)
SELECT tests.create_supabase_user('c2_both');      -- direct + member
SELECT tests.create_supabase_user('c2_indep');     -- independent K1 enrolment + direct P1
SELECT tests.create_supabase_user('c2_unknown');   -- historical unknown-origin K1 enrolment + direct P1
SELECT tests.create_supabase_user('c2_late');      -- joins the community after the group assignment
SELECT tests.create_supabase_user('c2_outsider');  -- nothing
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['c2_admin','c2_direct','c2_member','c2_both','c2_indep','c2_unknown','c2_late','c2_outsider']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (9781, 'C2 school (pgTAP 078)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES ('78000000-0000-4000-8000-00000000c001', 9781, 'C2 community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES ('78000000-0000-4000-8000-00000000bb01', '78000000-0000-4000-8000-00000000c001', 'C2 workspace');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('c2_admin'),    'admin',   NULL, NULL, true),
  (pg_temp.uid('c2_direct'),   'docente', 9781, NULL, true),
  (pg_temp.uid('c2_member'),   'docente', 9781, '78000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('c2_both'),     'docente', 9781, '78000000-0000-4000-8000-00000000c001', true),
  (pg_temp.uid('c2_indep'),    'docente', 9781, NULL, true),
  (pg_temp.uid('c2_unknown'),  'docente', 9781, NULL, true),
  (pg_temp.uid('c2_outsider'), 'docente', 9781, NULL, true);
INSERT INTO public.instructors (id, full_name) VALUES ('78000000-0000-4000-8000-00000000f001', 'C2 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('78000000-0000-4000-8000-000000000c01', 'C2 course K1', 'in P1', '78000000-0000-4000-8000-00000000f001'),
  ('78000000-0000-4000-8000-000000000c02', 'C2 course K2', 'in P1 and P2', '78000000-0000-4000-8000-00000000f001'),
  ('78000000-0000-4000-8000-000000000c03', 'C2 course K3', 'added to P1 later', '78000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('78000000-0000-4000-8000-00000000e001', '78000000-0000-4000-8000-000000000c01', 'C2 module K1', 1),
  ('78000000-0000-4000-8000-00000000e003', '78000000-0000-4000-8000-000000000c03', 'C2 module K3', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('78000000-0000-4000-8000-00000000ee01', '78000000-0000-4000-8000-00000000e001', '78000000-0000-4000-8000-000000000c01', 'C2 lesson K1', 1),
  ('78000000-0000-4000-8000-00000000ee03', '78000000-0000-4000-8000-00000000e003', '78000000-0000-4000-8000-000000000c03', 'C2 lesson K3', 1);
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('78000000-0000-4000-8000-00000000000a', 'C2 path P1', 'K1 + K2', pg_temp.uid('c2_admin')),
  ('78000000-0000-4000-8000-00000000000b', 'C2 path P2', 'K2 only', pg_temp.uid('c2_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('78000000-0000-4000-8000-00000000000a', '78000000-0000-4000-8000-000000000c01', 1),
  ('78000000-0000-4000-8000-00000000000a', '78000000-0000-4000-8000-000000000c02', 2),
  ('78000000-0000-4000-8000-00000000000b', '78000000-0000-4000-8000-000000000c02', 1);
-- pre-existing enrolments: one explicitly independent, one historical unknown
INSERT INTO public.course_enrollments (user_id, course_id, enrollment_type, status, access_origin, progress_percentage) VALUES
  (pg_temp.uid('c2_indep'),   '78000000-0000-4000-8000-000000000c01', 'assigned', 'active', 'independent', 10),
  (pg_temp.uid('c2_unknown'), '78000000-0000-4000-8000-000000000c01', 'assigned', 'active', 'unknown', 20);

-- ----------------------------------------------------------------------------
-- 2. batch_assign records provenance
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is((public.batch_assign_learning_path('78000000-0000-4000-8000-00000000000a',
            ARRAY[pg_temp.uid('c2_direct'), pg_temp.uid('c2_both'), pg_temp.uid('c2_indep'), pg_temp.uid('c2_unknown')],
            ARRAY['78000000-0000-4000-8000-00000000bb01'::uuid], auth.uid()) ->> 'assignments_created')::int,
  5, 'admin assigns P1 to four users and one group (5 assignment rows)');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c01'), 'learning_path:78000000-0000-4000-8000-00000000000a', 'direct assignee: K1 enrolment is learning_path with source P1');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c02'), 'learning_path:78000000-0000-4000-8000-00000000000a', 'direct assignee: K2 enrolment is learning_path with source P1');
SELECT is(pg_temp.origin('c2_member', '78000000-0000-4000-8000-000000000c01'), 'learning_path:78000000-0000-4000-8000-00000000000a', 'group member: K1 enrolment is learning_path with source P1');
SELECT is(pg_temp.origin('c2_indep', '78000000-0000-4000-8000-000000000c01'), 'independent:-', 'independent K1 row is NOT reclassified by the path assignment');
SELECT is(pg_temp.origin('c2_indep', '78000000-0000-4000-8000-000000000c02'), 'learning_path:78000000-0000-4000-8000-00000000000a', 'the same user''s new K2 row is learning_path');
SELECT is(pg_temp.origin('c2_unknown', '78000000-0000-4000-8000-000000000c01'), 'unknown:-', 'unknown K1 row is NOT reclassified (origin is still unknown)');
SELECT is((SELECT enrolled_by FROM public.course_enrollments WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'), pg_temp.uid('c2_admin'), 'enrolled_by is the authenticated actor');
SELECT is((SELECT access_origin_set_at IS NOT NULL FROM public.course_enrollments WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'), true, 'access_origin_set_at is stamped on a declared origin');
SELECT is(pg_temp.enrol_count('c2_both'), 2, 'direct + member: exactly one row per course (no duplicates)');
SELECT is(pg_temp.enrol_count('c2_outsider'), 0, 'outsider: nothing');

-- ----------------------------------------------------------------------------
-- 3. Access through the real policies
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), 'direct assignee: auth_is_course_student(K1) TRUE');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '78000000-0000-4000-8000-000000000c01'), 1, 'direct assignee: reads the K1 course row');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = '78000000-0000-4000-8000-00000000ee01'), 1, 'direct assignee: reads the K1 lesson');
SELECT is((SELECT array_agg(c ORDER BY c) FROM public.auth_accessible_course_ids() c), ARRAY['78000000-0000-4000-8000-000000000c01','78000000-0000-4000-8000-000000000c02']::uuid[], 'direct assignee: accessible course ids = K1, K2');
RESET ROLE;
SELECT tests.authenticate_as('c2_outsider');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), 'outsider: auth_is_course_student(K1) FALSE');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '78000000-0000-4000-8000-000000000c01'), 0, 'outsider: no course row');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = '78000000-0000-4000-8000-00000000ee01'), 0, 'outsider: no lesson');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()), 0, 'outsider: no accessible course');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), 'anon: auth_is_course_student FALSE without raising');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 4. D1 transitions
-- ----------------------------------------------------------------------------
-- progress recorded before any transition (must survive every one of them)
UPDATE public.course_enrollments SET progress_percentage = 40, lessons_completed = 1
 WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01';

-- 4a. direct unassignment ends path-only access; history survives; reassignment restores
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = '78000000-0000-4000-8000-00000000000a' AND user_id = pg_temp.uid('c2_direct')$$), 1, '4a: admin removes the direct assignment of c2_direct');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4a: after unassignment auth_is_course_student(K1) FALSE — the last entitlement is gone');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '78000000-0000-4000-8000-000000000c01'), 0, '4a: the course row is no longer readable');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = '78000000-0000-4000-8000-00000000ee01'), 0, '4a: the lesson is no longer readable');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()), 0, '4a: no accessible course');
SELECT is((SELECT progress_percentage::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'), 40, '4a: the enrolment row and its progress are preserved (own row still readable as history)');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is((public.batch_assign_learning_path('78000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('c2_direct')], NULL, auth.uid()) ->> 'enrollments_created')::int, 0, '4a: reassignment creates no new enrolment row (both exist)');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4a: reassignment restores access');
SELECT is((SELECT progress_percentage::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'), 40, '4a: progress unchanged across the round trip');

-- 4b. overlapping paths: K2 is in P1 and P2; removing P1 keeps K2 through P2, ends K1
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is((public.batch_assign_learning_path('78000000-0000-4000-8000-00000000000b', ARRAY[pg_temp.uid('c2_direct')], NULL, auth.uid()) ->> 'assignments_created')::int, 1, '4b: c2_direct also assigned P2');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = '78000000-0000-4000-8000-00000000000a' AND user_id = pg_temp.uid('c2_direct')$$), 1, '4b: P1 assignment removed again');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4b: K1 (only in P1) — no access');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c02'), '4b: K2 (also in P2) — access kept through the other active source');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c02'), 'learning_path:78000000-0000-4000-8000-00000000000a', '4b: the K2 row still records P1 as its source (informational, not authority)');

-- 4c. group membership: deactivation ends access, reactivation restores; no duplicate rows
RESET ROLE;
SELECT tests.authenticate_as('c2_member');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4c: active member has access');
RESET ROLE;
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('c2_member');
RESET ROLE;
SELECT tests.authenticate_as('c2_member');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4c: deactivated member — no access');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = '78000000-0000-4000-8000-00000000ee01'), 0, '4c: deactivated member — no lesson');
RESET ROLE;
UPDATE public.user_roles SET is_active = true WHERE user_id = pg_temp.uid('c2_member');
RESET ROLE;
SELECT tests.authenticate_as('c2_member');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4c: reactivated member — access restored');
SELECT is(pg_temp.enrol_count('c2_member'), 2, '4c: reactivation did not duplicate enrolment rows');

-- 4d. a late join creates the rows (trigger) with provenance
RESET ROLE;
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active)
VALUES (pg_temp.uid('c2_late'), 'docente', 9781, '78000000-0000-4000-8000-00000000c001', true);
SELECT is(pg_temp.enrol_count('c2_late'), 2, '4d: joining the assigned community enrols the user in the path''s courses');
SELECT is(pg_temp.origin('c2_late', '78000000-0000-4000-8000-000000000c01'), 'learning_path:78000000-0000-4000-8000-00000000000a', '4d: the late join row is learning_path with source P1');
RESET ROLE;
SELECT tests.authenticate_as('c2_late');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4d: late joiner has access');

-- 4e. direct + group: removing the direct row keeps access through the group; ending membership ends it
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = '78000000-0000-4000-8000-00000000000a' AND user_id = pg_temp.uid('c2_both')$$), 1, '4e: direct row of c2_both removed');
RESET ROLE;
SELECT tests.authenticate_as('c2_both');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4e: access kept through the group source');
RESET ROLE;
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('c2_both');
RESET ROLE;
SELECT tests.authenticate_as('c2_both');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4e: membership ended too — no access');
SELECT is(pg_temp.enrol_count('c2_both'), 2, '4e: rows preserved');

-- 4f. independent and unknown rows survive unassignment
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_assignments WHERE path_id = '78000000-0000-4000-8000-00000000000a' AND user_id IN (pg_temp.uid('c2_indep'), pg_temp.uid('c2_unknown'))$$), 2, '4f: direct rows of c2_indep and c2_unknown removed');
RESET ROLE;
SELECT tests.authenticate_as('c2_indep');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4f: independent K1 access persists');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c02'), '4f: the same user''s path-only K2 access ends');
SELECT is((SELECT array_agg(c) FROM public.auth_accessible_course_ids() c), ARRAY['78000000-0000-4000-8000-000000000c01']::uuid[], '4f: accessible ids = K1 only');
RESET ROLE;
SELECT tests.authenticate_as('c2_unknown');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4f: unknown-origin K1 access is PRESERVED (never guessed)');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c02'), '4f: their path-created K2 access ends');

-- 4g. course added to the path enrols current assignees; course removed ends access
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is((public.batch_assign_learning_path('78000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('c2_direct')], NULL, auth.uid()) ->> 'assignments_created')::int, 1, '4g: c2_direct reassigned P1');
SELECT lives_ok($$INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES ('78000000-0000-4000-8000-00000000000a', '78000000-0000-4000-8000-000000000c03', 3)$$, '4g: admin adds K3 to P1');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c03'), 'learning_path:78000000-0000-4000-8000-00000000000a', '4g: current direct assignee enrolled in the added course');
SELECT is(pg_temp.origin('c2_member', '78000000-0000-4000-8000-000000000c03'), 'learning_path:78000000-0000-4000-8000-00000000000a', '4g: current group member enrolled in the added course');
SELECT is(pg_temp.enrol_count('c2_both'), 2, '4g: the deactivated member is NOT enrolled in the added course');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c03'), '4g: K3 accessible');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = '78000000-0000-4000-8000-00000000ee03'), 1, '4g: K3 lesson readable');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_path_courses WHERE learning_path_id = '78000000-0000-4000-8000-00000000000a' AND course_id = '78000000-0000-4000-8000-000000000c03'$$), 1, '4g: admin removes K3 from P1');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c03'), '4g: K3 access ends when the course leaves the path');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c03'), 1, '4g: the K3 enrolment row remains (history)');

-- 4h. path deletion: source becomes NULL, access ends when no other path covers the course
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id = '78000000-0000-4000-8000-00000000000b'$$), 1, '4h: admin deletes P2');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c02'), '4h: K2 still covered by P1 (reassigned in 4g) — access kept');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.learning_paths WHERE id = '78000000-0000-4000-8000-00000000000a'$$), 1, '4h: admin deletes P1 too');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(NOT public.auth_is_course_student('78000000-0000-4000-8000-000000000c02'), '4h: no path covers K2 — access ends');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c02'), 'learning_path:-', '4h: the row survives with source_path_id SET NULL, origin still learning_path');
SELECT is((SELECT progress_percentage::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'), 40, '4h: K1 progress still preserved after both paths are gone');
RESET ROLE;
SELECT tests.authenticate_as('c2_indep');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '4h: independent access unaffected by path deletion');

-- ----------------------------------------------------------------------------
-- 5. Provenance is not client-writable
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT throws_ok($$UPDATE public.course_enrollments SET access_origin = 'independent' WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c02'$$, '42501', NULL, '5: a learner cannot promote their own learning_path row to independent');
SELECT throws_ok($$UPDATE public.course_enrollments SET source_path_id = NULL, access_origin = 'unknown' WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '5: a learner cannot relabel their row as unknown');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET progress_percentage = 55 WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$), 1, '5: own progress UPDATE still works (own-row policy)');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c02'), 'learning_path:-', '5: origin unchanged after the refused attempts');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT throws_ok($$UPDATE public.course_enrollments SET access_origin = 'independent' WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c02'$$, '42501', NULL, '5: not even an admin edits provenance through a table UPDATE (column privilege) — the grant surface is admin_grant_course_access');
SELECT is((public.admin_grant_course_access('78000000-0000-4000-8000-000000000c02', ARRAY[pg_temp.uid('c2_direct')]) ->> 'enrollments_promoted')::int, 1, '5: a literal admin declares an independent grant (existing row promoted)');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c02'), 'independent:-', '5: the promoted row is independent with no source path');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c02'), '5: the admin''s independent grant restores durable access to K2');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET access_origin = 'learning_path' WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c02'$$), 1, '5: the backend (service_role) may change provenance');
RESET ROLE;
DELETE FROM public.course_assignments WHERE course_id = '78000000-0000-4000-8000-000000000c02' AND teacher_id = pg_temp.uid('c2_direct');

-- ----------------------------------------------------------------------------
-- 6. Aggregate-only reconciliation report
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT is((public.lp_enrollment_origin_report() ->> 'unknown_total')::int, (SELECT count(*)::int FROM public.course_enrollments WHERE access_origin = 'unknown'), '6: admin: unknown_total matches the table');
SELECT is((public.lp_enrollment_origin_report() -> 'by_origin' ->> 'independent')::int, (SELECT count(*)::int FROM public.course_enrollments WHERE access_origin = 'independent'), '6: admin: by_origin.independent matches');
SELECT ok((public.lp_enrollment_origin_report() ->> 'learning_path_origin_lapsed')::int >= 1, '6: admin: lapsed learning_path rows are counted (c2_direct K1 after both paths were deleted)');
SELECT ok(NOT (public.lp_enrollment_origin_report()::text ~ pg_temp.uid('c2_unknown')::text), '6: the report carries no row identifiers');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT throws_ok($$SELECT public.lp_enrollment_origin_report()$$, '42501', NULL, '6: a non-admin cannot read the report');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT lives_ok($$SELECT public.lp_enrollment_origin_report()$$, '6: the backend can read the report');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 7. C-R1-01 — enrolment identity and grant authority are not client-writable
-- ----------------------------------------------------------------------------
-- K4: a course in no learning path; nobody but an explicit grant reaches it.
RESET ROLE;
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('78000000-0000-4000-8000-000000000c04', 'C2 course K4 (no path)', 'target of the re-association attack', '78000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES ('78000000-0000-4000-8000-00000000e004', '78000000-0000-4000-8000-000000000c04', 'C2 module K4', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES ('78000000-0000-4000-8000-00000000ee04', '78000000-0000-4000-8000-00000000e004', '78000000-0000-4000-8000-000000000c04', 'C2 lesson K4', 1);
CREATE OR REPLACE FUNCTION pg_temp.k4_visible() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT public.auth_is_course_student('78000000-0000-4000-8000-000000000c04')::text
      || '/' || (SELECT count(*) FROM public.courses WHERE id = '78000000-0000-4000-8000-000000000c04')
      || '/' || (SELECT count(*) FROM public.lessons WHERE id = '78000000-0000-4000-8000-00000000ee04') $$;

-- 7a. independent row (c2_indep holds K1 independently)
SELECT tests.authenticate_as('c2_indep');
SELECT is(pg_temp.k4_visible(), 'false/0/0', '7a: before the attack K4 is not a student course, not readable, lesson not readable');
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04' WHERE user_id = auth.uid()$$, '42501', NULL, '7a: an independent enrolment cannot be re-associated to another course (Codex reproduction)');
SELECT is(pg_temp.k4_visible(), 'false/0/0', '7a: after the refused attempt K4 stays invisible');
SELECT is(pg_temp.origin('c2_indep', '78000000-0000-4000-8000-000000000c01'), 'independent:-', '7a: the K1 row is untouched');
RESET ROLE;
-- 7b. unknown-origin row
SELECT tests.authenticate_as('c2_unknown');
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04' WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7b: an unknown-origin enrolment cannot be re-associated either');
SELECT is(pg_temp.k4_visible(), 'false/0/0', '7b: K4 stays invisible');
RESET ROLE;
-- 7c. path-origin row, provenance forgery, multi-field, user / id identity
SELECT tests.authenticate_as('c2_direct');
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04' WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7c: a path-origin enrolment cannot be re-associated');
SELECT throws_ok($$UPDATE public.course_enrollments SET access_origin_set_at = now() WHERE user_id = auth.uid()$$, '42501', NULL, '7c: access_origin_set_at is not client-writable');
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04', access_origin = 'independent', progress_percentage = 1 WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7c: a multi-field attempt (identity + provenance + progress) is refused as a whole');
SELECT throws_ok($$UPDATE public.course_enrollments SET user_id = pg_temp.uid('c2_outsider') WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7c: the user identity of a row cannot be changed');
SELECT throws_ok($$UPDATE public.course_enrollments SET id = gen_random_uuid() WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7c: the row id cannot be changed');
-- enrolled_by / enrollment_type stay in the column grant (old-app compatibility) but the trigger guards them
SELECT throws_ok($$UPDATE public.course_enrollments SET enrolled_by = pg_temp.uid('c2_admin'), enrollment_type = 'bulk_assigned' WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', 'Enrollment identity, provenance and grant authority are not client-writable', '7c: grant provenance (who / how) cannot be forged — refused by the guard trigger');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET progress_percentage = 77, lessons_completed = 2, is_completed = false, status = 'paused', total_time_spent_seconds = 120, updated_at = now() WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'$$), 1, '7c: an ordinary progress / status update by the learner still works');
SELECT is((SELECT progress_percentage::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '78000000-0000-4000-8000-000000000c01'), 77, '7c: the progress write landed');
SELECT is(pg_temp.k4_visible(), 'false/0/0', '7c: K4 stays invisible after every refused attempt');
RESET ROLE;
-- 7d. the trigger layer alone: a SECURITY DEFINER writer acting for the learner
--     (owner privileges, so no column privilege applies; auth.uid() is the learner)
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('c2_direct'), 'role', 'authenticated')::text, true);
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04' WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', 'Enrollment identity, provenance and grant authority are not client-writable', '7d: inside a definer writer the guard trigger still refuses a learner re-association (alternate RPC shape)');
SELECT throws_ok($$UPDATE public.course_enrollments SET access_origin = 'independent' WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7d: … and a learner provenance promotion');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET progress_percentage = 78 WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'$$), 1, '7d: … while a progress write for the learner passes (lp_record_progress / lesson trigger shape)');
SELECT set_config('request.jwt.claims', '', true);
RESET ROLE;
-- 7e. trusted principals: a literal admin through a definer path, the backend directly
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('c2_admin'), 'role', 'authenticated')::text, true);
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET enrolled_by = pg_temp.uid('c2_admin') WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'$$), 1, '7e: an admin acting through a definer writer may change grant provenance');
SELECT set_config('request.jwt.claims', '', true);
SELECT pg_temp.set_service();
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04' WHERE user_id = pg_temp.uid('c2_outsider')$$), 0, '7e: the backend may re-associate (no row for the outsider: 0, no error)');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT throws_ok($$UPDATE public.course_enrollments SET course_id = '78000000-0000-4000-8000-000000000c04' WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'$$, '42501', NULL, '7e: an admin browser session (authenticated role) cannot re-associate a row through a table UPDATE either — identity is service / definer only');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 8. C-R1-03 — admin_grant_course_access and batch_assign_courses provenance
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('c2_outsider');
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[auth.uid()])$$, '42501', 'Admin only', '8: an ordinary user cannot grant a course (to themselves or anyone)');
SELECT is(pg_temp.k4_visible(), 'false/0/0', '8: … and gains nothing');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY['78000000-0000-4000-8000-000000000c04'::uuid])$$, '42501', NULL, '8: anon cannot execute the grant');
RESET ROLE;
-- the actor is auth.uid(), never an argument: a consultor is not a literal admin
SELECT tests.create_supabase_user('c2_consultor');
INSERT INTO public.profiles (id, email, name, approval_status) VALUES (pg_temp.uid('c2_consultor'), 'c2_consultor@test.local', 'c2_consultor', 'approved') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (pg_temp.uid('c2_consultor'), 'consultor', 9781, true);
SELECT tests.authenticate_as('c2_consultor');
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_outsider')])$$, '42501', 'Admin only', '8: a consultor is not a literal admin for the independent grant surface');
RESET ROLE;
-- inactive admin row
UPDATE public.user_roles SET is_active = false WHERE user_id = pg_temp.uid('c2_admin') AND role_type = 'admin';
SELECT tests.authenticate_as('c2_admin');
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_outsider')])$$, '42501', 'Admin only', '8: an INACTIVE admin row grants nothing');
RESET ROLE;
UPDATE public.user_roles SET is_active = true WHERE user_id = pg_temp.uid('c2_admin') AND role_type = 'admin';
-- the real grant
UPDATE public.course_enrollments SET progress_percentage = 33 WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01';
SELECT tests.authenticate_as('c2_admin');
SELECT is((SELECT (r->>'assignments_created')::int || '/' || (r->>'enrollments_created') || '/' || (r->>'enrollments_promoted') || '/' || (r->>'assignments_existing') FROM public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_direct'), pg_temp.uid('c2_unknown'), pg_temp.uid('c2_direct')]) r), '2/2/0/0', '8: admin grants K4 to two users (duplicate collapsed): 2 assignments, 2 independent enrolments');
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE course_id = '78000000-0000-4000-8000-000000000c04' AND assigned_by = auth.uid()), 2, '8: the course_assignments rows exist with the verified actor');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c04'), 'independent:-', '8: the new row is independent');
SELECT is((SELECT (r->>'assignments_created')::int || '/' || (r->>'assignments_existing') || '/' || (r->>'enrollments_created') || '/' || (r->>'enrollments_unchanged') || '/' || jsonb_array_length(r->'newly_assigned_user_ids') FROM public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_direct'), pg_temp.uid('c2_unknown')]) r), '0/2/0/2/0', '8: the retry is idempotent and truthful (0 created, 2 existing, nobody newly assigned)');
SELECT is((SELECT (r->>'enrollments_promoted')::int FROM public.admin_grant_course_access('78000000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('c2_direct')]) r), 1, '8: granting K1 to c2_direct promotes the path-origin row');
SELECT is(pg_temp.origin('c2_direct', '78000000-0000-4000-8000-000000000c01'), 'independent:-', '8: … to independent with no source path');
SELECT is((SELECT progress_percentage::int || '/' || lessons_completed || '/' || status FROM public.course_enrollments WHERE user_id = pg_temp.uid('c2_direct') AND course_id = '78000000-0000-4000-8000-000000000c01'), '33/2/active', '8: progress and lessons are preserved by the promotion; status re-activated');
SELECT throws_ok($$SELECT public.admin_grant_course_access(gen_random_uuid(), ARRAY[pg_temp.uid('c2_direct')])$$, NULL, 'Course not found', '8: an unknown course is refused');
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_direct'), gen_random_uuid()])$$, NULL, '1 recipient(s) do not exist', '8: an unknown recipient is refused (count only, no identifier) and nothing is written');
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE course_id = '78000000-0000-4000-8000-000000000c04'), 2, '8: the refused call wrote nothing (atomic)');
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', '{}'::uuid[])$$, NULL, 'At least one recipient is required', '8: an empty recipient list is refused');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT is(pg_temp.k4_visible(), 'true/1/1', '8: the granted learner now reads K4 and its lesson');
SELECT ok(public.auth_is_course_student('78000000-0000-4000-8000-000000000c01'), '8: K1 access is durable again (independent) although its paths are gone');
RESET ROLE;
-- batch_assign_courses (admin OR consultor): declares provenance, keeps grant provenance on conflict
SELECT tests.authenticate_as('c2_consultor');
SELECT is((public.batch_assign_courses('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_outsider')]) ->> 'enrollments_created')::int, 1, '8: a consultor assigns K4 to the outsider through batch_assign_courses');
SELECT is(pg_temp.origin('c2_outsider', '78000000-0000-4000-8000-000000000c04'), 'independent:-', '8: the row it created declares independent provenance');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);  -- postgres, no claims, no role = trusted backend for the fixture rewrite
DELETE FROM public.course_assignments WHERE course_id = '78000000-0000-4000-8000-000000000c04' AND teacher_id = pg_temp.uid('c2_outsider');
UPDATE public.course_enrollments SET status = 'dropped', access_origin = 'unknown', access_origin_set_at = NULL, enrolled_by = pg_temp.uid('c2_admin') WHERE user_id = pg_temp.uid('c2_outsider') AND course_id = '78000000-0000-4000-8000-000000000c04';
SELECT tests.authenticate_as('c2_consultor');
SELECT lives_ok($$SELECT public.batch_assign_courses('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_outsider')])$$, '8: re-assigning an existing (dropped, unknown) row as a consultor passes the guard (no provenance rewrite)');
RESET ROLE;
SELECT is((SELECT status || '/' || access_origin || '/' || (enrolled_by = pg_temp.uid('c2_admin'))::text FROM public.course_enrollments WHERE user_id = pg_temp.uid('c2_outsider') AND course_id = '78000000-0000-4000-8000-000000000c04'), 'active/unknown/true', '8: the row is re-activated; origin and enrolled_by are NOT rewritten by the consultor path (recorded semantics)');

-- ----------------------------------------------------------------------------
-- 9. C-R1-02 — the C2 definer readers / writers hold the password boundary
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET must_change_password = true WHERE id IN (pg_temp.uid('c2_admin'), pg_temp.uid('c2_direct'));
SELECT tests.authenticate_as('c2_admin');
SELECT ok(NOT public.password_change_gate_ok(), '9: the flagged admin is held by the gate');
SELECT throws_ok($$SELECT public.admin_grant_course_access('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_outsider')])$$, '42501', 'Password change required', '9: a flagged admin cannot grant a course');
SELECT throws_ok($$SELECT public.batch_assign_learning_path('78000000-0000-4000-8000-00000000000a', ARRAY[pg_temp.uid('c2_outsider')], NULL, auth.uid())$$, '42501', 'Password change required', '9: a flagged admin cannot assign a learning path (definer writer)');
SELECT throws_ok($$SELECT public.lp_enrollment_origin_report()$$, '42501', 'Password change required', '9: a flagged admin cannot read the reconciliation report');
SELECT throws_ok($$SELECT public.batch_assign_courses('78000000-0000-4000-8000-000000000c04', ARRAY[pg_temp.uid('c2_outsider')])$$, '42501', 'Password change required', '9: a flagged admin cannot assign a course through batch_assign_courses');
RESET ROLE;
SELECT tests.authenticate_as('c2_direct');
SELECT is((SELECT count(*)::int FROM public.auth_accessible_course_ids()), 0, '9: a flagged learner gets no accessible course ids from the definer reader (has 3 rows)');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET must_change_password = false WHERE id IN (pg_temp.uid('c2_admin'), pg_temp.uid('c2_direct'));
SELECT tests.authenticate_as('c2_direct');
SELECT ok((SELECT count(*) FROM public.auth_accessible_course_ids()) >= 2, '9: clearing the flag restores the accessible course ids');
RESET ROLE;
SELECT tests.authenticate_as('c2_admin');
SELECT lives_ok($$SELECT public.lp_enrollment_origin_report()$$, '9: clearing the flag restores the report');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
