-- Create non-recursive auth functions that check JWT claims
-- This avoids the infinite recursion issue with RLS policies

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS auth_is_admin();
DROP FUNCTION IF EXISTS auth_has_role(text);

-- Create a function that checks admin status from JWT metadata
-- This completely bypasses the user_roles table and avoids recursion
CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    -- Check JWT metadata for admin role
    -- This is set during authentication and doesn't require table access
    SELECT COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
        false
    );
$$;

-- Create a more general role checking function
CREATE OR REPLACE FUNCTION auth_has_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    -- Check JWT metadata for the specified role
    SELECT COALESCE(
        (auth.jwt() -> 'user_metadata' ->> 'role') = role_name,
        false
    );
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION auth_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_has_role(text) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION auth_is_admin() IS 
    'Non-recursive function to check if current user is admin based on JWT metadata. Avoids RLS recursion issues.';
    
COMMENT ON FUNCTION auth_has_role(text) IS 
    'Non-recursive function to check if current user has a specific role based on JWT metadata.';

-- Test the functions
SELECT 
    auth_is_admin() as is_admin_jwt,
    auth_has_role('admin') as has_admin_role,
    auth.jwt() -> 'user_metadata' ->> 'role' as jwt_role;