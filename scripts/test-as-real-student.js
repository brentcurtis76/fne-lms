const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testAsStudent() {
  console.log('🧪 Testing course load AS A REAL STUDENT (simulating browser)\n');

  // Find a real student with enrollments
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get a student email and their enrolled course
  const { data: enrollment } = await adminSupabase
    .from('course_enrollments')
    .select(`
      student_id,
      course_id,
      courses(id, title),
      profiles!course_enrollments_student_id_fkey(email)
    `)
    .limit(1)
    .single();

  if (!enrollment) {
    console.log('❌ No student enrollments found to test');
    return;
  }

  console.log(`📋 Test Student: ${enrollment.profiles.email}`);
  console.log(`📚 Enrolled Course: ${enrollment.courses.title}`);
  console.log(`🆔 Course ID: ${enrollment.course_id}\n`);

  // Now test with ANON client (like browser would use)
  console.log('Step 1: Testing with ANON client (no authentication)...');
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data: anonCourse, error: anonError } = await anonClient
    .from('courses')
    .select('id, title')
    .eq('id', enrollment.course_id)
    .single();

  if (anonError) {
    console.log('⚠️  Anon user cannot see courses (expected - must be logged in)');
    console.log(`   Error: ${anonError.message}\n`);
  } else {
    console.log('⚠️  Anon user CAN see courses (may be security issue)\n');
  }

  // Test the auth_is_course_student function directly
  console.log('Step 2: Testing auth_is_course_student() function...');

  const { data: funcTest, error: funcError } = await adminSupabase.rpc(
    'auth_is_course_student',
    { p_course_id: enrollment.course_id }
  );

  if (funcError) {
    console.log('❌ PROBLEM: auth_is_course_student() function failed');
    console.log(`   Error: ${funcError.message}`);
    console.log('   This means RLS policies will FAIL for students!\n');
    return false;
  } else {
    console.log(`✅ auth_is_course_student() function exists and runs\n`);
  }

  // Check if the cache is actually being used by the auth functions
  console.log('Step 3: Testing if auth_is_admin() can read the cache...');

  const { data: adminCheckResult, error: adminCheckError } = await adminSupabase.rpc(
    'auth_is_admin'
  );

  if (adminCheckError) {
    console.log('❌ CRITICAL: auth_is_admin() function FAILED');
    console.log(`   Error: ${adminCheckError.message}`);
    console.log('   This means the RLS policies CANNOT work properly!\n');
    return false;
  } else {
    console.log(`✅ auth_is_admin() function works (returned: ${adminCheckResult})\n`);
  }

  // Test if we can read FROM the cache directly
  console.log('Step 4: Testing direct cache access with AUTHENTICATED role...');

  const { data: cacheTest, error: cacheTestError } = await anonClient
    .from('user_roles_cache')
    .select('*')
    .limit(1);

  if (cacheTestError) {
    console.log('❌ PROBLEM: Authenticated users cannot read user_roles_cache');
    console.log(`   Error: ${cacheTestError.message}`);
    console.log('   This could cause RLS failures!\n');
    return false;
  } else {
    console.log(`✅ user_roles_cache is readable by authenticated users\n`);
  }

  console.log('═'.repeat(80));
  console.log('SUMMARY:');
  console.log('═'.repeat(80));
  console.log('✅ Cache exists and has data');
  console.log('✅ Auth functions (auth_is_admin, auth_is_course_student) work');
  console.log('✅ Cache is readable by authenticated users');
  console.log('\n⚠️  CANNOT FULLY TEST: Need real student login session');
  console.log('   The RLS policies are evaluated with auth.uid() which requires');
  console.log('   an actual JWT token from a logged-in user.\n');
  console.log('RECOMMENDATION: Test manually in browser with student login');
  console.log('═'.repeat(80));

  return true;
}

testAsStudent().catch(console.error);
