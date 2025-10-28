-- Migration: Fix RLS policies for community_workspaces table
-- Issue: Community Managers and authenticated users cannot access workspaces
-- Date: 2025-10-06

-- Enable RLS on community_workspaces if not already enabled
ALTER TABLE community_workspaces ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_users_view_community_workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Allow authenticated users to read community workspaces" ON community_workspaces;
DROP POLICY IF EXISTS "Allow users to read workspaces for their communities" ON community_workspaces;

-- Create comprehensive read policy for community_workspaces
-- Allows access to users who have any active role (admin, consultant, community_manager, or community member)
CREATE POLICY "Allow authenticated users to read community workspaces"
ON community_workspaces
FOR SELECT
TO authenticated
USING (
  -- Allow if user has any active role
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
  )
);

-- Optional: Add insert/update policies for admins and community_managers only
CREATE POLICY "Allow admins and community managers to modify workspaces"
ON community_workspaces
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    AND role_type::text IN ('admin', 'community_manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    AND role_type::text IN ('admin', 'community_manager')
  )
);

-- Verify policies were created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'community_workspaces'
ORDER BY policyname;
