-- Ensure auth_is_admin() function exists
-- This function checks if the current user has admin role without causing recursion

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS auth_is_admin();

-- Create the function
CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles
        WHERE user_id = auth.uid()
        AND role_type = 'admin'
        AND deleted_at IS NULL
    );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION auth_is_admin() TO authenticated;

-- Comment on the function
COMMENT ON FUNCTION auth_is_admin() IS 'Checks if the current authenticated user has admin role';

-- Test the function (this will show current user's admin status)
SELECT auth_is_admin() as is_admin;