-- Fix for duplicate policy error in community_workspaces table
-- This script safely drops and recreates all policies to avoid duplicates

-- 1. Drop all existing policies on community_workspaces table
DO $$ 
BEGIN
    -- Drop policies if they exist
    DROP POLICY IF EXISTS "Community members can view their workspace" ON community_workspaces;
    DROP POLICY IF EXISTS "Community leaders and admins can update workspaces" ON community_workspaces;
    DROP POLICY IF EXISTS "Admins can create workspaces" ON community_workspaces;
    
    -- Also drop policies on workspace_activities
    DROP POLICY IF EXISTS "Community members can view workspace activities" ON workspace_activities;
    DROP POLICY IF EXISTS "Community members can insert workspace activities" ON workspace_activities;
EXCEPTION
    WHEN undefined_object THEN
        -- If policies don't exist, that's fine
        NULL;
END $$;

-- 2. Recreate all policies with proper checks

-- Enable RLS (safe to run multiple times)
ALTER TABLE community_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_activities ENABLE ROW LEVEL SECURITY;

-- Policy 1: Community members can view their workspace
CREATE POLICY "Community members can view their workspace" ON community_workspaces
  FOR SELECT
  USING (
    -- Allow if user has a role in this community
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.community_id = community_workspaces.community_id
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is consultant with assignments to this community's school
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN growth_communities gc ON gc.id = community_workspaces.community_id
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
      AND ur.school_id = gc.school_id
      AND ur.is_active = TRUE
    )
  );

-- Policy 2: Community leaders and admins can update workspaces
CREATE POLICY "Community leaders and admins can update workspaces" ON community_workspaces
  FOR UPDATE
  USING (
    -- Allow if user is community leader for this community
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.community_id = community_workspaces.community_id
      AND ur.role_type = 'lider_comunidad'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policy 3: Admins can create workspaces
CREATE POLICY "Admins can create workspaces" ON community_workspaces
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- Policy 4: Community members can view activities in their workspace
CREATE POLICY "Community members can view workspace activities" ON workspace_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = workspace_activities.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is consultant with access to this workspace's community school
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN growth_communities gc ON gc.id = cw.community_id
      JOIN user_roles ur ON ur.school_id = gc.school_id
      WHERE cw.id = workspace_activities.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.role_type = 'consultor'
      AND ur.is_active = TRUE
    )
  );

-- Policy 5: Community members can insert activities
CREATE POLICY "Community members can insert workspace activities" ON workspace_activities
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = workspace_activities.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = TRUE
    )
    OR
    -- Allow if user is admin
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = TRUE
    )
  );

-- 3. Verify policies were created successfully
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Check community_workspaces policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'community_workspaces'
    AND schemaname = 'public';
    
    IF policy_count != 3 THEN
        RAISE WARNING 'Expected 3 policies on community_workspaces, found %', policy_count;
    ELSE
        RAISE NOTICE 'Successfully created 3 policies on community_workspaces';
    END IF;
    
    -- Check workspace_activities policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'workspace_activities'
    AND schemaname = 'public';
    
    IF policy_count != 2 THEN
        RAISE WARNING 'Expected 2 policies on workspace_activities, found %', policy_count;
    ELSE
        RAISE NOTICE 'Successfully created 2 policies on workspace_activities';
    END IF;
END $$;

-- 4. Show current policies for verification
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('community_workspaces', 'workspace_activities')
ORDER BY tablename, policyname;