-- Migration: Batch assign courses to users with atomic transactions
-- Created: 2025-01-24
-- Purpose: Enable efficient bulk course assignment with automatic enrollment creation

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.batch_assign_courses(UUID, UUID[]);
DROP FUNCTION IF EXISTS public.batch_assign_courses(UUID, UUID[], UUID);

-- Create batch assignment function for courses
-- SECURITY FIX: Removed p_assigned_by parameter - now derives caller from auth.uid()
-- This prevents privilege escalation where any user could pass admin UUID
CREATE OR REPLACE FUNCTION public.batch_assign_courses(
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
    v_user_id UUID;
    v_assignment_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_enroll_count INT := 0;
    v_assignments UUID[] := '{}';
    v_total_lessons INT;
BEGIN
    -- SECURITY: Get authenticated caller ID from JWT
    -- This cannot be spoofed by the client
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate course exists
    IF NOT EXISTS (SELECT 1 FROM courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found';
    END IF;

    -- Check caller has permission (not a passed parameter)
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_caller_id
        AND is_active = true
        AND role_type IN ('admin', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign courses';
    END IF;

    -- Get total lessons for this course
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons
    WHERE course_id = p_course_id;

    -- Process user assignments
    IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
        FOREACH v_user_id IN ARRAY p_user_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM course_assignments
                WHERE course_id = p_course_id AND teacher_id = v_user_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;

            -- Verify user exists
            IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
                RAISE EXCEPTION 'User with ID % does not exist', v_user_id;
            END IF;

            -- Create assignment (using authenticated caller ID)
            INSERT INTO course_assignments (course_id, teacher_id, assigned_by, assigned_at)
            VALUES (p_course_id, v_user_id, v_caller_id, NOW())
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- Auto-create or update course enrollment (using authenticated caller ID)
            INSERT INTO course_enrollments (
                course_id,
                user_id,
                enrollment_type,
                enrolled_by,
                enrolled_at,
                status,
                total_lessons
            )
            VALUES (
                p_course_id,
                v_user_id,
                'assigned',
                v_caller_id,
                NOW(),
                'active',
                v_total_lessons
            )
            ON CONFLICT (course_id, user_id) DO UPDATE
            SET
                status = 'active',
                enrollment_type = 'assigned',
                enrolled_by = v_caller_id,
                enrolled_at = NOW(),
                total_lessons = v_total_lessons;

            IF FOUND THEN
                v_enroll_count := v_enroll_count + 1;
            END IF;
        END LOOP;
    END IF;

    -- Return summary with enrollment count
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'enrollments_created', v_enroll_count,
        'assignment_ids', v_assignments,
        'message', format('%s assignment(s) created, %s enrollment(s) created, %s skipped (already assigned)',
                         v_success_count, v_enroll_count, v_skip_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Any error will rollback all assignments and enrollments
        RAISE;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.batch_assign_courses IS
'Assigns courses to multiple users atomically, automatically creating or updating course enrollments. All operations are transactional. Caller authentication is derived from auth.uid() to prevent privilege escalation.';

-- Grant execute permission to authenticated users
-- Function internally validates caller has admin/consultor role
GRANT EXECUTE ON FUNCTION public.batch_assign_courses(UUID, UUID[]) TO authenticated;
