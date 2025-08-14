const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNewsTable() {
  console.log('🔍 Checking news_articles table structure...\n');
  
  try {
    // Get a sample article to see the columns
    const { data, error } = await supabase
      .from('news_articles')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('Error:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Current columns in news_articles table:');
      Object.keys(data[0]).forEach(key => {
        const value = data[0][key];
        const valueType = value === null ? 'null' : typeof value;
        console.log(`  - ${key}: ${valueType}`);
      });
    } else {
      console.log('No articles found in table');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkNewsTable();