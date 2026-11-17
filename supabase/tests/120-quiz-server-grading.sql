-- =============================================================================
-- 120-quiz-server-grading.sql — F5 (CUR-S2a, CUR-S2b): migration
-- 20261116173000_quiz_server_side_grading.sql.
--
--   CUR-S2a: submit_quiz scores from the quiz stored in the lesson's block, not
--            from the copy the browser sends; it accepts only a real quiz block
--            of the lesson named, of the course named, from someone who has
--            that course (or from backend code).
--   CUR-S2b: a learner's own session only READS their quiz results; direct
--            INSERT / UPDATE / DELETE on quiz_submissions is admin-only, and
--            grade_quiz_feedback is no longer executable by anon/authenticated.
--
-- Personas: anon; admin; learner A and learner B (given course 1 through
-- batch_assign_courses); learner B also given the simple course; learner L
-- (course 1 only through a learning path, batch_assign_learning_path); an
-- outsider (signed in, given nothing). Synthetic/local state only. Rolls back.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(52);

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

-- Counts every stored quiz result of a persona (as postgres: sees all rows).
CREATE OR REPLACE FUNCTION pg_temp.results_of(k text) RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.quiz_submissions WHERE student_id = pg_temp.uid(k) $$;

-- Runs a statement with the caller's rights. A refused statement answers
-- '<SQLSTATE> <message>'. An accepted one answers 'accepted, stored <n>' and is
-- then undone, so the probes below never collide on the table's unique key
-- whichever way they go.
CREATE OR REPLACE FUNCTION pg_temp.probe(stmt text, k text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n_before int := pg_temp.results_of(k);
BEGIN
  BEGIN
    EXECUTE stmt;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'accepted, stored ' || (pg_temp.results_of(k) - n_before);
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN RETURN SQLERRM;
    WHEN OTHERS THEN RETURN SQLSTATE || ' ' || SQLERRM;
  END;
END;
$$;

-- "auto/total/auto-gradable/manual-gradable/status" of a stored result (as postgres).
CREATE OR REPLACE FUNCTION pg_temp.score(k text, p_lesson uuid, p_block text) RETURNS text
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT auto_graded_score || '/' || total_possible_points || '/' || auto_gradable_points || '/'
         || manual_gradable_points || '/' || grading_status
    FROM public.quiz_submissions
   WHERE student_id = pg_temp.uid(k) AND lesson_id = p_lesson AND block_id = p_block $$;

-- The stored quiz of lesson 1 (block b2): MC worth 2 (o2 right), TF worth 1 (t right), open worth 3.
CREATE OR REPLACE FUNCTION pg_temp.quiz1() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT
'{"title": "Synthetic quiz 120", "totalPoints": 6, "allowRetries": false, "showResults": true,
  "randomizeQuestions": false, "randomizeAnswers": false,
  "questions": [
    {"id": "q-mc", "question": "Synthetic multiple choice", "type": "multiple-choice", "points": 2,
     "options": [{"id": "o1", "text": "A", "isCorrect": false}, {"id": "o2", "text": "B", "isCorrect": true},
                 {"id": "o3", "text": "C", "isCorrect": false}, {"id": "o4", "text": "D", "isCorrect": false}]},
    {"id": "q-tf", "question": "Synthetic true-false", "type": "true-false", "points": 1,
     "options": [{"id": "t", "text": "Verdadero", "isCorrect": true}, {"id": "f", "text": "Falso", "isCorrect": false}]},
    {"id": "q-open", "question": "Synthetic open question", "type": "open-ended", "points": 3, "options": [],
     "expectedAnswer": "synthetic expected", "gradingGuidelines": "synthetic guidelines"}
  ]}'::jsonb $$;

-- A made-up copy: the learner's wrong answers (o1, f) marked right, every question worth 100.
CREATE OR REPLACE FUNCTION pg_temp.forged() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT
'{"questions": [
    {"id": "q-mc", "type": "multiple-choice", "points": 100, "options": [{"id": "o1", "isCorrect": true}]},
    {"id": "q-tf", "type": "true-false", "points": 100, "options": [{"id": "f", "isCorrect": true}]},
    {"id": "q-open", "type": "open-ended", "points": 100, "options": []}
  ]}'::jsonb $$;

