-- ====================================================================
-- SUPPORT ORGANIZATIONS WITHOUT GENERATIONS
-- Allows schools to operate without the generation concept
-- ====================================================================

-- 1. Make generation_id nullable in growth_communities
-- This allows communities to exist directly under schools
ALTER TABLE growth_communities 
ALTER COLUMN generation_id DROP NOT NULL;

-- 2. Add a direct school relationship for generation-less communities
-- (Already exists, just documenting for clarity)
-- growth_communities already has school_id column

-- 3. Change user profiles to handle generation deletion better
-- Convert from RESTRICT to SET NULL so generations can be deleted
ALTER TABLE profiles 
DROP CONSTRAINT IF EXISTS profiles_generation_id_fkey;

ALTER TABLE profiles 
ADD CONSTRAINT profiles_generation_id_fkey 
FOREIGN KEY (generation_id) 
REFERENCES generations(id) 
ON DELETE SET NULL;

-- 4. Update growth_communities to handle generation deletion
-- Change from CASCADE to SET NULL to preserve communities
ALTER TABLE growth_communities 
DROP CONSTRAINT IF EXISTS growth_communities_generation_id_fkey;

ALTER TABLE growth_communities 
ADD CONSTRAINT growth_communities_generation_id_fkey 
FOREIGN KEY (generation_id) 
REFERENCES generations(id) 
ON DELETE SET NULL;

-- 5. Add a constraint to ensure communities have either generation_id OR are in a school without generations
CREATE OR REPLACE FUNCTION check_community_organization()
RETURNS TRIGGER AS $$
BEGIN
  -- If generation_id is provided, no additional checks needed
  IF NEW.generation_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- If generation_id is NULL, check if the school has generations disabled
  IF EXISTS (
    SELECT 1 FROM schools 
    WHERE id = NEW.school_id 
    AND has_generations = false
  ) THEN
    RETURN NEW;
  END IF;
  
  -- Otherwise, generation_id is required
  RAISE EXCEPTION 'generation_id is required for schools with generations enabled';
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS check_community_organization_trigger ON growth_communities;
CREATE TRIGGER check_community_organization_trigger
BEFORE INSERT OR UPDATE ON growth_communities
FOR EACH ROW
EXECUTE FUNCTION check_community_organization();

-- 6. Create a function to safely transition a school to no-generations
CREATE OR REPLACE FUNCTION transition_school_to_no_generations(
  p_school_id UUID
)
RETURNS TABLE (
  affected_users INTEGER,
  affected_communities INTEGER,
  affected_generations INTEGER
) AS $$
DECLARE
  v_affected_users INTEGER;
  v_affected_communities INTEGER;
  v_affected_generations INTEGER;
BEGIN
  -- Count affected records
  SELECT COUNT(*) INTO v_affected_users
  FROM profiles 
  WHERE school_id = p_school_id AND generation_id IS NOT NULL;
  
  SELECT COUNT(*) INTO v_affected_communities
  FROM growth_communities 
  WHERE school_id = p_school_id AND generation_id IS NOT NULL;
  
  SELECT COUNT(*) INTO v_affected_generations
  FROM generations 
  WHERE school_id = p_school_id;
  
  -- Update school to not have generations
  UPDATE schools 
  SET has_generations = false 
  WHERE id = p_school_id;
  
  -- Clear generation references from communities
  UPDATE growth_communities 
  SET generation_id = NULL 
  WHERE school_id = p_school_id;
  
  -- Clear generation references from profiles
  UPDATE profiles 
  SET generation_id = NULL 
  WHERE school_id = p_school_id;
  
  -- Note: We don't delete the generations themselves
  -- They remain for historical reference but are unused
  
  RETURN QUERY SELECT v_affected_users, v_affected_communities, v_affected_generations;
END;
$$ LANGUAGE plpgsql;

-- 7. Add comments for clarity
COMMENT ON COLUMN growth_communities.generation_id IS 'Generation ID - NULL for schools without generations';
COMMENT ON FUNCTION transition_school_to_no_generations IS 'Safely transitions a school to operate without generations';

-- 8. Example usage:
-- SELECT * FROM transition_school_to_no_generations('school-uuid-here');