/**
 * Migration 046: Add 'evaluacion' to valid transformation areas
 *
 * Purpose: Allow the Evaluación vía de transformación to be used
 *
 * Changes:
 * 1. Drop existing CHECK constraint
 * 2. Add new CHECK constraint including 'evaluacion'
 *
 * Usage:
 *   Execute in Supabase SQL Editor
 *
 * Rollback:
 *   ALTER TABLE transformation_assessments DROP CONSTRAINT IF EXISTS valid_transformation_area;
 *   ALTER TABLE transformation_assessments ADD CONSTRAINT valid_transformation_area
 *     CHECK (area IN ('personalizacion', 'aprendizaje'));
 */

-- Step 1: Drop existing constraint
ALTER TABLE transformation_assessments
DROP CONSTRAINT IF EXISTS valid_transformation_area;

-- Step 2: Add new constraint with evaluacion included
ALTER TABLE transformation_assessments
ADD CONSTRAINT valid_transformation_area
CHECK (area IN ('personalizacion', 'aprendizaje', 'evaluacion'));

-- Verify the updated constraint
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'transformation_assessments'::regclass
  AND conname = 'valid_transformation_area';

-- Expected output:
--   constraint_name           | constraint_definition
--   -------------------------+----------------------------------------------------------------
--   valid_transformation_area | CHECK ((area = ANY (ARRAY['personalizacion'::text, 'aprendizaje'::text, 'evaluacion'::text])))
