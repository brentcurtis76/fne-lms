-- Migration 105: Add detected_by column to debug_bugs
-- Date: 2025-11-14
-- Purpose: Track whether bugs were created manually or by the proactive monitoring system
--
-- This migration:
--   1. Adds detected_by column to debug_bugs table
--   2. Sets default value to 'manual'
--   3. Backfills existing records
--   4. Creates index for faster queries

-- =============================================================================
-- ADD COLUMN
-- =============================================================================

-- Add detected_by column with default value
ALTER TABLE debug_bugs
ADD COLUMN IF NOT EXISTS detected_by TEXT NOT NULL DEFAULT 'manual';

-- Add column comment
COMMENT ON COLUMN debug_bugs.detected_by IS
  'Source of bug detection: "manual" for user-reported, "proactive-monitor" for auto-detected';

-- =============================================================================
-- BACKFILL EXISTING DATA
-- =============================================================================

-- Update existing records based on metadata field or title
UPDATE debug_bugs
SET detected_by = 'proactive-monitor'
WHERE (metadata->>'source' = 'proactive-monitor'
   OR title ILIKE '[Auto-detected]%')
AND detected_by = 'manual';

-- =============================================================================
-- CREATE INDEX
-- =============================================================================

-- Create index for filtering bugs by detection source
CREATE INDEX IF NOT EXISTS idx_debug_bugs_detected_by
ON debug_bugs(detected_by);

-- Create composite index for common queries (status + detected_by)
CREATE INDEX IF NOT EXISTS idx_debug_bugs_status_detected_by
ON debug_bugs(status, detected_by);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
DECLARE
  column_exists BOOLEAN;
  index_count INTEGER;
  total_bugs INTEGER;
  auto_detected INTEGER;
  manual INTEGER;
BEGIN
  -- Check if column was added
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'debug_bugs'
    AND column_name = 'detected_by'
  ) INTO column_exists;

  -- Count indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE tablename = 'debug_bugs'
  AND indexname IN ('idx_debug_bugs_detected_by', 'idx_debug_bugs_status_detected_by');

  -- Get bug counts
  SELECT COUNT(*) INTO total_bugs FROM debug_bugs;
  SELECT COUNT(*) INTO auto_detected FROM debug_bugs WHERE detected_by = 'proactive-monitor';
  SELECT COUNT(*) INTO manual FROM debug_bugs WHERE detected_by = 'manual';

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 105 Applied Successfully';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  ✅ Column "detected_by" added: %', column_exists;
  RAISE NOTICE '  ✅ Indexes created: %/2', index_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Statistics:';
  RAISE NOTICE '  Total bugs: %', total_bugs;
  RAISE NOTICE '  Auto-detected: %', auto_detected;
  RAISE NOTICE '  Manual: %', manual;
  RAISE NOTICE '';
  RAISE NOTICE 'Usage Examples:';
  RAISE NOTICE '  -- Get all auto-detected bugs';
  RAISE NOTICE '  SELECT * FROM debug_bugs WHERE detected_by = ''proactive-monitor'';';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Get open bugs by detection source';
  RAISE NOTICE '  SELECT detected_by, COUNT(*) FROM debug_bugs';
  RAISE NOTICE '  WHERE status = ''open'' GROUP BY detected_by;';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
