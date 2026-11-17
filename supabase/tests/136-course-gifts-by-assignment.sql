-- =============================================================================
-- 136-course-gifts-by-assignment.sql — GENERA fixes F7c, item N40.
-- Proves migration 20261117165000_course_gifts_by_assignment.sql:
--   * public.auth_consultor_covers_user(uuid): true only when the caller holds
--     an active consultor role and a current (is_active, started — starts_at null
--     or not in the future — and ends_at null or in the future) consultant_assignments row whose scope covers the person — the
--     four scopes of lib/quiz-reviews/review-scope.ts (individual → student_id;
--     school / generation / community → the person has an active user_roles row
--     there); not executable by anon;
--   * public.batch_assign_courses / public.batch_unassign_courses: a caller
--     without an active admin role may give or take a course only to / from
--     people covered by their current assignments; any uncovered recipient
--     refuses the whole call (42501) and nothing is written; admins (also an
--     admin who is a consultor too) as before; docente, directivo as before;
--     anon refused by permission.
-- Synthetic fixtures (schools 13601 / 13602, uuids 13600000-…); everything
-- rolls back.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;
-- number of course_assignments rows of course K for a person, read as postgres
CREATE OR REPLACE FUNCTION pg_temp.ca(k text) RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.course_assignments
   WHERE course_id = '13600000-0000-4000-8000-000000000c01' AND teacher_id = pg_temp.uid(k) $$;
-- number of course_enrollments rows of course K for a person, read as postgres
CREATE OR REPLACE FUNCTION pg_temp.ce(k text) RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.course_enrollments
   WHERE course_id = '13600000-0000-4000-8000-000000000c01' AND user_id = pg_temp.uid(k) $$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user(k) FROM unnest(ARRAY[
  'n40_admin', 'n40_admin_cons', 'n40_cons_school', 'n40_cons_ind', 'n40_cons_gen', 'n40_cons_com',
  'n40_cons_inact', 'n40_cons_ended', 'n40_cons_none', 'n40_cons_future', 'n40_cons_recent',
  'n40_docente', 'n40_directivo',
  'n40_p_a1', 'n40_p_a2', 'n40_p_b1']) k;
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY[
  'n40_admin', 'n40_admin_cons', 'n40_cons_school', 'n40_cons_ind', 'n40_cons_gen', 'n40_cons_com',
  'n40_cons_inact', 'n40_cons_ended', 'n40_cons_none', 'n40_cons_future', 'n40_cons_recent',
  'n40_docente', 'n40_directivo',
  'n40_p_a1', 'n40_p_a2', 'n40_p_b1']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (13601, 'N40 school A (pgTAP 136)'),
  (13602, 'N40 school B (pgTAP 136)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.generations (id, school_id, name) VALUES
  ('13600000-0000-4000-8000-0000000000a1', 13601, 'N40 generation A'),
  ('13600000-0000-4000-8000-0000000000b1', 13602, 'N40 generation B');
INSERT INTO public.growth_communities (id, generation_id, school_id, name) VALUES
  ('13600000-0000-4000-8000-00000000c0a1', '13600000-0000-4000-8000-0000000000a1', 13601, 'N40 community A'),
  ('13600000-0000-4000-8000-00000000c0b1', '13600000-0000-4000-8000-0000000000b1', 13602, 'N40 community B');

-- p_a1: school A, generation A, community A; p_a2: school A only; p_b1: school B (gen B, community B)
INSERT INTO public.user_roles (user_id, role_type, school_id, generation_id, community_id, is_active) VALUES
  (pg_temp.uid('n40_admin'),       'admin',           NULL,  NULL, NULL, true),
  (pg_temp.uid('n40_admin_cons'),  'admin',           NULL,  NULL, NULL, true),
  (pg_temp.uid('n40_admin_cons'),  'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_school'), 'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_ind'),    'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_gen'),    'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_com'),    'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_inact'),  'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_ended'),  'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_none'),   'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_future'), 'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_cons_recent'), 'consultor',       13601, NULL, NULL, true),
  (pg_temp.uid('n40_docente'),     'docente',         13601, NULL, NULL, true),
  (pg_temp.uid('n40_directivo'),   'equipo_directivo', 13601, NULL, NULL, true),
  (pg_temp.uid('n40_p_a1'),        'docente',         13601, '13600000-0000-4000-8000-0000000000a1', '13600000-0000-4000-8000-00000000c0a1', true),
  (pg_temp.uid('n40_p_a2'),        'docente',         13601, NULL, NULL, true),
  (pg_temp.uid('n40_p_b1'),        'docente',         13602, '13600000-0000-4000-8000-0000000000b1', '13600000-0000-4000-8000-00000000c0b1', true);

