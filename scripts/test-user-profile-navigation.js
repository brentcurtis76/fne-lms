const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testUserProfileNavigation() {
  console.log('🔍 DASHBOARD COMMUNITY PROFILE NAVIGATION BUG TEST');
  console.log('=================================================\n');

  console.log('📝 USER REPORT:');
  console.log('"In the dashboard, when I click on someone in my growth community');
  console.log('it doesn\'t take me to their profile... it just tries and bounces back to the dashboard"\n');

  console.log('🔍 INVESTIGATING THE NAVIGATION CHAIN:\n');

  try {
    // Step 1: Find users in growth communities
    console.log('1. Finding users in growth communities...');
    const { data: communityMembers, error: membersError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        community_id,
        profiles:user_id (
          id,
          first_name,
          last_name,
          email,
          avatar_url
        ),
        communities:community_id (
          id,
          name
        )
      `)
      .not('community_id', 'is', null)
      .limit(10);

    if (membersError || !communityMembers || communityMembers.length === 0) {
      console.log('❌ No community members found');
      return;
    }

    console.log(`✅ Found ${communityMembers.length} community members\n`);

    // Step 2: Test the URL structure that dashboard uses
    console.log('2. Testing URL structure from dashboard...');
    const testMember = communityMembers[0];
    const targetUserId = testMember.profiles?.id;
    const expectedUrl = `/user/${targetUserId}`;

    console.log(`   Dashboard generates Link: ${expectedUrl}`);
    console.log(`   Target User: ${testMember.profiles?.first_name} ${testMember.profiles?.last_name}`);
    console.log(`   User ID: ${targetUserId}\n`);

    // Step 3: Check if the user profile exists and is accessible
    console.log('3. Verifying user profile data accessibility...');
    const { data: profileCheck, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', targetUserId)
      .single();

    if (profileError) {
      console.log(`❌ Profile fetch error: ${profileError.message}`);
      console.log('   This could cause the profile page to show "User not found"');
    } else {
      console.log('✅ Profile data accessible');
      console.log(`   Name: ${profileCheck.first_name} ${profileCheck.last_name}`);
      console.log(`   Email: ${profileCheck.email}`);
      console.log(`   School: ${profileCheck.school || 'Not specified'}`);
    }

    // Step 4: Check user roles for the target user
    console.log('\n4. Checking user roles for target user...');
    const { data: targetUserRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select(`
        *,
        schools:school_id(name),
        generations:generation_id(name),
        communities:community_id(name)
      `)
      .eq('user_id', targetUserId)
      .eq('is_active', true);

    if (rolesError) {
      console.log(`❌ Roles fetch error: ${rolesError.message}`);
    } else if (targetUserRoles && targetUserRoles.length > 0) {
      console.log(`✅ Found ${targetUserRoles.length} active roles for user`);
      targetUserRoles.forEach((role, index) => {
        console.log(`   ${index + 1}. ${role.role_type} (Community: ${role.communities?.name || 'None'})`);
      });
    } else {
      console.log('⚠️  No active roles found for target user');
    }

    // Step 5: Check course assignments
    console.log('\n5. Checking course assignments for target user...');
    const { data: courseAssignments, error: coursesError } = await supabase
      .from('course_assignments')
      .select(`
        course_id,
        courses (
          id,
          title,
          instructors(full_name)
        )
      `)
      .eq('teacher_id', targetUserId)
      .eq('is_active', true);

    if (coursesError) {
      console.log(`❌ Course assignments fetch error: ${coursesError.message}`);
    } else {
      console.log(`✅ Found ${courseAssignments?.length || 0} course assignments`);
    }

    // Step 6: Test authentication requirements
    console.log('\n6. Potential issues analysis...');
    console.log('   POSSIBLE CAUSES OF NAVIGATION FAILURE:');
    console.log('   ');
    console.log('   a) getUserPrimaryRole function failing:');
    console.log('      - This function is called in [userId].tsx line 46');
    console.log('      - If it throws an error, the page might not load');
    console.log('   ');
    console.log('   b) Session authentication issues:');
    console.log('      - Current user session might be invalid');
    console.log('      - Causes redirect back to dashboard or login');
    console.log('   ');
    console.log('   c) Permission checks failing:');
    console.log('      - User might not have permission to view other profiles');
    console.log('      - But this should show "User not found" not bounce back');
    console.log('   ');
    console.log('   d) Router.push() issues:');
    console.log('      - Navigation might be blocked by layout or auth guards');
    console.log('      - Link component might have onClick handler issues');

    console.log('\n🧪 RECOMMENDED DEBUGGING STEPS:');
    console.log('================================');
    console.log('1. Check browser console for JavaScript errors when clicking');
    console.log('2. Verify getUserPrimaryRole is not throwing exceptions');
    console.log('3. Check if session is valid in [userId].tsx');
    console.log('4. Add console.log statements to track navigation flow');
    console.log('5. Test direct URL navigation: /user/' + targetUserId);

    console.log('\n📍 SPECIFIC FILES TO EXAMINE:');
    console.log('=============================');
    console.log('- /pages/dashboard.tsx (lines 481-484) - Link component');
    console.log('- /pages/user/[userId].tsx (lines 26-69) - Session check');
    console.log('- /utils/roleUtils.ts - getUserPrimaryRole function');

  } catch (error) {
    console.error('❌ Unexpected error during testing:', error);
  }
}

testUserProfileNavigation().catch(console.error);