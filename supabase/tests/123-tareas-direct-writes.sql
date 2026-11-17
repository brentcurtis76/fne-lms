-- =============================================================================
-- 123-tareas-direct-writes.sql — F4c (T-WRITES, T-READS): migration
-- 20261116176000_tareas_close_direct_writes.sql.
--
--   T-WRITES: task and group-work records are written directly by admins only
--             (every person's writes go through the application's server
--             routes, which write as the service role). The service role is
--             unaffected; a learner can still leave their own group.
--   T-READS:  lesson task answers and their shares are no longer readable by
--             every consultor / directivo / lider_generacion of every school;
--             a group's work record is readable by its own members (and the
--             admin, the row's own person and the community's consultor), not
--             by every active role of the community; signed-in people lose
--             four summary views (the service role keeps them).
--   T-WRITES-b: tasks (lesson_assignments) are inserted and changed directly
--             by admins only; their creators can still delete them.
--   T-WRITES-c: groups are deleted directly by admins only (a delete cascades
--             to the members and their saved and graded work).
--   T-READS-b: a group's work record is read by the group's members only
--             while the record's own person is still a member of it.
--
-- Personas: anon; admin; learners A and C (school 9231, community d1, course 1,
-- members of group 1 on task block 1); learner B (same school, community and
-- course, member of group 2 on task block 2 — the unique key on
-- group_assignment_groups(assignment_id, community_id) allows one community
-- group per task); a consultor of school 9231 with no community; an
-- equipo_directivo of school 9232. Synthetic/local state only. Rolls back.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(148);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

CREATE OR REPLACE FUNCTION pg_temp.affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('tar123_admin');
SELECT tests.create_supabase_user('tar123_lrn_a');
SELECT tests.create_supabase_user('tar123_lrn_b');
SELECT tests.create_supabase_user('tar123_lrn_c');
SELECT tests.create_supabase_user('tar123_consultor');
SELECT tests.create_supabase_user('tar123_directivo');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['tar123_admin','tar123_lrn_a','tar123_lrn_b','tar123_lrn_c','tar123_consultor','tar123_directivo']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9231, 'TAR123 school (pgTAP 123)'), (9232, 'TAR123 other school (pgTAP 123)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('12300000-0000-4000-8000-0000000000d1', 9231, 'TAR123 community');

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('tar123_admin'),     'admin',            NULL, NULL, true),
  (pg_temp.uid('tar123_lrn_a'),     'docente',          9231, '12300000-0000-4000-8000-0000000000d1', true),
  (pg_temp.uid('tar123_lrn_b'),     'docente',          9231, '12300000-0000-4000-8000-0000000000d1', true),
  (pg_temp.uid('tar123_lrn_c'),     'docente',          9231, '12300000-0000-4000-8000-0000000000d1', true),
  (pg_temp.uid('tar123_consultor'), 'consultor',        9231, NULL, true),
  (pg_temp.uid('tar123_directivo'), 'equipo_directivo', 9232, NULL, true);

