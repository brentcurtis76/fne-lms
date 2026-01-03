-- ============================================================
-- Migration: 063_dual_expectations.sql
-- Purpose: Add GT/GI dual expectations support
-- Date: 2026-01-02
--
-- Templates for grades 7-16 need TWO sets of expectations:
-- - GT (Generación Tractor): Higher expectations
-- - GI (Generación Innova): Lower expectations
--
-- Grades 1-6 (is_always_gt = true) only need GT expectations.
-- ============================================================

-- Create the generation_type enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'generation_type') THEN
    CREATE TYPE generation_type AS ENUM ('GT', 'GI');
  END IF;
END $$;

-- Add generation_type column to assessment_year_expectations
ALTER TABLE assessment_year_expectations
ADD COLUMN IF NOT EXISTS generation_type generation_type NOT NULL DEFAULT 'GT';

-- Add comment
COMMENT ON COLUMN assessment_year_expectations.generation_type IS
'GT = Generación Tractor (higher expectations), GI = Generación Innova (lower expectations)';

-- Drop the existing unique constraint (template_id, indicator_id)
-- We need to find and drop it dynamically as the name may vary
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'assessment_year_expectations'::regclass
    AND contype = 'u'
    AND conname LIKE '%template_id%indicator_id%'
  LOOP
    EXECUTE format('ALTER TABLE assessment_year_expectations DROP CONSTRAINT IF EXISTS %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  END LOOP;
END $$;

-- Also try to drop by common naming patterns
ALTER TABLE assessment_year_expectations
DROP CONSTRAINT IF EXISTS assessment_year_expectations_template_id_indicator_id_key;

ALTER TABLE assessment_year_expectations
DROP CONSTRAINT IF EXISTS assessment_year_expectations_pkey;

-- Create new unique constraint including generation_type
-- This allows one GT row and one GI row per indicator per template
ALTER TABLE assessment_year_expectations
ADD CONSTRAINT assessment_year_expectations_template_indicator_gen_unique
UNIQUE (template_id, indicator_id, generation_type);

-- Create index for efficient queries by generation_type
CREATE INDEX IF NOT EXISTS idx_year_expectations_generation_type
ON assessment_year_expectations(generation_type);

-- Create index for template + generation_type queries
CREATE INDEX IF NOT EXISTS idx_year_expectations_template_gen
ON assessment_year_expectations(template_id, generation_type);

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  -- Check column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_year_expectations'
    AND column_name = 'generation_type'
  ) THEN
    RAISE EXCEPTION 'generation_type column was not created';
  END IF;

  RAISE NOTICE 'Migration 063 completed successfully: generation_type column added to assessment_year_expectations';
END;
$$;

-- ============================================================
-- ROLLBACK SQL (uncomment and run to revert):
--
-- DROP INDEX IF EXISTS idx_year_expectations_template_gen;
-- DROP INDEX IF EXISTS idx_year_expectations_generation_type;
-- ALTER TABLE assessment_year_expectations
--   DROP CONSTRAINT IF EXISTS assessment_year_expectations_template_indicator_gen_unique;
-- ALTER TABLE assessment_year_expectations
--   ADD CONSTRAINT assessment_year_expectations_template_id_indicator_id_key
--   UNIQUE (template_id, indicator_id);
-- ALTER TABLE assessment_year_expectations DROP COLUMN IF EXISTS generation_type;
-- ============================================================
