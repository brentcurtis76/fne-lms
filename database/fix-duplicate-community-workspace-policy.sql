-- Fix duplicate policy on community_workspaces table
-- This script safely removes any duplicate policies and recreates them properly

-- First, check if there are duplicate policies
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Count how many policies exist with this name
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' 
    AND tablename = 'community_workspaces'
    AND policyname = 'Community members can view their workspace';
    
    RAISE NOTICE 'Found % policies with name "Community members can view their workspace"', policy_count;
    
    -- If there are duplicates or the policy exists, drop it
    IF policy_count > 0 THEN
        RAISE NOTICE 'Dropping existing policy...';
        DROP POLICY IF EXISTS "Community members can view their workspace" ON community_workspaces;
    END IF;
END $$;

-- Now recreate the policy properly
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

-- Verify the fix
DO $$
DECLARE
    final_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO final_count
    FROM pg_policies
    WHERE schemaname = 'public' 
    AND tablename = 'community_workspaces'
    AND policyname = 'Community members can view their workspace';
    
    RAISE NOTICE 'After fix: Found % policies with name "Community members can view their workspace"', final_count;
    
    IF final_count = 1 THEN
        RAISE NOTICE 'Success: Policy is now unique';
    ELSIF final_count = 0 THEN
        RAISE EXCEPTION 'Error: Policy was not created';
    ELSE
        RAISE EXCEPTION 'Error: Still have duplicate policies';
    END IF;
END $$;

-- Also check all other policies on community_workspaces table
SELECT 
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'community_workspaces'
ORDER BY policyname;