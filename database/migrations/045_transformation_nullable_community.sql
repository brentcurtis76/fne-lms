-- Migration 045: Make growth_community_id nullable for school-based assessments
--
-- This migration allows transformation assessments to be created without a growth_community_id
-- since the new school-based model uses school_id instead.
--
-- SAFE: Existing assessments keep their growth_community_id values

-- Make growth_community_id nullable
ALTER TABLE transformation_assessments
ALTER COLUMN growth_community_id DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN transformation_assessments.growth_community_id IS
'Legacy: Community that owns this assessment. New assessments use school_id instead. Kept for backwards compatibility.';

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'growth_community_id is now nullable - school-based assessments can be created';
END $$;
