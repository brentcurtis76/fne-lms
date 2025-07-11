-- Fix recursive RLS policies on user_roles table
-- This addresses the infinite recursion issue when checking admin privileges

-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can update roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Block all direct mutations from authenticated users" ON user_roles;

-- Step 2: Create new non-recursive policies
-- Policy 1: Users can view their own roles
CREATE POLICY "user_roles_self_view" ON user_roles
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Policy 2: Admins can view all roles (using auth_is_admin function)
CREATE POLICY "user_roles_admin_view" ON user_roles
    FOR SELECT TO authenticated
    USING (auth_is_admin());

-- Policy 3: Block all mutations from authenticated users
-- (All mutations should go through service role via API endpoints)
CREATE POLICY "user_roles_block_mutations" ON user_roles
    FOR ALL TO authenticated
    USING (false)
    WITH CHECK (false);

-- Step 3: Verify the policies were created
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;