#!/usr/bin/env node

/**
 * Finalize Schema Hardening: Apply NOT NULL constraint
 * 
 * Since data is already consistent, this script attempts to apply the 
 * NOT NULL constraint. If it fails due to permissions, it provides
 * the exact SQL needed for manual execution.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SQL_TO_EXECUTE = `
-- Schema Hardening Migration: schools.has_generations NOT NULL
-- Date: 2025-07-28
-- Context: Preventing community leader role assignment bugs

-- Add NOT NULL constraint with default value
ALTER TABLE schools 
ALTER COLUMN has_generations SET NOT NULL,
ALTER COLUMN has_generations SET DEFAULT false;

-- Add helpful comment
COMMENT ON COLUMN schools.has_generations IS 
'Whether this school uses generations for organizing students. NOT NULL with default false. Updated 2025-07-28 to prevent community assignment issues.';
`;

async function attemptSchemaHardening() {
  console.log('🔧 Attempting to finalize schema hardening for schools.has_generations...\n');

  try {
    // Try to execute the ALTER TABLE command
    console.log('📝 Attempting to add NOT NULL constraint...');
    const { data: result, error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE schools 
        ALTER COLUMN has_generations SET NOT NULL,
        ALTER COLUMN has_generations SET DEFAULT false;
      `
    });

    if (error) {
      console.error('❌ Permission denied for ALTER TABLE command');
      console.error('Error details:', error);
      console.log('\n🔧 MANUAL ACTION REQUIRED:');
      console.log('The following SQL needs to be executed by a database administrator:');
      console.log('━'.repeat(80));
      console.log(SQL_TO_EXECUTE);
      console.log('━'.repeat(80));
      console.log('\nThis can be done through:');
      console.log('1. Supabase Dashboard → SQL Editor');
      console.log('2. Direct PostgreSQL connection with superuser privileges');
      console.log('3. Contact database administrator');
      return;
    }

    console.log('✅ NOT NULL constraint added successfully!');

    // Try to add the comment
    console.log('📝 Adding helpful comment...');
    const { data: commentResult, error: commentError } = await supabase.rpc('exec_sql', {
      sql: `
        COMMENT ON COLUMN schools.has_generations IS 
        'Whether this school uses generations for organizing students. NOT NULL with default false. Updated 2025-07-28 to prevent community assignment issues.';
      `
    });

    if (commentError) {
      console.error('⚠️  Warning: Could not add comment:', commentError);
    } else {
      console.log('✅ Comment added successfully!');
    }

    console.log('\n🎉 Schema hardening completed successfully!');
    
    // Run final verification
    await runFinalVerification();

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n🔧 MANUAL ACTION REQUIRED:');
    console.log('Please execute the following SQL manually:');
    console.log('━'.repeat(80));
    console.log(SQL_TO_EXECUTE);
    console.log('━'.repeat(80));
  }
}

async function runFinalVerification() {
  console.log('\n🔍 Running final verification...\n');

  try {
    // Check that the constraint was applied
    const { data: columnInfo, error } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          column_name,
          is_nullable,
          column_default,
          data_type
        FROM information_schema.columns 
        WHERE table_name = 'schools' 
        AND column_name = 'has_generations';
      `
    });

    if (error) {
      console.error('❌ Error checking column info:', error);
      return;
    }

    console.log('✅ Final column information:');
    if (columnInfo && columnInfo.length > 0) {
      const col = columnInfo[0];
      console.log(`   Column: ${col.column_name}`);
      console.log(`   Data Type: ${col.data_type}`);
      console.log(`   Is Nullable: ${col.is_nullable}`);
      console.log(`   Default: ${col.column_default}`);
      
      if (col.is_nullable === 'NO') {
        console.log('\n🎯 SUCCESS: NOT NULL constraint is now active!');
      } else {
        console.log('\n⚠️  WARNING: Column is still nullable - manual action needed');
      }
    }

  } catch (error) {
    console.error('❌ Final verification failed:', error);
  }
}

// Run the finalization
attemptSchemaHardening().catch(console.error);