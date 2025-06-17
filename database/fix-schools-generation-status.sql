-- Fix schools that have has_generations=true but no actual generations
-- This happens when all generations are deleted but the flag isn't updated

-- First, let's see which schools need fixing
SELECT 
  s.id,
  s.name,
  s.has_generations,
  COUNT(g.id) as generation_count,
  CASE 
    WHEN s.has_generations = true AND COUNT(g.id) = 0 THEN 'Needs Fix'
    ELSE 'OK'
  END as status
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
GROUP BY s.id, s.name, s.has_generations
ORDER BY status DESC, s.name;

-- Update schools that have has_generations=true but no actual generations
UPDATE schools
SET has_generations = false
WHERE has_generations = true
AND id NOT IN (
  SELECT DISTINCT school_id 
  FROM generations 
  WHERE school_id IS NOT NULL
);

-- Verify the update
SELECT 
  'Schools updated:' as message,
  COUNT(*) as count
FROM schools
WHERE has_generations = false
AND id IN (
  -- These are the schools that were just updated
  SELECT id FROM schools WHERE has_generations = true
  EXCEPT
  SELECT DISTINCT school_id FROM generations
);

-- Final check - show all schools with their correct status
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

-- Also ensure the constraint function handles this edge case
-- (This was already updated in the previous fix, but let's make sure)
CREATE OR REPLACE FUNCTION check_community_organization()
RETURNS TRIGGER AS $$
BEGIN
  -- If generation_id is provided, validate it exists
  IF NEW.generation_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM generations WHERE id = NEW.generation_id) THEN
      RAISE EXCEPTION 'Invalid generation_id provided';
    END IF;
    RETURN NEW;
  END IF;
  
  -- If generation_id is NULL, check if the school has generations disabled OR has no generations
  IF EXISTS (
    SELECT 1 FROM schools s
    WHERE s.id = NEW.school_id 
    AND (
      s.has_generations = false 
      OR NOT EXISTS (SELECT 1 FROM generations WHERE school_id = s.id)
    )
  ) THEN
    -- School doesn't use generations or has none, allow NULL generation_id
    RETURN NEW;
  END IF;
  
  -- If we get here, the school has generations but none was provided
  RAISE EXCEPTION 'generation_id is required for schools with generations';
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger to ensure it's using the updated function
DROP TRIGGER IF EXISTS check_community_organization_trigger ON growth_communities;
CREATE TRIGGER check_community_organization_trigger
BEFORE INSERT OR UPDATE ON growth_communities
FOR EACH ROW
EXECUTE FUNCTION check_community_organization();