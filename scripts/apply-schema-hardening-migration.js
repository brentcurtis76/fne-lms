#!/usr/bin/env node

/**
 * Schema Hardening Migration: schools.has_generations NOT NULL
 * 
 * This script applies a critical migration to prevent community assignment issues
 * by ensuring the has_generations column cannot be NULL.
 * 
 * Date: 2025-07-28
 * Context: Preventing community leader role assignment bugs
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🔧 Starting Schema Hardening Migration for schools.has_generations...\n');

  try {
    // Step 1: Update existing NULL values to false where no generations exist
    console.log('📝 Step 1: Updating NULL values to false where no generations exist...');
    const { data: updateFalse, error: errorFalse } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE schools 
        SET has_generations = false 
        WHERE has_generations IS NULL 
        AND NOT EXISTS (
          SELECT 1 FROM generations 
          WHERE school_id = schools.id
        );
      `
    });

    if (errorFalse) {
      console.error('❌ Error updating NULL values to false:', errorFalse);
      return;
    }
    console.log('✅ Step 1 completed');

    // Step 2: Update existing NULL values to true where generations do exist
    console.log('📝 Step 2: Updating NULL values to true where generations exist...');
    const { data: updateTrue, error: errorTrue } = await supabase.rpc('exec_sql', {
      sql: `
        UPDATE schools 
        SET has_generations = true 
        WHERE has_generations IS NULL 
        AND EXISTS (
          SELECT 1 FROM generations 
          WHERE school_id = schools.id
        );
      `
    });

    if (errorTrue) {
      console.error('❌ Error updating NULL values to true:', errorTrue);
      return;
    }
    console.log('✅ Step 2 completed');

    // Step 3: Add NOT NULL constraint with default value
    console.log('📝 Step 3: Adding NOT NULL constraint with default value...');
    const { data: alterTable, error: errorAlter } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE schools 
        ALTER COLUMN has_generations SET NOT NULL,
        ALTER COLUMN has_generations SET DEFAULT false;
      `
    });

    if (errorAlter) {
      console.error('❌ Error adding NOT NULL constraint:', errorAlter);
      return;
    }
    console.log('✅ Step 3 completed');

    // Step 4: Add helpful comment
    console.log('📝 Step 4: Adding helpful comment...');
    const { data: addComment, error: errorComment } = await supabase.rpc('exec_sql', {
      sql: `
        COMMENT ON COLUMN schools.has_generations IS 
        'Whether this school uses generations for organizing students. NOT NULL with default false. Updated 2025-07-28 to prevent community assignment issues.';
      `
    });

    if (errorComment) {
      console.error('❌ Error adding comment:', errorComment);
      return;
    }
    console.log('✅ Step 4 completed');

    console.log('\n🎉 Migration completed successfully!\n');

    // Verification steps
    await runVerification();

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

async function runVerification() {
  console.log('🔍 Running verification queries...\n');

  try {
    // Check 1: No NULL values remain
    console.log('📋 Check 1: Verifying no NULL values remain...');
    const { data: nullCheck, error: nullError } = await supabase
      .from('schools')
      .select('id')
      .is('has_generations', null);

    if (nullError) {
      console.error('❌ Error checking for NULL values:', nullError);
      return;
    }

    console.log(`✅ NULL values found: ${nullCheck?.length || 0}`);
    if (nullCheck && nullCheck.length > 0) {
      console.log('⚠️  WARNING: NULL values still exist!');
      console.log('Schools with NULL has_generations:', nullCheck.map(s => s.id));
    }

    // Check 2: All schools have explicit values
    console.log('\n📋 Check 2: All schools with their has_generations values...');
    const { data: allSchools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('id');

    if (schoolsError) {
      console.error('❌ Error fetching schools:', schoolsError);
      return;
    }

    console.log('✅ Schools and their has_generations values:');
    if (allSchools) {
      allSchools.forEach(school => {
        console.log(`   ${school.id}: ${school.name} → ${school.has_generations}`);
      });
    }

    // Check 3: Column constraint information
    console.log('\n📋 Check 3: Column constraint verification...');
    const { data: columnInfo, error: columnError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          column_name,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = 'schools' 
        AND column_name = 'has_generations';
      `
    });

    if (columnError) {
      console.error('❌ Error checking column constraints:', columnError);
      return;
    }

    console.log('✅ Column constraint information:');
    if (columnInfo && columnInfo.length > 0) {
      const col = columnInfo[0];
      console.log(`   Column: ${col.column_name}`);
      console.log(`   Nullable: ${col.is_nullable}`);
      console.log(`   Default: ${col.column_default}`);
    }

    console.log('\n🎯 Migration verification completed successfully!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run the migration
applyMigration().catch(console.error);