/**
 * Migration 027: Add constraints to transformation_assessments.area
 *
 * Purpose: Enforce data integrity for área field
 *
 * Changes:
 * 1. Add CHECK constraint to allow only valid área values
 * 2. Set area column to NOT NULL
 *
 * PREREQUISITES:
 * - Migration 026 MUST be run first (backfills existing NULL values)
 * - All assessments must have valid área before running this migration
 *
 * Usage:
 *   Execute in Supabase SQL Editor AFTER migration 026
 *
 * Rollback:
 *   ALTER TABLE transformation_assessments DROP CONSTRAINT IF EXISTS valid_transformation_area;
 *   ALTER TABLE transformation_assessments ALTER COLUMN area DROP NOT NULL;
 */

-- Step 1: Add CHECK constraint for valid areas
-- This allows only 'personalizacion' or 'aprendizaje' values
ALTER TABLE transformation_assessments
ADD CONSTRAINT valid_transformation_area
CHECK (area IN ('personalizacion', 'aprendizaje'));

-- Step 2: Make area column NOT NULL
-- This prevents future records from having NULL área
ALTER TABLE transformation_assessments
ALTER COLUMN area SET NOT NULL;

-- Verify the constraints
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'transformation_assessments'::regclass
  AND conname = 'valid_transformation_area';

-- Expected output:
--   constraint_name           | constraint_definition
--   -------------------------+----------------------------------------
--   valid_transformation_area | CHECK ((area = ANY (ARRAY['personalizacion'::text, 'aprendizaje'::text])))

-- Test the constraint (should succeed)
-- INSERT INTO transformation_assessments (growth_community_id, area, status)
-- VALUES ('test-uuid', 'personalizacion', 'in_progress');

-- Test the constraint (should FAIL with constraint violation)
-- INSERT INTO transformation_assessments (growth_community_id, area, status)
-- VALUES ('test-uuid', 'invalid', 'in_progress');

-- Test NOT NULL (should FAIL)
-- INSERT INTO transformation_assessments (growth_community_id, status)
-- VALUES ('test-uuid', 'in_progress');
