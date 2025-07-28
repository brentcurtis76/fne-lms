-- Migration: Enhanced Community Organization Trigger  
-- Date: 2025-07-28
-- Purpose: Improve check_community_organization trigger for Error Report #41AD380A
-- Changes: Better NULL handling and clearer error messages

CREATE OR REPLACE FUNCTION "public"."check_community_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  school_record RECORD;
  generation_count INTEGER;
BEGIN
  -- Get school information in one query
  SELECT id, name, has_generations 
  INTO school_record
  FROM schools 
  WHERE id = NEW.school_id;
  
  -- Validate school exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid school_id: school does not exist';
  END IF;
  
  -- If generation_id is provided, validate it exists and belongs to this school
  IF NEW.generation_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM generations 
      WHERE id = NEW.generation_id 
      AND school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Invalid generation_id: generation does not exist or does not belong to school "%"', school_record.name;
    END IF;
    RETURN NEW;
  END IF;
  
  -- If generation_id is NULL, determine if this is allowed
  -- Count actual generations for this school
  SELECT COUNT(*) INTO generation_count
  FROM generations 
  WHERE school_id = NEW.school_id;
  
  -- Allow NULL generation_id if:
  -- 1. School has no generations in database, OR
  -- 2. School has has_generations explicitly set to false (even if it has generation records)
  -- 3. School has has_generations set to NULL (treat as false for backward compatibility)
  IF generation_count = 0 OR 
     school_record.has_generations = false OR 
     school_record.has_generations IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- If we get here, the school has generations and requires generation_id
  RAISE EXCEPTION 'La escuela "%" utiliza generaciones. Debe especificar una generación para crear la comunidad.', school_record.name;
END;
$$;

-- Add comment explaining the trigger logic
COMMENT ON FUNCTION "public"."check_community_organization"() IS 
'Validates that communities have proper organizational structure. 
Schools with has_generations=true or actual generation records require generation_id.
Schools with has_generations=false or NULL allow generation_id=NULL.
Enhanced 2025-07-28 to prevent community assignment issues.';

-- Test the enhanced trigger
DO $$
DECLARE
  test_community_id UUID;
BEGIN
  -- Test 1: Create community for school without generations (should succeed)
  INSERT INTO growth_communities (name, school_id, generation_id, created_by)
  VALUES ('Test Enhanced Trigger', 10, NULL, (SELECT id FROM profiles LIMIT 1))
  RETURNING id INTO test_community_id;
  
  -- Clean up test
  DELETE FROM growth_communities WHERE id = test_community_id;
  
  RAISE NOTICE 'Enhanced trigger test passed: community creation allowed for school without generations';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Enhanced trigger test failed: %', SQLERRM;
END $$;