INSERT INTO public.instructors (id, full_name) VALUES ('12300000-0000-4000-8000-00000000f001', 'TAR123 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('12300000-0000-4000-8000-000000000c01', 'TAR123 course 1', 'given to A, B and C', '12300000-0000-4000-8000-00000000f001'),
  ('12300000-0000-4000-8000-000000000c02', 'TAR123 course 2', 'given to nobody',     '12300000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('12300000-0000-4000-8000-00000000e001', '12300000-0000-4000-8000-000000000c01', 'TAR123 module 1', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('12300000-0000-4000-8000-00000000ee01', '12300000-0000-4000-8000-00000000e001', '12300000-0000-4000-8000-000000000c01', 'TAR123 lesson 1', 1);
INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload) VALUES
  ('12300000-0000-4000-8000-0000000000b1', '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 1, 'group-assignment', '{"title": "TAR123 group task 1"}'),
  ('12300000-0000-4000-8000-0000000000b2', '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 2, 'group-assignment', '{"title": "TAR123 group task 2"}');
INSERT INTO public.course_enrollments (course_id, user_id, enrollment_type, status)
SELECT '12300000-0000-4000-8000-000000000c01', pg_temp.uid(k), 'assigned', 'active'
  FROM unnest(ARRAY['tar123_lrn_a','tar123_lrn_b','tar123_lrn_c']) k;

-- Group 1 (task block 1): A and C. Group 2 (task block 2): B.
INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id) VALUES
  ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group 1', 9231),
  ('12300000-0000-4000-8000-0000000000a2', '12300000-0000-4000-8000-0000000000b2', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group 2', 9231);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role) VALUES
  ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', pg_temp.uid('tar123_lrn_a'), 'member'),
  ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', pg_temp.uid('tar123_lrn_c'), 'member'),
  ('12300000-0000-4000-8000-0000000000a2', '12300000-0000-4000-8000-0000000000b2', pg_temp.uid('tar123_lrn_b'), 'member');
INSERT INTO public.group_assignment_submissions (id, assignment_id, group_id, user_id, content, status) VALUES
  ('12300000-0000-4000-8000-0000000005a1', '12300000-0000-4000-8000-0000000000b1', '12300000-0000-4000-8000-0000000000a1', pg_temp.uid('tar123_lrn_a'), 'TAR123 group 1 draft', 'pending'),
  ('12300000-0000-4000-8000-0000000005c1', '12300000-0000-4000-8000-0000000000b1', '12300000-0000-4000-8000-0000000000a1', pg_temp.uid('tar123_lrn_c'), 'TAR123 group 1 draft', 'pending'),
  ('12300000-0000-4000-8000-0000000005b2', '12300000-0000-4000-8000-0000000000b2', '12300000-0000-4000-8000-0000000000a2', pg_temp.uid('tar123_lrn_b'), 'TAR123 group 2 draft', 'pending');
INSERT INTO public.group_assignment_settings (id, assignment_id, consultant_managed) VALUES
  ('12300000-0000-4000-8000-0000000004c1', 'tar123-settings', false);

-- One published lesson task with A's and B's answers. is_original = false keeps the
-- AFTER UPDATE trigger trigger_cascade_lesson_submission_updates (which reads columns
-- the table does not have) out of the way of the UPDATE assertions.
INSERT INTO public.lesson_assignments (id, title, created_by, course_id, lesson_id, assignment_for, is_published) VALUES
  ('12300000-0000-4000-8000-0000000001a1', 'TAR123 lesson task', pg_temp.uid('tar123_admin'),
   '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', true);
INSERT INTO public.lesson_assignment_submissions (id, assignment_id, student_id, submitted_by, content, status, submitted_at, is_original) VALUES
  ('12300000-0000-4000-8000-0000000002a1', '12300000-0000-4000-8000-0000000001a1', pg_temp.uid('tar123_lrn_a'), pg_temp.uid('tar123_lrn_a'), 'TAR123 answer A', 'submitted', now(), false),
  ('12300000-0000-4000-8000-0000000002b1', '12300000-0000-4000-8000-0000000001a1', pg_temp.uid('tar123_lrn_b'), pg_temp.uid('tar123_lrn_b'), 'TAR123 answer B', 'submitted', now(), false);
INSERT INTO public.assignment_submission_shares (id, source_submission_id, shared_with_user_id, community_id) VALUES
  ('12300000-0000-4000-8000-0000000004d1', '12300000-0000-4000-8000-0000000002a1', pg_temp.uid('tar123_lrn_c'), '12300000-0000-4000-8000-0000000000d1');
INSERT INTO public.assignment_feedback (id, assignment_id, student_id, instructor_id, feedback_text, grade) VALUES
  ('12300000-0000-4000-8000-0000000003b1', '12300000-0000-4000-8000-0000000001a1', pg_temp.uid('tar123_lrn_b'), pg_temp.uid('tar123_admin'), 'TAR123 feedback for B', 6);
INSERT INTO public.assignment_templates (id, lesson_id, block_id, title, created_by) VALUES
  ('12300000-0000-4000-8000-0000000004a1', '12300000-0000-4000-8000-00000000ee01', '12300000-0000-4000-8000-0000000000b1', 'TAR123 template', pg_temp.uid('tar123_admin'));
INSERT INTO public.assignment_instances (id, template_id, course_id, title, created_by) VALUES
  ('12300000-0000-4000-8000-0000000004b1', '12300000-0000-4000-8000-0000000004a1', '12300000-0000-4000-8000-000000000c01', 'TAR123 instance', pg_temp.uid('tar123_admin'));
INSERT INTO public.course_completions (id, user_id, course_id, completion_type) VALUES
  ('12300000-0000-4000-8000-0000000004e1', pg_temp.uid('tar123_lrn_b'), '12300000-0000-4000-8000-000000000c01', 'course');

-- Direct writes every non-admin persona tries; each must throw 42501 once the
-- migration is in. auth.uid() is the persona (NULL for anon).
CREATE TEMP TABLE w123 (n int PRIMARY KEY, label text, stmt text) ON COMMIT DROP;
INSERT INTO w123 VALUES
 (1, 'INSERT assignment_feedback for learner B naming self as instructor',
  $s$INSERT INTO public.assignment_feedback (assignment_id, student_id, instructor_id, feedback_text, grade)
     VALUES (gen_random_uuid(), pg_temp.uid('tar123_lrn_b'), auth.uid(), 'Synthetic forged feedback', 7)$s$),
 (2, 'INSERT a lesson task answer for learner B',
  $s$INSERT INTO public.lesson_assignment_submissions (assignment_id, student_id, submitted_by, content, status, attempt_number)
     VALUES ('12300000-0000-4000-8000-0000000001a1', pg_temp.uid('tar123_lrn_b'), auth.uid(), 'Synthetic forged answer', 'submitted', 100 + (random() * 1000000)::int)$s$),
 (3, 'INSERT an own lesson task answer already graded 100 by the admin',
  $s$INSERT INTO public.lesson_assignment_submissions (assignment_id, student_id, submitted_by, content, status, score, graded_by, graded_at, attempt_number)
     VALUES ('12300000-0000-4000-8000-0000000001a1', auth.uid(), auth.uid(), 'Synthetic self-graded', 'graded', 100, pg_temp.uid('tar123_admin'), now(), 100 + (random() * 1000000)::int)$s$),
 (4, 'INSERT assignment_submission_shares sharing learner B''s answer',
  $s$INSERT INTO public.assignment_submission_shares (source_submission_id, shared_with_user_id)
     VALUES ('12300000-0000-4000-8000-0000000002b1', coalesce(auth.uid(), pg_temp.uid('tar123_lrn_c')))$s$),
 (5, 'INSERT assignment_templates created by self',
  $s$INSERT INTO public.assignment_templates (lesson_id, block_id, title, created_by)
     VALUES ('12300000-0000-4000-8000-00000000ee01', gen_random_uuid(), 'Synthetic forged template', auth.uid())$s$),
 (6, 'INSERT assignment_instances created by self',
  $s$INSERT INTO public.assignment_instances (template_id, course_id, title, created_by)
     VALUES ('12300000-0000-4000-8000-0000000004a1', '12300000-0000-4000-8000-000000000c01', 'Synthetic forged instance', auth.uid())$s$),
 (7, 'INSERT an own group-work record already graded (task block 2)',
  $s$INSERT INTO public.group_assignment_submissions (assignment_id, group_id, user_id, content, status, grade, feedback)
     VALUES ('12300000-0000-4000-8000-0000000000b2', '12300000-0000-4000-8000-0000000000a1', auth.uid(), 'Synthetic', 'graded', 100, 'Synthetic self-graded')$s$),
 (8, 'INSERT course_completions for a course not given',
  $s$INSERT INTO public.course_completions (user_id, course_id, completion_type)
     VALUES (auth.uid(), '12300000-0000-4000-8000-000000000c02', 'course')$s$),
 (9, 'INSERT group_assignment_groups in the community',
  $s$INSERT INTO public.group_assignment_groups (assignment_id, community_id, name, school_id)
     VALUES ('tar123-forged-' || coalesce(auth.uid()::text, 'anon'), '12300000-0000-4000-8000-0000000000d1', 'Synthetic forged group', 9231)$s$),
 (10, 'INSERT group_assignment_settings',
  $s$INSERT INTO public.group_assignment_settings (assignment_id, consultant_managed)
     VALUES ('tar123-forged-' || coalesce(auth.uid()::text, 'anon'), true)$s$);
-- Direct updates and deletes; each must change 0 rows once the migration is in.
CREATE TEMP TABLE u123 (n int PRIMARY KEY, label text, stmt text) ON COMMIT DROP;
INSERT INTO u123 VALUES
 (1, 'UPDATE lesson task answers to graded 100',
  $s$UPDATE public.lesson_assignment_submissions SET score = 100, status = 'graded'
      WHERE id IN ('12300000-0000-4000-8000-0000000002a1', '12300000-0000-4000-8000-0000000002b1')$s$),
 (2, 'UPDATE group-work records to grade 100',
  $s$UPDATE public.group_assignment_submissions SET grade = 100
      WHERE id IN ('12300000-0000-4000-8000-0000000005a1', '12300000-0000-4000-8000-0000000005b2', '12300000-0000-4000-8000-0000000005c1')$s$),
 (3, 'UPDATE group 1''s name',
  $s$UPDATE public.group_assignment_groups SET name = 'Synthetic renamed' WHERE id = '12300000-0000-4000-8000-0000000000a1'$s$),
 (4, 'UPDATE group_assignment_settings to consultant-managed',
  $s$UPDATE public.group_assignment_settings SET consultant_managed = true WHERE id = '12300000-0000-4000-8000-0000000004c1'$s$),
 (5, 'DELETE the lesson task answers',
  $s$DELETE FROM public.lesson_assignment_submissions
      WHERE id IN ('12300000-0000-4000-8000-0000000002a1', '12300000-0000-4000-8000-0000000002b1')$s$);
-- The four summary views.
CREATE TEMP TABLE v123 (relname text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO v123 VALUES ('group_assignments_with_status'), ('quiz_statistics'), ('school_progress_report'), ('community_progress_report');
GRANT SELECT ON w123, u123, v123 TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 0. Fixture sanity (2)
-- ----------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE group_id = '12300000-0000-4000-8000-0000000000a1'), 2,
  'fixture: A and C are the members of group 1');
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE group_id = '12300000-0000-4000-8000-0000000000a2'
            AND user_id = pg_temp.uid('tar123_lrn_b')), 1,
  'fixture: B is the member of group 2');

