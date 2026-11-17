-- =============================================================================
-- 124-progress-integrity.sql — F4b (CUR-S4a, CUR-S4b, CUR-S4c, CUR-S4d, N56):
-- migration 20261116177000_progress_integrity.sql.
--
--   CUR-S4a: the enrolment's progress is written by the trigger function
--            update_course_enrollment_progress() with its owner's rights
--            (SECURITY DEFINER); the numbers it writes are the same as before.
--   CUR-S4b: a learner's own direct UPDATE of course_enrollments changes 0 rows
--            (restrictive rule, admin only); the trigger still writes.
--   CUR-S4c: a learner's progress mark must name a real block of the lesson
--            named, of a course the learner has; a quiz block counts only once
--            the learner has a quiz_submissions row for it.
--   CUR-S4d: a quiz block with no questions is marked without a submission
--            (the lesson page's "Continuar" button).
--   N56:     lesson_completion_summary rows are read by their owner and the
--            admin only, and written directly by the admin only.
--
-- Personas: anon; admin; learners A and C (given course 1 through
-- batch_assign_courses: assignment + enrolment); an outsider (signed in, given
-- nothing); learner S (given the simple course: one lesson, no module).
-- Synthetic/local state only. Rolls back.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(75);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
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

-- Runs a statement with the caller's rights and always undoes it. A refused
-- statement answers its SQLSTATE; an accepted one answers 'accepted'. So the
-- broken-first probes leave no trace whichever way they go, and the progress
-- numbers asserted later are the same with and without the migration.
CREATE OR REPLACE FUNCTION pg_temp.probe(stmt text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'accepted';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN RETURN 'accepted';
    WHEN OTHERS THEN RETURN SQLSTATE;
  END;
END;
$$;

-- Like probe, but an accepted statement answers the number of rows it changed
-- (as text); always undone.
CREATE OR REPLACE FUNCTION pg_temp.probe_rows(stmt text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = n::text;
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN RETURN SQLERRM;
    WHEN OTHERS THEN RETURN SQLSTATE;
  END;
END;
$$;

-- "lessons_completed/progress/is_completed/completed_at set" of an enrolment (as postgres).
CREATE OR REPLACE FUNCTION pg_temp.enr(k text, p_course uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT lessons_completed || '/' || progress_percentage::numeric(6,2) || '/' || is_completed
         || '/' || (completed_at IS NOT NULL)
    FROM public.course_enrollments WHERE user_id = pg_temp.uid(k) AND course_id = p_course $$;

-- Progress marks of a persona (as postgres).
CREATE OR REPLACE FUNCTION pg_temp.marks_of(k text) RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.lesson_progress WHERE user_id = pg_temp.uid(k) $$;

-- The lesson page's write (pages/student/lesson/[lessonId].tsx:487-499), as SQL.
CREATE OR REPLACE FUNCTION pg_temp.page_upsert(p_lesson text, p_block text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT format(
  $f$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at, time_spent, completion_data)
     VALUES (auth.uid(), %L, %L, now(), 12, '{"synthetic": true}')
     ON CONFLICT (user_id, lesson_id, block_id) DO UPDATE
       SET completed_at = EXCLUDED.completed_at, time_spent = EXCLUDED.time_spent,
           completion_data = EXCLUDED.completion_data$f$, p_lesson, p_block) $$;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('p124_admin');
SELECT tests.create_supabase_user('p124_lrn_a');
SELECT tests.create_supabase_user('p124_lrn_c');
SELECT tests.create_supabase_user('p124_lrn_s');
SELECT tests.create_supabase_user('p124_outsider');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['p124_admin','p124_lrn_a','p124_lrn_c','p124_lrn_s','p124_outsider']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9124, 'P124 school (pgTAP 124)') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('p124_admin'),    'admin',   NULL, true),
  (pg_temp.uid('p124_lrn_a'),    'docente', 9124, true),
  (pg_temp.uid('p124_lrn_c'),    'docente', 9124, true),
  (pg_temp.uid('p124_lrn_s'),    'docente', 9124, true),
  (pg_temp.uid('p124_outsider'), 'docente', 9124, true);

INSERT INTO public.instructors (id, full_name) VALUES ('12400000-0000-4000-8000-00000000f001', 'P124 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('12400000-0000-4000-8000-000000000c01', 'P124 course 1', 'given to A and C', '12400000-0000-4000-8000-00000000f001'),
  ('12400000-0000-4000-8000-000000000c02', 'P124 course 2', 'given to nobody',  '12400000-0000-4000-8000-00000000f001'),
  ('12400000-0000-4000-8000-000000000c03', 'P124 simple course', 'no module; given to S', '12400000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('12400000-0000-4000-8000-00000000e001', '12400000-0000-4000-8000-000000000c01', 'P124 module 1', 1),
  ('12400000-0000-4000-8000-00000000e002', '12400000-0000-4000-8000-000000000c02', 'P124 module 2', 1);
-- Every lesson carries course_id, as the course builder sets it.
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-00000000e001', '12400000-0000-4000-8000-000000000c01', 'P124 lesson 1', 1),
  ('12400000-0000-4000-8000-00000000ee02', '12400000-0000-4000-8000-00000000e001', '12400000-0000-4000-8000-000000000c01', 'P124 lesson 2', 2),
  ('12400000-0000-4000-8000-00000000ee03', '12400000-0000-4000-8000-00000000e002', '12400000-0000-4000-8000-000000000c02', 'P124 course 2 lesson', 1),
  ('12400000-0000-4000-8000-00000000ee04', NULL,                                   '12400000-0000-4000-8000-000000000c03', 'P124 simple lesson', 1);
INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload) VALUES
  ('12400000-0000-4000-8000-0000000000b1', '12400000-0000-4000-8000-000000000c01', '12400000-0000-4000-8000-00000000ee01', 1, 'text', '{"content": "synthetic text 1"}'),
  ('12400000-0000-4000-8000-0000000000b2', '12400000-0000-4000-8000-000000000c01', '12400000-0000-4000-8000-00000000ee01', 2, 'quiz',
   '{"title": "Synthetic quiz 124", "totalPoints": 1, "allowRetries": false, "showResults": true, "randomizeQuestions": false, "randomizeAnswers": false,
     "questions": [{"id": "q1", "question": "Synthetic true-false", "type": "true-false", "points": 1,
                    "options": [{"id": "t", "text": "Verdadero", "isCorrect": true}, {"id": "f", "text": "Falso", "isCorrect": false}]}]}'),
  ('12400000-0000-4000-8000-0000000000b3', '12400000-0000-4000-8000-000000000c01', '12400000-0000-4000-8000-00000000ee02', 1, 'text', '{"content": "synthetic text 2"}'),
  ('12400000-0000-4000-8000-0000000000b4', '12400000-0000-4000-8000-000000000c02', '12400000-0000-4000-8000-00000000ee03', 1, 'text', '{"content": "course 2"}'),
  ('12400000-0000-4000-8000-0000000000b5', '12400000-0000-4000-8000-000000000c03', '12400000-0000-4000-8000-00000000ee04', 1, 'text', '{"content": "simple"}');

-- A, C and S are given their courses the way the app does it (assignment + enrolment).
SELECT tests.authenticate_as('p124_admin');
SELECT public.batch_assign_courses('12400000-0000-4000-8000-000000000c01',
         ARRAY[pg_temp.uid('p124_lrn_a'), pg_temp.uid('p124_lrn_c')]);
SELECT public.batch_assign_courses('12400000-0000-4000-8000-000000000c03', ARRAY[pg_temp.uid('p124_lrn_s')]);
RESET ROLE;
SELECT tests.clear_authentication();

-- Learner A sent lesson 1's quiz, and already holds a mark on lesson 1's text.
INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, total_possible_points,
                                     auto_gradable_points, manual_gradable_points, answers) VALUES
  ('12400000-0000-4000-8000-0000000000aa', '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2',
   pg_temp.uid('p124_lrn_a'), '12400000-0000-4000-8000-000000000c01', 1, 1, 0, '{}');
INSERT INTO public.lesson_progress (id, user_id, lesson_id, block_id, completed_at) VALUES
  ('12400000-0000-4000-8000-0000000000a1', pg_temp.uid('p124_lrn_a'), '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b1', now());

-- ----------------------------------------------------------------------------
-- 0. Fixture sanity (4)
-- ----------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE course_id = '12400000-0000-4000-8000-000000000c01'
            AND user_id IN (pg_temp.uid('p124_lrn_a'), pg_temp.uid('p124_lrn_c'))), 2,
  'fixture: A and C each hold an enrolment in course 1');
