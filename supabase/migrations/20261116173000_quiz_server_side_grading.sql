-- =============================================================================
-- F5 — Cursos: quiz scores a learner can forge.
--
-- Closes:
--   CUR-S2a submit_quiz scored the copy of the quiz the browser sends and never
--           checked that the lesson, block and course belong together or that
--           the caller has the course; it now scores the quiz stored in the
--           lesson's block (p_quiz_data is ignored) and accepts only a real quiz
--           block of the lesson named, of the course named, from someone who
--           has that course (or from backend code).
--   CUR-S2b a learner's own session could insert, update and delete their own
--           quiz results (grading fields included) and set review status and
--           reviewer through grade_quiz_feedback; direct writes on
--           quiz_submissions are now admin-only and grade_quiz_feedback is no
--           longer executable by PUBLIC, anon or authenticated.
--
-- Accepted limit (Brent, 13 Nov 2026): the right answers of a quiz stay readable
-- by a signed-in learner (they are part of the lesson content the page loads).
-- A learner can still look answers up, but can no longer invent a score.
--
-- Statements: one CREATE OR REPLACE FUNCTION (same signature, return type,
-- language, SECURITY DEFINER and search_path as 20260908180200), its REVOKE /
-- GRANT repeated as there, one COMMENT ON FUNCTION, three CREATE POLICY ... AS
-- RESTRICTIVE on public.quiz_submissions and one REVOKE on
-- public.grade_quiz_feedback. Additive only; RLS stays enabled.
-- =============================================================================

