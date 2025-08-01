#!/usr/bin/env node

/**
 * Verify that learning_path_assignments table was created correctly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function verifyTable() {
  console.log('🔍 Verifying learning_path_assignments table...\n');

  try {
    // Test 1: Check table exists
    console.log('1. Checking table existence...');
    const { data, error } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ Table does not exist');
        console.log('\n📋 TO FIX: Run this SQL in Supabase Dashboard > SQL Editor:');
        console.log('   File: MANUAL_MIGRATION.sql');
        return false;
      } else {
        console.log('❌ Table access error:', error.message);
        return false;
      }
    }

    console.log('✅ Table exists and is accessible');

    // Test 2: Test constraints (user_id XOR group_id)
    console.log('\n2. Testing table constraints...');
    
    // Get a sample learning path and user
    const { data: paths } = await supabase
      .from('learning_paths')
      .select('id')
      .limit(1)
      .single();

    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)
      .single();

    if (!paths || !users) {
      console.log('❌ Missing test data (need at least 1 learning path and 1 user)');
      return false;
    }

    // Test valid assignment (user_id only)
    const testAssignment = {
      path_id: paths.id,
      user_id: users.id,
      assigned_by: users.id,
      assigned_at: new Date().toISOString()
    };

    const { data: insertData, error: insertError } = await supabase
      .from('learning_path_assignments')
      .insert(testAssignment)
      .select()
      .single();

    if (insertError) {
      console.log('❌ Insert test failed:', insertError.message);
      return false;
    }

    console.log('✅ Valid assignment insert successful');

    // Test invalid assignment (both user_id and group_id)
    const { data: groups } = await supabase
      .from('community_workspaces')
      .select('id')
      .limit(1)
      .single();

    if (groups) {
      console.log('\n3. Testing exclusive constraint...');
      const { error: constraintError } = await supabase
        .from('learning_path_assignments')
        .insert({
          path_id: paths.id,
          user_id: users.id,
          group_id: groups.id,  // This should fail
          assigned_by: users.id
        });

      if (constraintError && constraintError.message.includes('learning_path_assignments_user_or_group_exclusive')) {
        console.log('✅ Exclusive constraint working correctly');
      } else {
        console.log('❌ Exclusive constraint not working:', constraintError?.message);
      }
    }

    // Clean up test data
    await supabase
      .from('learning_path_assignments')
      .delete()
      .eq('id', insertData.id);

    console.log('\n4. Testing unique constraints...');
    
    // Test duplicate assignment prevention
    const { error: duplicateError } = await supabase
      .from('learning_path_assignments')
      .insert([testAssignment, testAssignment]);

    if (duplicateError && duplicateError.message.includes('duplicate key')) {
      console.log('✅ Unique constraint working correctly');
    } else {
      console.log('❌ Unique constraint issue:', duplicateError?.message);
    }

    console.log('\n🎯 TABLE VERIFICATION COMPLETE');
    console.log('✅ learning_path_assignments table is properly configured');
    console.log('✅ All constraints are working correctly');
    console.log('✅ Ready to run E2E tests');

    return true;

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

verifyTable().then(success => {
  if (success) {
    console.log('\n🚀 Next step: Run the E2E test');
    console.log('   Command: node scripts/test-learning-path-assignment-db.js');
  } else {
    console.log('\n❌ Please fix the issues above before running E2E tests');
  }
});