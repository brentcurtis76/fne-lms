-- Fix post visibility to be restricted by community membership
-- This ensures users only see posts from their communities

-- 1. Drop the overly permissive policies
DROP POLICY IF EXISTS "Users can view posts simple" ON community_posts;
DROP POLICY IF EXISTS "Users can create posts simple" ON community_posts;

-- 2. Create proper community-based policies
-- View posts: Users can only see posts from workspaces they're members of
CREATE POLICY "Users can view posts from their communities"
  ON community_posts 
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM community_workspace_members cwm
      WHERE cwm.workspace_id = community_posts.workspace_id
      AND cwm.user_id = auth.uid()
      AND cwm.is_active = true
    )
    OR
    -- Admins can see all posts
    EXISTS (
      SELECT 1 
      FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role_type = 'admin'
      AND ur.is_active = true
    )
  );

-- Create posts: Users can only create posts in workspaces they're members of
CREATE POLICY "Users can create posts in their communities"
  ON community_posts 
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND
    EXISTS (
      SELECT 1 
      FROM community_workspace_members cwm
      WHERE cwm.workspace_id = community_posts.workspace_id
      AND cwm.user_id = auth.uid()
      AND cwm.is_active = true
    )
  );

-- 3. Check and create workspace members entries for all active community members
INSERT INTO community_workspace_members (workspace_id, user_id, role, is_active)
SELECT DISTINCT
    cw.id as workspace_id,
    ur.user_id,
    CASE 
        WHEN ur.role_type = 'lider_comunidad' THEN 'leader'
        ELSE 'member'
    END as role,
    true as is_active
FROM user_roles ur
INNER JOIN community_workspaces cw ON cw.community_id = ur.community_id
WHERE ur.is_active = true
AND ur.community_id IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET is_active = true;

-- 4. Add workspace members for consultants who have access to communities
INSERT INTO community_workspace_members (workspace_id, user_id, role, is_active)
SELECT DISTINCT
    cw.id as workspace_id,
    ur.user_id,
    'consultant' as role,
    true as is_active
FROM user_roles ur
INNER JOIN growth_communities gc ON gc.school_id = ur.school_id
INNER JOIN community_workspaces cw ON cw.community_id = gc.id
WHERE ur.role_type = 'consultor'
AND ur.is_active = true
ON CONFLICT (workspace_id, user_id) DO UPDATE
SET is_active = true;

-- 5. Verify the policies
SELECT 
    'RLS Policy Check' as check_type,
    polname as policy_name,
    CASE polcmd 
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT' 
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
    END as operation
FROM pg_policy 
WHERE polrelid = 'community_posts'::regclass
ORDER BY polname;

-- 6. Count workspace members by role
SELECT 
    'Workspace Members Count' as check_type,
    role,
    COUNT(*) as count
FROM community_workspace_members
WHERE is_active = true
GROUP BY role
ORDER BY role;

-- Output confirmation
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '===== POST VISIBILITY FIX COMPLETE =====';
    RAISE NOTICE '✓ Posts are now filtered by community membership';
    RAISE NOTICE '✓ Admins can see all posts across communities';
    RAISE NOTICE '✓ Consultants can see posts from their assigned communities';
    RAISE NOTICE '✓ Members can only see posts from their own community';
    RAISE NOTICE '✓ Workspace members table populated';
    RAISE NOTICE '=====================================';
END $$;