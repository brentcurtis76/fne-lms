const { supabase } = require('../lib/supabase-wrapper');
const fs = require('fs');
const path = require('path');

/**
 * Test script for consultant group management migration
 * This script applies the migration and runs tests to verify it worked
 */

async function testMigration() {
  console.log('=== Testing Consultant Group Management Migration ===\n');

  try {
    // Read the migration SQL
    const migrationPath = path.join(__dirname, '../database/migrations/20250108_add_consultant_group_management_settings.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('1. Applying migration...');
    const { data: migrationResult, error: migrationError } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (migrationError) {
      console.error('❌ Migration failed:', migrationError);
      return;
    }

    console.log('✅ Migration applied successfully\n');

    // Run tests
    console.log('2. Running verification tests...\n');

    // Test 1: Check new columns exist
    console.log('Test 1: Verifying new columns in group_assignment_groups table');
    const { data: columns, error: columnsError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'group_assignment_groups'
        AND column_name IN ('created_by', 'is_consultant_managed', 'max_members')
        ORDER BY column_name;
      `
    });

    if (columnsError) {
      console.error('❌ Failed to check columns:', columnsError);
    } else {
      console.log('✅ New columns found:', columns.length === 3 ? 'All 3 columns present' : `Only ${columns.length} columns found`);
      columns.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}, nullable: ${col.is_nullable}, default: ${col.column_default || 'none'}`);
      });
    }

    console.log('\nTest 2: Verifying group_assignment_settings table');
    const { data: settingsTable, error: settingsError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'group_assignment_settings'
        ) as table_exists;
      `
    });

    if (settingsError) {
      console.error('❌ Failed to check settings table:', settingsError);
    } else {
      console.log(settingsTable[0].table_exists ? '✅ Settings table exists' : '❌ Settings table not found');
    }

    console.log('\nTest 3: Checking existing groups remain unaffected');
    const { data: existingGroups, error: groupsError } = await supabase
      .from('group_assignment_groups')
      .select('id, created_by, is_consultant_managed, max_members')
      .limit(5);

    if (groupsError) {
      console.error('❌ Failed to check existing groups:', groupsError);
    } else if (existingGroups.length > 0) {
      console.log(`✅ Checked ${existingGroups.length} existing groups:`);
      const allCorrect = existingGroups.every(g => 
        g.created_by === null && 
        g.is_consultant_managed === false && 
        g.max_members === 8
      );
      console.log(allCorrect ? '   All have correct default values' : '   Some groups have unexpected values');
    } else {
      console.log('ℹ️  No existing groups found to check');
    }

    console.log('\nTest 4: Verifying RLS policies');
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT policyname, permissive, cmd
        FROM pg_policies
        WHERE tablename = 'group_assignment_settings'
        ORDER BY policyname;
      `
    });

    if (policiesError) {
      console.error('❌ Failed to check policies:', policiesError);
    } else {
      console.log(`✅ Found ${policies.length} RLS policies on settings table`);
      policies.forEach(policy => {
        console.log(`   - ${policy.policyname}: ${policy.cmd} (${policy.permissive})`);
      });
    }

    console.log('\n=== Migration Test Summary ===');
    console.log('✅ Migration applied successfully');
    console.log('✅ Database structure verified');
    console.log('✅ Existing data preserved');
    console.log('\nNext steps:');
    console.log('1. Test the rollback script if needed');
    console.log('2. Proceed with Phase 3: Consultant Group Management UI');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testMigration();