-- Update RLS policy for news_articles to include community_manager role

-- Drop the existing admin policy
DROP POLICY IF EXISTS "Admins all access to news" ON news_articles;

-- Create updated policy with community_manager access
CREATE POLICY "Admins all access to news" ON news_articles
  FOR ALL 
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role IN ('admin', 'consultor', 'community_manager')
      AND is_active = true
    )
  );