INSERT INTO public.consultant_assignments
  (consultant_id, student_id, school_id, generation_id, community_id, is_active, starts_at, ends_at, assignment_type, assignment_data) VALUES
  (pg_temp.uid('n40_admin_cons'),  NULL, 13601, NULL, NULL, true, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('n40_cons_school'), NULL, 13601, NULL, NULL, true, now() - interval '10 days', now() + interval '30 days', 'monitoring', '{"assignment_scope":"school"}'),
  -- individual: no assignment_scope at all (absent counts as individual)
  (pg_temp.uid('n40_cons_ind'),    pg_temp.uid('n40_p_a1'), 13601, NULL, NULL, true, now() - interval '10 days', NULL, 'monitoring', '{}'),
  (pg_temp.uid('n40_cons_gen'),    NULL, 13601, '13600000-0000-4000-8000-0000000000a1', NULL, true, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"generation"}'),
  (pg_temp.uid('n40_cons_com'),    NULL, 13601, NULL, '13600000-0000-4000-8000-00000000c0a1', true, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"community"}'),
  (pg_temp.uid('n40_cons_inact'),  NULL, 13601, NULL, NULL, false, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('n40_cons_ended'),  NULL, 13601, NULL, NULL, true, now() - interval '10 days', now() - interval '1 day', 'monitoring', '{"assignment_scope":"school"}'),
  -- send-back 1: an assignment that has not started yet (year 2099), and one that started a minute ago
  (pg_temp.uid('n40_cons_future'), NULL, 13601, NULL, NULL, true, '2099-01-01 00:00:00+00', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('n40_cons_recent'), NULL, 13601, NULL, NULL, true, now() - interval '1 minute', NULL, 'monitoring', '{"assignment_scope":"school"}');

INSERT INTO public.instructors (id, full_name) VALUES ('13600000-0000-4000-8000-00000000f001', 'N40 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('13600000-0000-4000-8000-000000000c01', 'N40 course K', 'gift course', '13600000-0000-4000-8000-00000000f001');

-- -----------------------------------------------------------------------------
-- Structure and grants
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'auth_consultor_covers_user', ARRAY['uuid']::name[], 'auth_consultor_covers_user(uuid) exists');
SELECT is_definer('public', 'auth_consultor_covers_user', ARRAY['uuid']::name[], 'auth_consultor_covers_user is SECURITY DEFINER');
SELECT ok(NOT coalesce(has_function_privilege('anon', to_regprocedure('public.auth_consultor_covers_user(uuid)'), 'EXECUTE'), true), 'anon cannot execute auth_consultor_covers_user');
SELECT ok(coalesce(has_function_privilege('authenticated', to_regprocedure('public.auth_consultor_covers_user(uuid)'), 'EXECUTE'), false), 'authenticated can execute auth_consultor_covers_user');
SELECT ok(coalesce(has_function_privilege('service_role', to_regprocedure('public.auth_consultor_covers_user(uuid)'), 'EXECUTE'), false), 'service_role can execute auth_consultor_covers_user');
SELECT ok(NOT has_function_privilege('anon', 'public.batch_assign_courses(uuid, uuid[])', 'EXECUTE'), 'anon cannot execute batch_assign_courses');
SELECT ok(NOT has_function_privilege('anon', 'public.batch_unassign_courses(uuid, uuid[])', 'EXECUTE'), 'anon cannot execute batch_unassign_courses');
SELECT ok(has_function_privilege('authenticated', 'public.batch_assign_courses(uuid, uuid[])', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.batch_assign_courses(uuid, uuid[])', 'EXECUTE'), 'authenticated and service_role keep batch_assign_courses');
SELECT ok(has_function_privilege('authenticated', 'public.batch_unassign_courses(uuid, uuid[])', 'EXECUTE')
      AND has_function_privilege('service_role', 'public.batch_unassign_courses(uuid, uuid[])', 'EXECUTE'), 'authenticated and service_role keep batch_unassign_courses');

-- -----------------------------------------------------------------------------
-- The reproduction: a consultor with a current school-A assignment gives the
-- course to a person of school B.
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n40_cons_school');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_b1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'school consultor: a person of another school is refused');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_b1') || '/' || pg_temp.ce('n40_p_b1'), '0/0', 'school consultor, uncovered: nothing written');

