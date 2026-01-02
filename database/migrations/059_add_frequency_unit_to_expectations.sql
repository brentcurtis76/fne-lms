-- ============================================================
-- 059_add_frequency_unit_to_expectations.sql
-- Adds frequency unit columns to assessment_year_expectations
--
-- Purpose: Allow frequency expectations to specify both a value
-- AND a time unit (e.g., "4 times per semester")
--
-- Changes:
-- 1. Add year_X_expected_unit columns for frequency indicators
-- 2. Remove the 0-4 constraint for frequency values (they can be any number)
-- ============================================================

-- Add frequency unit columns for each year
ALTER TABLE assessment_year_expectations
ADD COLUMN IF NOT EXISTS year_1_expected_unit TEXT;

ALTER TABLE assessment_year_expectations
ADD COLUMN IF NOT EXISTS year_2_expected_unit TEXT;

ALTER TABLE assessment_year_expectations
ADD COLUMN IF NOT EXISTS year_3_expected_unit TEXT;

ALTER TABLE assessment_year_expectations
ADD COLUMN IF NOT EXISTS year_4_expected_unit TEXT;

ALTER TABLE assessment_year_expectations
ADD COLUMN IF NOT EXISTS year_5_expected_unit TEXT;

-- Add comments explaining the fields
COMMENT ON COLUMN assessment_year_expectations.year_1_expected_unit IS
'Frequency unit for year 1 expectation. E.g., dia, semana, mes, trimestre, semestre, año';

COMMENT ON COLUMN assessment_year_expectations.year_2_expected_unit IS
'Frequency unit for year 2 expectation. E.g., dia, semana, mes, trimestre, semestre, año';

COMMENT ON COLUMN assessment_year_expectations.year_3_expected_unit IS
'Frequency unit for year 3 expectation. E.g., dia, semana, mes, trimestre, semestre, año';

COMMENT ON COLUMN assessment_year_expectations.year_4_expected_unit IS
'Frequency unit for year 4 expectation. E.g., dia, semana, mes, trimestre, semestre, año';

COMMENT ON COLUMN assessment_year_expectations.year_5_expected_unit IS
'Frequency unit for year 5 expectation. E.g., dia, semana, mes, trimestre, semestre, año';

-- Note: The existing CHECK constraints (year_X_expected BETWEEN 0 AND 4) apply to
-- profundidad indicators. For frequency indicators, values can exceed 4.
-- The constraint allows NULL which is used when no expectation is set.
-- We need to relax the constraint for frequency indicator values.

-- Drop the existing constraints and recreate them more flexibly
-- First, we need to identify the constraint names

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Drop year_1_expected check constraint if exists
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'assessment_year_expectations'::regclass
    AND conname LIKE '%year_1_expected%'
  LOOP
    EXECUTE format('ALTER TABLE assessment_year_expectations DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  -- Drop year_2_expected check constraint if exists
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'assessment_year_expectations'::regclass
    AND conname LIKE '%year_2_expected%'
  LOOP
    EXECUTE format('ALTER TABLE assessment_year_expectations DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  -- Drop year_3_expected check constraint if exists
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'assessment_year_expectations'::regclass
    AND conname LIKE '%year_3_expected%'
  LOOP
    EXECUTE format('ALTER TABLE assessment_year_expectations DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  -- Drop year_4_expected check constraint if exists
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'assessment_year_expectations'::regclass
    AND conname LIKE '%year_4_expected%'
  LOOP
    EXECUTE format('ALTER TABLE assessment_year_expectations DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;

  -- Drop year_5_expected check constraint if exists
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'assessment_year_expectations'::regclass
    AND conname LIKE '%year_5_expected%'
  LOOP
    EXECUTE format('ALTER TABLE assessment_year_expectations DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

-- Add new constraints that allow larger values (for frequency) but still validate profundidad range
-- Note: Profundidad indicators use 0-4 levels
-- Frequency indicators can have any positive integer (or null)
-- Cobertura indicators use 0 or 1 (or null)
-- The application layer handles the logic, so we just ensure values are non-negative

ALTER TABLE assessment_year_expectations
ADD CONSTRAINT year_1_expected_check CHECK (year_1_expected IS NULL OR year_1_expected >= 0);

ALTER TABLE assessment_year_expectations
ADD CONSTRAINT year_2_expected_check CHECK (year_2_expected IS NULL OR year_2_expected >= 0);

ALTER TABLE assessment_year_expectations
ADD CONSTRAINT year_3_expected_check CHECK (year_3_expected IS NULL OR year_3_expected >= 0);

ALTER TABLE assessment_year_expectations
ADD CONSTRAINT year_4_expected_check CHECK (year_4_expected IS NULL OR year_4_expected >= 0);

ALTER TABLE assessment_year_expectations
ADD CONSTRAINT year_5_expected_check CHECK (year_5_expected IS NULL OR year_5_expected >= 0);

-- Verify the changes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_year_expectations'
    AND column_name = 'year_1_expected_unit'
  ) THEN
    RAISE NOTICE 'Successfully added frequency unit columns to assessment_year_expectations';
  ELSE
    RAISE EXCEPTION 'Failed to add frequency unit columns';
  END IF;
END;
$$;
