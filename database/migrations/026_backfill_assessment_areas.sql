/**
 * Migration 026: Backfill transformation_assessments.area field
 *
 * Purpose: Set all existing assessments to 'personalizacion' (safe default)
 *
 * Context: Before this migration, assessments may have NULL or empty área values.
 * All existing assessments were created when only Personalización was available.
 *
 * IMPORTANT: Run this BEFORE migration 027 (which adds NOT NULL constraint)
 *
 * Usage:
 *   Execute in Supabase SQL Editor
 *
 * Rollback:
 *   UPDATE transformation_assessments SET area = NULL WHERE area = 'personalizacion';
 */

-- Backfill NULL or empty área values with 'personalizacion'
UPDATE transformation_assessments
SET area = 'personalizacion'
WHERE area IS NULL OR area = '';

-- Verify the backfill
SELECT
  area,
  COUNT(*) as assessment_count,
  MIN(started_at) as earliest_assessment,
  MAX(started_at) as latest_assessment
FROM transformation_assessments
GROUP BY area
ORDER BY area;

-- Expected result: All assessments should have area = 'personalizacion'
-- Output example:
--   area            | assessment_count | earliest_assessment | latest_assessment
--   ---------------+------------------+---------------------+-------------------
--   personalizacion |               15 | 2025-01-15 10:23:45 | 2025-10-29 14:30:12
