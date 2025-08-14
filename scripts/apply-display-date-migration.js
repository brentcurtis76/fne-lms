const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('📝 Applying display_date migration to news_articles table...\n');
  
  try {
    // Since we can't run direct SQL via the JS client, let's check if the column exists
    // and provide instructions if it doesn't
    const { data, error } = await supabase
      .from('news_articles')
      .select('display_date')
      .limit(1);
    
    if (error && error.message.includes('column "display_date" does not exist')) {
      console.log('❌ Column display_date does not exist.');
      console.log('\n📋 Please run this SQL in your Supabase Dashboard SQL Editor:\n');
      console.log(`-- Add display_date column to news_articles table
ALTER TABLE news_articles 
ADD COLUMN display_date TIMESTAMP WITH TIME ZONE;

-- Set existing articles' display_date to their created_at date
UPDATE news_articles 
SET display_date = created_at 
WHERE display_date IS NULL;

-- Make display_date NOT NULL with default value
ALTER TABLE news_articles 
ALTER COLUMN display_date SET DEFAULT NOW(),
ALTER COLUMN display_date SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN news_articles.display_date IS 'The date to display for the article. Can be manually set for migrated content or scheduled posts.';`);
      
      console.log('\n✅ After running this SQL, the display_date column will be available.');
    } else if (!error) {
      console.log('✅ Column display_date already exists!');
    } else {
      console.log('❌ Unexpected error:', error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

applyMigration();