-- ----------------------------------------------------------------------------
-- 1. T-READS — closed (17)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('tar123_consultor');
SELECT is((SELECT count(*)::int FROM public.lesson_assignment_submissions
            WHERE id IN ('12300000-0000-4000-8000-0000000002a1', '12300000-0000-4000-8000-0000000002b1')), 0,
  'T-READS: an unassigned consultor reads none of A''s and B''s lesson task answers');
SELECT is((SELECT count(*)::int FROM public.assignment_submission_shares WHERE id = '12300000-0000-4000-8000-0000000004d1'), 0,
  'T-READS: an unassigned consultor reads no answer shares');
SELECT throws_ok(format('SELECT count(*) FROM public.%I', relname), '42501', NULL,
  'T-READS: the consultor cannot read public.' || relname) FROM v123 ORDER BY relname;
RESET ROLE;

SELECT tests.authenticate_as('tar123_directivo');
SELECT is((SELECT count(*)::int FROM public.lesson_assignment_submissions
            WHERE id IN ('12300000-0000-4000-8000-0000000002a1', '12300000-0000-4000-8000-0000000002b1')), 0,
  'T-READS: another school''s directivo reads none of A''s and B''s lesson task answers');
SELECT is((SELECT count(*)::int FROM public.assignment_submission_shares WHERE id = '12300000-0000-4000-8000-0000000004d1'), 0,
  'T-READS: another school''s directivo reads no answer shares');
