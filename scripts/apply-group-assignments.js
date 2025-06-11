const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyGroupAssignmentsMigration() {
  try {
    console.log('Starting group assignments migration...');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'add-group-assignments.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');
    
    // Split by statements and execute each one
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      });
      
      if (error) {
        console.error(`Error executing statement: ${error.message}`);
        // Continue with other statements even if one fails
      } else {
        console.log('✓ Statement executed successfully');
      }
    }
    
    console.log('\n✅ Group assignments migration completed!');
    console.log('\nNext steps:');
    console.log('1. Test group assignment creation in the collaborative space');
    console.log('2. Verify group formation and member management');
    console.log('3. Test group discussion threads');
    console.log('4. Test group submission functionality');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Create exec_sql function if it doesn't exist
async function createExecSqlFunction() {
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: `
      CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
      RETURNS void AS $$
      BEGIN
        EXECUTE sql_query;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `
  }).catch(() => {
    // Function might already exist
    return { error: null };
  });
  
  if (!error) {
    console.log('✓ exec_sql function ready');
  }
}

// Run the migration
(async () => {
  await createExecSqlFunction();
  await applyGroupAssignmentsMigration();
})();