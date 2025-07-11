-- =====================================================
-- Comprehensive Fix for user_roles RLS Recursion Issue
-- =====================================================
-- This script ensures all necessary components are in place
-- and fixes the recursive RLS policies on user_roles table

-- Step 1: Check if the materialized view exists, create if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_matviews 
        WHERE schemaname = 'public' 
        AND matviewname = 'user_roles_cache'
    ) THEN
        -- Create the materialized view for role lookups
        CREATE MATERIALIZED VIEW public.user_roles_cache AS
        SELECT 
            ur.user_id,
            ur.role_type as role,
            ur.school_id,
            ur.generation_id,
            ur.community_id,
            p.approval_status,
            CASE 
                WHEN ur.role_type = 'admin' THEN true
                ELSE false
            END as is_admin,
            CASE 
                WHEN ur.role_type IN ('admin', 'consultor') THEN true
                ELSE false
            END as is_teacher,
            NOW() as cached_at
        FROM user_roles ur
        JOIN profiles p ON ur.user_id = p.id
        WHERE ur.is_active = true
        AND p.approval_status = 'approved';

        -- Create indexes
        CREATE UNIQUE INDEX idx_user_roles_cache_user_id ON user_roles_cache(user_id);
        CREATE INDEX idx_user_roles_cache_role ON user_roles_cache(role);
        CREATE INDEX idx_user_roles_cache_is_admin ON user_roles_cache(is_admin);
        
        -- Grant select permission
        GRANT SELECT ON user_roles_cache TO authenticated;
    END IF;
END $$;

-- Step 2: Ensure the auth_is_admin function exists
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_is_admin boolean;
BEGIN
    -- First check JWT metadata (fastest)
    IF (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' THEN
        RETURN true;
    END IF;
    
    -- Then check the cache (avoids recursion)
    SELECT is_admin INTO v_is_admin
    FROM user_roles_cache
    WHERE user_id = auth.uid();
    
    RETURN COALESCE(v_is_admin, false);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;

-- Step 3: Refresh the materialized view to ensure it's current
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache;

-- Step 4: Fix the RLS policies on user_roles table
-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can update roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Block all direct mutations from authenticated users" ON user_roles;

-- Create new non-recursive policies
CREATE POLICY "user_roles_self_view" ON user_roles
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "user_roles_admin_view" ON user_roles
    FOR SELECT TO authenticated
    USING (auth_is_admin());

CREATE POLICY "user_roles_block_mutations" ON user_roles
    FOR ALL TO authenticated
    USING (false)
    WITH CHECK (false);

-- Add policy comments
COMMENT ON POLICY "user_roles_self_view" ON user_roles IS 
    'Allows users to see their own role assignments';

COMMENT ON POLICY "user_roles_admin_view" ON user_roles IS 
    'Allows administrators to view all role assignments using non-recursive auth_is_admin() function';

COMMENT ON POLICY "user_roles_block_mutations" ON user_roles IS 
    'Blocks ALL mutations from authenticated users. Only service role can modify roles through API endpoints.';

-- Step 5: Verify the fix
-- Check that policies are correctly set
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;

-- Test that the function works
SELECT auth_is_admin() as is_current_user_admin;

-- Test that we can query user_roles without recursion error
SELECT COUNT(*) FROM user_roles WHERE role_type = 'admin' LIMIT 1;