SELECT throws_ok(format('SELECT count(*) FROM public.%I', relname), '42501', NULL,
  'T-READS: the other school''s directivo cannot read public.' || relname) FROM v123 ORDER BY relname;
RESET ROLE;

SELECT tests.authenticate_as('tar123_lrn_a');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions WHERE id = '12300000-0000-4000-8000-0000000005b2'), 0,
  'T-READS: learner A does not read learner B''s group-work record (group 2, same community)');
SELECT throws_ok(format('SELECT count(*) FROM public.%I', relname), '42501', NULL,
  'T-READS: learner A cannot read public.' || relname) FROM v123 ORDER BY relname;
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 2. T-READS — must still work (17)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('tar123_lrn_a');
-- components/assignments/GroupSubmissionModalV2.tsx:118-124 (own record in the active group)
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions
            WHERE assignment_id = '12300000-0000-4000-8000-0000000000b1'
              AND group_id = '12300000-0000-4000-8000-0000000000a1' AND user_id = auth.uid()), 1,
  'still works: learner A reads their own group-work record (GroupSubmissionModalV2 :118-124)');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions
            WHERE assignment_id = '12300000-0000-4000-8000-0000000000b1' AND group_id = '12300000-0000-4000-8000-0000000000a1'), 2,
  'still works: learner A reads both records of group 1 (own and C''s)');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions
            WHERE id = '12300000-0000-4000-8000-0000000005c1'), 1,
  'still works: learner A reads C''s record (same group)');
-- components/assignments/GroupSubmissionModalV2.tsx:151-155 (the group row)
SELECT is((SELECT count(*)::int FROM public.group_assignment_groups WHERE id = '12300000-0000-4000-8000-0000000000a1'), 1,
  'still works: learner A reads group 1 (GroupSubmissionModalV2 :151-155)');
-- lib/services/groupAssignmentsV2.js:214 (own records across task blocks)
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions
            WHERE user_id = auth.uid()
              AND assignment_id IN ('12300000-0000-4000-8000-0000000000b1', '12300000-0000-4000-8000-0000000000b2')), 1,
  'still works: learner A reads their own records (groupAssignmentsV2.js:214)');
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE group_id = '12300000-0000-4000-8000-0000000000a1'), 2,
  'still works: learner A reads the members of group 1');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE lesson_id = '12300000-0000-4000-8000-00000000ee01'), 2,
  'still works: learner A reads the task blocks of the lesson');
SELECT is((SELECT count(*)::int FROM public.lesson_assignment_submissions WHERE student_id = auth.uid()), 1,
  'still works: learner A reads their own lesson task answer');
RESET ROLE;

SELECT tests.authenticate_as('tar123_lrn_b');
SELECT is((SELECT count(*)::int FROM public.assignment_feedback WHERE student_id = auth.uid()), 1,
  'still works: learner B reads their own feedback');
SELECT is((SELECT count(*)::int FROM public.lesson_assignment_submissions WHERE student_id = auth.uid()), 1,
  'still works: learner B reads their own lesson task answer');
RESET ROLE;

SELECT tests.authenticate_as('tar123_admin');
SELECT is((SELECT count(*)::int FROM public.lesson_assignment_submissions
            WHERE id IN ('12300000-0000-4000-8000-0000000002a1', '12300000-0000-4000-8000-0000000002b1')), 2,
  'still works: the admin reads every lesson task answer');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions
            WHERE id IN ('12300000-0000-4000-8000-0000000005a1', '12300000-0000-4000-8000-0000000005b2', '12300000-0000-4000-8000-0000000005c1')), 3,
  'still works: the admin reads every group-work record');
SELECT is((SELECT count(*)::int FROM public.assignment_submission_shares WHERE id = '12300000-0000-4000-8000-0000000004d1'), 1,
  'still works: the admin reads answer shares');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT lives_ok(format('SELECT count(*) FROM public.%I', relname),
  'still works: the service role reads public.' || relname) FROM v123 ORDER BY relname;
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 3. T-WRITES — learner A (15)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('tar123_lrn_a');
SELECT throws_ok(stmt, '42501', NULL, 'T-WRITES: learner A cannot ' || label) FROM w123 ORDER BY n;
SELECT is(pg_temp.affected(stmt), 0, 'T-WRITES: learner A cannot ' || label) FROM u123 ORDER BY n;
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 4. T-WRITES — learner B moves group (2)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('tar123_lrn_b');
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_members
                              WHERE group_id = '12300000-0000-4000-8000-0000000000a2' AND user_id = auth.uid()$q$), 1,
  'still works: learner B leaves their own group 2');
SELECT throws_ok($q$INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role)
                    VALUES ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', auth.uid(), 'member')$q$,
  '42501', NULL, 'T-WRITES: learner B cannot join group 1 directly');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 5. T-WRITES — consultor, other school's directivo, anon (45)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('tar123_consultor');
-- Write 6 (assignment_instances) is already refused today for this persona by the BEFORE INSERT
-- trigger validate_assignment_instance_course (it cannot read the course's lesson/module: P0001).
SELECT throws_ok(stmt, CASE WHEN n = 6 THEN 'P0001' ELSE '42501' END, NULL, 'T-WRITES: the consultor cannot ' || label) FROM w123 ORDER BY n;
SELECT throws_ok($q$INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role)
                    VALUES ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', auth.uid(), 'member')$q$,
  '42501', NULL, 'T-WRITES: the consultor cannot join group 1 directly');
