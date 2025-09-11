-- Migration: Add UUID-safe school access function (Fixed Version)
-- Purpose: Fix type mismatch issues with school_id in RLS policies
-- Author: System
-- Date: 2024-01-11
-- Note: This handles the case where school_id might be BIGINT in some tables

BEGIN;

-- ============================================================================
-- PART 1: Create UUID-safe version of auth_has_school_access
-- ============================================================================

-- Drop the function if it exists (to recreate with proper signature)
DROP FUNCTION IF EXISTS auth_has_school_access_uuid(uuid);

-- Create a function that accepts BIGINT but works with UUID internally
-- This bridges the type mismatch between BIGINT IDs and UUID user_roles
CREATE OR REPLACE FUNCTION auth_has_school_access_uuid(p_school_id bigint) 
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
    -- Note: school_id in user_roles_cache is BIGINT
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
COMMENT ON FUNCTION auth_has_school_access_uuid(bigint) IS 
'Fixed version: Checks if the current authenticated user has access to a specific school via active role or admin status';

-- ============================================================================
-- PART 2: Update existing RLS policies to use the new function
-- ============================================================================

-- Note: Only update policies if the tables exist and have the expected structure
DO $$
BEGIN
    -- Check if schools table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'schools') THEN
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
    END IF;

    -- Check if generations table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'generations') THEN
        -- Update generations table policies
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
    END IF;

    -- Check if growth_communities table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'growth_communities') THEN
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
    END IF;
END $$;

-- ============================================================================
-- PART 3: Verification queries (commented out for safety)
-- ============================================================================

-- Verify the function exists with correct signature:
-- SELECT proname, proargtypes::regtype[] 
-- FROM pg_proc 
-- WHERE proname = 'auth_has_school_access_uuid';

-- Test with a sample school ID (replace with actual ID):
-- SELECT auth_has_school_access_uuid(1);

-- Check column types in relevant tables:
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name IN ('schools', 'generations', 'user_roles_cache') 
-- AND column_name = 'school_id';

COMMIT;

-- ============================================================================
-- ROLLBACK SECTION (if needed)
-- ============================================================================
-- To rollback this migration, run:
/*
BEGIN;

-- Restore original policies using the original function
DROP POLICY IF EXISTS "schools_select_policy" ON schools;
CREATE POLICY "schools_select_policy" ON schools
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL 
        AND (
            auth_is_admin() 
            OR auth_has_school_access(id)
        )
    );

DROP POLICY IF EXISTS "schools_update_policy" ON schools;
CREATE POLICY "schools_update_policy" ON schools
    FOR UPDATE
    USING (
        auth_is_admin() 
        OR auth_has_school_access(id)
    )
    WITH CHECK (
        auth_is_admin() 
        OR auth_has_school_access(id)
    );

-- Similar restoration for other policies...

-- Drop the new function
DROP FUNCTION IF EXISTS auth_has_school_access_uuid(bigint);

COMMIT;
*/