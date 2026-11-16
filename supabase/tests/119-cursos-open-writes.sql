-- =============================================================================
-- 119-cursos-open-writes.sql — F4 (CUR-S5, CUR-S1): migration
-- 20261116140000_cursos_close_open_writes.sql.
--
--   CUR-S5: a learner given a course (course_assignments.teacher_id = learner)
--           is no longer its "course teacher": no writes on the course's
--           lessons / modules, no reads or writes of classmates' enrolments,
--           progress or quiz submissions. Their own reads and progress stay.
--   CUR-S1: blocks are inserted / updated / deleted by admins only; every
--           signed-in persona still reads them.
--   CUR-S6d: signed-in people no longer read the view pending_quiz_reviews
--           (learner name, e-mail and answers of every waiting submission);
--           the service role still does.
--
-- Personas: anon; admin; learner A and learner B (both given course 1 through
-- batch_assign_courses: assignment + enrolment); an outsider (signed in,
-- given nothing). Synthetic/local state only. Rolls back.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(67);

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

-- Runs an INSERT ... RETURNING id with the caller's privileges and returns the id.
CREATE OR REPLACE FUNCTION pg_temp.insert_returning(stmt text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  EXECUTE stmt INTO r;
  RETURN r;
END;
$$;

-- Read as postgres (bypasses RLS): does learner B's progress row on block 1 still exist?
CREATE OR REPLACE FUNCTION pg_temp.b_progress_left() RETURNS int
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.lesson_progress
   WHERE id = '11900000-0000-4000-8000-0000000000a1' $$;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('cur119_admin');
SELECT tests.create_supabase_user('cur119_lrn_a');
SELECT tests.create_supabase_user('cur119_lrn_b');
SELECT tests.create_supabase_user('cur119_outsider');

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['cur119_admin','cur119_lrn_a','cur119_lrn_b','cur119_outsider']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9191, 'CUR119 school (pgTAP 119)') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('cur119_admin'),    'admin',   NULL, true),
  (pg_temp.uid('cur119_lrn_a'),    'docente', 9191, true),
  (pg_temp.uid('cur119_lrn_b'),    'docente', 9191, true),
  (pg_temp.uid('cur119_outsider'), 'docente', 9191, true);