SELECT is(pg_temp.enr('p124_lrn_c', '12400000-0000-4000-8000-000000000c01'), '0/0.00/false/false',
  'fixture: C starts course 1 at 0 lessons / 0% / not completed');
SELECT is(pg_temp.enr('p124_lrn_s', '12400000-0000-4000-8000-000000000c03'), '0/0.00/false/false',
  'fixture: S starts the simple course at 0%');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid('p124_outsider')), 0,
  'fixture: the outsider has no enrolment');

-- ----------------------------------------------------------------------------
-- 1. CUR-S4c broken-first — refused marks (each probe is undone) (8)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_lrn_c');
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                          VALUES (auth.uid(), '12400000-0000-4000-8000-00000000ee03', '12400000-0000-4000-8000-0000000000b4', now())$$),
  '42501', 'CUR-S4c: C cannot mark a block of course 2, a course C does not have');
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                          VALUES (auth.uid(), '12400000-0000-4000-8000-00000000ee02', '12400000-0000-4000-8000-0000000000b1', now())$$),
  '42501', 'CUR-S4c: C cannot mark lesson 1''s text block under lesson 2');
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                          VALUES (auth.uid(), '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2', now())$$),
  '42501', 'CUR-S4c: C cannot mark lesson 1''s quiz done without having sent it');