-- CUR-S2a
CREATE OR REPLACE FUNCTION public.submit_quiz(
  p_lesson_id uuid,
  p_block_id text,
  p_student_id uuid,
  p_course_id uuid,
  p_answers jsonb,
  p_quiz_data jsonb,
  p_time_spent integer DEFAULT NULL::integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_submission_id UUID;
  v_auto_score INTEGER := 0;
  v_total_points INTEGER := 0;
  v_auto_points INTEGER := 0;
  v_manual_points INTEGER := 0;
  v_open_responses JSONB := '[]'::jsonb;
  v_question JSONB;
  v_answer JSONB;
  v_correct_answer TEXT;
  v_payload JSONB;
  v_block_type TEXT;
  v_block_lesson UUID;
  v_course UUID;
BEGIN
  -- Actor boundary (D-RLS-02): an end user may only submit as themselves.
  IF auth.uid() IS NOT NULL THEN
    IF p_student_id IS NULL OR p_student_id <> auth.uid() THEN
      RAISE EXCEPTION 'Caller-supplied student does not match the authenticated user' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'p_student_id is required' USING ERRCODE = '22023';
  END IF;

  -- CUR-S2a: the quiz is the one stored in the lesson's block, never the
  -- browser's copy (p_quiz_data is not read).
  SELECT b.payload, b.type, b.lesson_id INTO v_payload, v_block_type, v_block_lesson
    FROM public.blocks b WHERE b.id::text = p_block_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz block not found' USING ERRCODE = '22023';
  END IF;
  IF v_block_type IS DISTINCT FROM 'quiz' THEN
    RAISE EXCEPTION 'Block is not a quiz' USING ERRCODE = '22023';
  END IF;
  IF v_block_lesson IS DISTINCT FROM p_lesson_id THEN
    RAISE EXCEPTION 'Quiz does not belong to that lesson' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(m.course_id, l.course_id) INTO v_course
    FROM public.lessons l LEFT JOIN public.modules m ON m.id = l.module_id WHERE l.id = p_lesson_id;
  IF v_course IS NULL OR v_course IS DISTINCT FROM p_course_id THEN
    RAISE EXCEPTION 'Lesson does not belong to that course' USING ERRCODE = '22023';
  END IF;

  -- An end user must have the course (the same people the lesson read rules admit).
  IF auth.uid() IS NOT NULL
     AND NOT (public.auth_is_admin()
              OR public.auth_is_course_student(v_course)
              OR public.auth_is_learning_path_member(v_course)) THEN
    RAISE EXCEPTION 'No access to this course' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_payload->'questions') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Quiz has no questions' USING ERRCODE = '22023';
  END IF;

  -- Calculate scores
  FOR v_question IN SELECT * FROM jsonb_array_elements(v_payload->'questions')
  LOOP
    v_total_points := v_total_points + (v_question->>'points')::INTEGER;

    -- Get the student's answer for this question
    v_answer := p_answers->(v_question->>'id');

    IF v_question->>'type' = 'open-ended' THEN
      -- Track manual points and collect open responses
      v_manual_points := v_manual_points + (v_question->>'points')::INTEGER;
      v_open_responses := v_open_responses || jsonb_build_object(
        'question_id', v_question->>'id',
        'question', v_question->>'question',
        'response', v_answer->>'text',
        'points', (v_question->>'points')::INTEGER,
        'expectedAnswer', v_question->>'expectedAnswer',
        'gradingGuidelines', v_question->>'gradingGuidelines'
      );
    ELSE
      -- Auto-gradable question
      v_auto_points := v_auto_points + (v_question->>'points')::INTEGER;

      -- Check if answer is correct
      IF v_question->>'type' = 'multiple-choice' THEN
        -- Find the correct option
        SELECT o->>'id' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') o
        WHERE (o->>'isCorrect')::boolean = true
        LIMIT 1;

        IF v_answer->>'selectedOption' = v_correct_answer THEN
          v_auto_score := v_auto_score + (v_question->>'points')::INTEGER;
        END IF;
      ELSIF v_question->>'type' = 'true-false' THEN
        -- Similar logic for true/false
        SELECT o->>'id' INTO v_correct_answer
        FROM jsonb_array_elements(v_question->'options') o
        WHERE (o->>'isCorrect')::boolean = true
        LIMIT 1;

        IF v_answer->>'selectedOption' = v_correct_answer THEN
          v_auto_score := v_auto_score + (v_question->>'points')::INTEGER;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Insert the submission
  INSERT INTO quiz_submissions (
    lesson_id,
    block_id,
    student_id,
    course_id,
    auto_graded_score,
    manual_graded_score,
    total_possible_points,
    auto_gradable_points,
    manual_gradable_points,
    grading_status,
    answers,
    open_responses,
    time_spent
  ) VALUES (
    p_lesson_id,
    p_block_id,
    p_student_id,
    p_course_id,
    v_auto_score,
    0, -- Manual score starts at 0
    v_total_points,
    v_auto_points,
    v_manual_points,
    CASE WHEN v_manual_points > 0 THEN 'pending_review' ELSE 'completed' END,
    p_answers,
    CASE WHEN v_manual_points > 0 THEN v_open_responses ELSE NULL END,
    p_time_spent
  )
  RETURNING id INTO v_submission_id;

  RETURN v_submission_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) TO service_role;

COMMENT ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) IS
  'F5 / CUR-S2a (2026-11-16): scores the quiz stored in public.blocks for p_block_id; p_quiz_data is ignored (kept only so callers need not change). Accepts only a quiz block of p_lesson_id, a lesson of p_course_id, and an end user who has that course (admin, course student or learning-path member); backend callers skip the course check. Submitting as anyone but oneself stays refused.';

-- CUR-S2b
CREATE POLICY "quiz_submissions_direct_insert_admin_only" ON public.quiz_submissions
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.auth_is_admin());
CREATE POLICY "quiz_submissions_direct_update_admin_only" ON public.quiz_submissions
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "quiz_submissions_direct_delete_admin_only" ON public.quiz_submissions
  AS RESTRICTIVE FOR DELETE TO authenticated USING (public.auth_is_admin());
REVOKE ALL ON FUNCTION public.grade_quiz_feedback(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