INSERT INTO public.instructors (id, full_name) VALUES ('11900000-0000-4000-8000-00000000f001', 'CUR119 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('11900000-0000-4000-8000-000000000c01', 'CUR119 course 1', 'given to A and B', '11900000-0000-4000-8000-00000000f001'),
  ('11900000-0000-4000-8000-000000000c02', 'CUR119 course 2', 'given to nobody',  '11900000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('11900000-0000-4000-8000-00000000e001', '11900000-0000-4000-8000-000000000c01', 'CUR119 module 1', 1),
  ('11900000-0000-4000-8000-00000000e002', '11900000-0000-4000-8000-000000000c02', 'CUR119 module 2', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('11900000-0000-4000-8000-00000000ee01', '11900000-0000-4000-8000-00000000e001', '11900000-0000-4000-8000-000000000c01', 'CUR119 lesson 1', 1),
  ('11900000-0000-4000-8000-00000000ee02', '11900000-0000-4000-8000-00000000e002', '11900000-0000-4000-8000-000000000c02', 'CUR119 lesson 2', 1);
INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload) VALUES
  ('11900000-0000-4000-8000-0000000000b1', '11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 1, 'text', '{"content": "synthetic text"}'),
  ('11900000-0000-4000-8000-0000000000b2', '11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 2, 'quiz', '{"questions": []}'),
  ('11900000-0000-4000-8000-0000000000b3', '11900000-0000-4000-8000-000000000c02', '11900000-0000-4000-8000-00000000ee02', 1, 'text', '{"content": "course 2"}');

-- Learners A and B are given course 1 the way the app does it (assignment + enrolment).
SELECT tests.authenticate_as('cur119_admin');
SELECT public.batch_assign_courses('11900000-0000-4000-8000-000000000c01',
         ARRAY[pg_temp.uid('cur119_lrn_a'), pg_temp.uid('cur119_lrn_b')]);
RESET ROLE;
SELECT tests.clear_authentication();

INSERT INTO public.lesson_progress (id, user_id, lesson_id, block_id) VALUES
  ('11900000-0000-4000-8000-0000000000a1', pg_temp.uid('cur119_lrn_b'), '11900000-0000-4000-8000-00000000ee01', '11900000-0000-4000-8000-0000000000b1');
INSERT INTO public.quiz_submissions (id, lesson_id, block_id, student_id, course_id, total_possible_points,
                                     auto_gradable_points, manual_gradable_points, answers) VALUES
  ('11900000-0000-4000-8000-0000000000aa', '11900000-0000-4000-8000-00000000ee01', '11900000-0000-4000-8000-0000000000b2',
   pg_temp.uid('cur119_lrn_a'), '11900000-0000-4000-8000-000000000c01', 10, 5, 5, '{}'),
  ('11900000-0000-4000-8000-0000000000ab', '11900000-0000-4000-8000-00000000ee01', '11900000-0000-4000-8000-0000000000b2',
   pg_temp.uid('cur119_lrn_b'), '11900000-0000-4000-8000-000000000c01', 10, 5, 5, '{}');
-- Learner A's submission waits for review as the view pending_quiz_reviews defines it
-- (review_status 'pending' and a non-empty open_responses array).
UPDATE public.quiz_submissions SET open_responses = '[{"question_id": "q1", "response": "synthetic answer"}]'
 WHERE id = '11900000-0000-4000-8000-0000000000aa';

-- ----------------------------------------------------------------------------
-- 0. Fixture sanity (3)
-- ----------------------------------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.course_assignments WHERE course_id = '11900000-0000-4000-8000-000000000c01'
            AND teacher_id IN (pg_temp.uid('cur119_lrn_a'), pg_temp.uid('cur119_lrn_b'))), 2,
  'fixture: A and B each hold a course_assignments row for course 1');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE course_id = '11900000-0000-4000-8000-000000000c01'
            AND user_id IN (pg_temp.uid('cur119_lrn_a'), pg_temp.uid('cur119_lrn_b'))), 2,
  'fixture: A and B each hold a course_enrollments row for course 1');
SELECT is((SELECT count(*)::int FROM public.pending_quiz_reviews WHERE id = '11900000-0000-4000-8000-0000000000aa'), 1,
  'fixture: learner A''s submission is waiting in pending_quiz_reviews');

-- ----------------------------------------------------------------------------
-- 1. CUR-S5 — learner A is not a course teacher (11)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('cur119_lrn_a');
SELECT is(public.auth_is_course_teacher('11900000-0000-4000-8000-000000000c01'), false,
  'CUR-S5: auth_is_course_teacher is false for an assigned learner');
SELECT is(pg_temp.rows_affected($$UPDATE public.lessons SET title = 'hijacked' WHERE id = '11900000-0000-4000-8000-00000000ee01'$$), 0,
  'CUR-S5: learner A cannot UPDATE a lesson title of course 1');
SELECT is(pg_temp.rows_affected($$UPDATE public.modules SET title = 'hijacked' WHERE id = '11900000-0000-4000-8000-00000000e001'$$), 0,
  'CUR-S5: learner A cannot UPDATE the module title of course 1');
SELECT throws_ok($$INSERT INTO public.lessons (module_id, course_id, title) VALUES ('11900000-0000-4000-8000-00000000e001', '11900000-0000-4000-8000-000000000c01', 'injected')$$,
  '42501', NULL, 'CUR-S5: learner A cannot INSERT a lesson into the module of course 1');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid('cur119_lrn_b')), 0,
  'CUR-S5: learner A does not see learner B''s enrolment');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE user_id = pg_temp.uid('cur119_lrn_b')), 0,
  'CUR-S5: learner A does not see learner B''s lesson progress');
SELECT is((SELECT count(*)::int FROM public.quiz_submissions WHERE student_id = pg_temp.uid('cur119_lrn_b')), 0,
  'CUR-S5: learner A does not see learner B''s quiz submission');
