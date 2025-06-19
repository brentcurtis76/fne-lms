const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function applyBlocksRLSFix() {
  console.log('Applying RLS policies fix for blocks table...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-blocks-rls-policies.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('Error applying RLS fix:', error);
      console.log('\nIf the error is about exec_sql not existing, please run the SQL manually in Supabase SQL Editor.');
      return;
    }

    console.log('✅ RLS policies for blocks table have been fixed successfully!');
    console.log('\nThe following policies have been created:');
    console.log('- blocks_select_policy: Allows authenticated users to view blocks');
    console.log('- blocks_insert_policy: Allows authenticated users to create blocks');
    console.log('- blocks_update_policy: Allows authenticated users to update blocks');
    console.log('- blocks_delete_policy: Allows authenticated users to delete blocks');
    console.log('\nBlock deletion should now work properly in the course builder.');

  } catch (error) {
    console.error('Error:', error);
    console.log('\n❌ Automatic application failed.');
    console.log('\n📋 Please manually run the following SQL in your Supabase SQL Editor:');
    console.log('Path: database/fix-blocks-rls-policies.sql');
  }
}

// Run the fix
applyBlocksRLSFix();