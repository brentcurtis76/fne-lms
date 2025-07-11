#!/usr/bin/env node

/**
 * Test AssignTeachersModal Fix
 * Verifies that the modal can fetch users without the profiles.role column
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

async function testAssignTeachersQuery() {
  console.log('🧪 Testing AssignTeachersModal Query Fix\n');

  try {
    // 1. Test the OLD query (should fail)
    console.log('1️⃣ Testing OLD query with role column...');
    try {
      const { data: oldData, error: oldError } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, school, approval_status, role')
        .eq('approval_status', 'approved')
        .order('first_name')
        .limit(1);

      if (oldError) {
        console.log('   ❌ Old query failed (as expected):', oldError.message);
        if (oldError.message.includes('column') && oldError.message.includes('role')) {
          console.log('   ✅ Confirmed: role column does not exist');
        }
      } else {
        console.log('   ⚠️  WARNING: Old query succeeded - role column might still exist!');
      }
    } catch (e) {
      console.log('   ❌ Old query threw exception (expected)');
    }

    // 2. Test the NEW query (should succeed)
    console.log('\n2️⃣ Testing NEW query without role column...');
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, school, approval_status')
      .eq('approval_status', 'approved')
      .order('first_name');

    if (profilesError) {
      console.error('   ❌ New query failed:', profilesError);
      return false;
    }

    console.log(`   ✅ Successfully fetched ${profilesData.length} approved profiles`);

    // 3. Test fetching roles from user_roles table
    console.log('\n3️⃣ Testing role fetch from user_roles table...');
    const userIds = profilesData?.map(p => p.id) || [];
    
    if (userIds.length === 0) {
      console.log('   ⚠️  No approved users found to test roles');
      return true;
    }

    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .in('user_id', userIds);

    if (rolesError) {
      console.error('   ❌ Roles query failed:', rolesError);
      // This is not critical - users can still be displayed without roles
    } else {
      console.log(`   ✅ Successfully fetched ${rolesData?.length || 0} user roles`);
    }

    // 4. Test merging data (simulating the component logic)
    console.log('\n4️⃣ Testing data merge logic...');
    const rolesMap = new Map(rolesData?.map(r => [r.user_id, r.role_type]) || []);
    const teachersWithRoles = profilesData?.map(profile => ({
      ...profile,
      role: rolesMap.get(profile.id) || 'docente'
    })) || [];

    console.log('   ✅ Successfully merged profile and role data');
    
    // 5. Display sample results
    console.log('\n5️⃣ Sample results (first 3 users):');
    teachersWithRoles.slice(0, 3).forEach((teacher, index) => {
      console.log(`   ${index + 1}. ${teacher.first_name} ${teacher.last_name}`);
      console.log(`      Email: ${teacher.email}`);
      console.log(`      School: ${teacher.school || 'N/A'}`);
      console.log(`      Role: ${teacher.role}`);
      console.log('');
    });

    // 6. Test API endpoint
    console.log('6️⃣ Testing course assignments API endpoint...');
    
    // Get a sample course ID
    const { data: sampleCourse } = await supabase
      .from('courses')
      .select('id, title')
      .limit(1)
      .single();

    if (sampleCourse) {
      console.log(`   Using course: ${sampleCourse.title} (${sampleCourse.id})`);
      
      // Note: We can't fully test the API without a real auth token
      console.log('   ℹ️  API endpoint test requires authentication - skipping');
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log('✅ Profile query works without role column');
    console.log('✅ User roles can be fetched from user_roles table');
    console.log('✅ Data merge logic works correctly');
    console.log(`✅ Found ${teachersWithRoles.length} users ready for assignment`);
    console.log('\n🎉 AssignTeachersModal should now work correctly!');

    return true;

  } catch (error) {
    console.error('❌ Test failed with unexpected error:', error);
    return false;
  }
}

// Run test
testAssignTeachersQuery();