SELECT is(pg_temp.probe(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2')),
  '42501', 'CUR-S4c: … nor through the page''s upsert shape');
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                          VALUES (pg_temp.uid('p124_lrn_a'), '12400000-0000-4000-8000-00000000ee02', '12400000-0000-4000-8000-0000000000b3', now())$$),
  '42501', 'CUR-S4c: C cannot write a mark in learner A''s name');
RESET ROLE;
SELECT tests.authenticate_as('p124_outsider');
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                          VALUES (auth.uid(), '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b1', now())$$),
  '42501', 'CUR-S4c: the outsider cannot mark a block of course 1');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT pg_temp.set_anon();
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                          VALUES (pg_temp.uid('p124_lrn_c'), '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b1', now())$$),
  '42501', 'CUR-S4c: anon cannot write a mark');
RESET ROLE;
SELECT is(pg_temp.marks_of('p124_lrn_c') + pg_temp.marks_of('p124_outsider'), 0,
  'CUR-S4c: no mark of C or the outsider is stored after the probes');

-- ----------------------------------------------------------------------------
-- 2. CUR-S4a + CUR-S4c — C's real journey moves the enrolment (13)
--    text -> quiz sent -> quiz mark -> lesson 2's text; same numbers on the
--    baseline and with the migration.
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_lrn_c');
SELECT lives_ok(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b1'),
  'still works: C marks lesson 1''s text through the page''s upsert');
SELECT is(pg_temp.enr('p124_lrn_c', '12400000-0000-4000-8000-000000000c01'), '0/0.00/false/false',
  'CUR-S4a: one of lesson 1''s two blocks done — still 0 lessons / 0%');
SELECT lives_ok(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b1'),
  'still works: the same upsert a second time (ON CONFLICT DO UPDATE)');
SELECT is(pg_temp.marks_of('p124_lrn_c'), 1, 'still works: the second upsert updated the one mark');
RESET ROLE;
-- C sends lesson 1's quiz (stored as the quiz grader stores it).
INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, total_possible_points,
                                     auto_gradable_points, manual_gradable_points, answers) VALUES
  ('12400000-0000-4000-8000-0000000000ac', '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2',
   pg_temp.uid('p124_lrn_c'), '12400000-0000-4000-8000-000000000c01', 1, 1, 0, '{"q1": "t"}');
