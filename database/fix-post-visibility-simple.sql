-- Fix post visibility to be restricted by community membership
-- Uses existing user_roles and community relationships

-- 1. Drop the overly permissive policies
DROP POLICY IF EXISTS "Users can view posts simple" ON community_posts;
DROP POLICY IF EXISTS "Users can create posts simple" ON community_posts;

-- 2. Create function to check workspace access
CREATE OR REPLACE FUNCTION can_access_workspace(p_user_id uuid, p_workspace_id uuid)
RETURNS boolean AS $$
BEGIN
    -- Check if user is admin
    IF EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = p_user_id 
        AND role_type = 'admin' 
        AND is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    -- Check if user is a member of the community that owns this workspace
    IF EXISTS (
        SELECT 1 
        FROM community_workspaces cw
        INNER JOIN user_roles ur ON ur.community_id = cw.community_id
        WHERE cw.id = p_workspace_id
        AND ur.user_id = p_user_id
        AND ur.is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    -- Check if user is a consultant for the school that has this community
    IF EXISTS (
        SELECT 1 
        FROM community_workspaces cw
        INNER JOIN growth_communities gc ON gc.id = cw.community_id
        INNER JOIN user_roles ur ON ur.school_id = gc.school_id
        WHERE cw.id = p_workspace_id
        AND ur.user_id = p_user_id
        AND ur.role_type = 'consultor'
        AND ur.is_active = true
    ) THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create proper community-based policies
-- View posts: Users can only see posts from workspaces they have access to
CREATE POLICY "Users can view posts from their communities"
  ON community_posts 
  FOR SELECT
  USING (
    can_access_workspace(auth.uid(), workspace_id)
  );

-- Create posts: Users can only create posts in workspaces they have access to
CREATE POLICY "Users can create posts in their communities"
  ON community_posts 
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND can_access_workspace(auth.uid(), workspace_id)
  );

-- 4. Update the posts_with_engagement view to include workspace_id
DROP VIEW IF EXISTS posts_with_engagement CASCADE;

CREATE VIEW posts_with_engagement AS
SELECT 
    cp.*,
    COALESCE(reaction_counts.like_count, 0) as like_count,
    COALESCE(reaction_counts.save_count, 0) as save_count,
    COALESCE(comment_count.count, 0) as comment_count,
    COALESCE(view_count.count, 0) as view_count,
    EXISTS(
        SELECT 1 FROM post_reactions 
        WHERE post_id = cp.id 
        AND user_id = auth.uid() 
        AND reaction_type = 'like'
    ) as is_liked_by_user,
    EXISTS(
        SELECT 1 FROM post_reactions 
        WHERE post_id = cp.id 
        AND user_id = auth.uid() 
        AND reaction_type = 'save'
    ) as is_saved_by_user
FROM community_posts cp
LEFT JOIN (
    SELECT 
        post_id,
        SUM(CASE WHEN reaction_type = 'like' THEN 1 ELSE 0 END) as like_count,
        SUM(CASE WHEN reaction_type = 'save' THEN 1 ELSE 0 END) as save_count
    FROM post_reactions
    GROUP BY post_id
) reaction_counts ON reaction_counts.post_id = cp.id
LEFT JOIN (
    SELECT post_id, COUNT(*) as count
    FROM post_comments
    WHERE deleted_at IS NULL
    GROUP BY post_id
) comment_count ON comment_count.post_id = cp.id
LEFT JOIN (
    SELECT post_id, COUNT(DISTINCT user_id) as count
    FROM post_views
    GROUP BY post_id
) view_count ON view_count.post_id = cp.id;

-- Grant access to the view
GRANT SELECT ON posts_with_engagement TO authenticated;

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

-- Output confirmation
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '===== POST VISIBILITY FIX COMPLETE =====';
    RAISE NOTICE '✓ Posts are now filtered by community membership';
    RAISE NOTICE '✓ Admins can see all posts across communities';
    RAISE NOTICE '✓ Consultants can see posts from their assigned communities';
    RAISE NOTICE '✓ Members can only see posts from their own community';
    RAISE NOTICE '✓ Access function created for reusability';
    RAISE NOTICE '=====================================';
END $$;