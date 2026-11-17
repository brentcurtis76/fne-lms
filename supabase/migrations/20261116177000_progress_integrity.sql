-- =============================================================================
-- 20261116177000_progress_integrity.sql — F4b (CUR-S4): a learner's progress
-- follows real content; the enrolment's progress is written by the database only.
--
-- Closes:
--   CUR-S4a: update_course_enrollment_progress() (trigger on lesson_progress) ran
--            with the learner's rights; it now runs with its owner's rights
--            (SECURITY DEFINER, pinned search_path). Body copied verbatim from
--            the baseline: the counting logic is not changed here.
--   CUR-S4b: a learner could set their own enrolment's progress, completion and
--            score directly; direct UPDATEs of course_enrollments are now admin
--            only (one RESTRICTIVE rule; grants and existing rules untouched).
--   CUR-S4c: a learner could mark as done content of courses they do not have,
--            a block under a lesson it is not in, and a quiz never sent; marks
--            now must pass can_mark_block_progress() (two RESTRICTIVE rules).
--   CUR-S4d: a quiz block with no questions (the lesson page's "Continuar")
--            needs no submission to be marked.
--   N56:     lesson_completion_summary could be read, changed and deleted by
--            any signed-in person for anyone; it is now read by its owner and
--            the admin, and written directly by the admin only (one ALTER
--            POLICY of its single rule, three RESTRICTIVE rules).
--
-- Accepted limit (Brent, 13 Nov 2026): reading a text or watching an embedded
-- video stays the learner's own word.
--
-- Statements: one CREATE OR REPLACE of an existing function, one new function,
-- REVOKE / GRANT on those two functions, six CREATE POLICY, one ALTER POLICY.
-- Additive only. Existing marks are not re-checked.
-- =============================================================================

-- CUR-S4a ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_course_enrollment_progress() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
DECLARE
    v_course_id UUID;
    v_total_lessons INT;
    v_completed_lessons INT;
    v_progress_pct NUMERIC;
BEGIN
    -- Get course_id for this lesson
    SELECT course_id INTO v_course_id
    FROM lessons
    WHERE id = NEW.lesson_id;

    IF v_course_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count total lessons
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons
    WHERE course_id = v_course_id;

    -- Count completed lessons
    -- A lesson is complete when ALL its blocks have completed lesson_progress records
    SELECT COUNT(DISTINCT l.id) INTO v_completed_lessons
    FROM lessons l
    WHERE l.course_id = v_course_id
      -- All blocks must be completed
      AND NOT EXISTS (
          SELECT 1
          FROM blocks b
          WHERE b.lesson_id = l.id
            AND NOT EXISTS (
                SELECT 1
                FROM lesson_progress lp
                WHERE lp.lesson_id = l.id
                  AND lp.block_id = b.id
                  AND lp.user_id = NEW.user_id
                  AND lp.completed_at IS NOT NULL
            )
      );

    -- Calculate progress
    IF v_total_lessons > 0 THEN
        v_progress_pct := ROUND((v_completed_lessons::NUMERIC / v_total_lessons * 100), 2);
    ELSE
        v_progress_pct := 0;
    END IF;

    -- Update enrollment
    UPDATE course_enrollments
    SET
        lessons_completed = v_completed_lessons,
        progress_percentage = v_progress_pct,
        is_completed = (v_progress_pct >= 100),
        completed_at = CASE
            WHEN v_progress_pct >= 100 AND completed_at IS NULL
            THEN NOW()
            ELSE completed_at
        END,
        updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND course_id = v_course_id;

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.update_course_enrollment_progress() FROM PUBLIC, anon, authenticated;

-- CUR-S4b ---------------------------------------------------------------------
-- After the function above: the progress trigger now writes with its owner's
-- rights, so the learner's own direct UPDATE can be closed.
CREATE POLICY "course_enrollments_direct_update_admin_only" ON public.course_enrollments
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

-- CUR-S4c ---------------------------------------------------------------------
-- Types (checked against the schema): lesson_progress.user_id / lesson_id /
-- block_id uuid NOT NULL; blocks.id / lesson_id uuid, blocks.type text ('quiz');
-- quiz_submissions.lesson_id uuid, block_id text (stored as blocks.id::text by
-- submit_quiz), student_id uuid.
CREATE OR REPLACE FUNCTION public.can_mark_block_progress(p_user uuid, p_lesson uuid, p_block uuid)
  RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_type text;
  v_payload jsonb;
  v_course uuid;
BEGIN
  IF p_user IS NULL OR p_lesson IS NULL OR p_block IS NULL OR p_user IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  SELECT b.type, b.payload INTO v_type, v_payload FROM blocks b WHERE b.id = p_block AND b.lesson_id = p_lesson;
  IF NOT FOUND THEN RETURN false; END IF;                       -- the block is not in that lesson
  SELECT COALESCE(m.course_id, l.course_id) INTO v_course
    FROM lessons l LEFT JOIN modules m ON m.id = l.module_id WHERE l.id = p_lesson;
  IF v_course IS NULL THEN RETURN false; END IF;
  IF NOT (auth_is_course_student(v_course) OR auth_is_learning_path_member(v_course)) THEN
    RETURN false;                                               -- not a course this person has
  END IF;
  -- CUR-S4d: a quiz with no questions is marked by the page's "Continuar"
  -- without a submission (StudentBlockRenderer.tsx:535-550).
  IF v_type = 'quiz'
     AND jsonb_typeof(v_payload->'questions') = 'array' AND jsonb_array_length(v_payload->'questions') > 0
     AND NOT EXISTS (
       SELECT 1 FROM quiz_submissions qs
       WHERE qs.student_id = p_user AND qs.lesson_id = p_lesson AND qs.block_id = p_block::text) THEN
    RETURN false;                                               -- a quiz counts only once it was sent
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.can_mark_block_progress(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mark_block_progress(uuid, uuid, uuid) TO authenticated, service_role;

CREATE POLICY "lesson_progress_insert_real_content" ON public.lesson_progress
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_admin() OR public.can_mark_block_progress(user_id, lesson_id, block_id));
CREATE POLICY "lesson_progress_update_real_content" ON public.lesson_progress
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.auth_is_admin() OR user_id = auth.uid())
  WITH CHECK (public.auth_is_admin() OR public.can_mark_block_progress(user_id, lesson_id, block_id));

-- N56 -------------------------------------------------------------------------
-- lesson_completion_summary has one rule, "System updates lesson summary"
-- (baseline, FOR ALL TO public, USING (true) WITH CHECK (true)). No function or
-- trigger writes the table; no screen reads or writes it; two report views read
-- it with their owner's rights (not touched). anon holds no grant since
-- 20261006180000_urgent_anonymous_boundaries.sql.
ALTER POLICY "System updates lesson summary" ON public.lesson_completion_summary
  USING (user_id = auth.uid() OR public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());
CREATE POLICY "lesson_completion_summary_direct_insert_admin_only" ON public.lesson_completion_summary
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.auth_is_admin());
CREATE POLICY "lesson_completion_summary_direct_update_admin_only" ON public.lesson_completion_summary
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "lesson_completion_summary_direct_delete_admin_only" ON public.lesson_completion_summary
  AS RESTRICTIVE FOR DELETE TO authenticated USING (public.auth_is_admin());