SELECT is(pg_temp.affected(stmt), 0, 'T-WRITES: the consultor cannot ' || label) FROM u123 ORDER BY n;
RESET ROLE;

SELECT tests.authenticate_as('tar123_directivo');
-- Write 6 (assignment_instances) is already refused today for this persona by the BEFORE INSERT
-- trigger validate_assignment_instance_course (it cannot read the course's lesson/module: P0001).
SELECT throws_ok(stmt, CASE WHEN n = 6 THEN 'P0001' ELSE '42501' END, NULL, 'T-WRITES: the other school''s directivo cannot ' || label) FROM w123 ORDER BY n;
SELECT throws_ok($q$INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role)
                    VALUES ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', auth.uid(), 'member')$q$,
  '42501', NULL, 'T-WRITES: the other school''s directivo cannot join group 1 directly');
SELECT is(pg_temp.affected(stmt), 0, 'T-WRITES: the other school''s directivo cannot ' || label) FROM u123 ORDER BY n;
RESET ROLE;
SELECT tests.clear_authentication();

SELECT pg_temp.set_anon();
SELECT throws_ok(stmt, '42501', NULL, 'T-WRITES: anon cannot ' || label) FROM w123 ORDER BY n;
SELECT throws_ok($q$INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role)
                    VALUES ('12300000-0000-4000-8000-0000000000a1', '12300000-0000-4000-8000-0000000000b1', pg_temp.uid('tar123_lrn_b'), 'member')$q$,
  '42501', NULL, 'T-WRITES: anon cannot add a member to group 1');
RESET ROLE;

-- Nothing the refused personas tried is in the tables (read as the superuser).
SELECT is((SELECT count(*)::int FROM public.lesson_assignment_submissions WHERE assignment_id = '12300000-0000-4000-8000-0000000001a1'), 2,
  'T-WRITES: still only A''s and B''s lesson task answers');
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE user_id = pg_temp.uid('tar123_lrn_b')), 0,
  'T-WRITES: learner B is in no group after leaving');

-- ----------------------------------------------------------------------------
-- 6. Must still work — the admin writes directly (21)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('tar123_admin');
SELECT lives_ok($q$INSERT INTO public.assignment_feedback (id, assignment_id, student_id, instructor_id, feedback_text, grade)
                   VALUES ('12300000-0000-4000-8000-0000000003c1', '12300000-0000-4000-8000-0000000001aa', pg_temp.uid('tar123_lrn_c'), auth.uid(), 'Synthetic admin feedback', 5)$q$,
  'still works: the admin inserts assignment_feedback');
SELECT is(pg_temp.affected($q$UPDATE public.assignment_feedback SET grade = 7 WHERE id = '12300000-0000-4000-8000-0000000003b1'$q$), 1,
  'still works: the admin updates assignment_feedback');
SELECT is(pg_temp.affected($q$DELETE FROM public.assignment_feedback WHERE id = '12300000-0000-4000-8000-0000000003c1'$q$), 1,
  'still works: the admin deletes assignment_feedback');
SELECT lives_ok($q$INSERT INTO public.assignment_templates (id, lesson_id, block_id, title, created_by)
                   VALUES ('12300000-0000-4000-8000-0000000004a2', '12300000-0000-4000-8000-00000000ee01', '12300000-0000-4000-8000-0000000000b2', 'Synthetic admin template', auth.uid())$q$,
  'still works: the admin inserts assignment_templates');
SELECT is(pg_temp.affected($q$UPDATE public.assignment_templates SET title = 'Synthetic renamed template' WHERE id = '12300000-0000-4000-8000-0000000004a1'$q$), 1,
  'still works: the admin updates assignment_templates');
SELECT lives_ok($q$INSERT INTO public.assignment_instances (id, template_id, course_id, title, created_by)
                   VALUES ('12300000-0000-4000-8000-0000000004b2', '12300000-0000-4000-8000-0000000004a2', '12300000-0000-4000-8000-000000000c01', 'Synthetic admin instance', auth.uid())$q$,
  'still works: the admin inserts assignment_instances');
SELECT is(pg_temp.affected($q$UPDATE public.assignment_instances SET title = 'Synthetic renamed instance' WHERE id = '12300000-0000-4000-8000-0000000004b1'$q$), 1,
  'still works: the admin updates assignment_instances');
SELECT is(pg_temp.affected($q$DELETE FROM public.assignment_instances WHERE id = '12300000-0000-4000-8000-0000000004b2'$q$), 1,
  'still works: the admin deletes assignment_instances');
SELECT is(pg_temp.affected($q$DELETE FROM public.assignment_templates WHERE id = '12300000-0000-4000-8000-0000000004a2'$q$), 1,
  'still works: the admin deletes assignment_templates');
SELECT lives_ok($q$INSERT INTO public.lesson_assignment_submissions (id, assignment_id, student_id, submitted_by, content, status, is_original)
                   VALUES ('12300000-0000-4000-8000-0000000002c1', '12300000-0000-4000-8000-0000000001a1', pg_temp.uid('tar123_lrn_c'), auth.uid(), 'Synthetic admin answer', 'draft', false)$q$,
  'still works: the admin inserts lesson_assignment_submissions');