-- The stored quiz of the simple course (block b5): closed questions only, MC worth 4 (s2 right).
CREATE OR REPLACE FUNCTION pg_temp.quiz5() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT
'{"title": "Synthetic simple quiz 120", "totalPoints": 4, "allowRetries": false, "showResults": true,
  "randomizeQuestions": false, "randomizeAnswers": false,
  "questions": [
    {"id": "s-mc", "question": "Synthetic simple MC", "type": "multiple-choice", "points": 4,
     "options": [{"id": "s1", "text": "A", "isCorrect": false}, {"id": "s2", "text": "B", "isCorrect": true},
                 {"id": "s3", "text": "C", "isCorrect": false}, {"id": "s4", "text": "D", "isCorrect": false}]}
  ]}'::jsonb $$;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('q120_admin');
SELECT tests.create_supabase_user('q120_lrn_a');
SELECT tests.create_supabase_user('q120_lrn_b');
SELECT tests.create_supabase_user('q120_lrn_l');
SELECT tests.create_supabase_user('q120_outsider');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['q120_admin','q120_lrn_a','q120_lrn_b','q120_lrn_l','q120_outsider']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9120, 'Q120 school (pgTAP 120)') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('q120_admin'),    'admin',   NULL, true),
  (pg_temp.uid('q120_lrn_a'),    'docente', 9120, true),
  (pg_temp.uid('q120_lrn_b'),    'docente', 9120, true),
  (pg_temp.uid('q120_lrn_l'),    'docente', 9120, true),
  (pg_temp.uid('q120_outsider'), 'docente', 9120, true);

INSERT INTO public.instructors (id, full_name) VALUES ('12000000-0000-4000-8000-00000000f001', 'Q120 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('12000000-0000-4000-8000-000000000c01', 'Q120 course 1', 'given to A, B and L', '12000000-0000-4000-8000-00000000f001'),
  ('12000000-0000-4000-8000-000000000c02', 'Q120 course 2', 'given to nobody',     '12000000-0000-4000-8000-00000000f001'),
  ('12000000-0000-4000-8000-000000000c03', 'Q120 simple course', 'no modules; given to B', '12000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('12000000-0000-4000-8000-00000000e001', '12000000-0000-4000-8000-000000000c01', 'Q120 module 1', 1),
  ('12000000-0000-4000-8000-00000000e002', '12000000-0000-4000-8000-000000000c02', 'Q120 module 2', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-00000000e001', '12000000-0000-4000-8000-000000000c01', 'Q120 lesson 1', 1),
  ('12000000-0000-4000-8000-00000000ee02', '12000000-0000-4000-8000-00000000e001', '12000000-0000-4000-8000-000000000c01', 'Q120 lesson 2', 2),
  ('12000000-0000-4000-8000-00000000ee03', '12000000-0000-4000-8000-00000000e002', '12000000-0000-4000-8000-000000000c02', 'Q120 course 2 lesson', 1),
  ('12000000-0000-4000-8000-00000000ee04', NULL,                                   '12000000-0000-4000-8000-000000000c03', 'Q120 simple lesson', 1),
  -- CUR-S2c: in course 1's module, but its own course_id disagrees (says course 2).
  ('12000000-0000-4000-8000-00000000ee05', '12000000-0000-4000-8000-00000000e001', '12000000-0000-4000-8000-000000000c02', 'Q120 mismatched lesson', 3);
INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload) VALUES
  ('12000000-0000-4000-8000-0000000000b1', '12000000-0000-4000-8000-000000000c01', '12000000-0000-4000-8000-00000000ee01', 1, 'text', '{"content": "synthetic text"}'),
  ('12000000-0000-4000-8000-0000000000b2', '12000000-0000-4000-8000-000000000c01', '12000000-0000-4000-8000-00000000ee01', 2, 'quiz', pg_temp.quiz1()),
  ('12000000-0000-4000-8000-0000000000b3', '12000000-0000-4000-8000-000000000c01', '12000000-0000-4000-8000-00000000ee02', 1, 'text', '{"content": "lesson 2 text"}'),
  ('12000000-0000-4000-8000-0000000000b4', '12000000-0000-4000-8000-000000000c02', '12000000-0000-4000-8000-00000000ee03', 1, 'text', '{"content": "course 2 text"}'),
  ('12000000-0000-4000-8000-0000000000b5', '12000000-0000-4000-8000-000000000c03', '12000000-0000-4000-8000-00000000ee04', 1, 'quiz', pg_temp.quiz5()),
  ('12000000-0000-4000-8000-0000000000b6', '12000000-0000-4000-8000-000000000c02', '12000000-0000-4000-8000-00000000ee05', 1, 'quiz', pg_temp.quiz1());
INSERT INTO public.learning_paths (id, name, description, created_by) VALUES
  ('12000000-0000-4000-8000-00000000000a', 'Q120 path', 'course 1', pg_temp.uid('q120_admin'));
INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order) VALUES
  ('12000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-000000000c01', 1);

-- Courses are given the way the app does it: assignment + enrolment, or a learning path.
SELECT tests.authenticate_as('q120_admin');
SELECT public.batch_assign_courses('12000000-0000-4000-8000-000000000c01',
         ARRAY[pg_temp.uid('q120_lrn_a'), pg_temp.uid('q120_lrn_b')]);
SELECT public.batch_assign_courses('12000000-0000-4000-8000-000000000c03', ARRAY[pg_temp.uid('q120_lrn_b')]);
SELECT public.batch_assign_learning_path('12000000-0000-4000-8000-00000000000a',
         ARRAY[pg_temp.uid('q120_lrn_l')], NULL, auth.uid());
RESET ROLE;
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 0. Fixture sanity (3)
-- ----------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE course_id = '12000000-0000-4000-8000-000000000c01'
            AND teacher_id IN (pg_temp.uid('q120_lrn_a'), pg_temp.uid('q120_lrn_b'))), 2,
  'fixture: A and B each hold a course_assignments row for course 1');
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE teacher_id = pg_temp.uid('q120_lrn_l')), 0,
  'fixture: L holds no course assignment (course 1 only through the learning path)');
