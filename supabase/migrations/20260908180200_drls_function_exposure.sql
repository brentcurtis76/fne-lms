-- =============================================================================
-- 20260907120200_drls_function_exposure.sql — D-RLS-01 confirmed corrections
--
-- The release protocol (docs/reviews/santa-marta-release-protocol-2026-08-25.md
-- §9) deferred three research units on the broader function EXECUTE surface.
-- D-RLS-01 named five non-learning functions to re-inventory against current
-- main: has_transformation_access, get_available_assignment_templates,
-- cleanup_propuesta_rate_limits, has_global_workspace_access, submit_quiz.
-- That re-inventory was done at base 92df72a6 (callers, dependent policies,
-- privileges — recorded in docs/planning/reviews/fase-rls-remediation-
-- review-request.md) and this migration applies only the MECHANICAL
-- corrections whose intended behaviour is established:
--
--   * Postgres grants EXECUTE to PUBLIC by default and the baseline never
--     revoked it, so every role — including roles that do not exist yet —
--     could execute these functions. PUBLIC is revoked on all five and the
--     grants are restated by name.
--   * anon is revoked on all five: none is reachable from an anonymous
--     surface (the transformation and meeting policies that call the two
--     has_* helpers target authenticated, quiz submission requires a
--     session, the templates lookup has no caller, the rate-limit cleanup
--     is a maintenance action).
--   * authenticated is revoked on cleanup_propuesta_rate_limits: it is a
--     plain (non-definer) maintenance DELETE with no application caller, and
--     after W-B10a-01 the application roles hold no privilege on the table
--     it touches. service_role keeps EXECUTE.
--   * Four of the five ran with a mutable search_path (the fifth,
--     cleanup_propuesta_rate_limits, is language sql and also gains one).
--     ALTER FUNCTION … SET search_path pins it without touching a body.
--
-- What this migration deliberately does NOT do (D-RLS-02, deferred by the
-- protocol and dependent on a separate decision): redesign the actor
-- handling of has_global_workspace_access(check_user_id) and
-- submit_quiz(p_student_id), both of which still accept a caller-supplied
-- user id. The open question is recorded in the review request.
-- Additive only: no DROP, no TRUNCATE, no destructive ALTER.
--
-- pgTAP evidence: supabase/tests/072-drls-function-exposure.sql.
-- =============================================================================

ALTER FUNCTION public.has_transformation_access(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.has_transformation_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_transformation_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_transformation_access(uuid) TO service_role;

ALTER FUNCTION public.get_available_assignment_templates(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_available_assignment_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_assignment_templates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_assignment_templates(uuid) TO service_role;

ALTER FUNCTION public.cleanup_propuesta_rate_limits() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.cleanup_propuesta_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_propuesta_rate_limits() TO service_role;

ALTER FUNCTION public.has_global_workspace_access(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.has_global_workspace_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_global_workspace_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_global_workspace_access(uuid) TO service_role;

ALTER FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer) TO service_role;

-- -----------------------------------------------------------------------------
-- D-RLS-02 actor corrections (review R1 correction round, 2026-09-07).
-- Grants alone cannot close these two: authenticated must keep EXECUTE, so the
-- bodies now bind the caller-supplied id to the authenticated identity.
-- -----------------------------------------------------------------------------

-- TRUE only for a caller without an end-user identity that is a backend
-- principal: no JWT at all (a direct database session such as a seed script)
-- or a service_role JWT. anon carries the 'anon' role claim and is refused;
-- an authenticated user always has auth.uid() and never reaches this branch.
CREATE OR REPLACE FUNCTION public.auth_is_backend_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NULL
     AND coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           'service_role'
         ) = 'service_role';
$$;

COMMENT ON FUNCTION public.auth_is_backend_caller() IS
  'D-RLS-02 helper: TRUE when there is no end-user identity (auth.uid() IS NULL) and the request is a backend principal (no JWT, or a service_role JWT). Used to admit seed/maintenance callers to actor-bound functions without letting an end user impersonate another.';

REVOKE ALL ON FUNCTION public.auth_is_backend_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_backend_caller() TO authenticated, service_role;

-- submit_quiz: the submission's student is the authenticated user. The
-- browser callers (lib/services/quizSubmissions.js via QuizTaker /
-- LearningQuizTaker) pass the signed-in user's own id, so they are unaffected;
-- a p_student_id naming anyone else is refused before any write. The QA seed
-- scripts (scripts/seed-qa-phase2*.js) run with the service-role key and no
-- end-user identity; they keep working through the explicit backend branch.
-- Body otherwise identical to the baseline (scoring and insert unchanged).
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

  -- Calculate scores
  FOR v_question IN SELECT * FROM jsonb_array_elements(p_quiz_data->'questions')
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

-- has_global_workspace_access: answers about the caller (the three
-- community_meetings policies pass auth.uid()), about anyone for a literal
-- admin, and about anyone for a backend principal; for any other user id it
-- answers FALSE instead of disclosing another user's staff status.
CREATE OR REPLACE FUNCTION public.has_global_workspace_access(check_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF check_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF auth.uid() IS NOT NULL THEN
    IF check_user_id <> auth.uid() AND NOT public.auth_is_admin() THEN
      RETURN false;
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = check_user_id
      AND role_type IN ('admin', 'consultor')
      AND is_active = true
  );
END;
$function$;

-- Grants on both functions were tightened above (PUBLIC/anon revoked,
-- authenticated + service_role keep EXECUTE); CREATE OR REPLACE preserves them.
