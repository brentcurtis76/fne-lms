-- Migration: Fix batch_unassign_courses to preserve full course access
-- Created: 2025-01-XX
-- Purpose: Remove enrollment status update so users retain course access after unassignment
--
-- CRITICAL FIX: The previous version set status='dropped' which:
-- 1. Blocked access to course assignments (userAssignments.ts filters by status='active')
-- 2. Left the course in a "limbo" state (visible in Mis Cursos but not functional)
--
-- This version ONLY removes the course_assignments row, leaving course_enrollments untouched.
-- Result: User retains full course access + progress after admin unassignment.

-- Drop and recreate the function without the enrollment status update
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

COMMENT ON FUNCTION public.batch_unassign_courses IS
'Removes course assignment records without affecting enrollment status. Users retain course access and progress after unassignment. Caller authentication is derived from auth.uid() to prevent privilege escalation.';

GRANT EXECUTE ON FUNCTION public.batch_unassign_courses(UUID, UUID[]) TO authenticated;
