-- ============================================================================
-- CRITICAL FIX: Enrollment Progress Trigger
-- Date: 2025-10-07
-- Issue: Original trigger used is_mandatory column that doesn't exist
--
-- INSTRUCTIONS:
-- 1. Copy this entire file
-- 2. Open Supabase SQL Editor
-- 3. Paste and run
-- ============================================================================

-- Drop existing broken trigger
DROP TRIGGER IF EXISTS trigger_update_enrollment_progress ON lesson_progress;
DROP FUNCTION IF EXISTS update_course_enrollment_progress();

-- Create FIXED function (without is_mandatory dependency)
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
'Auto-updates course_enrollments when lessons complete. Fixed 2025-10-07 - removed is_mandatory.';

-- ============================================================================
-- MANUALLY UPDATE TOM'S ENROLLMENT (for immediate fix)
-- ============================================================================

-- Update Tom's "El plan personal en prekinder y kinder (2)" enrollment
-- Tom completed ALL 6 blocks of the 1 lesson, so this should be 100%
UPDATE course_enrollments
SET
    lessons_completed = 1,
    progress_percentage = 100,
    is_completed = true,
    completed_at = NOW(),
    updated_at = NOW()
WHERE user_id = 'ca5efb9a-fac7-4741-b9b9-699694308ae8'
  AND course_id = 'c5fee76b-b0d5-4d44-874b-b7788ade4258';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT
    p.email,
    c.title AS course_title,
    ce.total_lessons,
    ce.lessons_completed,
    ce.progress_percentage,
    ce.is_completed,
    ce.completed_at
FROM course_enrollments ce
JOIN profiles p ON p.id = ce.user_id
JOIN courses c ON c.id = ce.course_id
WHERE p.email = 'tom@nuevaeducacion.org'
  AND ce.enrollment_type = 'assigned'
ORDER BY ce.updated_at DESC;

-- ============================================================================
-- DONE
-- ============================================================================
SELECT
    '✅ Trigger fixed!' AS status,
    'Removed is_mandatory dependency' AS fix_1,
    'Tom enrollment manually updated' AS fix_2,
    'Future completions will auto-update' AS fix_3;
