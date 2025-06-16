-- ====================================================================
-- UPDATE DEFAULT VALUE FOR has_generations IN SCHOOLS TABLE
-- Changes the default from true to false
-- ====================================================================

-- Update the default value for has_generations column
ALTER TABLE schools 
ALTER COLUMN has_generations SET DEFAULT false;

-- Update the column comment to reflect new default
COMMENT ON COLUMN schools.has_generations IS 'Whether this school uses the generation concept (false by default)';

-- Optional: Update existing schools that have has_generations = true but no actual generations
-- This will set has_generations to false for schools that claim to have generations but don't actually have any
UPDATE schools s
SET has_generations = false
WHERE s.has_generations = true
  AND NOT EXISTS (
    SELECT 1 FROM generations g WHERE g.school_id = s.id
  );

-- Show results of the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % schools to has_generations = false', updated_count;
END $$;