SELECT tests.authenticate_as('p124_lrn_c');
SELECT lives_ok(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2'),
  'still works: once the quiz is sent, C marks the quiz block');
SELECT is(pg_temp.enr('p124_lrn_c', '12400000-0000-4000-8000-000000000c01'), '1/50.00/false/false',
  'CUR-S4a: lesson 1 complete — 1 lesson / 50% / not completed');
SELECT lives_ok(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee02', '12400000-0000-4000-8000-0000000000b3'),
  'still works: C marks lesson 2''s text');
SELECT is(pg_temp.enr('p124_lrn_c', '12400000-0000-4000-8000-000000000c01'), '2/100.00/true/true',
  'CUR-S4a: both lessons complete — 2 lessons / 100% / completed, completed_at set');
SELECT lives_ok($$UPDATE public.lesson_progress SET time_spent = 99 WHERE user_id = auth.uid() AND block_id = '12400000-0000-4000-8000-0000000000b3'$$,
  'still works: C updates their own real mark directly');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE user_id = auth.uid()), 3,
  'still works: C reads their three marks');
SELECT is((SELECT progress_percentage::numeric(6,2)::text FROM public.course_enrollments
            WHERE user_id = auth.uid() AND course_id = '12400000-0000-4000-8000-000000000c01'), '100.00',
  'still works: C reads their own enrolment at 100%');
RESET ROLE;

-- Learner S, simple course (lesson with course_id and no module).
SELECT tests.authenticate_as('p124_lrn_s');
SELECT lives_ok(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee04', '12400000-0000-4000-8000-0000000000b5'),
  'still works: S marks the simple course''s text');
RESET ROLE;
SELECT is(pg_temp.enr('p124_lrn_s', '12400000-0000-4000-8000-000000000c03'), '1/100.00/true/true',
  'CUR-S4a: S''s enrolment in the simple course moved to 100% / completed');

-- ----------------------------------------------------------------------------
-- 3. CUR-S4c — other learners and the admin (9)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_lrn_a');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE id = '12400000-0000-4000-8000-0000000000a1'), 1,
  'still works: A reads their existing mark');
SELECT lives_ok(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2'),
  'still works: A (quiz sent) marks the quiz block');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE user_id = auth.uid()), 2,
  'still works: A reads both of their marks');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE user_id = pg_temp.uid('p124_lrn_c')), 0,
  'A does not read C''s marks');
RESET ROLE;
SELECT tests.authenticate_as('p124_admin');
SELECT lives_ok($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                  VALUES (pg_temp.uid('p124_lrn_a'), '12400000-0000-4000-8000-00000000ee03', '12400000-0000-4000-8000-0000000000b4', now())$$,
  'admin: inserts a mark for any person and block (course 2, A not enrolled)');
SELECT lives_ok($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at)
                  VALUES (pg_temp.uid('p124_outsider'), '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b2', now())$$,
  'admin: inserts a quiz mark with no submission');
SELECT is(pg_temp.rows_affected($$UPDATE public.lesson_progress SET time_spent = 5 WHERE id = '12400000-0000-4000-8000-0000000000a1'$$), 1,
  'admin: updates learner A''s mark');
SELECT is(pg_temp.rows_affected($$UPDATE public.lesson_progress SET lesson_id = '12400000-0000-4000-8000-00000000ee01' WHERE user_id = pg_temp.uid('p124_lrn_a') AND block_id = '12400000-0000-4000-8000-0000000000b4'$$), 1,
  'admin: moves a mark to any lesson');
RESET ROLE;
SELECT is(pg_temp.marks_of('p124_outsider'), 1, 'admin: the outsider''s mark written by the admin is stored');

-- ----------------------------------------------------------------------------
-- 4. CUR-S4c — a learner cannot move an own mark onto refused content (3)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_lrn_c');
SELECT is(pg_temp.probe($$UPDATE public.lesson_progress SET lesson_id = '12400000-0000-4000-8000-00000000ee03', block_id = '12400000-0000-4000-8000-0000000000b4'
                          WHERE user_id = auth.uid() AND block_id = '12400000-0000-4000-8000-0000000000b3'$$),
  '42501', 'CUR-S4c: C cannot move an own mark onto course 2''s block');
