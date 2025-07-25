const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAPIWithAuth() {
  console.log('🧪 Testing Reports API with Authentication...');
  
  try {
    // Get an admin user to simulate the session
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin')
      .eq('is_active', true)
      .limit(1);
    
    if (!adminUsers || adminUsers.length === 0) {
      console.error('❌ No admin users found');
      return;
    }
    
    const adminUserId = adminUsers[0].user_id;
    console.log('👤 Using admin user:', adminUserId);
    
    // Test the getReportableUsers logic directly
    console.log('\n1. Testing getReportableUsers logic for admin...');
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id');
      
    console.log('✅ All profiles found:', allProfiles?.length || 0);
    console.log('Sample profile IDs:', allProfiles?.slice(0, 3)?.map(p => p.id));
    
    if (!allProfiles || allProfiles.length === 0) {
      console.error('❌ No profiles found - this is the problem!');
      return;
    }
    
    // Test getting user profiles with organizational info
    console.log('\n2. Testing user profiles with organizational info...');
    const userIds = allProfiles.slice(0, 5).map(p => p.id);
    
    const { data: userProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id, first_name, last_name, email, school_id, generation_id, community_id,
        schools:school_id(name),
        generations:generation_id(name),
        communities:community_id(name)
      `)
      .in('id', userIds);
    
    if (profilesError) {
      console.error('❌ Profiles error:', profilesError);
    } else {
      console.log('✅ User profiles with org info:', userProfiles?.length || 0);
      console.log('Sample profile:', userProfiles?.[0]);
    }
    
    // Test course enrollments
    console.log('\n3. Testing course enrollments...');
    const { data: enrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('user_id, course_id, completed_at, updated_at')
      .in('user_id', userIds)
      .limit(10);
    
    if (enrollError) {
      console.error('❌ Enrollments error:', enrollError);
    } else {
      console.log('✅ Course enrollments found:', enrollments?.length || 0);
      console.log('Sample enrollment:', enrollments?.[0]);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testAPIWithAuth();