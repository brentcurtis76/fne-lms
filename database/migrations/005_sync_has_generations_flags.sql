-- =====================================================
-- Migration 005: Sync has_generations Flags
-- =====================================================
-- Author: Claude Code
-- Date: 2025-10-06
-- Status: DATA FIX
--
-- Problem: Schools with generations have has_generations = false
-- Cause: Trigger was broken (fixed in migration 004)
-- Fix: Update all schools to reflect their actual generation count
--
-- This migration syncs the has_generations flag for ALL schools
-- =====================================================

BEGIN;

-- Update has_generations flag for all schools based on actual generation count
UPDATE schools s
SET has_generations = (
    SELECT COUNT(*) > 0
    FROM generations g
    WHERE g.school_id = s.id
)
WHERE has_generations != (
    SELECT COUNT(*) > 0
    FROM generations g
    WHERE g.school_id = s.id
);

-- Show what changed
DO $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RAISE NOTICE '✅ Updated has_generations flag for % schools', v_updated_count;
END $$;

COMMIT;

-- =====================================================
-- Verification
-- =====================================================

-- Show schools with generations and their flag status
SELECT
    s.id,
    s.name,
    s.has_generations,
    COUNT(g.id) as generation_count
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
GROUP BY s.id, s.name, s.has_generations
HAVING COUNT(g.id) > 0
ORDER BY s.id;

-- Verify no inconsistencies remain
SELECT
    COUNT(*) as inconsistent_schools
FROM schools s
WHERE has_generations != (
    SELECT COUNT(*) > 0
    FROM generations g
    WHERE g.school_id = s.id
);

-- =====================================================
-- END OF MIGRATION
-- =====================================================
