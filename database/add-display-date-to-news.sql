-- Add display_date column to news_articles table
-- This allows manual control over the displayed date for articles

ALTER TABLE news_articles 
ADD COLUMN IF NOT EXISTS display_date TIMESTAMP WITH TIME ZONE;

-- Set existing articles' display_date to their created_at date
UPDATE news_articles 
SET display_date = created_at 
WHERE display_date IS NULL;

-- Make display_date NOT NULL with default value for future inserts
ALTER TABLE news_articles 
ALTER COLUMN display_date SET DEFAULT NOW(),
ALTER COLUMN display_date SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN news_articles.display_date IS 'The date to display for the article. Can be manually set for migrated content or scheduled posts.';