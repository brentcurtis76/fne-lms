-- Migration 003: Fix recursive RLS policy on user_roles table
-- This fixes the circular dependency that was causing 406 Not Acceptable errors
-- when admins try to access functionality that queries the user_roles table

-- =============================================
-- USER_ROLES TABLE - Fix Recursive Policies
-- =============================================

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can update roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Block all direct mutations from authenticated users" ON user_roles;

-- Create new non-recursive policies using the auth_is_admin() function
-- This function checks JWT metadata and the role cache, avoiding recursion

-- Policy 1: Users can view their own roles (no recursion)
CREATE POLICY "user_roles_self_view" ON user_roles
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Policy 2: Admins can view all roles (uses non-recursive function)
CREATE POLICY "user_roles_admin_view" ON user_roles
    FOR SELECT TO authenticated
    USING (auth_is_admin());

-- Policy 3: Block all direct mutations - force use of API endpoints
-- This ensures role changes go through proper validation and auditing
CREATE POLICY "user_roles_block_mutations" ON user_roles
    FOR ALL TO authenticated
    USING (false)
    WITH CHECK (false);

-- Add comments for documentation
COMMENT ON POLICY "user_roles_self_view" ON user_roles IS 
    'Allows users to see their own role assignments for proper UI rendering and authorization checks';

COMMENT ON POLICY "user_roles_admin_view" ON user_roles IS 
    'Allows administrators to view all role assignments using non-recursive auth_is_admin() function';

COMMENT ON POLICY "user_roles_block_mutations" ON user_roles IS 
    'Blocks ALL mutations from authenticated users. Only service role can modify roles through API endpoints.';

-- Verify the policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;

-- Test that admins can now query user_roles without recursion
-- This should not cause a 406 error anymore
SELECT COUNT(*) FROM user_roles WHERE role_type = 'admin' LIMIT 1;