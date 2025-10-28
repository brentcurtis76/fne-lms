-- Migration: Fix enrollment progress trigger
-- Created: 2025-10-07
-- Purpose: Fix trigger logic - blocks table doesn't have is_mandatory column

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS trigger_update_enrollment_progress ON lesson_progress;
DROP FUNCTION IF EXISTS update_course_enrollment_progress();

-- Create FIXED progress update function
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

    -- Count completed lessons
    -- A lesson is complete when ALL its blocks have completed lesson_progress records
    SELECT COUNT(DISTINCT l.id) INTO v_completed_lessons
    FROM lessons l
    WHERE l.course_id = v_course_id
      -- Check that ALL blocks for this lesson are completed
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
'Auto-updates course_enrollments progress when lessons complete. Fixed 2025-10-07 to remove is_mandatory dependency.';