SELECT tests.authenticate_as('q120_lrn_l');
SELECT ok(public.auth_is_learning_path_member('12000000-0000-4000-8000-000000000c01'),
  'fixture: L is a learning-path member of course 1');
RESET ROLE;
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 1. CUR-S2a — wrong caller, wrong context (6; probed before any result of A exists)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('q120_outsider');
SELECT is(pg_temp.probe(
  $s$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_outsider'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}}'::jsonb, pg_temp.quiz1(), NULL)$s$, 'q120_outsider'),
  '42501 No access to this course', 'CUR-S2a: the outsider cannot send course 1''s quiz');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.results_of('q120_outsider'), 0, 'CUR-S2a: the outsider''s refused call stored nothing');

SELECT tests.authenticate_as('q120_lrn_a');
SELECT is(pg_temp.probe(
  $s$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b1',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01', '{}'::jsonb, pg_temp.quiz1(), NULL)$s$, 'q120_lrn_a'),
  '22023 Block is not a quiz', 'CUR-S2a: learner A naming the TEXT block is refused, nothing stored');
SELECT is(pg_temp.probe(
  $s$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee02', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01', '{}'::jsonb, pg_temp.quiz1(), NULL)$s$, 'q120_lrn_a'),
  '22023 Quiz does not belong to that lesson', 'CUR-S2a: learner A naming lesson 2 with lesson 1''s quiz is refused, nothing stored');
SELECT is(pg_temp.probe(
  $s$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c02', '{}'::jsonb, pg_temp.quiz1(), NULL)$s$, 'q120_lrn_a'),
  '22023 Lesson does not belong to that course', 'CUR-S2a: learner A naming course 2 with lesson 1 is refused, nothing stored');
SELECT is(pg_temp.probe(
  $s$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', 'no-such-block',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01', '{}'::jsonb, pg_temp.quiz1(), NULL)$s$, 'q120_lrn_a'),
  '22023 Quiz block not found', 'CUR-S2a: learner A naming a block that does not exist is refused, nothing stored');
RESET ROLE;
SELECT tests.clear_authentication();

-- ----------------------------------------------------------------------------
-- 2. CUR-S2a — the made-up quiz changes nothing (7)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('q120_lrn_a');
SELECT lives_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o1"}, "q-tf": {"selectedOption": "f"}, "q-open": {"text": "synthetic answer"}}'::jsonb,
      pg_temp.forged(), 30)$$,
  'CUR-S2a: learner A sends wrong answers with a made-up quiz copy (the call itself is accepted)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT auto_graded_score FROM public.quiz_submissions WHERE student_id = pg_temp.uid('q120_lrn_a')
            AND block_id = '12000000-0000-4000-8000-0000000000b2'), 0,
  'CUR-S2a: auto_graded_score is 0 (the stored quiz says o1 and f are wrong), not 200');
