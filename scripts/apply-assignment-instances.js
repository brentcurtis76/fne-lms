#!/usr/bin/env node

/**
 * Apply Assignment Instance/Template Pattern Migration
 * This script applies the database changes for the new assignment template/instance system
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Starting Assignment Instance/Template Migration...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'add-assignment-instances.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL into individual statements (basic split on semicolons)
    const statements = sql
      .split(/;\s*$/m)
      .filter(stmt => stmt.trim().length > 0)
      .map(stmt => stmt.trim() + ';');

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments
      if (statement.trim().startsWith('--')) {
        continue;
      }

      // Show progress
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      // Extract first few words for logging
      const preview = statement.substring(0, 50).replace(/\n/g, ' ');
      console.log(`  ${preview}...`);

      // Execute the statement
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      
      if (error) {
        // Check if it's a "already exists" error which we can ignore
        if (error.message.includes('already exists')) {
          console.log('  ⚠️  Already exists, skipping...');
        } else {
          console.error(`\n❌ Error executing statement ${i + 1}:`, error.message);
          console.error('Statement:', statement.substring(0, 200) + '...');
          throw error;
        }
      } else {
        console.log('  ✅ Success');
      }
    }

    console.log('\n✨ Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Test creating a group assignment block in the lesson builder');
    console.log('2. Verify assignment templates are created automatically');
    console.log('3. Create an assignment instance from a template');
    console.log('4. Test student submission workflow');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Create a helper function to execute SQL directly
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
  }).catch(async (err) => {
    // If function doesn't exist, try creating it with raw SQL
    const { data, error } = await supabase
      .from('_migrations')
      .select('*')
      .limit(1);
    
    if (error && error.message.includes('exec_sql')) {
      console.log('⚠️  exec_sql function not available, will execute migration manually in Supabase dashboard');
      console.log('\n📋 Manual migration steps:');
      console.log('1. Go to Supabase SQL Editor');
      console.log('2. Copy contents of database/add-assignment-instances.sql');
      console.log('3. Paste and run in SQL Editor');
      process.exit(0);
    }
  });
}

// Run the migration
createExecSqlFunction().then(() => {
  runMigration();
});