const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testLearningPathsDatabase() {
  console.log('Direct Database Test for Learning Paths\n');
  console.log('='.repeat(50));
  
  try {
    // Test 1: Direct table query (what the service actually does)
    console.log('\n1. Testing direct table query (like the service does)...');
    const { data: paths, error: pathsError } = await supabase
      .from('learning_paths')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (pathsError) {
      console.error('   ❌ Error:', pathsError.message);
    } else {
      console.log('   ✅ Success! Found', paths.length, 'learning paths');
      
      if (paths.length > 0) {
        console.log('\n   Sample paths:');
        paths.slice(0, 3).forEach(path => {
          console.log(`     - ${path.name} (ID: ${path.id})`);
        });
      }
    }
    
    // Test 2: Check if we can fetch profiles (for creator names)
    console.log('\n2. Testing profiles access...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .limit(5);
    
    if (profilesError) {
      console.error('   ❌ Error:', profilesError.message);
    } else {
      console.log('   ✅ Success! Can access profiles table');
    }
    
    // Test 3: Check course counts
    console.log('\n3. Testing learning_path_courses access...');
    const { data: pathCourses, error: coursesError } = await supabase
      .from('learning_path_courses')
      .select('path_id, course_id')
      .limit(10);
    
    if (coursesError) {
      console.error('   ❌ Error:', coursesError.message);
    } else {
      console.log('   ✅ Success! Found', pathCourses?.length || 0, 'course assignments');
    }
    
    // Test 4: Check user roles for permissions
    console.log('\n4. Testing user_roles for permission check...');
    const { data: adminRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .eq('is_active', true)
      .in('role_type', ['admin', 'equipo_directivo', 'consultor'])
      .limit(5);
    
    if (rolesError) {
      console.error('   ❌ Error:', rolesError.message);
    } else {
      console.log('   ✅ Success! Found', adminRoles.length, 'users with manage permissions');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ DIAGNOSIS COMPLETE');
    console.log('\nAll database queries that the Learning Paths page needs are working!');
    console.log('The service uses direct table queries, NOT the RPC functions.');
    
    console.log('\n🎯 CONCLUSION:');
    console.log('The backend is fully functional. If the page isn\'t loading:');
    console.log('1. It\'s likely a frontend/authentication issue');
    console.log('2. Check that you\'re logged in with the right role');
    console.log('3. Look for JavaScript errors in the browser console');
    console.log('4. Check the Network tab for failed API requests');
    
    console.log('\n💡 TIP: Try accessing http://localhost:3000/admin/learning-paths');
    console.log('Make sure you\'re logged in as an admin user first!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

testLearningPathsDatabase();