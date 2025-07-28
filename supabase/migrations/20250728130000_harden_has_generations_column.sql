-- Migration: Harden has_generations column to prevent NULL values
-- Date: 2025-07-28
-- Purpose: Fix Error Report #41AD380A by ensuring has_generations is never NULL

-- First, update any existing NULL values to false where no generations exist
UPDATE schools 
SET has_generations = false 
WHERE has_generations IS NULL 
AND NOT EXISTS (
  SELECT 1 FROM generations 
  WHERE school_id = schools.id
);

-- Update any existing NULL values to true where generations do exist  
UPDATE schools 
SET has_generations = true 
WHERE has_generations IS NULL 
AND EXISTS (
  SELECT 1 FROM generations 
  WHERE school_id = schools.id
);

-- Add NOT NULL constraint with default value
ALTER TABLE schools 
ALTER COLUMN has_generations SET NOT NULL,
ALTER COLUMN has_generations SET DEFAULT false;

-- Add helpful comment
COMMENT ON COLUMN schools.has_generations IS 
'Whether this school uses generations for organizing students. NOT NULL with default false. Updated 2025-07-28 to prevent community assignment issues.';

-- Create index for performance on commonly queried column
CREATE INDEX IF NOT EXISTS idx_schools_has_generations 
ON schools(has_generations) 
WHERE has_generations = true;

-- Verification query (should return 0 rows)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count 
  FROM schools 
  WHERE has_generations IS NULL;
  
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % schools still have NULL has_generations', null_count;
  END IF;
  
  RAISE NOTICE 'Migration successful: All schools have non-NULL has_generations values';
END $$;