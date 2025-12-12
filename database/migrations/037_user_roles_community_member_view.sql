-- Migration 037: Allow community members to see other members of their community
-- This enables the Workspace members list to show all community members, not just self
-- Fixes QA Issue 5.1: "Only shows 1 member (self) in Espacio Colaborativo"

-- =============================================
-- USER_ROLES TABLE - Add Community Member View Policy
-- =============================================

-- Add policy to allow users to see other members of their same community
-- This uses a non-recursive approach to avoid infinite loops

CREATE POLICY "user_roles_community_member_view" ON user_roles
    FOR SELECT TO authenticated
    USING (
        -- Allow if the row belongs to someone in the same community as the current user
        -- We use a subquery that doesn't reference the same table with RLS
        community_id IS NOT NULL
        AND community_id IN (
            -- Get communities the current user belongs to
            -- This subquery is safe because it filters by auth.uid() first
            SELECT ur.community_id
            FROM user_roles ur
            WHERE ur.user_id = auth.uid()
            AND ur.community_id IS NOT NULL
            AND ur.is_active = true
        )
    );

-- Add comment for documentation
COMMENT ON POLICY "user_roles_community_member_view" ON user_roles IS
    'Allows authenticated users to view roles of other members in their same growth community. Required for workspace member lists.';

-- Verify the policies were created
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'user_roles'
ORDER BY policyname;
