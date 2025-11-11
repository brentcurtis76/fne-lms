-- Migration 031: Add unique constraint on lesson_progress (user_id, lesson_id, block_id)
--
-- CONTEXT:
-- lesson_progress is a block-level log (not lesson-level)
-- Each lesson can have multiple blocks (e.g., 8 blocks per lesson)
-- Each block completion creates one lesson_progress record
--
-- PROBLEM:
-- No unique constraint on (user_id, lesson_id, block_id) meant:
-- - Frontend upsert without onConflict falls back to PK
-- - Creates duplicate block records on retry
-- - Reports were counting blocks as lessons (inflated counts)
--
-- SOLUTION:
-- 1. Clean up existing duplicates (keep earliest completion)
-- 2. Add unique constraint on natural key (user_id, lesson_id, block_id)
-- 3. Add index for query performance

-- Step 1: Clean up existing duplicates
-- Keep the earliest completion per (user_id, lesson_id, block_id)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, lesson_id, block_id
      ORDER BY
        completed_at ASC NULLS LAST,
        created_at ASC,
        id ASC  -- tie-breaker for identical timestamps
    ) as rn
  FROM lesson_progress
)
DELETE FROM lesson_progress
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 2: Add unique constraint on natural key
-- This ensures each (user, lesson, block) combination has at most one record
ALTER TABLE lesson_progress
ADD CONSTRAINT lesson_progress_user_lesson_block_unique
UNIQUE (user_id, lesson_id, block_id);

-- Step 3: Add index for common query patterns (user + lesson lookups)
-- This improves performance for dashboard and progress queries
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson_lookup
ON lesson_progress(user_id, lesson_id, completed_at)
WHERE completed_at IS NOT NULL;

-- Step 4: Add index for user-specific queries (used heavily in reports)
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_completed
ON lesson_progress(user_id, completed_at)
WHERE completed_at IS NOT NULL;

-- Verification query (optional - run manually to check cleanup)
-- SELECT
--   COUNT(*) as total_records,
--   COUNT(DISTINCT (user_id, lesson_id, block_id)) as unique_combinations,
--   COUNT(*) - COUNT(DISTINCT (user_id, lesson_id, block_id)) as duplicates_removed
-- FROM lesson_progress;
