-- Fix for preventing duplicate community creation when re-assigning community leader roles
-- This addresses the issue where deleting and re-adding a "Líder de Comunidad" role creates duplicate communities

-- 1. First, we need to clean up existing duplicates before we can create the unique index
-- This section finds and removes duplicate communities, keeping the oldest one with active roles

DO $$
DECLARE
  r RECORD;
  v_keep_id UUID;
  v_deleted_count INTEGER := 0;
BEGIN
  -- Find groups of duplicates
  FOR r IN (
    SELECT 
      name,
      school_id,
      generation_id,
      COUNT(*) as dup_count
    FROM growth_communities
    WHERE name LIKE 'Comunidad de %'
    GROUP BY name, school_id, generation_id
    HAVING COUNT(*) > 1
  ) LOOP
    -- For each group of duplicates, find the one to keep (oldest with active roles, or just oldest)
    SELECT gc.id INTO v_keep_id
    FROM growth_communities gc
    LEFT JOIN user_roles ur ON ur.community_id = gc.id AND ur.is_active = true
    WHERE gc.name = r.name
      AND gc.school_id = r.school_id
      AND (gc.generation_id = r.generation_id OR (gc.generation_id IS NULL AND r.generation_id IS NULL))
    GROUP BY gc.id, gc.created_at
    ORDER BY 
      COUNT(ur.id) DESC,  -- Prefer communities with active roles
      gc.created_at ASC   -- Then prefer oldest
    LIMIT 1;
    
    -- Update any user_roles pointing to duplicate communities to point to the keeper
    UPDATE user_roles
    SET community_id = v_keep_id
    WHERE community_id IN (
      SELECT id 
      FROM growth_communities
      WHERE name = r.name
        AND school_id = r.school_id
        AND (generation_id = r.generation_id OR (generation_id IS NULL AND r.generation_id IS NULL))
        AND id != v_keep_id
    );
    
    -- Delete the duplicates
    DELETE FROM growth_communities
    WHERE name = r.name
      AND school_id = r.school_id
      AND (generation_id = r.generation_id OR (generation_id IS NULL AND r.generation_id IS NULL))
      AND id != v_keep_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % duplicates for community: %, kept ID: %', v_deleted_count, r.name, v_keep_id;
  END LOOP;
END $$;

-- 2. Now that duplicates are cleaned up, create the unique index to prevent future duplicates
-- We use a unique index instead of constraint to handle NULL generation_id values
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_community_name_per_scope 
ON growth_communities (name, school_id, COALESCE(generation_id, '00000000-0000-0000-0000-000000000000'));

-- 3. Create a function to safely get or create a community for a leader
CREATE OR REPLACE FUNCTION get_or_create_community_for_leader(
  p_leader_id UUID,
  p_school_id UUID,
  p_generation_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_community_id UUID;
  v_leader_name TEXT;
  v_community_name TEXT;
  v_generation_name TEXT;
BEGIN
  -- Get leader's name
  SELECT first_name || ' ' || last_name INTO v_leader_name
  FROM profiles
  WHERE id = p_leader_id;
  
  -- If no name found, use a default
  IF v_leader_name IS NULL OR v_leader_name = ' ' THEN
    v_leader_name := 'Líder';
  END IF;
  
  -- Build community name
  v_community_name := 'Comunidad de ' || v_leader_name;
  
  -- If generation is provided, add it to the name
  IF p_generation_id IS NOT NULL THEN
    SELECT name INTO v_generation_name
    FROM generations
    WHERE id = p_generation_id;
    
    IF v_generation_name IS NOT NULL THEN
      v_community_name := v_community_name || ' - ' || v_generation_name;
    END IF;
  END IF;
  
  -- First, check if a community with this exact name already exists for this school/generation
  SELECT id INTO v_community_id
  FROM growth_communities
  WHERE name = v_community_name
    AND school_id = p_school_id
    AND (generation_id = p_generation_id OR (generation_id IS NULL AND p_generation_id IS NULL));
  
  -- If found, return existing community
  IF v_community_id IS NOT NULL THEN
    RETURN v_community_id;
  END IF;
  
  -- If not found, create new community
  INSERT INTO growth_communities (school_id, generation_id, name, max_teachers)
  VALUES (p_school_id, p_generation_id, v_community_name, 16)
  RETURNING id INTO v_community_id;
  
  RETURN v_community_id;
  
EXCEPTION
  WHEN unique_violation THEN
    -- If we hit the unique constraint (race condition), try to fetch again
    SELECT id INTO v_community_id
    FROM growth_communities
    WHERE name = v_community_name
      AND school_id = p_school_id
      AND (generation_id = p_generation_id OR (generation_id IS NULL AND p_generation_id IS NULL));
    
    RETURN v_community_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Create a function to clean up orphaned communities (communities with no active leader)
CREATE OR REPLACE FUNCTION cleanup_orphaned_communities()
RETURNS TABLE (
  deleted_id UUID,
  deleted_name TEXT,
  deleted_school_id UUID,
  deleted_generation_id UUID
) AS $$
BEGIN
  RETURN QUERY
  DELETE FROM growth_communities gc
  WHERE gc.id IN (
    SELECT gc2.id
    FROM growth_communities gc2
    WHERE NOT EXISTS (
      -- Check if any active role references this community
      SELECT 1 
      FROM user_roles ur
      WHERE ur.community_id = gc2.id
        AND ur.is_active = true
    )
    -- Only delete auto-created communities (those with leader names)
    AND gc2.name LIKE 'Comunidad de %'
  )
  RETURNING gc.id, gc.name, gc.school_id, gc.generation_id;
END;
$$ LANGUAGE plpgsql;

-- Note: Duplicate cleanup is now handled in step 1 before creating the unique index

-- 5. Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_or_create_community_for_leader TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_orphaned_communities TO authenticated;

-- 6. Add comment explaining the fix
COMMENT ON FUNCTION get_or_create_community_for_leader IS 
'Safely gets or creates a community for a community leader, preventing duplicates.
This function should be used instead of directly creating communities when assigning
the lider_comunidad role to ensure no duplicate communities are created.';

-- 7. Summary report of what was cleaned
SELECT 
  'Duplicate communities cleaned' as action,
  COUNT(DISTINCT name || school_id || COALESCE(generation_id::text, 'null')) as affected_count
FROM (
  SELECT name, school_id, generation_id, COUNT(*) as cnt
  FROM growth_communities
  WHERE name LIKE 'Comunidad de %'
  GROUP BY name, school_id, generation_id
  HAVING COUNT(*) > 1
) duplicates;

-- Check remaining communities
SELECT 
  COUNT(*) as total_communities,
  COUNT(CASE WHEN name LIKE 'Comunidad de %' THEN 1 END) as auto_created_communities,
  COUNT(DISTINCT name || school_id || COALESCE(generation_id::text, 'null')) as unique_communities
FROM growth_communities;