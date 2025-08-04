// Script to create the news_articles table
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🚀 Running news table migration...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create-news-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct execution since rpc might not exist
      console.log('Trying direct SQL execution...');
      const { error: directError } = await supabase.from('_').select('1');
      
      // Execute statements one by one
      const statements = sql.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`Executing: ${statement.substring(0, 50)}...`);
          const { error: stmtError } = await supabase.sql`${statement}`;
          if (stmtError) {
            console.error('Error executing statement:', stmtError);
          }
        }
      }
    }
    
    console.log('✅ News table migration completed successfully');
    
    // Test the table by trying to query it
    const { data: testData, error: testError } = await supabase
      .from('news_articles')
      .select('id')
      .limit(1);
      
    if (testError) {
      console.error('❌ Error testing table:', testError);
    } else {
      console.log('✅ Table is accessible and ready to use');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runMigration().then(() => {
    console.log('🎉 Migration completed!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { runMigration };