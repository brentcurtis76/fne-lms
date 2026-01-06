/**
 * Apply Meeting System Migration
 * Creates the complete meeting documentation system tables and functions
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMeetingMigration() {
  try {
    console.log('🚀 Starting meeting system migration...');
    
    // Read the migration SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'meeting-system.sql');
    const migrationSQL = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📝 Processing migration SQL...');
    
    // Split the SQL into individual statements, handling complex cases
    const statements = migrationSQL
      .split(/(?<!\$[^$]*);(?![^$]*\$)/) // Split on semicolons not within $$ function blocks
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && stmt !== 'COMMENT ON');
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.trim() === '') continue;
      
      console.log(`   Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        // For complex statements with multiple commands, execute directly
        const { data, error } = await supabase
          .from('_supabase_migrations') // Use a dummy table to execute raw SQL
          .select('*')
          .limit(0);
        
        // Execute using raw SQL if available, otherwise try RPC
        let result;
        try {
          // Try direct SQL execution for CREATE TYPE and other DDL
          if (statement.includes('CREATE TYPE') || 
              statement.includes('CREATE TABLE') || 
              statement.includes('CREATE INDEX') ||
              statement.includes('CREATE POLICY') ||
              statement.includes('ALTER TABLE') ||
              statement.includes('CREATE OR REPLACE FUNCTION')) {
            
            // For these statements, we need to use RPC or handle manually
            console.log(`   ⚠️  DDL statement detected, may need manual execution:`);
            console.log(`      ${statement.substring(0, 100)}...`);
            skipCount++;
            continue;
          }
          
          // For other statements, try normal execution
          result = await supabase.rpc('exec_sql', {
            sql_statement: statement + ';'
          });
          
        } catch (execError) {
          console.log(`   ⚠️  Statement ${i + 1} execution method not available, marking as needs manual execution`);
          skipCount++;
          continue;
        }
        
        if (result && result.error) {
          console.error(`❌ Error in statement ${i + 1}:`, result.error);
          
          // Check for common acceptable errors
          if (result.error.code === '42P07') { // Relation already exists
            console.log('   ⚠️  Table/relation already exists, continuing...');
            skipCount++;
          } else if (result.error.code === '42710') { // Function already exists
            console.log('   ⚠️  Function already exists, continuing...');
            skipCount++;
          } else if (result.error.code === '42P06') { // Schema already exists
            console.log('   ⚠️  Schema already exists, continuing...');
            skipCount++;
          } else {
            errorCount++;
            console.error(`   ❌ Failed statement: ${statement.substring(0, 200)}...`);
          }
        } else {
          console.log(`   ✅ Statement ${i + 1} executed successfully`);
          successCount++;
        }
        
      } catch (error) {
        console.error(`❌ Unexpected error in statement ${i + 1}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⚠️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (skipCount > 0) {
      console.log('\n⚠️  Some DDL statements were skipped and may need manual execution.');
      console.log('   These typically include CREATE TYPE, CREATE TABLE, CREATE FUNCTION statements.');
      console.log('   You may need to run these manually in the Supabase SQL editor.');
    }
    
    // Test the migration by checking core tables
    console.log('\n🔍 Verifying migration...');
    
    const coreTables = [
      'community_meetings',
      'meeting_agreements', 
      'meeting_commitments',
      'meeting_tasks',
      'meeting_attendees'
    ];
    
    let tablesFound = 0;
    for (const table of coreTables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          console.log(`   ❌ Table ${table} not accessible: ${error.message}`);
        } else {
          console.log(`   ✅ Table ${table} is accessible`);
          tablesFound++;
        }
      } catch (error) {
        console.log(`   ❌ Table ${table} test failed: ${error.message}`);
      }
    }
    
    console.log(`\n📈 Tables verified: ${tablesFound}/${coreTables.length}`);
    
    if (tablesFound === coreTables.length) {
      console.log('🎉 Meeting system migration completed successfully!');
      console.log('\n📋 Next Steps:');
      console.log('   1. Test the system: node scripts/test-meeting-system.js');
      console.log('   2. Create sample data: node scripts/test-meeting-system.js --create-sample');
      console.log('   3. Test frontend components in browser');
      console.log('   4. Verify RLS policies with different user roles');
    } else if (tablesFound > 0) {
      console.log('⚠️  Migration partially completed. Some manual steps may be required.');
      console.log('\n📋 Manual Steps Needed:');
      console.log('   1. Check Supabase SQL editor for any failed DDL statements');
      console.log('   2. Run missing CREATE TYPE, CREATE TABLE, and CREATE FUNCTION statements');
      console.log('   3. Re-run this migration script to verify');
    } else {
      console.log('❌ Migration appears to have failed. Manual intervention required.');
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Check Supabase connection and permissions');
      console.log('   2. Verify SUPABASE_SERVICE_ROLE_KEY has sufficient privileges'); 
      console.log('   3. Try running DDL statements manually in Supabase SQL editor');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify environment variables are set correctly');
    console.error('   2. Check Supabase project is accessible');
    console.error('   3. Ensure service role key has admin privileges');
    process.exit(1);
  }
}

// Helper function to create workspace-meetings junction if needed
async function ensureWorkspaceIntegration() {
  console.log('\n🔗 Ensuring workspace integration...');
  
  try {
    // Check if community_workspaces table exists
    const { data: workspaces, error: workspaceError } = await supabase
      .from('community_workspaces')
      .select('id')
      .limit(1);
    
    if (workspaceError) {
      console.log('⚠️  Community workspaces table not found. Run workspace migration first.');
      return false;
    }
    
    console.log('✅ Workspace integration verified');
    return true;
    
  } catch (error) {
    console.log('⚠️  Could not verify workspace integration:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('🎯 Genera Meeting System Migration');
  console.log('================================\n');
  
  // Check workspace integration first
  const workspaceReady = await ensureWorkspaceIntegration();
  if (!workspaceReady) {
    console.log('❌ Workspace system not ready. Please run workspace migration first:');
    console.log('   node scripts/apply-workspace-migration.js');
    process.exit(1);
  }
  
  await runMeetingMigration();
}

main();