SELECT is(pg_temp.affected($q$UPDATE public.lesson_assignment_submissions SET feedback = 'Synthetic admin note' WHERE id = '12300000-0000-4000-8000-0000000002a1'$q$), 1,
  'still works: the admin updates lesson_assignment_submissions');
SELECT is(pg_temp.affected($q$DELETE FROM public.lesson_assignment_submissions WHERE id = '12300000-0000-4000-8000-0000000002c1'$q$), 1,
  'still works: the admin deletes lesson_assignment_submissions');
SELECT lives_ok($q$INSERT INTO public.assignment_submission_shares (source_submission_id, shared_with_user_id)
                   VALUES ('12300000-0000-4000-8000-0000000002a1', pg_temp.uid('tar123_lrn_b'))$q$,
  'still works: the admin inserts assignment_submission_shares');
SELECT lives_ok($q$INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id)
                   VALUES ('12300000-0000-4000-8000-0000000000a3', 'tar123-admin-group', '12300000-0000-4000-8000-0000000000d1', 'Synthetic admin group', 9231)$q$,
  'still works: the admin inserts group_assignment_groups');
SELECT is(pg_temp.affected($q$UPDATE public.group_assignment_groups SET name = 'Synthetic admin rename' WHERE id = '12300000-0000-4000-8000-0000000000a1'$q$), 1,
  'still works: the admin updates group_assignment_groups');
SELECT lives_ok($q$INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role)
                   VALUES ('12300000-0000-4000-8000-0000000000a3', 'tar123-admin-group', pg_temp.uid('tar123_lrn_c'), 'member')$q$,
  'still works: the admin inserts group_assignment_members (another person)');
SELECT lives_ok($q$INSERT INTO public.group_assignment_submissions (id, assignment_id, group_id, user_id, content, status)
                   VALUES ('12300000-0000-4000-8000-0000000005c3', 'tar123-admin-group', '12300000-0000-4000-8000-0000000000a3', pg_temp.uid('tar123_lrn_c'), 'Synthetic', 'pending')$q$,
  'still works: the admin inserts group_assignment_submissions');
SELECT is(pg_temp.affected($q$UPDATE public.group_assignment_submissions SET feedback = 'Synthetic admin feedback', grade = 6 WHERE id = '12300000-0000-4000-8000-0000000005a1'$q$), 1,
  'still works: the admin updates group_assignment_submissions');
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_submissions WHERE id = '12300000-0000-4000-8000-0000000005c3'$q$), 1,
  'still works: the admin deletes group_assignment_submissions');
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_members WHERE group_id = '12300000-0000-4000-8000-0000000000a3'$q$)
          + pg_temp.affected($q$DELETE FROM public.group_assignment_groups WHERE id = '12300000-0000-4000-8000-0000000000a3'$q$), 2,
  'still works: the admin deletes group_assignment_members and group_assignment_groups');
SELECT lives_ok($q$INSERT INTO public.course_completions (user_id, course_id, completion_type)
                   VALUES (auth.uid(), '12300000-0000-4000-8000-000000000c01', 'course')$q$,
  'still works: the admin inserts their own course_completions row');
RESET ROLE;
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 7. Must still work — the service role (2)
-- ----------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(public.save_group_submission('12300000-0000-4000-8000-0000000000b1', '12300000-0000-4000-8000-0000000000a1',
            pg_temp.uid('tar123_lrn_a'), 'Synthetic group answer', NULL, '2026-11-16 12:00:00+00',
            jsonb_build_object(pg_temp.uid('tar123_lrn_a')::text, NULL, pg_temp.uid('tar123_lrn_c')::text, NULL)) ->> 'outcome',
  'saved', 'still works: the service role saves group 1''s work through save_group_submission');
SELECT lives_ok($q$INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role)
                   VALUES ('12300000-0000-4000-8000-0000000000a2', '12300000-0000-4000-8000-0000000000b2', pg_temp.uid('tar123_lrn_b'), 'member')$q$,
  'still works: the service role inserts group_assignment_members');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 8. T-WRITES-b — lesson_assignments: created and changed by admins only;
