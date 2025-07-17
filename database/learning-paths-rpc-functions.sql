-- =====================================================
-- LEARNING PATHS RPC FUNCTIONS FOR TRUE ATOMICITY
-- =====================================================
-- These functions ensure true database-level transactional integrity
-- for multi-table operations in the Learning Paths feature.
-- Date: 2025-01-14
-- =====================================================

-- =====================================================
-- 1. CREATE LEARNING PATH WITH COURSES (ATOMIC)
-- =====================================================
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
            
            -- Insert course association
            INSERT INTO learning_path_courses (path_id, course_id, sequence)
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

-- Add helpful comment
COMMENT ON FUNCTION create_full_learning_path IS 
'Creates a learning path with associated courses in a single atomic transaction. 
If any part fails, the entire operation is rolled back.';

-- =====================================================
-- 2. UPDATE LEARNING PATH WITH COURSES (ATOMIC)
-- =====================================================
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
    
    -- Start atomic update
    
    -- 1. Update the learning path metadata
    UPDATE learning_paths
    SET name = p_name,
        description = p_description,
        updated_at = NOW()
    WHERE id = p_path_id;
    
    -- 2. Delete all existing course associations
    DELETE FROM learning_path_courses
    WHERE path_id = p_path_id;
    
    -- 3. Create new course associations if courses provided
    IF array_length(p_course_ids, 1) > 0 THEN
        FOREACH v_course_id IN ARRAY p_course_ids
        LOOP
            -- Verify course exists
            IF NOT EXISTS (SELECT 1 FROM courses WHERE id = v_course_id) THEN
                RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
            END IF;
            
            -- Insert course association
            INSERT INTO learning_path_courses (path_id, course_id, sequence)
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

-- Add helpful comment
COMMENT ON FUNCTION update_full_learning_path IS 
'Updates a learning path and replaces all associated courses in a single atomic transaction. 
If any part fails, the entire operation is rolled back.';

-- =====================================================
-- 3. BATCH ASSIGN LEARNING PATHS (ATOMIC)
-- =====================================================
-- This function allows assigning a learning path to multiple users
-- or groups in a single atomic operation
CREATE OR REPLACE FUNCTION batch_assign_learning_path(
    p_path_id UUID,
    p_user_ids UUID[],
    p_group_ids UUID[],
    p_assigned_by UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_group_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_assignments UUID[] := '{}';
BEGIN
    -- Validate that path exists
    IF NOT EXISTS (SELECT 1 FROM learning_paths WHERE id = p_path_id) THEN
        RAISE EXCEPTION 'Learning path not found';
    END IF;
    
    -- Check if user has permission to assign
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_assigned_by 
        AND is_active = true
        AND role_type IN ('admin', 'equipo_directivo', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign learning paths';
    END IF;
    
    -- Process user assignments
    IF array_length(p_user_ids, 1) > 0 THEN
        FOREACH v_user_id IN ARRAY p_user_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM learning_path_assignments 
                WHERE path_id = p_path_id AND user_id = v_user_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;
            
            -- Verify user exists
            IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
                RAISE EXCEPTION 'User with ID % does not exist', v_user_id;
            END IF;
            
            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, user_id, assigned_by)
            VALUES (p_path_id, v_user_id, p_assigned_by)
            RETURNING id INTO v_user_id;
            
            v_assignments := array_append(v_assignments, v_user_id);
            v_success_count := v_success_count + 1;
        END LOOP;
    END IF;
    
    -- Process group assignments
    IF array_length(p_group_ids, 1) > 0 THEN
        FOREACH v_group_id IN ARRAY p_group_ids
        LOOP
            -- Skip if already assigned
            IF EXISTS (
                SELECT 1 FROM learning_path_assignments 
                WHERE path_id = p_path_id AND group_id = v_group_id
            ) THEN
                v_skip_count := v_skip_count + 1;
                CONTINUE;
            END IF;
            
            -- Verify group exists
            IF NOT EXISTS (SELECT 1 FROM groups WHERE id = v_group_id) THEN
                RAISE EXCEPTION 'Group with ID % does not exist', v_group_id;
            END IF;
            
            -- Create assignment
            INSERT INTO learning_path_assignments (path_id, group_id, assigned_by)
            VALUES (p_path_id, v_group_id, p_assigned_by)
            RETURNING id INTO v_group_id;
            
            v_assignments := array_append(v_assignments, v_group_id);
            v_success_count := v_success_count + 1;
        END LOOP;
    END IF;
    
    -- Return summary
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'assignment_ids', v_assignments,
        'message', format('%s assignments created, %s skipped (already assigned)', 
                         v_success_count, v_skip_count)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        -- Any error will rollback all assignments
        RAISE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION batch_assign_learning_path TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION batch_assign_learning_path IS 
'Assigns a learning path to multiple users and/or groups in a single atomic transaction. 
Skips duplicates gracefully. If any assignment fails, all are rolled back.';

-- =====================================================
-- 4. VERIFICATION FUNCTION
-- =====================================================
-- Verify the functions were created successfully
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_full_learning_path') THEN
        RAISE EXCEPTION 'create_full_learning_path function was not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_full_learning_path') THEN
        RAISE EXCEPTION 'update_full_learning_path function was not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'batch_assign_learning_path') THEN
        RAISE EXCEPTION 'batch_assign_learning_path function was not created';
    END IF;
    
    RAISE NOTICE '✅ All Learning Paths RPC functions created successfully';
END $$;