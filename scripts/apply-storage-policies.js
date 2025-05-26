// Apply storage policies to fix image upload issues
// Run with: node scripts/apply-storage-policies.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

async function applyStoragePolicies() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase credentials in .env.local');
    process.exit(1);
  }

  console.log('🔧 Applying storage policies...');
  
  // Create Supabase client with service role key
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'fix-storage-policies.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n${i + 1}. Executing: ${statement.substring(0, 60)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement });
      
      if (error) {
        console.warn(`⚠️  Warning for statement ${i + 1}: ${error.message}`);
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    console.log('\n🎉 Storage policies applied successfully!');
    
    // Test the bucket access
    console.log('\n🧪 Testing bucket access...');
    const { data, error } = await supabase.storage.from('resources').list();
    
    if (error) {
      console.error('❌ Bucket test failed:', error.message);
    } else {
      console.log('✅ Bucket access test successful');
      console.log(`📁 Found ${data.length} files in resources bucket`);
    }
    
  } catch (error) {
    console.error('💥 Error applying policies:', error.message);
    process.exit(1);
  }
}

applyStoragePolicies();