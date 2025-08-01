-- Fix column name inconsistency in learning path RPC functions
-- The table uses 'learning_path_id' but the functions use 'path_id'

-- Drop the existing function first to avoid return type conflicts
DROP FUNCTION IF EXISTS "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid");

-- Update create_full_learning_path function to use correct column names
CREATE OR REPLACE FUNCTION "public"."create_full_learning_path"(
    "p_name" "text", 
    "p_description" "text", 
    "p_course_ids" "uuid"[], 
    "p_created_by" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_path_id UUID;
    v_course_id UUID;
    v_sequence INTEGER := 1;
    v_result JSONB;
BEGIN
    -- Input validation
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
    
    -- Start transaction block (implicit in function)
    
    -- 1. Create the learning path
    INSERT INTO learning_paths (name, description, created_by)
    VALUES (p_name, p_description, p_created_by)
    RETURNING id INTO v_path_id;
    
    -- 2. Create course associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association (FIXED: use learning_path_id instead of path_id)
            INSERT INTO learning_path_courses (learning_path_id, course_id, sequence_order)
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

-- Drop the existing update function first
DROP FUNCTION IF EXISTS "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid");

-- Update update_full_learning_path function to use correct column names
CREATE OR REPLACE FUNCTION "public"."update_full_learning_path"(
    "p_path_id" "uuid", 
    "p_name" "text", 
    "p_description" "text", 
    "p_course_ids" "uuid"[], 
    "p_updated_by" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_course_id UUID;
    v_sequence INTEGER := 1;
    v_result JSONB;
BEGIN
    -- Input validation
    IF p_name IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Learning path name cannot be empty';
    END IF;
    
    IF p_description IS NULL OR trim(p_description) = '' THEN
        RAISE EXCEPTION 'Learning path description cannot be empty';
    END IF;
    
    -- Check if path exists and user has permission
    IF NOT EXISTS (
        SELECT 1 FROM learning_paths lp
        JOIN user_roles ur ON ur.user_id = p_updated_by
        WHERE lp.id = p_path_id 
        AND ur.is_active = true
        AND (ur.role_type IN ('admin', 'equipo_directivo', 'consultor') OR lp.created_by = p_updated_by)
    ) THEN
        RAISE EXCEPTION 'Learning path not found or user does not have permission to update it';
    END IF;
    
    -- Start transaction block (implicit in function)
    
    -- 1. Update the learning path
    UPDATE learning_paths 
    SET name = p_name, 
        description = p_description, 
        updated_at = NOW()
    WHERE id = p_path_id;
    
    -- 2. Replace course associations
    -- First delete existing associations (FIXED: use learning_path_id instead of path_id)
    DELETE FROM learning_path_courses
    WHERE learning_path_id = p_path_id;
    
    -- Then add new associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association (FIXED: use learning_path_id instead of path_id)
            INSERT INTO learning_path_courses (learning_path_id, course_id, sequence_order)
            VALUES (p_path_id, v_course_id, v_sequence);
            
            v_sequence := v_sequence + 1;
        END LOOP;
    END IF;
    
    -- 3. Return the updated learning path
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

-- Update batch_assign_learning_path function to use correct column names (FIXED: use path_id for assignments table)
-- Note: learning_path_assignments table uses path_id (this is correct, no change needed)

COMMENT ON FUNCTION "public"."create_full_learning_path"("p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_created_by" "uuid") IS 'Creates a learning path with associated courses in a single atomic transaction. FIXED: Uses correct column names (learning_path_id for learning_path_courses table).';

COMMENT ON FUNCTION "public"."update_full_learning_path"("p_path_id" "uuid", "p_name" "text", "p_description" "text", "p_course_ids" "uuid"[], "p_updated_by" "uuid") IS 'Updates a learning path and replaces all course associations in a single atomic transaction. FIXED: Uses correct column names (learning_path_id for learning_path_courses table).';