SELECT is(pg_temp.rows_affected($$UPDATE public.quiz_submissions SET manual_graded_score = 10 WHERE id = '11900000-0000-4000-8000-0000000000ab'$$), 0,
  'CUR-S5: learner A cannot UPDATE learner B''s quiz submission');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.quiz_submissions WHERE id = '11900000-0000-4000-8000-0000000000ab'$$), 0,
  'CUR-S5: learner A cannot DELETE learner B''s quiz submission');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.quiz_submissions WHERE id = '11900000-0000-4000-8000-0000000000ab'), 1,
  'CUR-S5: learner B''s quiz submission is still there');
SELECT is((SELECT title FROM public.lessons WHERE id = '11900000-0000-4000-8000-00000000ee01'), 'CUR119 lesson 1',
  'CUR-S5: lesson title unchanged');

-- ----------------------------------------------------------------------------
-- 2. CUR-S5 — must still work for learner A (12)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('cur119_lrn_a');
SELECT is((SELECT count(*)::int FROM public.modules WHERE id = '11900000-0000-4000-8000-00000000e001'), 1,
  'still works: learner A reads the module of course 1');
SELECT is((SELECT count(*)::int FROM public.lessons WHERE id = '11900000-0000-4000-8000-00000000ee01'), 1,
  'still works: learner A reads the lesson of course 1');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE lesson_id = '11900000-0000-4000-8000-00000000ee01'), 2,
  'still works: learner A reads both blocks of course 1');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '11900000-0000-4000-8000-000000000c01'), 1,
  'still works: learner A reads their own enrolment');
SELECT is((SELECT count(*)::int FROM public.quiz_submissions WHERE student_id = auth.uid()), 1,
  'still works: learner A reads their own quiz submission');
SELECT is((SELECT progress_percentage::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '11900000-0000-4000-8000-000000000c01'), 0,
  'still works: learner A starts at 0% progress');
SELECT lives_ok($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, time_spent) VALUES (auth.uid(), '11900000-0000-4000-8000-00000000ee01', '11900000-0000-4000-8000-0000000000b1', 1)$$,
  'still works: learner A inserts their own lesson_progress row');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE user_id = auth.uid()), 1,
  'still works: learner A reads their own lesson_progress');
SELECT is(pg_temp.rows_affected($$UPDATE public.lesson_progress SET completed_at = now(), time_spent = 30 WHERE user_id = auth.uid() AND block_id = '11900000-0000-4000-8000-0000000000b1'$$), 1,
  'still works: learner A updates their own lesson_progress row (completes block 1)');
SELECT lives_ok($$INSERT INTO public.lesson_progress (user_id, lesson_id, block_id, completed_at) VALUES (auth.uid(), '11900000-0000-4000-8000-00000000ee01', '11900000-0000-4000-8000-0000000000b2', now())$$,
  'still works: learner A completes block 2');
SELECT is((SELECT progress_percentage::int FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '11900000-0000-4000-8000-000000000c01'), 100,
  'still works: learner A''s enrolment progress moved to 100% through the existing trigger');
SELECT is((SELECT lessons_completed FROM public.course_enrollments WHERE user_id = auth.uid() AND course_id = '11900000-0000-4000-8000-000000000c01'), 1,
  'still works: learner A''s enrolment counts the completed lesson');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 3. CUR-S5 — the admin still does everything (8)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('cur119_admin');
SELECT is(public.auth_is_course_teacher('11900000-0000-4000-8000-000000000c01'), true,
  'admin: auth_is_course_teacher is true');
SELECT is(pg_temp.rows_affected($$UPDATE public.lessons SET title = 'CUR119 lesson 1 (edited)' WHERE id = '11900000-0000-4000-8000-00000000ee01'$$), 1,
  'admin: UPDATE a lesson title');
SELECT is(pg_temp.rows_affected($$UPDATE public.modules SET title = 'CUR119 module 1 (edited)' WHERE id = '11900000-0000-4000-8000-00000000e001'$$), 1,
  'admin: UPDATE a module title');
SELECT lives_ok($$INSERT INTO public.lessons (module_id, course_id, title) VALUES ('11900000-0000-4000-8000-00000000e001', '11900000-0000-4000-8000-000000000c01', 'admin lesson')$$,
  'admin: INSERT a lesson');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid('cur119_lrn_b')), 1,
  'admin: sees learner B''s enrolment');
