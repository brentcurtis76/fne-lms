-- Comprehensive fix for community workspace policies
-- This handles all existing policies including unexpected ones

-- 1. First, let's see what policies currently exist
DO $$
BEGIN
    RAISE NOTICE 'Current policies before cleanup:';
END $$;

SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename IN ('community_workspaces', 'workspace_activities')
ORDER BY tablename, policyname;

-- 2. Drop ALL existing policies on both tables
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on community_workspaces
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'community_workspaces'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON community_workspaces', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on community_workspaces', pol.policyname;
    END LOOP;
    
    -- Drop all policies on workspace_activities
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'workspace_activities'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON workspace_activities', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on workspace_activities', pol.policyname;
    END LOOP;
END $$;

-- 3. Recreate the correct policies

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

-- Policy 2: Community members can update workspace settings (DEMOCRATIC - any member can update)
-- This is the additional policy that was found - keeping it since it allows democratic editing
CREATE POLICY "Community members can update workspace settings" ON community_workspaces
  FOR UPDATE
  USING (
    -- Allow any community member to update workspace settings
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

-- 4. Verify the final state
DO $$
DECLARE
    cw_count INTEGER;
    wa_count INTEGER;
BEGIN
    -- Count policies on community_workspaces
    SELECT COUNT(*) INTO cw_count
    FROM pg_policies
    WHERE tablename = 'community_workspaces'
    AND schemaname = 'public';
    
    -- Count policies on workspace_activities
    SELECT COUNT(*) INTO wa_count
    FROM pg_policies
    WHERE tablename = 'workspace_activities'
    AND schemaname = 'public';
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Policy Creation Summary ===';
    RAISE NOTICE 'community_workspaces policies: %', cw_count;
    RAISE NOTICE 'workspace_activities policies: %', wa_count;
    RAISE NOTICE '';
END $$;

-- 5. Show final policies
SELECT 
    tablename,
    policyname,
    cmd,
    qual IS NOT NULL as has_using_clause,
    with_check IS NOT NULL as has_check_clause
FROM pg_policies
WHERE tablename IN ('community_workspaces', 'workspace_activities')
ORDER BY tablename, policyname;