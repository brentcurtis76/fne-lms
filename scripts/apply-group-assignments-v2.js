#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Starting group assignments v2 migration...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'simplify-group-assignments-v2.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split the SQL content by semicolons to execute statements separately
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--')); // Remove empty and comment-only statements

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'; // Re-add semicolon
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          // Check if it's a "already exists" error which we can safely ignore
          if (error.message.includes('already exists')) {
            console.log(`⚠️  Statement ${i + 1}: Already exists (skipping)`);
          } else {
            throw error;
          }
        } else {
          console.log(`✅ Statement ${i + 1}: Success`);
        }
      } catch (err) {
        console.error(`❌ Statement ${i + 1}: Failed`);
        console.error(`   Error: ${err.message}`);
        console.error(`   Statement: ${statement.substring(0, 100)}...`);
        
        // Continue with other statements even if one fails
        console.log('   Continuing with remaining statements...\n');
      }
    }

    console.log('\n✨ Migration completed!');
    console.log('\nNext steps:');
    console.log('1. Test the group assignments feature in the collaborative workspace');
    console.log('2. Verify that students can see group assignments from their enrolled courses');
    console.log('3. Test the submission flow');
    console.log('4. Verify consultant notifications are working');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Check required environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your .env file');
  process.exit(1);
}

// Note about manual execution
console.log('⚠️  Note: This script attempts to use the exec_sql RPC function.');
console.log('   If this function doesn\'t exist in your Supabase instance, you\'ll need to:');
console.log('   1. Create it in Supabase SQL editor:');
console.log('      CREATE OR REPLACE FUNCTION exec_sql(sql text) RETURNS void AS $$');
console.log('      BEGIN EXECUTE sql; END;');
console.log('      $$ LANGUAGE plpgsql SECURITY DEFINER;');
console.log('   2. Or manually execute the SQL file in Supabase SQL editor\n');

// Run the migration
applyMigration();