SELECT is((SELECT total_possible_points FROM public.quiz_submissions WHERE student_id = pg_temp.uid('q120_lrn_a')
            AND block_id = '12000000-0000-4000-8000-0000000000b2'), 6,
  'CUR-S2a: total_possible_points is 6 from the stored quiz');
SELECT is((SELECT auto_gradable_points FROM public.quiz_submissions WHERE student_id = pg_temp.uid('q120_lrn_a')
            AND block_id = '12000000-0000-4000-8000-0000000000b2'), 3,
  'CUR-S2a: auto_gradable_points is 3 from the stored quiz');
SELECT is((SELECT manual_gradable_points FROM public.quiz_submissions WHERE student_id = pg_temp.uid('q120_lrn_a')
            AND block_id = '12000000-0000-4000-8000-0000000000b2'), 3,
  'CUR-S2a: manual_gradable_points is 3 from the stored quiz');
SELECT is((SELECT open_responses -> 0 ->> 'expectedAnswer' FROM public.quiz_submissions WHERE student_id = pg_temp.uid('q120_lrn_a')
            AND block_id = '12000000-0000-4000-8000-0000000000b2'), 'synthetic expected',
  'CUR-S2a: the open response carries the stored question''s expected answer');
SELECT is(pg_temp.results_of('q120_lrn_a'), 1, 'CUR-S2a: learner A holds exactly one stored result (the scored quiz)');

-- ----------------------------------------------------------------------------
-- 3. CUR-S2a — must still work (13)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('q120_lrn_b');
SELECT lives_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_b'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}, "q-tf": {"selectedOption": "f"}, "q-open": {"text": "synthetic answer"}}'::jsonb,
      pg_temp.quiz1(), 45)$$,
  'still works: learner B sends the quiz as the lesson page does (p_quiz_data = the stored payload)');
SELECT throws_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_b'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}}'::jsonb, pg_temp.quiz1(), 45)$$,
  '23505', NULL, 'still works: a second result for the same quiz by the same learner fails on the unique key, as today');
SELECT lives_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee04', '12000000-0000-4000-8000-0000000000b5',
      pg_temp.uid('q120_lrn_b'), '12000000-0000-4000-8000-000000000c03',
      '{"s-mc": {"selectedOption": "s2"}}'::jsonb, pg_temp.quiz5(), 20)$$,
  'still works: learner B sends the simple course''s quiz (lesson without a module)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.score('q120_lrn_b', '12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2'),
  '2/6/3/3/pending_review', 'still works: right option -> its points, wrong -> 0, open question -> manual points, pending_review');
SELECT is((SELECT jsonb_array_length(open_responses) FROM public.quiz_submissions WHERE student_id = pg_temp.uid('q120_lrn_b')
            AND block_id = '12000000-0000-4000-8000-0000000000b2'), 1,
  'still works: the open answer is kept for review');
SELECT is(pg_temp.score('q120_lrn_b', '12000000-0000-4000-8000-00000000ee04', '12000000-0000-4000-8000-0000000000b5'),
  '4/4/4/0/completed', 'still works: a quiz with closed questions only is completed');

SELECT tests.authenticate_as('q120_lrn_l');
SELECT lives_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_l'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}, "q-tf": {"selectedOption": "t"}, "q-open": {"text": "synthetic answer"}}'::jsonb,
      pg_temp.quiz1(), 60)$$,
  'still works: learner L (course 1 only through a learning path) sends the quiz');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.score('q120_lrn_l', '12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2'),
  '3/6/3/3/pending_review', 'still works: learner L''s result is scored from the stored quiz');

SELECT tests.authenticate_as('q120_admin');
SELECT lives_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_admin'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}}'::jsonb, pg_temp.quiz1(), NULL)$$,
  'still works: the admin can send a quiz of any course');
RESET ROLE;
SELECT tests.clear_authentication();

