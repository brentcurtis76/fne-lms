-- Fix the RPC functions to use the correct column names
-- The table has 'learning_path_id' not 'path_id'

-- Drop the existing function first
DROP FUNCTION IF EXISTS create_full_learning_path(TEXT, TEXT, UUID[], UUID);

-- Recreate with correct column names
CREATE OR REPLACE FUNCTION create_full_learning_path(
    p_name TEXT,
    p_description TEXT,
    p_course_ids UUID[],
    p_created_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_path_id UUID;
    v_course_id UUID;
    v_sequence INT := 1;
    v_result json;
BEGIN
    -- Validate inputs
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning path name cannot be empty';
    END IF;
    
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Learning path description cannot be empty';
    END IF;
    
    -- Check if user has permission to create learning paths
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_created_by 
        AND is_active = true
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to create learning paths';
    END IF;
    
    -- 1. Create the learning path
    INSERT INTO learning_paths (name, description, created_by)
    VALUES (p_name, p_description, p_created_by)
    RETURNING id INTO v_path_id;
    
    -- 2. Create course associations if courses provided
    -- FIXED: Use 'learning_path_id' instead of 'path_id'
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association with correct column name
            INSERT INTO learning_path_courses (learning_path_id, course_id, sequence)
            VALUES (v_path_id, v_course_id, v_sequence);
            
            v_sequence := v_sequence + 1;
        END LOOP;
    END IF;
    
    -- 3. Return the created learning path
    SELECT json_build_object(
        'id', id,
        'name', name,
        'description', description,
        'created_by', created_by,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO v_result
    FROM learning_paths
    WHERE id = v_path_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any error will automatically rollback the entire transaction
        RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_full_learning_path TO authenticated;

-- Also fix the update function
DROP FUNCTION IF EXISTS update_full_learning_path(UUID, TEXT, TEXT, UUID[], UUID);

CREATE OR REPLACE FUNCTION update_full_learning_path(
    p_path_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_course_ids UUID[],
    p_updated_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_path_owner UUID;
    v_is_admin BOOLEAN;
    v_course_id UUID;
    v_sequence INT := 1;
    v_result json;
BEGIN
    -- Validate inputs
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning path name cannot be empty';
    END IF;
    
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Learning path description cannot be empty';
    END IF;
    
    -- Check if learning path exists and get owner
    SELECT created_by INTO v_path_owner
    FROM learning_paths
    WHERE id = p_path_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Learning path not found';
    END IF;
    
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_updated_by 
        AND is_active = true
        AND role_type = 'admin'
    ) INTO v_is_admin;
    
    -- Check permissions: must be owner or admin
    IF v_path_owner != p_updated_by AND NOT v_is_admin THEN
        RAISE EXCEPTION 'You can only update your own learning paths';
    END IF;
    
    -- 1. Update the learning path metadata
    UPDATE learning_paths
    SET name = p_name,
        description = p_description,
        updated_at = NOW()
    WHERE id = p_path_id;
    
    -- 2. Delete all existing course associations
    -- FIXED: Use 'learning_path_id' instead of 'path_id'
    DELETE FROM learning_path_courses
    WHERE learning_path_id = p_path_id;
    
    -- 3. Create new course associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association with correct column name
            INSERT INTO learning_path_courses (learning_path_id, course_id, sequence)
            VALUES (p_path_id, v_course_id, v_sequence);
            
            v_sequence := v_sequence + 1;
        END LOOP;
    END IF;
    
    -- 4. Return the updated learning path
    SELECT json_build_object(
        'id', id,
        'name', name,
        'description', description,
        'created_by', created_by,
        'created_at', created_at,
        'updated_at', updated_at
    ) INTO v_result
    FROM learning_paths
    WHERE id = p_path_id;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any error will automatically rollback the entire transaction
        RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_full_learning_path TO authenticated;

-- Verify the fix
DO $$
BEGIN
    RAISE NOTICE '✅ Learning Paths RPC functions updated with correct column names';
END $$;