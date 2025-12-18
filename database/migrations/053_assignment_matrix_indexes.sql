-- Migration: Add indexes for Assignment Matrix performance
-- Created: 2025-01-XX
-- Purpose: Optimize queries for overlap detection and assignment aggregation

-- Index for efficient user+course enrollment lookups
-- Used by user-assignments API to get all enrollments for a user
CREATE INDEX IF NOT EXISTS idx_ce_user_course
ON course_enrollments(user_id, course_id);

-- Index for learning path assignments by user
-- Used to determine LP source for courses
-- Partial index excludes NULL user_id (group assignments)
CREATE INDEX IF NOT EXISTS idx_lpa_user_path
ON learning_path_assignments(user_id, path_id)
WHERE user_id IS NOT NULL;

-- Index for learning path course membership
-- Used to find which courses belong to which LPs for overlap detection
CREATE INDEX IF NOT EXISTS idx_lpc_path_course
ON learning_path_courses(learning_path_id, course_id);

-- Index for course assignments by user (for direct assignment detection)
-- teacher_id is the assigned user in course_assignments table
CREATE INDEX IF NOT EXISTS idx_ca_teacher_course
ON course_assignments(teacher_id, course_id);

-- Comment explaining the indexes
COMMENT ON INDEX idx_ce_user_course IS 'Optimizes enrollment lookups by user for Assignment Matrix';
COMMENT ON INDEX idx_lpa_user_path IS 'Optimizes LP assignment lookups for source attribution';
COMMENT ON INDEX idx_lpc_path_course IS 'Optimizes course membership lookups for overlap detection';
COMMENT ON INDEX idx_ca_teacher_course IS 'Optimizes direct assignment detection by user';