-- Backend caller (service role, no end-user identity), as 072 does.
SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT isnt(
  public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_outsider'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}}'::jsonb, '{}'::jsonb, NULL),
  NULL, 'still works: the service role sends a quiz for a named student (backend path, no course check)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.score('q120_outsider', '12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2'),
  '2/6/3/3/pending_review', 'still works: the backend call is scored from the stored quiz too');

SELECT pg_temp.set_anon();
SELECT throws_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b2',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01', '{}'::jsonb, pg_temp.quiz1(), NULL)$$,
  '42501', NULL, 'still refused: anon cannot call submit_quiz');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)'::regprocedure)
          AND has_function_privilege('authenticated', 'public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)', 'EXECUTE'),
  'still works: submit_quiz stays SECURITY DEFINER, executable by authenticated and service_role, not by anon');

-- ----------------------------------------------------------------------------
-- 4. CUR-S2b — a learner cannot write their own results directly (9)
-- ----------------------------------------------------------------------------
SELECT ok(NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.quiz_submissions'::regclass),
  'CUR-S2b: quiz_submissions is not FORCE ROW LEVEL SECURITY (submit_quiz, owned by the table owner, is not bound by the new rules)');
INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, auto_graded_score, total_possible_points,
                                     auto_gradable_points, manual_gradable_points, grading_status, answers) VALUES
  ('12000000-0000-4000-8000-0000000000aa', '12000000-0000-4000-8000-00000000ee02', '12000000-0000-4000-8000-0000000000b3',
   pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01', 1, 6, 3, 3, 'pending_review', '{}');

SELECT tests.authenticate_as('q120_lrn_a');
SELECT is(pg_temp.rows_affected(format(
  $f$UPDATE public.quiz_submissions SET auto_graded_score = 6, grading_status = 'completed', graded_by = %L
      WHERE id = '12000000-0000-4000-8000-0000000000aa'$f$, pg_temp.uid('q120_admin'))), 0,
  'CUR-S2b: learner A cannot UPDATE their own result (score, status, grader)');
SELECT throws_ok(format(
  $f$SELECT public.grade_quiz_feedback('12000000-0000-4000-8000-0000000000aa', %L, 'pass', 'synthetic feedback', NULL)$f$,
  pg_temp.uid('q120_admin')),
  '42501', NULL, 'CUR-S2b: learner A cannot call grade_quiz_feedback on their own result naming the admin as grader');
SELECT throws_ok(
  $$INSERT INTO public.quiz_submissions (lesson_id, block_id, student_id, course_id, auto_graded_score, total_possible_points,
                                        auto_gradable_points, manual_gradable_points, grading_status, answers)
    VALUES ('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b1', auth.uid(),
            '12000000-0000-4000-8000-000000000c01', 6, 6, 6, 0, 'completed', '{}')$$,
  '42501', NULL, 'CUR-S2b: learner A cannot INSERT a perfect result for themself');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.quiz_submissions WHERE id = '12000000-0000-4000-8000-0000000000aa'$$), 0,
  'CUR-S2b: learner A cannot DELETE their own result');
SELECT is((SELECT count(*)::int FROM public.quiz_submissions WHERE student_id = auth.uid()), 2,
  'still works: learner A reads their own results (the scored quiz and the stored one)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT auto_graded_score || '/' || grading_status || '/' || coalesce(graded_by::text, '-') || '/' || coalesce(review_status, '-')
             FROM public.quiz_submissions WHERE id = '12000000-0000-4000-8000-0000000000aa'),
  '1/pending_review/-/pending', 'CUR-S2b: learner A''s stored result is unchanged');
SELECT is(pg_temp.results_of('q120_lrn_a'), 2, 'CUR-S2b: learner A still has exactly two results (none added, none deleted)');
SELECT ok(NOT has_function_privilege('authenticated', 'public.grade_quiz_feedback(uuid, uuid, text, text, jsonb)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.grade_quiz_feedback(uuid, uuid, text, text, jsonb)', 'EXECUTE'),
  'CUR-S2b: neither authenticated nor anon may execute grade_quiz_feedback');

-- ----------------------------------------------------------------------------
-- 5. CUR-S2b — must still work, anon still refused (11)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('q120_admin');
SELECT lives_ok(
  $$INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, total_possible_points,
                                        auto_gradable_points, manual_gradable_points, answers)
    VALUES ('12000000-0000-4000-8000-0000000000ab', '12000000-0000-4000-8000-00000000ee02', '12000000-0000-4000-8000-0000000000b3',
            pg_temp.uid('q120_lrn_b'), '12000000-0000-4000-8000-000000000c01', 6, 3, 3, '{}')$$,
  'still works: the admin inserts a result directly');
