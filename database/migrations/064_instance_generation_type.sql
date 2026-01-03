-- ============================================================
-- Migration: 064_instance_generation_type.sql
-- Purpose: Add generation_type to assessment instances
-- Date: 2026-01-03
--
-- Assessment instances need to track which generation track
-- (GT or GI) was used for expectations. This is determined
-- at assignment time based on the Migration Plan.
-- ============================================================

-- Ensure the generation_type enum exists (created in 063 or earlier)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'generation_type') THEN
    CREATE TYPE generation_type AS ENUM ('GT', 'GI');
  END IF;
END $$;

-- Add generation_type column to assessment_instances
-- Nullable initially for existing instances (will default to GT in queries)
ALTER TABLE assessment_instances
ADD COLUMN IF NOT EXISTS generation_type generation_type;

-- Add comment
COMMENT ON COLUMN assessment_instances.generation_type IS
'GT = Generacion Tractor, GI = Generacion Innova. Determined from Migration Plan at assignment time.';

-- Create index for efficient filtering by generation type
CREATE INDEX IF NOT EXISTS idx_assessment_instances_generation_type
ON assessment_instances(generation_type);

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  -- Check column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_instances'
    AND column_name = 'generation_type'
  ) THEN
    RAISE EXCEPTION 'generation_type column was not created on assessment_instances';
  END IF;

  RAISE NOTICE 'Migration 064 completed successfully: generation_type column added to assessment_instances';
END;
$$;

-- ============================================================
-- ROLLBACK SQL (uncomment and run to revert):
--
-- DROP INDEX IF EXISTS idx_assessment_instances_generation_type;
-- ALTER TABLE assessment_instances DROP COLUMN IF EXISTS generation_type;
-- ============================================================
