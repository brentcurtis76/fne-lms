-- ================================================
-- ADD DISPLAY_DATE COLUMN TO NEWS_ARTICLES TABLE
-- ================================================
-- This script adds a display_date column that allows manual control 
-- over the displayed date for news articles (useful for migrated content)

-- Step 1: Add the column (nullable initially)
ALTER TABLE news_articles 
ADD COLUMN IF NOT EXISTS display_date TIMESTAMP WITH TIME ZONE;

-- Step 2: Set existing articles' display_date to their created_at date
UPDATE news_articles 
SET display_date = created_at 
WHERE display_date IS NULL;

-- Step 3: Make display_date NOT NULL with default value for future inserts
ALTER TABLE news_articles 
ALTER COLUMN display_date SET DEFAULT NOW();

-- Note: We're not making it NOT NULL to avoid issues if column already exists
-- ALTER COLUMN display_date SET NOT NULL;

-- Step 4: Add documentation
COMMENT ON COLUMN news_articles.display_date IS 'The date to display for the article. Can be manually set for migrated content or scheduled posts.';

-- Verify the column was added
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'news_articles' 
AND column_name = 'display_date';