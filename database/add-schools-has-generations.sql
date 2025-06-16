-- ====================================================================
-- ADD HAS_GENERATIONS COLUMN TO SCHOOLS TABLE
-- Allows schools to opt out of using generations
-- ====================================================================

-- Add the has_generations column to schools table
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS has_generations BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN schools.has_generations IS 'Whether this school uses the generation concept (true by default)';

-- Update any existing schools to have generations by default
UPDATE schools 
SET has_generations = true 
WHERE has_generations IS NULL;