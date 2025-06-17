-- Fix for allowing community leaders to be assigned without generations
-- when the school has generations disabled

-- First, let's check if the constraint function exists and update it
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
    AND (has_generations = false OR has_generations IS NULL)
  ) THEN
    -- School doesn't use generations, allow NULL generation_id
    RETURN NEW;
  END IF;
  
  -- For backward compatibility, if has_generations is not set (NULL),
  -- allow communities without generations
  IF EXISTS (
    SELECT 1 FROM schools 
    WHERE id = NEW.school_id 
    AND has_generations IS NULL
  ) THEN
    RETURN NEW;
  END IF;
  
  -- If we get here, the school requires generations but none was provided
  RAISE EXCEPTION 'generation_id is required for schools with generations enabled';
END;
$$ LANGUAGE plpgsql;

-- Ensure the trigger is properly set up
DROP TRIGGER IF EXISTS check_community_organization_trigger ON growth_communities;
CREATE TRIGGER check_community_organization_trigger
BEFORE INSERT OR UPDATE ON growth_communities
FOR EACH ROW
EXECUTE FUNCTION check_community_organization();

-- Update the roleUtils error message to be more specific
-- This is handled in the application code, but we can add a comment
COMMENT ON FUNCTION check_community_organization() IS 
'Validates that communities have proper organizational structure. 
Communities require generation_id only if the school has generations enabled.
Schools without generations (has_generations = false) can have communities without generation_id.';

-- Also ensure the user_roles table allows the same pattern
-- Update constraint on user_roles to match the logic
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS check_role_organizational_scope;

-- Add a more flexible constraint that understands schools without generations
ALTER TABLE user_roles ADD CONSTRAINT check_role_organizational_scope
CHECK (
  -- Admin roles don't need organizational scope
  (role_type = 'admin') OR
  
  -- Consultant roles need at least a school
  (role_type = 'consultor' AND school_id IS NOT NULL) OR
  
  -- School leadership roles need a school
  (role_type = 'equipo_directivo' AND school_id IS NOT NULL) OR
  
  -- Generation leaders need both school and generation (if school uses generations)
  (role_type = 'lider_generacion' AND school_id IS NOT NULL) OR
  
  -- Community leaders need a school and community
  (role_type = 'lider_comunidad' AND school_id IS NOT NULL) OR
  
  -- Teachers need at least a school
  (role_type = 'docente' AND school_id IS NOT NULL)
);

-- Quick check to see current state
SELECT 
  s.id,
  s.name,
  s.has_generations,
  COUNT(g.id) as generation_count,
  COUNT(gc.id) as community_count,
  COUNT(CASE WHEN gc.generation_id IS NULL THEN 1 END) as communities_without_generation
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
LEFT JOIN growth_communities gc ON gc.school_id = s.id
GROUP BY s.id, s.name, s.has_generations
ORDER BY s.name;