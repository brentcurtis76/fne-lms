/**
 * Apply Community Workspaces Migration
 * Creates the community_workspaces table and related structures
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🚀 Starting community workspaces migration...');
    
    // Read the migration SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'community-workspaces.sql');
    const migrationSQL = fs.readFileSync(sqlPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.trim() === '') continue;
      
      console.log(`   Executing statement ${i + 1}/${statements.length}...`);
      
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_statement: statement + ';'
      });
      
      if (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error);
        // Continue with other statements for non-critical errors
        if (error.code === '42P07') { // Table already exists
          console.log('   ⚠️  Table already exists, continuing...');
        } else if (error.code === '42710') { // Function already exists
          console.log('   ⚠️  Function already exists, continuing...');
        } else {
          throw error;
        }
      } else {
        console.log(`   ✅ Statement ${i + 1} completed successfully`);
      }
    }
    
    console.log('🎉 Community workspaces migration completed successfully!');
    
    // Test the migration by checking if tables exist
    console.log('\n🔍 Verifying migration...');
    
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['community_workspaces', 'workspace_activities']);
    
    if (tablesError) {
      console.error('❌ Error verifying tables:', tablesError);
    } else {
      console.log('✅ Tables created:', tables?.map(t => t.table_name).join(', '));
    }
    
    // Test the helper function
    const { data: funcTest, error: funcError } = await supabase
      .rpc('get_or_create_community_workspace', { 
        p_community_id: '00000000-0000-0000-0000-000000000000' // Test UUID
      });
    
    if (funcError && funcError.code !== 'P0001') { // Expected error for non-existent community
      console.error('❌ Error testing function:', funcError);
    } else {
      console.log('✅ Helper functions are working');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();