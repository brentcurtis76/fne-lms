-- Permanent fix for generation deletion bug
-- Automatically updates has_generations flag when generations are added or removed

-- 1. Create a function that updates the has_generations flag based on actual generations
CREATE OR REPLACE FUNCTION update_school_has_generations()
RETURNS TRIGGER AS $$
DECLARE
  v_school_id uuid;
  v_generation_count integer;
BEGIN
  -- Determine which school to update based on the operation
  IF TG_OP = 'DELETE' THEN
    v_school_id := OLD.school_id;
  ELSE
    v_school_id := NEW.school_id;
  END IF;
  
  -- Count remaining generations for this school
  SELECT COUNT(*) INTO v_generation_count
  FROM generations
  WHERE school_id = v_school_id;
  
  -- Update the has_generations flag based on the count
  UPDATE schools
  SET has_generations = (v_generation_count > 0)
  WHERE id = v_school_id;
  
  -- For DELETE operations, return OLD; for INSERT/UPDATE, return NEW
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Create triggers to automatically update has_generations when generations change
-- Drop existing triggers if any
DROP TRIGGER IF EXISTS update_school_generations_on_insert ON generations;
DROP TRIGGER IF EXISTS update_school_generations_on_delete ON generations;
DROP TRIGGER IF EXISTS update_school_generations_on_update ON generations;

-- Trigger for INSERT
CREATE TRIGGER update_school_generations_on_insert
AFTER INSERT ON generations
FOR EACH ROW
EXECUTE FUNCTION update_school_has_generations();

-- Trigger for DELETE
CREATE TRIGGER update_school_generations_on_delete
AFTER DELETE ON generations
FOR EACH ROW
EXECUTE FUNCTION update_school_has_generations();

-- Trigger for UPDATE (in case school_id changes)
CREATE TRIGGER update_school_generations_on_update
AFTER UPDATE OF school_id ON generations
FOR EACH ROW
EXECUTE FUNCTION update_school_has_generations();

-- 3. Fix current data inconsistencies
UPDATE schools s
SET has_generations = EXISTS (
  SELECT 1 FROM generations g WHERE g.school_id = s.id
);

-- 4. Add a comment to document this behavior
COMMENT ON FUNCTION update_school_has_generations() IS 
'Automatically maintains the has_generations flag on schools table. 
When generations are added or removed, this function updates the flag accordingly.
This prevents data inconsistencies where a school is marked as having generations
but actually has none (e.g., after all generations are deleted).';

-- 5. Test the fix by showing current state
SELECT 
  s.id,
  s.name,
  s.has_generations,
  COUNT(g.id) as actual_generation_count,
  CASE 
    WHEN s.has_generations = (COUNT(g.id) > 0) THEN '✓ Consistent'
    ELSE '✗ Inconsistent'
  END as status
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
GROUP BY s.id, s.name, s.has_generations
ORDER BY s.name;

-- 6. Also update the community organization check to be more flexible
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
  
  -- If generation_id is NULL, check if the school actually has generations
  -- This now checks the real count, not just the flag
  IF NOT EXISTS (
    SELECT 1 FROM generations 
    WHERE school_id = NEW.school_id
  ) THEN
    -- School has no generations, allow NULL generation_id
    RETURN NEW;
  END IF;
  
  -- Also allow if has_generations is explicitly false
  IF EXISTS (
    SELECT 1 FROM schools 
    WHERE id = NEW.school_id 
    AND has_generations = false
  ) THEN
    RETURN NEW;
  END IF;
  
  -- If we get here, the school has generations but none was provided
  RAISE EXCEPTION 'generation_id is required for schools with generations';
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS check_community_organization_trigger ON growth_communities;
CREATE TRIGGER check_community_organization_trigger
BEFORE INSERT OR UPDATE ON growth_communities
FOR EACH ROW
EXECUTE FUNCTION check_community_organization();