-- -----------------------------------------------------------------------------
-- School scope: assign
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n40_cons_school');
SELECT lives_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  'school consultor: a covered person is assigned');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_a1') || '/' || pg_temp.ce('n40_p_a1'), '1/1', 'school consultor, covered: assignment and enrolment written');

SELECT tests.authenticate_as('n40_cons_school');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a2'), pg_temp.uid('n40_p_b1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'school consultor: a list mixing covered and uncovered is refused');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_a2') || '/' || pg_temp.ce('n40_p_a2') || '/' || pg_temp.ca('n40_p_b1') || '/' || pg_temp.ce('n40_p_b1'),
  '0/0/0/0', 'school consultor, mixed list: nothing written for either');

-- -----------------------------------------------------------------------------
-- School scope: unassign (p_a2 and p_b1 given the course by the backend first)
-- -----------------------------------------------------------------------------
INSERT INTO public.course_assignments (course_id, teacher_id, assigned_by) VALUES
  ('13600000-0000-4000-8000-000000000c01', pg_temp.uid('n40_p_a2'), pg_temp.uid('n40_admin')),
  ('13600000-0000-4000-8000-000000000c01', pg_temp.uid('n40_p_b1'), pg_temp.uid('n40_admin'));
SELECT tests.authenticate_as('n40_cons_school');
SELECT is((public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')]) ->> 'unassigned_count')::int, 1,
  'school consultor: the course is taken from a covered person');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_b1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'school consultor: taking it from a person of another school is refused');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a2'), pg_temp.uid('n40_p_b1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'school consultor: unassigning a mixed list is refused');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_a1') || '/' || pg_temp.ca('n40_p_a2') || '/' || pg_temp.ca('n40_p_b1'), '0/1/1',
  'school consultor unassign: covered removed; uncovered and mixed list left untouched');

-- -----------------------------------------------------------------------------
-- Individual, generation and community scopes (p_a1 covered, p_a2 not)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.scope_case(who text) RETURNS SETOF text LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM tests.authenticate_as(who);
  RETURN NEXT lives_ok(format($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[%L::uuid])$$, pg_temp.uid('n40_p_a1')),
    who || ': covered person assigned');
  RETURN NEXT throws_ok(format($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[%L::uuid])$$, pg_temp.uid('n40_p_a2')),
    '42501', 'Recipient not covered by the caller''s assignments', who || ': uncovered person refused (assign)');
  RETURN NEXT throws_ok(format($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[%L::uuid])$$, pg_temp.uid('n40_p_a2')),
    '42501', 'Recipient not covered by the caller''s assignments', who || ': uncovered person refused (unassign)');
  RETURN NEXT is((public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')]) ->> 'unassigned_count')::int, 1,
    who || ': course taken from the covered person');
  RESET ROLE;
  RETURN NEXT is(pg_temp.ca('n40_p_a2'), 1, who || ': the uncovered person''s assignment is untouched');
END;
$f$;
SELECT pg_temp.scope_case('n40_cons_ind');
SELECT pg_temp.scope_case('n40_cons_gen');
SELECT pg_temp.scope_case('n40_cons_com');

-- -----------------------------------------------------------------------------
-- Inactive, ended or missing assignment: refused
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n40_cons_inact');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'consultor whose assignment is inactive: refused');
RESET ROLE;
SELECT tests.authenticate_as('n40_cons_ended');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'consultor whose assignment has ended: refused');
RESET ROLE;
SELECT tests.authenticate_as('n40_cons_none');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'consultor with no assignment: refused (assign)');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a2')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'consultor with no assignment: refused (unassign)');
RESET ROLE;
-- send-back 1: an assignment that has not started does not count yet
SELECT tests.authenticate_as('n40_cons_future');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'consultor whose only assignment starts in the future: refused (assign)');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a2')])$$,
  '42501', 'Recipient not covered by the caller''s assignments', 'consultor whose only assignment starts in the future: refused (unassign)');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_a1') || '/' || pg_temp.ca('n40_p_a2'), '0/1',
  'consultor with a future assignment: nothing written, nothing removed');
