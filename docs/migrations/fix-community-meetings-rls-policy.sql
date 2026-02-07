-- Fix RLS Policy for community_meetings table
-- Issue: Docente users cannot create meetings due to RLS policy restrictions
-- Solution: Add INSERT policy allowing users who are members of the workspace's community
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Author: Claude Code
-- Date: 2026-02-05

-- First, let's check if RLS is enabled on community_meetings
-- (If not, enable it)
ALTER TABLE community_meetings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe to run if they don't exist)
DROP POLICY IF EXISTS "Users can view meetings in their community workspace" ON community_meetings;
DROP POLICY IF EXISTS "Users can create meetings in their community workspace" ON community_meetings;
DROP POLICY IF EXISTS "Users can update meetings in their community workspace" ON community_meetings;
DROP POLICY IF EXISTS "Users can delete meetings in their community workspace" ON community_meetings;
DROP POLICY IF EXISTS "Community members can view meetings" ON community_meetings;
DROP POLICY IF EXISTS "Community members can create meetings" ON community_meetings;
DROP POLICY IF EXISTS "Community members can update meetings" ON community_meetings;
DROP POLICY IF EXISTS "Community members can delete meetings" ON community_meetings;

-- Helper function to check if a user is a member of a community
-- This checks if the user has an active role in the specified community
CREATE OR REPLACE FUNCTION is_community_member(check_user_id UUID, check_community_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = check_user_id
      AND community_id = check_community_id
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if a user has admin/consultor access (can access all communities)
CREATE OR REPLACE FUNCTION has_global_workspace_access(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_id = check_user_id
      AND role_type IN ('admin', 'consultor')
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy 1: SELECT - Users can view meetings in workspaces belonging to their community
-- Or if they are admin/consultor
CREATE POLICY "Community members can view meetings"
ON community_meetings FOR SELECT
TO authenticated
USING (
  -- User is admin or consultor (global access)
  has_global_workspace_access(auth.uid())
  OR
  -- User is a member of the workspace's community
  EXISTS (
    SELECT 1
    FROM community_workspaces cw
    JOIN user_roles ur ON ur.community_id = cw.community_id
    WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
  )
);

-- Policy 2: INSERT - Users can create meetings in workspaces belonging to their community
-- Or if they are admin/consultor
CREATE POLICY "Community members can create meetings"
ON community_meetings FOR INSERT
TO authenticated
WITH CHECK (
  -- User is admin or consultor (global access)
  has_global_workspace_access(auth.uid())
  OR
  -- User is a member of the workspace's community
  EXISTS (
    SELECT 1
    FROM community_workspaces cw
    JOIN user_roles ur ON ur.community_id = cw.community_id
    WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
  )
);

-- Policy 3: UPDATE - Users can update meetings in workspaces belonging to their community
-- Or if they are admin/consultor
CREATE POLICY "Community members can update meetings"
ON community_meetings FOR UPDATE
TO authenticated
USING (
  -- User is admin or consultor (global access)
  has_global_workspace_access(auth.uid())
  OR
  -- User is a member of the workspace's community
  EXISTS (
    SELECT 1
    FROM community_workspaces cw
    JOIN user_roles ur ON ur.community_id = cw.community_id
    WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
  )
)
WITH CHECK (
  -- Same check for the new values
  has_global_workspace_access(auth.uid())
  OR
  EXISTS (
    SELECT 1
    FROM community_workspaces cw
    JOIN user_roles ur ON ur.community_id = cw.community_id
    WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
  )
);

-- Policy 4: DELETE - Users can delete meetings in workspaces belonging to their community
-- Or if they are admin/consultor
CREATE POLICY "Community members can delete meetings"
ON community_meetings FOR DELETE
TO authenticated
USING (
  -- User is admin or consultor (global access)
  has_global_workspace_access(auth.uid())
  OR
  -- User is a member of the workspace's community
  EXISTS (
    SELECT 1
    FROM community_workspaces cw
    JOIN user_roles ur ON ur.community_id = cw.community_id
    WHERE cw.id = community_meetings.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
  )
);

-- Verification query: Check if policies were created
SELECT
  policyname,
  tablename,
  cmd,
  permissive
FROM pg_policies
WHERE tablename = 'community_meetings'
ORDER BY policyname;

-- Test query: Verify the docente.qa user can access their community
-- Replace with actual test after running migration
/*
SELECT
  p.email,
  ur.role_type,
  ur.community_id,
  gc.name as community_name,
  cw.id as workspace_id
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.id AND ur.is_active = true
LEFT JOIN growth_communities gc ON gc.id = ur.community_id
LEFT JOIN community_workspaces cw ON cw.community_id = gc.id
WHERE p.email = 'docente.qa@fne.cl';
*/