SELECT is(pg_temp.probe($$UPDATE public.lesson_progress SET lesson_id = '12400000-0000-4000-8000-00000000ee02'
                          WHERE user_id = auth.uid() AND block_id = '12400000-0000-4000-8000-0000000000b1'$$),
  '42501', 'CUR-S4c: C cannot move an own mark to a lesson the block is not in');
SELECT is(pg_temp.rows_affected($$UPDATE public.lesson_progress SET time_spent = 1 WHERE user_id = pg_temp.uid('p124_lrn_a')$$), 0,
  'CUR-S4c: C cannot update learner A''s marks');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 5. The admin still updates an enrolment directly; the trigger
--    still writes for the learner (3)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_admin');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET overall_score = 42, status = 'active'
                                   WHERE user_id = pg_temp.uid('p124_lrn_a') AND course_id = '12400000-0000-4000-8000-000000000c01'$$), 1,
  'admin: UPDATE of a learner''s enrolment directly');
RESET ROLE;
SELECT is((SELECT overall_score::int FROM public.course_enrollments
            WHERE user_id = pg_temp.uid('p124_lrn_a') AND course_id = '12400000-0000-4000-8000-000000000c01'), 42,
  'admin: the update landed');
SELECT is(pg_temp.enr('p124_lrn_a', '12400000-0000-4000-8000-000000000c01'), '1/50.00/false/false',
  'CUR-S4a: A''s enrolment was moved by the trigger (lesson 1 complete)');

-- ----------------------------------------------------------------------------
-- 6. Enrolments of others: the outsider and anon (3)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_outsider');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET progress_percentage = 100 WHERE course_id = '12400000-0000-4000-8000-000000000c01'$$), 0,
  'the outsider cannot update enrolments of course 1 (0 rows)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT pg_temp.set_anon();
SELECT is(pg_temp.probe($$UPDATE public.course_enrollments SET progress_percentage = 100 WHERE course_id = '12400000-0000-4000-8000-000000000c01'$$),
  '42501', 'anon cannot update enrolments');
RESET ROLE;
SELECT is(pg_temp.enr('p124_lrn_c', '12400000-0000-4000-8000-000000000c01'), '2/100.00/true/true',
  'C''s progress is still what the trigger wrote');

-- ----------------------------------------------------------------------------
-- 7. Catalog: functions and rules have the intended shape (11)
-- ----------------------------------------------------------------------------
SELECT ok(COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = 'public.update_course_enrollment_progress()'::regprocedure), false),
  'CUR-S4a: update_course_enrollment_progress is SECURITY DEFINER');
SELECT ok(COALESCE((SELECT 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = 'public.update_course_enrollment_progress()'::regprocedure), false),
  'CUR-S4a: update_course_enrollment_progress has a pinned search_path');
SELECT ok(NOT has_function_privilege('authenticated', 'public.update_course_enrollment_progress()', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.update_course_enrollment_progress()', 'EXECUTE'),
  'CUR-S4a: anon and authenticated cannot call the trigger function');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_enrollment_progress'
                   AND tgrelid = 'public.lesson_progress'::regclass AND tgenabled = 'O'),
  'CUR-S4a: the progress trigger is still in place and enabled');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_progress'
                   AND policyname = 'lesson_progress_insert_real_content' AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT'),
  'CUR-S4c: the restrictive INSERT rule exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_progress'
                   AND policyname = 'lesson_progress_update_real_content' AND permissive = 'RESTRICTIVE' AND cmd = 'UPDATE'),
  'CUR-S4c: the restrictive UPDATE rule exists');
SELECT ok(to_regprocedure('public.can_mark_block_progress(uuid, uuid, uuid)') IS NOT NULL
          AND (SELECT prosecdef AND 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc
                WHERE oid = to_regprocedure('public.can_mark_block_progress(uuid, uuid, uuid)')),
  'CUR-S4c: can_mark_block_progress is SECURITY DEFINER with a pinned search_path');