SELECT is(pg_temp.rows_affected($$UPDATE public.quiz_submissions SET manual_graded_score = 2 WHERE id = '12000000-0000-4000-8000-0000000000ab'$$), 1,
  'still works: the admin updates a result directly');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.quiz_submissions WHERE id = '12000000-0000-4000-8000-0000000000ab'$$), 1,
  'still works: the admin deletes a result directly');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT is(pg_temp.rows_affected($$UPDATE public.quiz_submissions SET manual_graded_score = 3, review_status = 'pass'
                                   WHERE id = '12000000-0000-4000-8000-0000000000aa'$$), 1,
  'still works: the service role (review routes) updates a result');
SELECT ok(has_function_privilege('service_role', 'public.grade_quiz_feedback(uuid, uuid, text, text, jsonb)', 'EXECUTE'),
  'still works: the service role keeps EXECUTE on grade_quiz_feedback');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT pg_temp.set_anon();
SELECT is((SELECT count(*)::int FROM public.quiz_submissions), 0, 'anon: reads no quiz result');
SELECT throws_ok(
  $$INSERT INTO public.quiz_submissions (lesson_id, block_id, student_id, course_id, total_possible_points,
                                        auto_gradable_points, manual_gradable_points, answers)
    VALUES ('12000000-0000-4000-8000-00000000ee01', '12000000-0000-4000-8000-0000000000b1', pg_temp.uid('q120_lrn_a'),
            '12000000-0000-4000-8000-000000000c01', 6, 6, 0, '{}')$$,
  '42501', NULL, 'anon: cannot INSERT a result');
SELECT is(pg_temp.rows_affected($$UPDATE public.quiz_submissions SET auto_graded_score = 6 WHERE id = '12000000-0000-4000-8000-0000000000aa'$$), 0,
  'anon: cannot UPDATE a result');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.quiz_submissions WHERE id = '12000000-0000-4000-8000-0000000000aa'$$), 0,
  'anon: cannot DELETE a result');
SELECT throws_ok(
  $$SELECT public.grade_quiz_feedback('12000000-0000-4000-8000-0000000000aa', NULL, 'pass', 'synthetic', NULL)$$,
  '42501', NULL, 'anon: cannot call grade_quiz_feedback');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is((SELECT manual_graded_score || '/' || review_status FROM public.quiz_submissions WHERE id = '12000000-0000-4000-8000-0000000000aa'),
  '3/pass', 'anon: learner A''s result is as the service role left it');

-- ----------------------------------------------------------------------------
-- 6. CUR-S2c — the course is resolved as the lesson page does: module first (3)
--    Lesson ee05 sits in course 1's module but its own course_id says course 2.
--    The page sends lesson.module.course_id || lesson.course_id = course 1.
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('q120_lrn_a');
SELECT is(pg_temp.probe(
  $s$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee05', '12000000-0000-4000-8000-0000000000b6',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c02', '{}'::jsonb, pg_temp.quiz1(), NULL)$s$, 'q120_lrn_a'),
  '22023 Lesson does not belong to that course',
  'CUR-S2c: naming course 2 for the mismatched lesson is refused (its module is course 1''s), nothing stored');
SELECT lives_ok(
  $$SELECT public.submit_quiz('12000000-0000-4000-8000-00000000ee05', '12000000-0000-4000-8000-0000000000b6',
      pg_temp.uid('q120_lrn_a'), '12000000-0000-4000-8000-000000000c01',
      '{"q-mc": {"selectedOption": "o2"}, "q-tf": {"selectedOption": "t"}, "q-open": {"text": "synthetic answer"}}'::jsonb,
      pg_temp.forged(), 25)$$,
  'CUR-S2c: learner A sends the mismatched lesson''s quiz naming course 1, as the page does (accepted)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.score('q120_lrn_a', '12000000-0000-4000-8000-00000000ee05', '12000000-0000-4000-8000-0000000000b6'),
  '3/6/3/3/pending_review', 'CUR-S2c: the mismatched lesson''s result is stored and scored from the stored quiz');

SELECT * FROM finish();

ROLLBACK;
