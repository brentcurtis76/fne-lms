-- Instagram-style feed implementation for Collaborative Space
-- This migration adds tables for posts, reactions, comments, and media

-- 1. Create community_posts table for all post types
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'document', 'link', 'poll', 'question')),
  content JSONB NOT NULL, -- Flexible content storage for different post types
  visibility TEXT DEFAULT 'community' CHECK (visibility IN ('community', 'school', 'private')),
  is_pinned BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create post_reactions table for likes and other reactions
CREATE TABLE IF NOT EXISTS post_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  reaction_type TEXT NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like', 'love', 'celebrate', 'support', 'insightful')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- One reaction per user per post
);

-- 3. Create post_comments table for nested comments
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE, -- For nested replies
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create post_media table for images and videos
CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'video')),
  url TEXT NOT NULL,
  storage_path TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  order_index INTEGER DEFAULT 0, -- For carousel ordering
  metadata JSONB, -- Store dimensions, duration, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create post_mentions table for @mentions
CREATE TABLE IF NOT EXISTS post_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, mentioned_user_id)
);

-- 6. Create post_hashtags table
CREATE TABLE IF NOT EXISTS post_hashtags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  hashtag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, hashtag)
);

-- 7. Create saved_posts table for bookmarking
CREATE TABLE IF NOT EXISTS saved_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- 8. Add indexes for performance
CREATE INDEX idx_community_posts_workspace ON community_posts(workspace_id);
CREATE INDEX idx_community_posts_author ON community_posts(author_id);
CREATE INDEX idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX idx_community_posts_type ON community_posts(type);
CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);
CREATE INDEX idx_post_comments_post ON post_comments(post_id);
CREATE INDEX idx_post_media_post ON post_media(post_id);
CREATE INDEX idx_post_hashtags_hashtag ON post_hashtags(hashtag);
CREATE INDEX idx_saved_posts_user ON saved_posts(user_id);

-- 9. Create views for common queries

-- View for posts with engagement counts
CREATE OR REPLACE VIEW posts_with_engagement AS
SELECT 
  p.*,
  COALESCE(reaction_counts.total_reactions, 0) as reaction_count,
  COALESCE(comment_counts.total_comments, 0) as comment_count,
  COALESCE(media_counts.total_media, 0) as media_count
FROM community_posts p
LEFT JOIN (
  SELECT post_id, COUNT(*) as total_reactions
  FROM post_reactions
  GROUP BY post_id
) reaction_counts ON p.id = reaction_counts.post_id
LEFT JOIN (
  SELECT post_id, COUNT(*) as total_comments
  FROM post_comments
  GROUP BY post_id
) comment_counts ON p.id = comment_counts.post_id
LEFT JOIN (
  SELECT post_id, COUNT(*) as total_media
  FROM post_media
  GROUP BY post_id
) media_counts ON p.id = media_counts.post_id;

-- 10. Set up RLS policies

-- Enable RLS on all tables
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;

-- Community posts policies
CREATE POLICY "Users can view posts from their communities"
  ON community_posts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN growth_communities gc ON cw.community_id = gc.id
      JOIN user_roles ur ON ur.community_id = gc.id
      WHERE cw.id = community_posts.workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Users can create posts in their communities"
  ON community_posts FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM community_workspaces cw
      JOIN growth_communities gc ON cw.community_id = gc.id
      JOIN user_roles ur ON ur.community_id = gc.id
      WHERE cw.id = workspace_id
      AND ur.user_id = auth.uid()
      AND ur.is_active = true
    )
  );

CREATE POLICY "Users can update their own posts"
  ON community_posts FOR UPDATE
  USING (author_id = auth.uid());

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
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      -- User can see the post (reuse the select policy logic)
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON post_reactions FOR DELETE
  USING (user_id = auth.uid());

-- Comments policies
CREATE POLICY "Users can view comments on visible posts"
  ON post_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      -- User can see the post
    )
  );

CREATE POLICY "Users can comment on visible posts"
  ON post_comments FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      -- User can see the post
    )
  );

CREATE POLICY "Users can update their own comments"
  ON post_comments FOR UPDATE
  USING (author_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON post_comments FOR DELETE
  USING (author_id = auth.uid());

-- Media policies
CREATE POLICY "Users can view media for visible posts"
  ON post_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      -- User can see the post
    )
  );

CREATE POLICY "Media is managed through posts"
  ON post_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      AND p.author_id = auth.uid()
    )
  );

-- Mentions policies
CREATE POLICY "Users can view mentions"
  ON post_mentions FOR SELECT
  USING (true);

CREATE POLICY "Mentions are managed through posts"
  ON post_mentions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      AND p.author_id = auth.uid()
    )
  );

-- Hashtags policies
CREATE POLICY "Anyone can view hashtags"
  ON post_hashtags FOR SELECT
  USING (true);

CREATE POLICY "Hashtags are managed through posts"
  ON post_hashtags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM community_posts p
      WHERE p.id = post_id
      AND p.author_id = auth.uid()
    )
  );

-- Saved posts policies
CREATE POLICY "Users can view their saved posts"
  ON saved_posts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can save posts"
  ON saved_posts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave posts"
  ON saved_posts FOR DELETE
  USING (user_id = auth.uid());

-- 11. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_community_posts_updated_at
  BEFORE UPDATE ON community_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_comments_updated_at
  BEFORE UPDATE ON post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 12. Add function to increment view count
CREATE OR REPLACE FUNCTION increment_post_view_count(post_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE community_posts
  SET view_count = view_count + 1
  WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_post_view_count TO authenticated;

-- 13. Summary
COMMENT ON TABLE community_posts IS 'Instagram-style posts for collaborative spaces';
COMMENT ON TABLE post_reactions IS 'User reactions (likes, etc.) on posts';
COMMENT ON TABLE post_comments IS 'Comments on posts with nested reply support';
COMMENT ON TABLE post_media IS 'Media attachments for posts (images, videos)';
COMMENT ON TABLE post_mentions IS 'User mentions in posts';
COMMENT ON TABLE post_hashtags IS 'Hashtags used in posts';
COMMENT ON TABLE saved_posts IS 'User bookmarked posts';