SELECT ok(to_regprocedure('public.can_mark_block_progress(uuid, uuid, uuid)') IS NOT NULL
          AND NOT has_function_privilege('anon', 'public.can_mark_block_progress(uuid, uuid, uuid)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.can_mark_block_progress(uuid, uuid, uuid)', 'EXECUTE'),
  'CUR-S4c: can_mark_block_progress is callable by authenticated, not anon');
SELECT ok(EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.course_enrollments'::regclass AND relrowsecurity)
          AND EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.lesson_progress'::regclass AND relrowsecurity),
  'row level security stays enabled on course_enrollments and lesson_progress');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_progress'
            AND policyname IN ('Users can insert their own progress', 'Users can update their own progress', 'lesson_progress_user_own')), 3,
  'the three existing own-row rules of lesson_progress are kept');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_enrollments'
            AND policyname = 'Users can update own enrollment progress'), 1,
  'the existing own-row UPDATE rule of course_enrollments is not touched');

-- ----------------------------------------------------------------------------
-- 8. CUR-S4b — a learner cannot set their own enrolment directly (5)
--    (real updates, at the end so nothing later depends on them)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('p124_lrn_c');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET progress_percentage = 100, is_completed = true, has_passed = true, overall_score = 100
                                   WHERE user_id = auth.uid() AND course_id = '12400000-0000-4000-8000-000000000c01'$$), 0,
  'CUR-S4b: C''s direct UPDATE of their own enrolment (progress, completion, pass, score) changes 0 rows');
RESET ROLE;
SELECT ok((SELECT NOT COALESCE(has_passed, false) AND overall_score IS DISTINCT FROM 100
             FROM public.course_enrollments WHERE user_id = pg_temp.uid('p124_lrn_c') AND course_id = '12400000-0000-4000-8000-000000000c01'),
  'CUR-S4b: C''s stored pass mark and score stay as they were');
SELECT tests.authenticate_as('p124_lrn_s');
SELECT is(pg_temp.rows_affected($$UPDATE public.course_enrollments SET progress_percentage = 0, is_completed = false, lessons_completed = 0
                                   WHERE user_id = auth.uid() AND course_id = '12400000-0000-4000-8000-000000000c03'$$), 0,
  'CUR-S4b: S''s direct reset of their own enrolment changes 0 rows');
RESET ROLE;
SELECT is(pg_temp.enr('p124_lrn_s', '12400000-0000-4000-8000-000000000c03'), '1/100.00/true/true',
  'CUR-S4b: S''s enrolment stays what the trigger wrote');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'course_enrollments'
                   AND policyname = 'course_enrollments_direct_update_admin_only' AND permissive = 'RESTRICTIVE' AND cmd = 'UPDATE'
                   AND roles = ARRAY['authenticated']::name[]),
  'CUR-S4b: the restrictive UPDATE rule of course_enrollments exists');

-- ----------------------------------------------------------------------------
-- 9. CUR-S4d — a quiz with no questions is marked without a submission (3)
--    (blocks added to lesson 1 only now, so the progress numbers above hold)
-- ----------------------------------------------------------------------------
INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload) VALUES
  ('12400000-0000-4000-8000-0000000000b6', '12400000-0000-4000-8000-000000000c01', '12400000-0000-4000-8000-00000000ee01', 3, 'quiz',
   '{"title": "Synthetic empty quiz 124", "totalPoints": 0, "questions": []}'),
  ('12400000-0000-4000-8000-0000000000b7', '12400000-0000-4000-8000-000000000c01', '12400000-0000-4000-8000-00000000ee01', 4, 'quiz',
   '{"title": "Synthetic quiz 124 without a questions key"}');