-- an assignment that started a minute ago counts
SELECT tests.authenticate_as('n40_cons_recent');
SELECT is(public.auth_consultor_covers_user(pg_temp.uid('n40_p_a1')), true, 'helper: an assignment that started a minute ago counts');
SELECT lives_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  'consultor whose assignment started a minute ago: covered person assigned');
SELECT is((public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')]) ->> 'unassigned_count')::int, 1,
  'consultor whose assignment started a minute ago: course taken from the covered person');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_a1') || '/' || pg_temp.ca('n40_p_a2'), '0/1', 'refused consultors wrote and removed nothing');

-- -----------------------------------------------------------------------------
-- Admin, and admin who is also a consultor: as before, in both schools
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n40_admin');
SELECT is((public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1'), pg_temp.uid('n40_p_b1')]) ->> 'assignments_created')::int, 1,
  'admin: assigns people of both schools (one new, one existing)');
SELECT is((public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1'), pg_temp.uid('n40_p_b1')]) ->> 'unassigned_count')::int, 2,
  'admin: takes the course from people of both schools');
RESET ROLE;
SELECT tests.authenticate_as('n40_admin_cons');
SELECT is((public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_b1')]) ->> 'assignments_created')::int, 1,
  'admin who is also a consultor: assigns a person outside the consultor assignment (as admin)');
SELECT is((public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_b1')]) ->> 'unassigned_count')::int, 1,
  'admin who is also a consultor: takes it away again (as admin)');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- Docente, directivo, anon: refused as before (anon now by permission)
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n40_docente');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  NULL, 'User does not have permission to assign courses', 'docente: refused (assign)');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a2')])$$,
  NULL, 'User does not have permission to unassign courses', 'docente: refused (unassign)');
RESET ROLE;
SELECT tests.authenticate_as('n40_directivo');
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a1')])$$,
  NULL, 'User does not have permission to assign courses', 'directivo: refused (assign)');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY[pg_temp.uid('n40_p_a2')])$$,
  NULL, 'User does not have permission to unassign courses', 'directivo: refused (unassign)');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.batch_assign_courses('13600000-0000-4000-8000-000000000c01', ARRAY['13600000-0000-4000-8000-0000000000ff'::uuid])$$,
  '42501', NULL, 'anon: refused by permission (assign)');
SELECT throws_ok($$SELECT public.batch_unassign_courses('13600000-0000-4000-8000-000000000c01', ARRAY['13600000-0000-4000-8000-0000000000ff'::uuid])$$,
  '42501', NULL, 'anon: refused by permission (unassign)');
SELECT throws_ok($$SELECT public.auth_consultor_covers_user('13600000-0000-4000-8000-0000000000ff'::uuid)$$,
  '42501', NULL, 'anon: cannot call auth_consultor_covers_user');
RESET ROLE;
SELECT is(pg_temp.ca('n40_p_a1') || '/' || pg_temp.ca('n40_p_a2') || '/' || pg_temp.ca('n40_p_b1'), '0/1/0', 'refused callers changed nothing');

-- -----------------------------------------------------------------------------
-- The helper answers about the caller only
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n40_cons_school');
SELECT is(public.auth_consultor_covers_user(pg_temp.uid('n40_p_a1')), true, 'helper: school consultor covers a person of the school');
SELECT is(public.auth_consultor_covers_user(pg_temp.uid('n40_p_b1')), false, 'helper: school consultor does not cover a person of another school');
SELECT is(public.auth_consultor_covers_user(NULL), false, 'helper: NULL is not covered');
RESET ROLE;
SELECT tests.authenticate_as('n40_docente');
SELECT is(public.auth_consultor_covers_user(pg_temp.uid('n40_p_a1')), false, 'helper: a docente covers nobody');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
