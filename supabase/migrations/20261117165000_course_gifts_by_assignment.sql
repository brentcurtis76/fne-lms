-- =============================================================================
-- 20261117165000_course_gifts_by_assignment.sql — GENERA fixes F7c, item N40.
--
-- Owner's decision (17 Nov 2026, N40): a consultor gives courses only to people
-- of the schools (generations, communities, people) they are assigned to — the
-- rule used for quiz reviews (lib/quiz-reviews/review-scope.ts) — counted only
-- while the assignment is current: is_active, started (starts_at null or not in
-- the future) and not ended (ends_at null or in the future). Taking a course
-- away follows the same rule. Admins are unchanged.
--
--   1. public.auth_consultor_covers_user(uuid): yes/no about the caller only.
--   2. public.batch_assign_courses and public.batch_unassign_courses: their
--      current bodies, byte for byte, plus ONE added rule — a caller with no
--      active admin role must cover every recipient, checked before anything is
--      written; otherwise 42501 'Recipient not covered by the caller''s
--      assignments' and the whole call is undone.
--   3. Neither function is executable by anon any more (PUBLIC's default
--      EXECUTE is revoked too, otherwise anon would keep it through PUBLIC);
--      authenticated and service_role keep it.
-- Additive: no table, row or earlier migration is changed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The coverage helper
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.auth_consultor_covers_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_user_id IS NOT NULL
     AND EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role_type = 'consultor'::public.user_role_type
              AND ur.is_active IS TRUE)
     AND EXISTS (
           SELECT 1 FROM public.consultant_assignments ca
            WHERE ca.consultant_id = auth.uid()
              AND ca.is_active IS TRUE
              AND (ca.starts_at IS NULL OR ca.starts_at <= now())
              AND (ca.ends_at IS NULL OR ca.ends_at > now())
              AND CASE COALESCE(NULLIF(ca.assignment_data->>'assignment_scope', ''), 'individual')
                    WHEN 'individual' THEN ca.student_id IS NOT NULL AND ca.student_id = p_user_id
                    WHEN 'school' THEN ca.school_id IS NOT NULL AND EXISTS (
                           SELECT 1 FROM public.user_roles r
                            WHERE r.user_id = p_user_id AND r.is_active IS TRUE
                              AND r.school_id = ca.school_id)
                    WHEN 'generation' THEN ca.generation_id IS NOT NULL AND EXISTS (
                           SELECT 1 FROM public.user_roles r
                            WHERE r.user_id = p_user_id AND r.is_active IS TRUE
                              AND r.generation_id = ca.generation_id)
                    WHEN 'community' THEN ca.community_id IS NOT NULL AND EXISTS (
                           SELECT 1 FROM public.user_roles r
                            WHERE r.user_id = p_user_id AND r.is_active IS TRUE
                              AND r.community_id = ca.community_id)
                    ELSE false
                  END);
$$;

COMMENT ON FUNCTION public.auth_consultor_covers_user(uuid) IS
  'F7c N40 (17 Nov 2026): true when the caller holds an active consultor role and a current '
  '(is_active, started: starts_at null or not future, not ended: ends_at null or future) consultant_assignments row covering that person: scope '
  'individual (assignment_data.assignment_scope absent or empty) -> student_id; school / generation / '
  'community -> the person has an active user_roles row there (the four scopes of '
  'lib/quiz-reviews/review-scope.ts). Answers only about the caller.';

