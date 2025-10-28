-- ============================================================================
-- LEARNING PATH PROGRESS FIX - COMPLETE SOLUTION
-- Date: 2025-10-07
-- Purpose: Fix learning path progress tracking bug
--
-- INSTRUCTIONS:
-- 1. Copy this entire file
-- 2. Open Supabase SQL Editor: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new
-- 3. Paste and run
-- ============================================================================

-- ============================================================================
-- STEP 1: Update batch_assign_learning_path function to set total_lessons
-- ============================================================================

-- Drop existing function
DROP FUNCTION IF EXISTS public.batch_assign_learning_path(UUID, UUID[], UUID[], UUID);

-- Create updated function with total_lessons support
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

            -- Auto-enroll user in all courses with total_lessons
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
                    status,
                    total_lessons
                )
                VALUES (
                    v_course_id,
                    v_user_id,
                    'assigned',
                    p_assigned_by,
                    NOW(),
                    'active',
                    (SELECT COUNT(*) FROM lessons WHERE course_id = v_course_id)
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

            -- Verify group exists
            IF NOT EXISTS (SELECT 1 FROM community_workspaces WHERE id = v_group_id) THEN
                RAISE EXCEPTION 'Group with ID % does not exist', v_group_id;
            END IF;

            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, group_id, assigned_by)
            VALUES (p_path_id, v_group_id, p_assigned_by)
            RETURNING id INTO v_assignment_id;

            v_assignments := array_append(v_assignments, v_assignment_id);
            v_success_count := v_success_count + 1;

            -- Auto-enroll all active group members with total_lessons
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
                        status,
                        total_lessons
                    )
                    VALUES (
                        v_course_id,
                        v_group_member_id,
                        'assigned',
                        p_assigned_by,
                        NOW(),
                        'active',
                        (SELECT COUNT(*) FROM lessons WHERE course_id = v_course_id)
                    )
                    ON CONFLICT (course_id, user_id) DO NOTHING;

                    IF FOUND THEN
                        v_enroll_count := v_enroll_count + 1;
                    END IF;
                END LOOP;
            END LOOP;
        END LOOP;
    END IF;

    -- Return summary
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'enrollments_created', v_enroll_count,
        'assignment_ids', v_assignments,
        'message', format('%s assignment(s) created, %s enrollment(s) created, %s skipped',
                         v_success_count, v_enroll_count, v_skip_count)
    );

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_assign_learning_path(UUID, UUID[], UUID[], UUID) TO authenticated;

COMMENT ON FUNCTION public.batch_assign_learning_path IS
'Assigns learning paths to users/groups, auto-enrolling in courses. Fixed 2025-10-07 to include total_lessons.';

-- ============================================================================
-- STEP 2: Backfill existing enrollments
-- ============================================================================

UPDATE course_enrollments
SET
    total_lessons = (
        SELECT COUNT(*)
        FROM lessons
        WHERE course_id = course_enrollments.course_id
    ),
    updated_at = NOW()
WHERE enrollment_type = 'assigned'
  AND total_lessons = 0
  AND enrolled_at >= '2025-10-07';

-- ============================================================================
-- STEP 3: Add progress update trigger
-- ============================================================================

-- Drop existing if present
DROP TRIGGER IF EXISTS trigger_update_enrollment_progress ON lesson_progress;
DROP FUNCTION IF EXISTS update_course_enrollment_progress();

-- Create progress update function
CREATE OR REPLACE FUNCTION update_course_enrollment_progress()
RETURNS TRIGGER AS $$
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

    -- Count completed lessons (all mandatory blocks done)
    SELECT COUNT(DISTINCT l.id) INTO v_completed_lessons
    FROM lessons l
    WHERE l.course_id = v_course_id
      AND NOT EXISTS (
          SELECT 1
          FROM blocks b
          WHERE b.lesson_id = l.id
            AND b.is_mandatory = true
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
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_enrollment_progress
    AFTER INSERT OR UPDATE OF completed_at
    ON lesson_progress
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL)
    EXECUTE FUNCTION update_course_enrollment_progress();

GRANT EXECUTE ON FUNCTION update_course_enrollment_progress() TO authenticated;

COMMENT ON FUNCTION update_course_enrollment_progress IS
'Auto-updates course_enrollments progress when lessons complete. Created 2025-10-07.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check Tom's enrollments
SELECT
    ce.id,
    ce.user_id,
    p.email,
    c.title AS course_title,
    ce.total_lessons,
    ce.lessons_completed,
    ce.progress_percentage,
    ce.enrolled_at
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
JOIN courses c ON c.id = ce.course_id
WHERE p.email = 'tom@nuevaeducacion.org'
  AND ce.enrollment_type = 'assigned'
ORDER BY ce.enrolled_at DESC;

-- ============================================================================
-- DONE
-- ============================================================================
SELECT
    '✅ All migrations applied successfully!' AS status,
    'Enrollments now have total_lessons set' AS fix_1,
    'Progress will update automatically on lesson completion' AS fix_2;
