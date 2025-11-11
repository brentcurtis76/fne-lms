-- Migration 032: Add NOT NULL constraints to lesson_progress
--
-- CONTEXT:
-- Migration 031 deployed without NOT NULL constraints
-- This migration adds them as a proper forward migration
-- Fixes schema drift from incorrectly editing 031 post-deployment
--
-- BACKGROUND:
-- lesson_progress table uses (user_id, lesson_id, block_id) as natural key
-- Migration 031 added UNIQUE constraint but without NOT NULL
-- PostgreSQL treats NULL as distinct, allowing NULL duplicates:
--   (user_id=1, lesson_id=NULL, block_id=5) could exist multiple times
--
-- SOLUTION:
-- Add NOT NULL constraints to complete the natural key integrity

-- Add NOT NULL constraints on natural key columns
ALTER TABLE lesson_progress
ALTER COLUMN user_id SET NOT NULL,
ALTER COLUMN lesson_id SET NOT NULL,
ALTER COLUMN block_id SET NOT NULL;

-- Verification query (optional - run manually to check constraints)
-- SELECT column_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'lesson_progress'
--   AND column_name IN ('user_id', 'lesson_id', 'block_id')
-- ORDER BY column_name;
-- Expected: all should show is_nullable = 'NO'