REVOKE ALL ON FUNCTION public.auth_consultor_covers_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_consultor_covers_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_consultor_covers_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_consultor_covers_user(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2a. batch_assign_courses: current body (20260908180500_c2_course_entitlement.sql)
--     plus the coverage rule, before the recipient loop writes anything.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.batch_assign_courses(p_course_id uuid, p_user_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_user_id uuid;
    v_assignment_id uuid;
    v_assignment_status text;
    v_origin text;
    v_existing_assignment boolean;
    v_existing_enrollment boolean;
    v_success_count int := 0;
    v_skip_count int := 0;
    v_enroll_count int := 0;
    v_promoted_count int := 0;
    v_unchanged_count int := 0;
    v_assignments uuid[] := '{}';
    v_new_users uuid[] := '{}';
    v_total_lessons int;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller_id AND is_active = true
           AND role_type IN ('admin', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign courses';
    END IF;
    IF NOT public.password_change_gate_ok() THEN
        RAISE EXCEPTION 'Password change required' USING ERRCODE = '42501';
    END IF;
    -- F7c N40: a caller without an active admin role may give the course only
    -- to people covered by their current assignments; checked before any write.
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller_id AND is_active = true
           AND role_type = 'admin'
    ) AND EXISTS (
        SELECT 1 FROM unnest(p_user_ids) u
         WHERE NOT COALESCE(public.auth_consultor_covers_user(u), false)
    ) THEN
        RAISE EXCEPTION 'Recipient not covered by the caller''s assignments' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found';
    END IF;
    SELECT count(*) INTO v_total_lessons FROM public.lessons WHERE course_id = p_course_id;

    -- Deduplicate and order recipients: overlapping calls take assignment row
    -- locks in the same order. ON CONFLICT closes the absent-row race; the next
    -- statement sees the winner at READ COMMITTED. Any error rolls back ALL
    -- recipients, including their assignments, enrollments and result counts.
    FOR v_user_id IN SELECT DISTINCT u FROM unnest(p_user_ids) u ORDER BY u
    LOOP
        IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
            RAISE EXCEPTION 'Recipient does not exist';
        END IF;
        v_assignment_id := NULL;
        INSERT INTO public.course_assignments (course_id, teacher_id, assigned_by, assigned_at)
        VALUES (p_course_id, v_user_id, v_caller_id, now())
        ON CONFLICT (course_id, teacher_id) DO NOTHING
        RETURNING id INTO v_assignment_id;
        v_existing_assignment := v_assignment_id IS NULL;
        IF v_existing_assignment THEN
            SELECT id, status INTO STRICT v_assignment_id, v_assignment_status
              FROM public.course_assignments
             WHERE course_id = p_course_id AND teacher_id = v_user_id FOR UPDATE;
            v_skip_count := v_skip_count + 1;
        ELSE
            v_assignment_status := 'active';
            v_success_count := v_success_count + 1;
            v_assignments := array_append(v_assignments, v_assignment_id);
            v_new_users := array_append(v_new_users, v_user_id);
        END IF;

        -- Always ensure the enrollment, including the formerly early-skipped
        -- existing-assignment case. Conflict never overwrites identity, origin,
        -- enrollment time, progress, completion or certificate history.
        INSERT INTO public.course_enrollments (
            course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status,
            total_lessons, access_origin, source_path_id, access_origin_set_at
        ) VALUES (
            p_course_id, v_user_id, 'assigned', v_caller_id, now(), 'active',
            v_total_lessons, 'independent', NULL, now()
        ) ON CONFLICT (course_id, user_id) DO NOTHING;
        v_existing_enrollment := NOT FOUND;
        IF NOT v_existing_enrollment THEN
            v_enroll_count := v_enroll_count + 1;
        ELSE
            SELECT access_origin INTO STRICT v_origin FROM public.course_enrollments
             WHERE course_id = p_course_id AND user_id = v_user_id FOR UPDATE;
            IF v_origin = 'learning_path'
               AND (NOT v_existing_assignment OR v_assignment_status = 'cancelled') THEN
                v_promoted_count := v_promoted_count + 1;
            ELSE
                v_unchanged_count := v_unchanged_count + 1;
            END IF;
            UPDATE public.course_enrollments SET status = 'active', total_lessons = v_total_lessons
             WHERE course_id = p_course_id AND user_id = v_user_id
               AND (status IS DISTINCT FROM 'active' OR total_lessons IS DISTINCT FROM v_total_lessons);
        END IF;
        -- An explicit regrant reactivates a cancelled source, preserving its
        -- assignment identity, actor and learning history.
        IF v_assignment_status = 'cancelled' THEN
            UPDATE public.course_assignments SET status = 'active' WHERE id = v_assignment_id;
        END IF;
    END LOOP;
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'enrollments_created', v_enroll_count,
        'enrollments_promoted', v_promoted_count,
        'enrollments_unchanged', v_unchanged_count,
        'assignment_ids', v_assignments,
        'newly_assigned_user_ids', v_new_users,
        'message', format('%s assignment(s) created, %s existing; %s enrollment(s) created, %s independent entitlement(s) promoted, %s unchanged',
                         v_success_count, v_skip_count, v_enroll_count, v_promoted_count, v_unchanged_count)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2b. batch_unassign_courses: current body (00000000000000_baseline.sql) plus the
--     coverage rule, before the DELETE.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.batch_unassign_courses(p_course_id uuid, p_user_ids uuid[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_caller_id UUID;
    v_unassigned_count INT := 0;
BEGIN
    -- SECURITY: Get authenticated caller ID from JWT
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check caller has permission
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_caller_id
        AND is_active = true
        AND role_type IN ('admin', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to unassign courses';
    END IF;

    -- Validate course exists
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    -- Validate user IDs provided
    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) = 0 THEN
        RAISE EXCEPTION 'At least one user ID must be provided';
    END IF;

    -- F7c N40: a caller without an active admin role may take the course only
    -- from people covered by their current assignments; checked before any write.
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller_id AND is_active = true
           AND role_type = 'admin'
    ) AND EXISTS (
        SELECT 1 FROM unnest(p_user_ids) u
         WHERE NOT COALESCE(public.auth_consultor_covers_user(u), false)
    ) THEN
        RAISE EXCEPTION 'Recipient not covered by the caller''s assignments' USING ERRCODE = '42501';
    END IF;

    -- Delete course assignments ONLY
    -- DO NOT touch course_enrollments - this preserves:
    -- 1. Course visibility in "Mis Cursos"
    -- 2. Active status for assignment submission
    -- 3. All lesson_progress data
    DELETE FROM course_assignments
    WHERE course_id = p_course_id
    AND teacher_id = ANY(p_user_ids);

    GET DIAGNOSTICS v_unassigned_count = ROW_COUNT;

    -- NOTE: Enrollment status is intentionally NOT updated
    -- The user retains their enrollment and all progress
    -- Re-assignment will use ON CONFLICT to update existing enrollment

    -- Return summary
    RETURN json_build_object(
        'success', true,
        'unassigned_count', v_unassigned_count,
        'message', format('%s assignment(s) removed (enrollment preserved)', v_unassigned_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. No anon execution (PUBLIC's default EXECUTE included); authenticated and
--    service_role keep it.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.batch_assign_courses(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_assign_courses(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_assign_courses(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_assign_courses(uuid, uuid[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.batch_unassign_courses(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_unassign_courses(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_unassign_courses(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_unassign_courses(uuid, uuid[]) TO service_role;
