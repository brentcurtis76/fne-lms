-- ============================================================
-- 060_remove_indicator_question.sql
-- Removes 'question' field from assessment_indicators table
--
-- Purpose: The team decided to design the rubric (expectations)
-- before creating user-facing questions. This migration removes
-- the question field that was added in migration 056.
-- ============================================================

-- Remove question column from assessment_indicators
ALTER TABLE assessment_indicators
DROP COLUMN IF EXISTS question;

-- Verify the change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_indicators'
    AND column_name = 'question'
  ) THEN
    RAISE NOTICE 'Successfully removed question column from assessment_indicators';
  ELSE
    RAISE EXCEPTION 'Failed to remove question column';
  END IF;
END;
$$;

-- ============================================================
-- ROLLBACK SQL (to re-add the column if needed):
--
-- ALTER TABLE assessment_indicators
-- ADD COLUMN IF NOT EXISTS question TEXT;
--
-- COMMENT ON COLUMN assessment_indicators.question IS
-- 'User-friendly question displayed to docentes. Falls back to name if empty.';
-- ============================================================
