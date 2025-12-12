-- Migration 038: Fix community member view (replaces broken 037)
-- The previous approach caused RLS recursion. This uses a SECURITY DEFINER function instead.
--
-- IMPORTANT: First run this to remove the broken policy:
-- DROP POLICY IF EXISTS "user_roles_community_member_view" ON user_roles;

-- =============================================
-- DROP THE BROKEN POLICY
-- =============================================
DROP POLICY IF EXISTS "user_roles_community_member_view" ON user_roles;

-- =============================================
-- CREATE HELPER FUNCTION WITH SECURITY DEFINER
-- =============================================
-- This function runs with elevated privileges, bypassing RLS to get
-- the user's community IDs without causing recursion

CREATE OR REPLACE FUNCTION auth_user_community_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT community_id
    FROM user_roles
    WHERE user_id = auth.uid()
    AND community_id IS NOT NULL
    AND is_active = true;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION auth_user_community_ids() TO authenticated;

-- Add comment
COMMENT ON FUNCTION auth_user_community_ids() IS
    'Returns community IDs for the current authenticated user. Uses SECURITY DEFINER to avoid RLS recursion.';

-- =============================================
-- CREATE NON-RECURSIVE POLICY
-- =============================================
-- Now we can safely create a policy that uses the function instead of a subquery

CREATE POLICY "user_roles_community_member_view" ON user_roles
    FOR SELECT TO authenticated
    USING (
        -- Allow viewing roles of users in the same community
        community_id IS NOT NULL
        AND community_id IN (SELECT auth_user_community_ids())
    );

-- Add comment
COMMENT ON POLICY "user_roles_community_member_view" ON user_roles IS
    'Allows users to view roles of other members in their same growth community. Uses auth_user_community_ids() function to avoid RLS recursion.';

-- =============================================
-- VERIFY
-- =============================================
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;
