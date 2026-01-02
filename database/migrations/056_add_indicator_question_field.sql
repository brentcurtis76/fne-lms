-- ============================================================
-- 056_add_indicator_question_field.sql
-- Adds 'question' field to assessment_indicators table
--
-- Purpose: Allow indicators to have a user-friendly question
-- that is displayed to docentes, separate from the technical name
-- used by admins.
--
-- Example:
--   name: "Tutorías individuales" (admin reference)
--   question: "¿Realizas tutorías individuales con tus estudiantes?" (docente sees)
-- ============================================================

-- Add question column to assessment_indicators
ALTER TABLE assessment_indicators
ADD COLUMN IF NOT EXISTS question TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN assessment_indicators.question IS
'User-friendly question displayed to docentes. Falls back to name if empty.';

-- Verify the change
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_indicators'
    AND column_name = 'question'
  ) THEN
    RAISE NOTICE 'Successfully added question column to assessment_indicators';
  ELSE
    RAISE EXCEPTION 'Failed to add question column';
  END IF;
END;
$$;
