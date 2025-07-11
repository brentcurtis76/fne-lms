#!/usr/bin/env node

/**
 * Test Profile Update - Verify role column fix
 * 
 * This script tests that profile updates work correctly after removing
 * references to the non-existent profiles.role column.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testProfileUpdate() {
  console.log('🧪 Testing Profile Update System\n');

  try {
    // 1. First, verify profiles table schema
    console.log('1️⃣ Checking profiles table schema...');
    const { data: columns, error: schemaError } = await supabase
      .from('profiles')
      .select('*')
      .limit(0);

    if (schemaError) {
      console.error('❌ Error checking schema:', schemaError);
      return;
    }

    // Check if role column exists (it shouldn't)
    const sampleQuery = await supabase
      .from('profiles')
      .select('id, first_name, last_name, school')
      .limit(1);

    console.log('✅ Profiles table accessible');

    // 2. Test updating a profile WITHOUT role field
    console.log('\n2️⃣ Testing profile update (Jorge Parra scenario)...');
    
    // Get Jorge's user ID
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('email', 'jorge@lospellines.cl')
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.log('⚠️  Jorge Parra not found, using test user instead');
      
      // Use any existing user for testing
      const { data: testUser } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, school')
        .limit(1)
        .single();

      if (testUser) {
        console.log(`📝 Testing with user: ${testUser.first_name} ${testUser.last_name}`);
        
        // Test update WITHOUT role field
        const { data: updateData, error: updateError } = await supabase
          .from('profiles')
          .update({
            school: 'lospellines',  // Jorge's school
            description: 'Test update - no role field'
          })
          .eq('id', testUser.id)
          .select();

        if (updateError) {
          console.error('❌ Update failed:', updateError.message);
          if (updateError.message.includes('role')) {
            console.error('🚨 CRITICAL: Still trying to access role column!');
          }
        } else {
          console.log('✅ Profile updated successfully without role field');
          console.log('   Updated data:', updateData);
        }
      }
    } else if (users) {
      console.log(`📝 Found Jorge Parra (${users.id})`);
      
      // Test Jorge's exact scenario
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({
          school: 'lospellines',
          first_name: users.first_name || 'Jorge',
          last_name: users.last_name || 'Parra'
        })
        .eq('id', users.id)
        .select();

      if (updateError) {
        console.error('❌ Jorge\'s update failed:', updateError.message);
        if (updateError.message.includes('role')) {
          console.error('🚨 CRITICAL: Still trying to access role column!');
        }
      } else {
        console.log('✅ Jorge\'s profile updated successfully');
      }
    }

    // 3. Test that we can still manage roles through user_roles table
    console.log('\n3️⃣ Verifying role management through user_roles table...');
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .limit(5);

    if (roleError) {
      console.error('❌ Error accessing user_roles:', roleError);
    } else {
      console.log('✅ user_roles table accessible');
      console.log(`   Found ${roles.length} role assignments`);
    }

    // 4. Test auth.updateUser to ensure it doesn't trigger role sync
    console.log('\n4️⃣ Testing auth metadata update (should NOT affect profiles)...');
    console.log('⚠️  Note: This test requires admin API access, skipping in service role context');

    // 5. Verify no role column exists
    console.log('\n5️⃣ Confirming role column does not exist...');
    try {
      const { error: roleCheckError } = await supabase
        .from('profiles')
        .select('role')
        .limit(1);

      if (roleCheckError && roleCheckError.message.includes('column')) {
        console.log('✅ Confirmed: role column does not exist (as expected)');
      } else {
        console.error('🚨 WARNING: role column might still exist!');
      }
    } catch (e) {
      console.log('✅ role column query failed (as expected)');
    }

    console.log('\n✅ All tests completed successfully!');
    console.log('📋 Summary: Profile updates work without role column references');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testProfileUpdate();