SELECT tests.authenticate_as('p124_lrn_c');
SELECT is(pg_temp.probe(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b6')),
  'accepted', 'CUR-S4d: C marks a quiz whose questions are [] without a submission ("Continuar")');
SELECT is(pg_temp.probe(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b7')),
  'accepted', 'CUR-S4d: C marks a quiz with no questions key without a submission');
RESET ROLE;
SELECT tests.authenticate_as('p124_outsider');
SELECT is(pg_temp.probe(pg_temp.page_upsert('12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-0000000000b6')),
  '42501', 'CUR-S4d: the outsider still cannot mark the empty quiz (course not given)');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 10. N56 — lesson_completion_summary is private (13)
-- ----------------------------------------------------------------------------
INSERT INTO public.lesson_completion_summary (id, user_id, lesson_id, course_id, progress_percentage) VALUES
  ('12400000-0000-4000-8000-0000000000d1', pg_temp.uid('p124_lrn_a'), '12400000-0000-4000-8000-00000000ee01', '12400000-0000-4000-8000-000000000c01', 10);
SELECT tests.authenticate_as('p124_lrn_c');
SELECT is((SELECT count(*)::int FROM public.lesson_completion_summary WHERE user_id = pg_temp.uid('p124_lrn_a')), 0,
  'N56: C does not see A''s lesson summary');
SELECT is(pg_temp.probe_rows($$UPDATE public.lesson_completion_summary SET progress_percentage = 99 WHERE id = '12400000-0000-4000-8000-0000000000d1'$$), '0',
  'N56: C''s UPDATE of A''s summary changes 0 rows');
SELECT is(pg_temp.probe_rows($$DELETE FROM public.lesson_completion_summary WHERE id = '12400000-0000-4000-8000-0000000000d1'$$), '0',
  'N56: C''s DELETE of A''s summary changes 0 rows');
SELECT is(pg_temp.probe($$INSERT INTO public.lesson_completion_summary (user_id, lesson_id, course_id, progress_percentage)
                          VALUES (pg_temp.uid('p124_lrn_a'), '12400000-0000-4000-8000-00000000ee02', '12400000-0000-4000-8000-000000000c01', 100)$$),
  '42501', 'N56: C cannot insert a summary in A''s name');
RESET ROLE;
SELECT tests.authenticate_as('p124_lrn_a');
SELECT is((SELECT progress_percentage::int FROM public.lesson_completion_summary WHERE id = '12400000-0000-4000-8000-0000000000d1'), 10,
  'N56 still works: A reads their own summary');
SELECT is(pg_temp.probe_rows($$UPDATE public.lesson_completion_summary SET progress_percentage = 100 WHERE id = '12400000-0000-4000-8000-0000000000d1'$$), '0',
  'N56: A''s own direct UPDATE of their summary changes 0 rows (direct writes are admin only)');
RESET ROLE;
SELECT tests.authenticate_as('p124_admin');
SELECT is((SELECT count(*)::int FROM public.lesson_completion_summary WHERE id = '12400000-0000-4000-8000-0000000000d1'), 1,
  'N56 admin: reads A''s summary');
SELECT is(pg_temp.rows_affected($$UPDATE public.lesson_completion_summary SET progress_percentage = 20 WHERE id = '12400000-0000-4000-8000-0000000000d1'$$), 1,
  'N56 admin: updates A''s summary');
SELECT lives_ok($$INSERT INTO public.lesson_completion_summary (id, user_id, lesson_id, course_id, progress_percentage)
                  VALUES ('12400000-0000-4000-8000-0000000000d2', pg_temp.uid('p124_lrn_c'), '12400000-0000-4000-8000-00000000ee02', '12400000-0000-4000-8000-000000000c01', 5)$$,
  'N56 admin: inserts a summary for any person');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.lesson_completion_summary WHERE id = '12400000-0000-4000-8000-0000000000d2'$$), 1,
  'N56 admin: deletes a summary');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosrc ILIKE '%lesson_completion_summary%'), 0,
  'N56: no function of the public schema reads or writes lesson_completion_summary');
SELECT is((SELECT count(*)::int FROM pg_trigger WHERE tgrelid = 'public.lesson_completion_summary'::regclass AND NOT tgisinternal), 0,
  'N56: no trigger on lesson_completion_summary');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lesson_completion_summary'
            AND permissive = 'RESTRICTIVE' AND roles = ARRAY['authenticated']::name[]
            AND policyname IN ('lesson_completion_summary_direct_insert_admin_only', 'lesson_completion_summary_direct_update_admin_only',
                               'lesson_completion_summary_direct_delete_admin_only')), 3,
  'N56: the three restrictive admin-only write rules exist');

SELECT * FROM finish();
ROLLBACK;