--    creators keep deleting their own (pages/assignments.tsx:125) (17)
-- ----------------------------------------------------------------------------
-- One task row per non-admin creator, inserted as the superuser.
INSERT INTO public.lesson_assignments (id, title, created_by, course_id, lesson_id, assignment_for, is_published) VALUES
  ('12300000-0000-4000-8000-0000000001b1', 'TAR123 task by A',         pg_temp.uid('tar123_lrn_a'),     '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', false),
  ('12300000-0000-4000-8000-0000000001b2', 'TAR123 task by consultor', pg_temp.uid('tar123_consultor'), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', false),
  ('12300000-0000-4000-8000-0000000001b3', 'TAR123 task by directivo', pg_temp.uid('tar123_directivo'), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', false);

SELECT tests.authenticate_as('tar123_lrn_a');
SELECT is((SELECT count(*)::int FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001a1'), 1,
  'still works: learner A reads the published task of their course');
SELECT throws_ok($q$INSERT INTO public.lesson_assignments (title, created_by, course_id, lesson_id, assignment_for, is_published)
                    VALUES ('Synthetic forged task', auth.uid(), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', true)$q$,
  '42501', NULL, 'T-WRITES-b: learner A cannot publish a task in the course directly');
SELECT is(pg_temp.affected($q$UPDATE public.lesson_assignments SET title = 'Synthetic renamed task' WHERE id = '12300000-0000-4000-8000-0000000001b1'$q$), 0,
  'T-WRITES-b: learner A cannot change the title of a task they created');
RESET ROLE;
SELECT is((SELECT title::text FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001b1'), 'TAR123 task by A',
  'T-WRITES-b: the title of A''s task is unchanged');

SELECT tests.authenticate_as('tar123_consultor');
SELECT throws_ok($q$INSERT INTO public.lesson_assignments (title, created_by, course_id, lesson_id, assignment_for, is_published)
                    VALUES ('Synthetic forged task', auth.uid(), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', true)$q$,
  '42501', NULL, 'T-WRITES-b: the consultor cannot insert a task directly');
SELECT is(pg_temp.affected($q$UPDATE public.lesson_assignments SET title = 'Synthetic renamed task' WHERE id = '12300000-0000-4000-8000-0000000001b2'$q$), 0,
  'T-WRITES-b: the consultor cannot change the title of a task they created');
RESET ROLE;
SELECT is((SELECT title::text FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001b2'), 'TAR123 task by consultor',
  'T-WRITES-b: the title of the consultor''s task is unchanged');
SELECT tests.authenticate_as('tar123_consultor');
-- lib/services/assignments.js:200-206 as called by pages/assignments.tsx:125
SELECT is(pg_temp.affected($q$DELETE FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001b2'$q$), 1,
  'still works: the consultor deletes a task they created (the tasks page''s own action)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001b2'), 0,
  'still works: the consultor''s deleted task is gone');

SELECT tests.authenticate_as('tar123_directivo');
SELECT throws_ok($q$INSERT INTO public.lesson_assignments (title, created_by, course_id, lesson_id, assignment_for, is_published)
                    VALUES ('Synthetic forged task', auth.uid(), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', true)$q$,
  '42501', NULL, 'T-WRITES-b: the other school''s directivo cannot insert a task directly');
SELECT is(pg_temp.affected($q$UPDATE public.lesson_assignments SET title = 'Synthetic renamed task' WHERE id = '12300000-0000-4000-8000-0000000001b3'$q$), 0,
  'T-WRITES-b: the other school''s directivo cannot change the title of a task they created');
RESET ROLE;
SELECT is((SELECT title::text FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001b3'), 'TAR123 task by directivo',
  'T-WRITES-b: the title of the directivo''s task is unchanged');
SELECT tests.clear_authentication();

SELECT pg_temp.set_anon();
SELECT throws_ok($q$INSERT INTO public.lesson_assignments (title, created_by, course_id, lesson_id, assignment_for, is_published)
                    VALUES ('Synthetic forged task', pg_temp.uid('tar123_lrn_a'), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', true)$q$,
  '42501', NULL, 'T-WRITES-b: anon cannot insert a task');
SELECT is(pg_temp.affected($q$UPDATE public.lesson_assignments SET title = 'Synthetic renamed task'
                              WHERE id IN ('12300000-0000-4000-8000-0000000001a1', '12300000-0000-4000-8000-0000000001b1')$q$), 0,
  'T-WRITES-b: anon cannot change a task');
RESET ROLE;

SELECT tests.authenticate_as('tar123_admin');
SELECT lives_ok($q$INSERT INTO public.lesson_assignments (id, title, created_by, course_id, lesson_id, assignment_for, is_published)
                   VALUES ('12300000-0000-4000-8000-0000000001b4', 'Synthetic admin task', auth.uid(), '12300000-0000-4000-8000-000000000c01', '12300000-0000-4000-8000-00000000ee01', 'individual', true)$q$,
  'still works: the admin inserts a task');
SELECT is(pg_temp.affected($q$UPDATE public.lesson_assignments SET title = 'Synthetic admin rename' WHERE id = '12300000-0000-4000-8000-0000000001b4'$q$), 1,
  'still works: the admin updates a task');
SELECT is(pg_temp.affected($q$DELETE FROM public.lesson_assignments WHERE id = '12300000-0000-4000-8000-0000000001b4'$q$), 1,
  'still works: the admin deletes a task');
RESET ROLE;
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 9. T-WRITES-c — a group is deleted directly by admins only; its members and
--    their saved and graded work no longer go with a non-admin's delete (7)
-- ----------------------------------------------------------------------------
-- Four more groups of the community, none with a discussion, each with one
-- member and one saved, graded work record (inserted as the superuser):
--   a5: A is its member; a6: C is its member (A is not);
--   a7: deleted by the admin; a8: deleted by the service role.
INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id) VALUES
  ('12300000-0000-4000-8000-0000000000a5', 'tar123-del-a5', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group a5', 9231),
  ('12300000-0000-4000-8000-0000000000a6', 'tar123-del-a6', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group a6', 9231),
  ('12300000-0000-4000-8000-0000000000a7', 'tar123-del-a7', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group a7', 9231),
  ('12300000-0000-4000-8000-0000000000a8', 'tar123-del-a8', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group a8', 9231);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role) VALUES
  ('12300000-0000-4000-8000-0000000000a5', 'tar123-del-a5', pg_temp.uid('tar123_lrn_a'), 'member'),
  ('12300000-0000-4000-8000-0000000000a6', 'tar123-del-a6', pg_temp.uid('tar123_lrn_c'), 'member'),
  ('12300000-0000-4000-8000-0000000000a7', 'tar123-del-a7', pg_temp.uid('tar123_lrn_c'), 'member'),
  ('12300000-0000-4000-8000-0000000000a8', 'tar123-del-a8', pg_temp.uid('tar123_lrn_c'), 'member');
INSERT INTO public.group_assignment_submissions (id, assignment_id, group_id, user_id, content, status, grade, feedback) VALUES
  ('12300000-0000-4000-8000-0000000005a5', 'tar123-del-a5', '12300000-0000-4000-8000-0000000000a5', pg_temp.uid('tar123_lrn_a'), 'TAR123 a5 work', 'graded', 6, 'TAR123 a5 feedback'),
  ('12300000-0000-4000-8000-0000000005a6', 'tar123-del-a6', '12300000-0000-4000-8000-0000000000a6', pg_temp.uid('tar123_lrn_c'), 'TAR123 a6 work', 'graded', 6, 'TAR123 a6 feedback'),
  ('12300000-0000-4000-8000-0000000005a7', 'tar123-del-a7', '12300000-0000-4000-8000-0000000000a7', pg_temp.uid('tar123_lrn_c'), 'TAR123 a7 work', 'graded', 6, 'TAR123 a7 feedback'),
  ('12300000-0000-4000-8000-0000000005a8', 'tar123-del-a8', '12300000-0000-4000-8000-0000000000a8', pg_temp.uid('tar123_lrn_c'), 'TAR123 a8 work', 'graded', 6, 'TAR123 a8 feedback');

SELECT tests.authenticate_as('tar123_lrn_a');
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_groups WHERE id = '12300000-0000-4000-8000-0000000000a5'$q$), 0,
  'T-WRITES-c: learner A cannot delete a group they are a member of (no discussion)');
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_groups WHERE id = '12300000-0000-4000-8000-0000000000a6'$q$), 0,
  'T-WRITES-c: learner A cannot delete another group of their community (no discussion)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.group_assignment_groups
            WHERE id IN ('12300000-0000-4000-8000-0000000000a5', '12300000-0000-4000-8000-0000000000a6')), 2,
  'T-WRITES-c: groups a5 and a6 are still there');
SELECT is((SELECT count(*)::int FROM public.group_assignment_members
            WHERE group_id IN ('12300000-0000-4000-8000-0000000000a5', '12300000-0000-4000-8000-0000000000a6')), 2,
  'T-WRITES-c: the members of a5 and a6 are still there');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions
            WHERE id IN ('12300000-0000-4000-8000-0000000005a5', '12300000-0000-4000-8000-0000000005a6')
              AND status = 'graded' AND grade = 6), 2,
  'T-WRITES-c: the saved, graded work of a5 and a6 is still there');

SELECT tests.authenticate_as('tar123_admin');
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_groups WHERE id = '12300000-0000-4000-8000-0000000000a7'$q$), 1,
  'still works: the admin deletes a group without a discussion');
RESET ROLE;
SELECT tests.clear_authentication();

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.affected($q$DELETE FROM public.group_assignment_groups WHERE id = '12300000-0000-4000-8000-0000000000a8'$q$), 1,
  'still works: the service role deletes a group');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 10. T-READS-b — a group's work is read by its current members only; a
--     person who leaves keeps reading their own record (3)
-- ----------------------------------------------------------------------------
-- C leaves group 1 (C's work record stays).
DELETE FROM public.group_assignment_members
 WHERE group_id = '12300000-0000-4000-8000-0000000000a1' AND user_id = pg_temp.uid('tar123_lrn_c');
-- Group a9: B was its only member and left (B's record stays); learner A is
-- then added as its member, as add-classmates does for an emptied group.
INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id) VALUES
  ('12300000-0000-4000-8000-0000000000a9', 'tar123-empty-a9', '12300000-0000-4000-8000-0000000000d1', 'TAR123 group a9', 9231);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role) VALUES
  ('12300000-0000-4000-8000-0000000000a9', 'tar123-empty-a9', pg_temp.uid('tar123_lrn_b'), 'member');
INSERT INTO public.group_assignment_submissions (id, assignment_id, group_id, user_id, content, status, grade, feedback) VALUES
  ('12300000-0000-4000-8000-0000000005a9', 'tar123-empty-a9', '12300000-0000-4000-8000-0000000000a9', pg_temp.uid('tar123_lrn_b'), 'TAR123 a9 work by B', 'graded', 5, 'TAR123 a9 feedback for B');
DELETE FROM public.group_assignment_members
 WHERE group_id = '12300000-0000-4000-8000-0000000000a9' AND user_id = pg_temp.uid('tar123_lrn_b');
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id, role) VALUES
  ('12300000-0000-4000-8000-0000000000a9', 'tar123-empty-a9', pg_temp.uid('tar123_lrn_a'), 'member');

SELECT tests.authenticate_as('tar123_lrn_a');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions WHERE id = '12300000-0000-4000-8000-0000000005c1'), 0,
  'T-READS-b: learner A (still in group 1) does not read the record of C, who left group 1');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions WHERE id = '12300000-0000-4000-8000-0000000005a9'), 0,
  'T-READS-b: learner A, added to an emptied group, does not read the work of B, who left it');
RESET ROLE;
SELECT tests.authenticate_as('tar123_lrn_c');
SELECT is((SELECT count(*)::int FROM public.group_assignment_submissions WHERE id = '12300000-0000-4000-8000-0000000005c1'), 1,
  'still works: C reads their own group 1 record after leaving the group');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
