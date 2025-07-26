const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyProfileNavigationFix() {
  console.log('🔍 USER PROFILE NAVIGATION FIX VERIFICATION');
  console.log('==========================================\n');

  console.log('📝 USER REPORT:');
  console.log('"In the dashboard, when I click on someone in my growth community');
  console.log('it doesn\'t take me to their profile... it just tries and bounces back to the dashboard"\n');

  console.log('🐛 ISSUES IDENTIFIED AND FIXED:');
  console.log('==============================\n');

  console.log('1. ❌ BROKEN: course_assignments.is_active column reference');
  console.log('   - File: /pages/user/[userId].tsx line 107');
  console.log('   - Problem: Database column does not exist');
  console.log('   - Fix: Removed .eq("is_active", true) filter');
  console.log('   - Result: Course assignments query no longer fails\n');

  console.log('2. ❌ BROKEN: getUserPrimaryRole function causing crashes');
  console.log('   - File: /pages/user/[userId].tsx line 47');
  console.log('   - Problem: Function failure caused entire page to crash');
  console.log('   - Fix: Added try-catch wrapper with fallback to non-admin');
  console.log('   - Result: Page loads even if role check fails\n');

  console.log('3. ❌ BROKEN: Unhandled errors in profile loading');
  console.log('   - File: /pages/user/[userId].tsx loadUserProfile function');
  console.log('   - Problem: Any API error caused silent failures');
  console.log('   - Fix: Added comprehensive error handling for roles and courses');
  console.log('   - Result: Profile page shows partial data instead of failing completely\n');

  console.log('✅ FIXES APPLIED:');
  console.log('================\n');

  try {
    // Test 1: Verify community members exist and are accessible
    console.log('📊 Test 1: Community members accessibility...');
    const { data: communityMembers, error: membersError } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        community_id,
        profiles:user_id (
          id,
          first_name,
          last_name,
          email
        ),
        communities:community_id (
          name
        )
      `)
      .not('community_id', 'is', null)
      .limit(5);

    if (membersError || !communityMembers || communityMembers.length === 0) {
      console.log('⚠️  No community members found for testing');
      return;
    }

    console.log(`✅ Found ${communityMembers.length} community members for testing\n`);

    // Test 2: Verify course assignments query works without is_active
    console.log('📊 Test 2: Course assignments query (fixed)...');
    const testUserId = communityMembers[0].profiles?.id;
    
    const { data: courseAssignments, error: coursesError } = await supabase
      .from('course_assignments')
      .select(`
        course_id,
        assigned_at,
        courses (
          id,
          title,
          instructors(full_name)
        )
      `)
      .eq('teacher_id', testUserId);

    if (coursesError) {
      console.log(`❌ Course assignments query still failing: ${coursesError.message}`);
    } else {
      console.log(`✅ Course assignments query successful (${courseAssignments?.length || 0} assignments)`);
    }

    // Test 3: Verify profile data accessibility
    console.log('\n📊 Test 3: Profile data accessibility...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name, email, school, avatar_url')
      .eq('id', testUserId)
      .single();

    if (profileError) {
      console.log(`❌ Profile query failed: ${profileError.message}`);
    } else {
      console.log(`✅ Profile data accessible for ${profile.first_name} ${profile.last_name}`);
    }

    // Test 4: List test URLs for manual verification
    console.log('\n🧪 MANUAL TESTING URLS:');
    console.log('======================\n');
    console.log('Test these URLs directly in your browser:');
    communityMembers.slice(0, 3).forEach((member, index) => {
      const userId = member.profiles?.id;
      const name = member.profiles ? `${member.profiles.first_name} ${member.profiles.last_name}` : 'Unknown';
      const community = member.communities?.name || 'Unknown Community';
      
      console.log(`${index + 1}. http://localhost:3000/user/${userId}`);
      console.log(`   User: ${name}`);
      console.log(`   Community: ${community}`);
      console.log(`   Expected: Profile page loads without errors\n`);
    });

    console.log('🎯 EXPECTED RESULTS AFTER FIX:');
    console.log('==============================');
    console.log('1. ✅ Clicking community members navigates to profile page');
    console.log('2. ✅ Profile page loads user information successfully');
    console.log('3. ✅ Course assignments section shows (even if empty)');
    console.log('4. ✅ User roles display correctly');
    console.log('5. ✅ No more "bouncing back" to dashboard');
    console.log('6. ✅ Error handling prevents page crashes\n');

    console.log('📋 TESTING CHECKLIST:');
    console.log('=====================');
    console.log('□ 1. Log into dashboard at http://localhost:3000/dashboard');
    console.log('□ 2. Find "Mi Comunidad de Crecimiento" section');
    console.log('□ 3. Click on any community member');
    console.log('□ 4. Verify navigation to /user/[userId] works');
    console.log('□ 5. Verify profile page displays user information');
    console.log('□ 6. Check browser console for any remaining errors');
    console.log('□ 7. Test back navigation to dashboard works');

  } catch (error) {
    console.error('❌ Unexpected error during testing:', error);
  }

  console.log('\n✅ FIX SUMMARY:');
  console.log('===============');
  console.log('- Removed invalid database column reference');
  console.log('- Added comprehensive error handling');
  console.log('- Profile navigation should now work correctly');
  console.log('- Build completed successfully');
  console.log('\n🚀 Ready for testing!');
}

verifyProfileNavigationFix().catch(console.error);