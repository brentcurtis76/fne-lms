-- Migration: Auto-enroll users in courses when learning path is assigned
-- Created: 2025-10-07
-- Purpose: Fix bug where users assigned learning paths cannot access courses

-- Drop existing function
DROP FUNCTION IF EXISTS public.batch_assign_learning_path(UUID, UUID[], UUID[], UUID);

-- Create updated function with auto-enrollment
CREATE OR REPLACE FUNCTION public.batch_assign_learning_path(
    p_path_id UUID,
    p_user_ids UUID[],
    p_group_ids UUID[],
    p_assigned_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_group_id UUID;
    v_course_id UUID;
    v_group_member_id UUID;
    v_assignment_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_enroll_count INT := 0;
    v_assignments UUID[] := '{}';
BEGIN
    -- Validate path exists
    IF NOT EXISTS (SELECT 1 FROM learning_paths WHERE id = p_path_id) THEN
        RAISE EXCEPTION 'Learning path not found';
    END IF;

    -- Check permissions
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_assigned_by
        AND is_active = true
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign learning paths';
    END IF;

    -- Process user assignments
    IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
        FOREACH v_user_id IN ARRAY p_user_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM learning_path_assignments
                WHERE path_id = p_path_id AND user_id = v_user_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;

            -- Verify user exists
            IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
                RAISE EXCEPTION 'User with ID % does not exist', v_user_id;
            END IF;

            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
            VALUES (p_path_id, v_user_id, p_assigned_by)
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- NEW: Auto-enroll user in all courses in the learning path
            FOR v_course_id IN
                SELECT course_id
                FROM learning_path_courses
                WHERE learning_path_id = p_path_id
                ORDER BY sequence_order
            LOOP
                INSERT INTO course_enrollments (
                    course_id,
                    user_id,
                    enrollment_type,
                    enrolled_by,
                    enrolled_at,
                    status
                )
                VALUES (
                    v_course_id,
                    v_user_id,
                    'assigned',
                    p_assigned_by,
                    NOW(),
                    'active'
                )
                ON CONFLICT (course_id, user_id) DO NOTHING;

                IF FOUND THEN
                    v_enroll_count := v_enroll_count + 1;
                END IF;
            END LOOP;
        END LOOP;
    END IF;

    -- Process group assignments
    IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
        FOREACH v_group_id IN ARRAY p_group_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM learning_path_assignments
                WHERE path_id = p_path_id AND group_id = v_group_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;

            -- Verify group exists (using community_workspaces table)
            IF NOT EXISTS (SELECT 1 FROM community_workspaces WHERE id = v_group_id) THEN
                RAISE EXCEPTION 'Group with ID % does not exist', v_group_id;
            END IF;

            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, group_id, assigned_by)
            VALUES (p_path_id, v_group_id, p_assigned_by)
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- NEW: Auto-enroll all active group members in all courses
            FOR v_group_member_id IN
                SELECT DISTINCT user_id
                FROM user_roles
                WHERE community_id = v_group_id
                AND is_active = true
            LOOP
                FOR v_course_id IN
                    SELECT course_id
                    FROM learning_path_courses
                    WHERE learning_path_id = p_path_id
                    ORDER BY sequence_order
                LOOP
                    INSERT INTO course_enrollments (
                        course_id,
                        user_id,
                        enrollment_type,
                        enrolled_by,
                        enrolled_at,
                        status
                    )
                    VALUES (
                        v_course_id,
                        v_group_member_id,
                        'assigned',
                        p_assigned_by,
                        NOW(),
                        'active'
                    )
                    ON CONFLICT (course_id, user_id) DO NOTHING;

                    IF FOUND THEN
                        v_enroll_count := v_enroll_count + 1;
                    END IF;
                END LOOP;
            END LOOP;
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
COMMENT ON FUNCTION public.batch_assign_learning_path IS
'Assigns learning paths to users and/or groups, automatically enrolling them in all courses within the path. Updated 2025-10-07 to include auto-enrollment functionality.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.batch_assign_learning_path(UUID, UUID[], UUID[], UUID) TO authenticated;
