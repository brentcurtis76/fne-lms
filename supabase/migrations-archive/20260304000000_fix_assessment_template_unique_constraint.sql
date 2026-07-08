-- Fix: assessment_templates unique constraint should include grade_id
-- The old constraint (area, version) prevented creating templates for different
-- grade levels in the same area. The version generation also produced corrupted
-- versions (NaN.0.1, v1.0) due to text-sorting mixed formats.

-- Step 1: Clean up corrupted version data
UPDATE assessment_templates
SET version = '0.0.1'
WHERE version = 'NaN.0.1';

UPDATE assessment_templates
SET version = '1.0.0'
WHERE version = 'v1.0';

-- Step 2: Drop the old unique constraint
ALTER TABLE assessment_templates
  DROP CONSTRAINT IF EXISTS assessment_templates_area_version_key;

-- Step 3: Add new unique constraint that includes grade_id
-- This allows the same area to have templates for different grade levels
ALTER TABLE assessment_templates
  ADD CONSTRAINT assessment_templates_area_grade_version_key
  UNIQUE (area, grade_id, version);
