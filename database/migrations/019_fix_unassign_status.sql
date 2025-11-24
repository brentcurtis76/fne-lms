-- Migration: Fix unassign status to satisfy course_enrollments_status_check
-- Created: 2025-01-25
-- Purpose: Align batch_unassign_courses with allowed enrollment statuses (no "inactive")

-- Drop and recreate the function with status set to 'dropped'
DROP FUNCTION IF EXISTS public.batch_unassign_courses(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.batch_unassign_courses(
    p_course_id UUID,
    p_user_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- Delete course assignments (atomic with enrollment updates below)
    DELETE FROM course_assignments
    WHERE course_id = p_course_id
    AND teacher_id = ANY(p_user_ids);

    GET DIAGNOSTICS v_unassigned_count = ROW_COUNT;

    -- Update enrollments to an allowed status ('dropped')
    -- Only update those with enrollment_type 'assigned' to avoid affecting self-enrolled users
    UPDATE course_enrollments
    SET status = 'dropped',
        updated_at = NOW()
    WHERE course_id = p_course_id
    AND user_id = ANY(p_user_ids)
    AND enrollment_type = 'assigned';

    -- Return summary
    RETURN json_build_object(
        'success', true,
        'unassigned_count', v_unassigned_count,
        'message', format('%s assignment(s) removed', v_unassigned_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Any error will rollback both deletions and updates
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.batch_unassign_courses IS
'Unassigns courses from multiple users atomically, updating enrollment status to an allowed value (dropped). Caller authentication is derived from auth.uid() to prevent privilege escalation.';

GRANT EXECUTE ON FUNCTION public.batch_unassign_courses(UUID, UUID[]) TO authenticated;
