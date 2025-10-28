-- Migration: Backfill total_lessons for existing learning path enrollments
-- Created: 2025-10-07
-- Purpose: Fix existing course_enrollments that have total_lessons = 0

-- Update all enrollments created through learning path assignment
-- that are missing the total_lessons count
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
  AND enrolled_at >= '2025-10-07'  -- Only fix recent learning-path enrollments
RETURNING
    id,
    user_id,
    course_id,
    total_lessons AS fixed_lesson_count;

-- Add a comment explaining this migration
COMMENT ON TABLE course_enrollments IS
'Stores user course enrollments. The total_lessons field should be set during enrollment creation. Migration 018 (2025-10-07) backfilled missing values for learning path enrollments.';
