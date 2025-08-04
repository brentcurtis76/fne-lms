-- Create news_articles table for the simple news system
CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content JSONB NOT NULL, -- TipTap JSON format for editing
  content_html TEXT NOT NULL, -- Pre-rendered HTML for fast display
  featured_image TEXT, -- Single image URL (optional)
  is_published BOOLEAN DEFAULT false,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read published news" ON news_articles;
DROP POLICY IF EXISTS "Admins all access to news" ON news_articles;

-- Everyone can read published articles
CREATE POLICY "Public read published news" ON news_articles
  FOR SELECT 
  USING (is_published = true);

-- Admins and consultors can do everything
CREATE POLICY "Admins all access to news" ON news_articles
  FOR ALL 
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles 
      WHERE role IN ('admin', 'consultor')
      AND is_active = true
    )
  );

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_slug ON news_articles(slug);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_news_articles_updated_at ON news_articles;

CREATE TRIGGER update_news_articles_updated_at 
  BEFORE UPDATE ON news_articles 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();