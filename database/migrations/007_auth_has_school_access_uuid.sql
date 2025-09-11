-- Migration: Add UUID-safe school access function and update policies
-- Purpose: Fix type mismatch issues with school_id (UUID) in RLS policies
-- Author: System
-- Date: 2024-01-11

BEGIN;

-- ============================================================================
-- PART 1: Create UUID-safe version of auth_has_school_access
-- ============================================================================

-- Create UUID version of the school access check function
CREATE OR REPLACE FUNCTION auth_has_school_access_uuid(p_school_id uuid) 
RETURNS boolean AS $$
DECLARE
    v_user_id uuid;
    v_has_access boolean;
BEGIN
    -- Get the current user's ID
    v_user_id := auth.uid();
    
    -- Check if user is null (not authenticated)
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if user is admin (admins have access to all schools)
    IF auth_is_admin() THEN
        RETURN true;
    END IF;
    
    -- Check if user has an active role in the specified school
    -- Use user_roles_cache for performance
    SELECT EXISTS (
        SELECT 1 
        FROM user_roles_cache 
        WHERE user_id = v_user_id 
        AND school_id = p_school_id
        AND is_active = true
    ) INTO v_has_access;
    
    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the function
COMMENT ON FUNCTION auth_has_school_access_uuid(uuid) IS 
'UUID-safe version: Checks if the current authenticated user has access to a specific school via active role or admin status';

-- ============================================================================
-- PART 2: Update existing RLS policies to use UUID function
-- ============================================================================

-- Update schools table policies
DROP POLICY IF EXISTS "schools_select_policy" ON schools;
CREATE POLICY "schools_select_policy" ON schools
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        AND (
            auth_is_admin() 
            OR auth_has_school_access_uuid(id)
        )
    );

DROP POLICY IF EXISTS "schools_insert_policy" ON schools;
CREATE POLICY "schools_insert_policy" ON schools
    FOR INSERT
    WITH CHECK (auth_is_admin());

DROP POLICY IF EXISTS "schools_update_policy" ON schools;
CREATE POLICY "schools_update_policy" ON schools
    FOR UPDATE
    USING (
        auth_is_admin() 
        OR auth_has_school_access_uuid(id)
    )
    WITH CHECK (
        auth_is_admin() 
        OR auth_has_school_access_uuid(id)
    );

DROP POLICY IF EXISTS "schools_delete_policy" ON schools;
CREATE POLICY "schools_delete_policy" ON schools
    FOR DELETE
    USING (auth_is_admin());

-- Update generations table policies (if they reference schools)
DROP POLICY IF EXISTS "generations_select_policy" ON generations;
CREATE POLICY "generations_select_policy" ON generations
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        AND (
            auth_is_admin() 
            OR auth_has_school_access_uuid(school_id)
        )
    );

DROP POLICY IF EXISTS "generations_insert_policy" ON generations;
CREATE POLICY "generations_insert_policy" ON generations
    FOR INSERT
    WITH CHECK (
        auth_is_admin() 
        OR auth_has_school_access_uuid(school_id)
    );

DROP POLICY IF EXISTS "generations_update_policy" ON generations;
CREATE POLICY "generations_update_policy" ON generations
    FOR UPDATE
    USING (
        auth_is_admin() 
        OR auth_has_school_access_uuid(school_id)
    )
    WITH CHECK (
        auth_is_admin() 
        OR auth_has_school_access_uuid(school_id)
    );

DROP POLICY IF EXISTS "generations_delete_policy" ON generations;
CREATE POLICY "generations_delete_policy" ON generations
    FOR DELETE
    USING (auth_is_admin());

-- Update growth_communities table policies
DROP POLICY IF EXISTS "growth_communities_select_policy" ON growth_communities;
CREATE POLICY "growth_communities_select_policy" ON growth_communities
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        AND (
            auth_is_admin() 
            OR EXISTS (
                SELECT 1 FROM generations g
                WHERE g.id = growth_communities.generation_id
                AND auth_has_school_access_uuid(g.school_id)
            )
        )
    );

DROP POLICY IF EXISTS "growth_communities_insert_policy" ON growth_communities;
CREATE POLICY "growth_communities_insert_policy" ON growth_communities
    FOR INSERT
    WITH CHECK (
        auth_is_admin() 
        OR EXISTS (
            SELECT 1 FROM generations g
            WHERE g.id = generation_id
            AND auth_has_school_access_uuid(g.school_id)
        )
    );

DROP POLICY IF EXISTS "growth_communities_update_policy" ON growth_communities;
CREATE POLICY "growth_communities_update_policy" ON growth_communities
    FOR UPDATE
    USING (
        auth_is_admin() 
        OR EXISTS (
            SELECT 1 FROM generations g
            WHERE g.id = growth_communities.generation_id
            AND auth_has_school_access_uuid(g.school_id)
        )
    )
    WITH CHECK (
        auth_is_admin() 
        OR EXISTS (
            SELECT 1 FROM generations g
            WHERE g.id = generation_id
            AND auth_has_school_access_uuid(g.school_id)
        )
    );

DROP POLICY IF EXISTS "growth_communities_delete_policy" ON growth_communities;
CREATE POLICY "growth_communities_delete_policy" ON growth_communities
    FOR DELETE
    USING (auth_is_admin());

-- ============================================================================
-- PART 3: Sanity tests (commented out for safety)
-- ============================================================================

-- Test the UUID function with a sample school ID:
-- SELECT auth_has_school_access_uuid('123e4567-e89b-12d3-a456-426614174000'::uuid);

-- Verify function exists and has correct signature:
-- SELECT proname, proargtypes::regtype[] 
-- FROM pg_proc 
-- WHERE proname IN ('auth_has_school_access', 'auth_has_school_access_uuid');

-- Check which policies use the functions:
-- SELECT schemaname, tablename, policyname, polcmd, qual::text, with_check::text
-- FROM pg_policies
-- WHERE qual::text LIKE '%auth_has_school_access%'
-- OR with_check::text LIKE '%auth_has_school_access%';

COMMIT;

-- ============================================================================
-- ROLLBACK SECTION (if needed)
-- ============================================================================
-- To rollback this migration, run:
/*
BEGIN;

-- Restore original policies using BIGINT function
DROP POLICY IF EXISTS "schools_select_policy" ON schools;
CREATE POLICY "schools_select_policy" ON schools
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        AND (
            auth_is_admin() 
            OR auth_has_school_access(id::bigint)
        )
    );

DROP POLICY IF EXISTS "schools_update_policy" ON schools;
CREATE POLICY "schools_update_policy" ON schools
    FOR UPDATE
    USING (
        auth_is_admin() 
        OR auth_has_school_access(id::bigint)
    )
    WITH CHECK (
        auth_is_admin() 
        OR auth_has_school_access(id::bigint)
    );

-- Similar restoration for other policies...

-- Drop the UUID function
DROP FUNCTION IF EXISTS auth_has_school_access_uuid(uuid);

COMMIT;
*/