SELECT is((SELECT count(*)::int FROM public.lesson_progress WHERE user_id = pg_temp.uid('cur119_lrn_b')), 1,
  'admin: sees learner B''s lesson progress');
SELECT is((SELECT count(*)::int FROM public.quiz_submissions WHERE student_id = pg_temp.uid('cur119_lrn_b')), 1,
  'admin: sees learner B''s quiz submission');
SELECT is(pg_temp.rows_affected($$UPDATE public.quiz_submissions SET manual_graded_score = 4 WHERE id = '11900000-0000-4000-8000-0000000000ab'$$), 1,
  'admin: UPDATE learner B''s quiz submission');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 4. CUR-S1 — blocks: outsider, learner A, anon cannot write (3 x 4 = 12)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('cur119_outsider');
SELECT throws_ok($$INSERT INTO public.blocks (course_id, lesson_id, position, type, payload) VALUES ('11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 9, 'text', '{}')$$,
  '42501', NULL, 'CUR-S1: outsider cannot INSERT a block');
SELECT is(pg_temp.rows_affected($$UPDATE public.blocks SET payload = '{"content": "defaced"}' WHERE id = '11900000-0000-4000-8000-0000000000b1'$$), 0,
  'CUR-S1: outsider cannot UPDATE a block payload');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b1'$$), 0,
  'CUR-S1: outsider cannot DELETE a block');
RESET ROLE;
SELECT is(pg_temp.b_progress_left(), 1, 'CUR-S1: learner B''s progress row survives the outsider''s DELETE');

SELECT tests.authenticate_as('cur119_lrn_a');
SELECT throws_ok($$INSERT INTO public.blocks (course_id, lesson_id, position, type, payload) VALUES ('11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 9, 'text', '{}')$$,
  '42501', NULL, 'CUR-S1: learner A cannot INSERT a block');
SELECT is(pg_temp.rows_affected($$UPDATE public.blocks SET payload = '{"content": "defaced"}' WHERE id = '11900000-0000-4000-8000-0000000000b1'$$), 0,
  'CUR-S1: learner A cannot UPDATE a block payload');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b1'$$), 0,
  'CUR-S1: learner A cannot DELETE a block');
RESET ROLE;
SELECT is(pg_temp.b_progress_left(), 1, 'CUR-S1: learner B''s progress row survives learner A''s DELETE');

SELECT tests.clear_authentication();
SELECT pg_temp.set_anon();
SELECT throws_ok($$INSERT INTO public.blocks (course_id, lesson_id, position, type, payload) VALUES ('11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 9, 'text', '{}')$$,
  '42501', NULL, 'CUR-S1: anon cannot INSERT a block');
SELECT is(pg_temp.rows_affected($$UPDATE public.blocks SET payload = '{"content": "defaced"}' WHERE id = '11900000-0000-4000-8000-0000000000b1'$$), 0,
  'CUR-S1: anon cannot UPDATE a block payload');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b1'$$), 0,
  'CUR-S1: anon cannot DELETE a block');
RESET ROLE;
SELECT is(pg_temp.b_progress_left(), 1, 'CUR-S1: learner B''s progress row survives anon''s DELETE');

SELECT is((SELECT payload->>'content' FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b1'), 'synthetic text',
  'CUR-S1: block 1 payload unchanged');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE course_id = '11900000-0000-4000-8000-000000000c01'), 2,
  'CUR-S1: course 1 still has exactly its two blocks');

-- ----------------------------------------------------------------------------
-- 5. CUR-S1 — every signed-in persona still reads blocks (4)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('cur119_lrn_a');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE id IN ('11900000-0000-4000-8000-0000000000b1','11900000-0000-4000-8000-0000000000b2','11900000-0000-4000-8000-0000000000b3')), 3,
  'still works: learner A reads blocks');
RESET ROLE;
SELECT tests.authenticate_as('cur119_lrn_b');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE id IN ('11900000-0000-4000-8000-0000000000b1','11900000-0000-4000-8000-0000000000b2','11900000-0000-4000-8000-0000000000b3')), 3,
  'still works: learner B reads blocks');
RESET ROLE;
SELECT tests.authenticate_as('cur119_outsider');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE id IN ('11900000-0000-4000-8000-0000000000b1','11900000-0000-4000-8000-0000000000b2','11900000-0000-4000-8000-0000000000b3')), 3,
  'still works: the outsider reads blocks');
