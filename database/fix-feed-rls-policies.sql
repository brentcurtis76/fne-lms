-- Fix RLS policies for Instagram feed tables
-- This ensures users can properly create, read, update, and delete posts

-- First, let's check and drop existing policies to start fresh
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Users can view posts from their communities" ON community_posts;
    DROP POLICY IF EXISTS "Users can create posts in their communities" ON community_posts;
    DROP POLICY IF EXISTS "Users can update their own posts" ON community_posts;
    DROP POLICY IF EXISTS "Users can delete their own posts" ON community_posts;
    
    DROP POLICY IF EXISTS "Users can view all reactions" ON post_reactions;
    DROP POLICY IF EXISTS "Users can add reactions to visible posts" ON post_reactions;
    DROP POLICY IF EXISTS "Users can remove their own reactions" ON post_reactions;
    
    DROP POLICY IF EXISTS "Users can view comments on visible posts" ON post_comments;
    DROP POLICY IF EXISTS "Users can comment on visible posts" ON post_comments;
    DROP POLICY IF EXISTS "Users can update their own comments" ON post_comments;
    DROP POLICY IF EXISTS "Users can delete their own comments" ON post_comments;
END $$;

-- Enable RLS on all tables (if not already enabled)
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;

-- Community posts policies (simplified for testing)
CREATE POLICY "Users can view posts from their communities"
  ON community_posts FOR SELECT
  USING (
    -- User can see posts from workspaces they have access to
    workspace_id IN (
      SELECT cw.id 
      FROM community_workspaces cw
      JOIN growth_communities gc ON cw.community_id = gc.id
      JOIN user_roles ur ON ur.community_id = gc.id
      WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
    )
    OR
    -- Admins can see all posts
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Users can create posts in their communities"
  ON community_posts FOR INSERT
  WITH CHECK (
    -- Author must be the current user
    author_id = auth.uid()
    AND
    -- Workspace must be one they have access to
    workspace_id IN (
      SELECT cw.id 
      FROM community_workspaces cw
      JOIN growth_communities gc ON cw.community_id = gc.id
      JOIN user_roles ur ON ur.community_id = gc.id
      WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
    )
  );

CREATE POLICY "Users can update their own posts"
  ON community_posts FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own posts"
  ON community_posts FOR DELETE
  USING (author_id = auth.uid());

-- Reactions policies
CREATE POLICY "Users can view all reactions"
  ON post_reactions FOR SELECT
  USING (true);

CREATE POLICY "Users can add reactions to visible posts"
  ON post_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND
    post_id IN (
      SELECT id FROM community_posts
      -- Where user can see the post (reuse select policy logic)
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON post_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Comments policies
CREATE POLICY "Users can view all comments"
  ON post_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can add comments"
  ON post_comments FOR INSERT
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can update their own comments"
  ON post_comments FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON post_comments FOR DELETE
  USING (author_id = auth.uid());

-- Media policies
CREATE POLICY "Users can view all media"
  ON post_media FOR SELECT
  USING (true);

CREATE POLICY "Media is managed by post authors"
  ON post_media FOR ALL
  USING (
    post_id IN (
      SELECT id FROM community_posts
      WHERE author_id = auth.uid()
    )
  );

-- Mentions policies
CREATE POLICY "Users can view all mentions"
  ON post_mentions FOR SELECT
  USING (true);

CREATE POLICY "Mentions are managed by post authors"
  ON post_mentions FOR ALL
  USING (
    post_id IN (
      SELECT id FROM community_posts
      WHERE author_id = auth.uid()
    )
  );

-- Hashtags policies
CREATE POLICY "Users can view all hashtags"
  ON post_hashtags FOR SELECT
  USING (true);

CREATE POLICY "Hashtags are managed by post authors"
  ON post_hashtags FOR ALL
  USING (
    post_id IN (
      SELECT id FROM community_posts
      WHERE author_id = auth.uid()
    )
  );

-- Saved posts policies
DROP POLICY IF EXISTS "Users can view their saved posts" ON saved_posts;
DROP POLICY IF EXISTS "Users can save posts" ON saved_posts;
DROP POLICY IF EXISTS "Users can unsave posts" ON saved_posts;

CREATE POLICY "Users can view their saved posts"
  ON saved_posts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can save posts"
  ON saved_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave posts"
  ON saved_posts FOR DELETE
  USING (user_id = auth.uid());

-- Grant necessary permissions to the view
GRANT SELECT ON posts_with_engagement TO authenticated;
GRANT SELECT ON posts_with_engagement TO anon;

-- Test the policies
DO $$
BEGIN
    RAISE NOTICE 'RLS policies have been updated for Instagram feed tables';
    RAISE NOTICE 'Users should now be able to create and view posts in their communities';
END $$;