RESET ROLE;
SELECT tests.authenticate_as('cur119_admin');
SELECT is((SELECT count(*)::int FROM public.blocks WHERE id IN ('11900000-0000-4000-8000-0000000000b1','11900000-0000-4000-8000-0000000000b2','11900000-0000-4000-8000-0000000000b3')), 3,
  'still works: the admin reads blocks');

-- ----------------------------------------------------------------------------
-- 6. CUR-S1 — the admin still writes blocks like the lesson editors do (8)
-- ----------------------------------------------------------------------------
SELECT is(pg_temp.insert_returning(
  $$INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload)
    VALUES ('11900000-0000-4000-8000-0000000000b9', '11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 3, 'text', '{"content": "admin"}')
    RETURNING id$$),
  '11900000-0000-4000-8000-0000000000b9'::uuid,
  'admin: INSERT ... RETURNING a block');
SELECT lives_ok($$INSERT INTO public.blocks (course_id, lesson_id, position, type, payload) VALUES ('11900000-0000-4000-8000-000000000c02', '11900000-0000-4000-8000-00000000ee02', 2, 'text', '{}')$$,
  'admin: INSERT a block into course 2');
SELECT is(pg_temp.rows_affected($$UPDATE public.blocks SET payload = '{"content": "admin edit"}' WHERE id = '11900000-0000-4000-8000-0000000000b9'$$), 1,
  'admin: UPDATE a block payload');
SELECT lives_ok($$INSERT INTO public.blocks (id, course_id, lesson_id, position, type, payload)
                  VALUES ('11900000-0000-4000-8000-0000000000b9', '11900000-0000-4000-8000-000000000c01', '11900000-0000-4000-8000-00000000ee01', 4, 'text', '{"content": "upserted"}')
                  ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, payload = EXCLUDED.payload$$,
  'admin: upsert-style save of an existing block');
SELECT is((SELECT payload->>'content' FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b9'), 'upserted',
  'admin: the upsert changed the block');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b9'$$), 1,
  'admin: DELETE a block');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.blocks WHERE id = '11900000-0000-4000-8000-0000000000b3'$$), 1,
  'admin: DELETE a block of course 2');
SELECT is(pg_temp.rows_affected($$DELETE FROM public.quiz_submissions WHERE id = '11900000-0000-4000-8000-0000000000ab'$$), 1,
  'admin: DELETE learner B''s quiz submission');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 7. CUR-S6d — pending_quiz_reviews: closed to signed-in people and anon, open to the service role (4)
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('cur119_lrn_a');
SELECT throws_ok($$SELECT count(*) FROM public.pending_quiz_reviews$$,
  '42501', NULL, 'CUR-S6d: learner A cannot read pending_quiz_reviews');
RESET ROLE;
SELECT tests.authenticate_as('cur119_outsider');
SELECT throws_ok($$SELECT count(*) FROM public.pending_quiz_reviews$$,
  '42501', NULL, 'CUR-S6d: the outsider cannot read pending_quiz_reviews');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT count(*) FROM public.pending_quiz_reviews$$,
  '42501', NULL, 'CUR-S6d: anon cannot read pending_quiz_reviews');
RESET ROLE;
SELECT set_config('role', 'service_role', true);
SELECT is((SELECT count(*)::int FROM public.pending_quiz_reviews WHERE id = '11900000-0000-4000-8000-0000000000aa'), 1,
  'still works: the service role reads learner A''s waiting submission from pending_quiz_reviews');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 8. Catalog: the helper keeps its shape (3)
-- ----------------------------------------------------------------------------
SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = 'public.auth_is_course_teacher(uuid)'::regprocedure),
  'auth_is_course_teacher stays SECURITY DEFINER');
SELECT ok((SELECT 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = 'public.auth_is_course_teacher(uuid)'::regprocedure),
  'auth_is_course_teacher has a pinned search_path');
SELECT ok(has_function_privilege('authenticated', 'public.auth_is_course_teacher(uuid)', 'EXECUTE'),
  'authenticated keeps EXECUTE on auth_is_course_teacher');

SELECT * FROM finish();
ROLLBACK;
