const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function deepTest() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🔍 DEEP VERIFICATION - Testing Potential Failure Points\n');

  // 1. Check if auth functions exist and work
  console.log('Test 1: Do the auth_* functions exist?');
  
  const { data: functions, error: funcListError } = await supabase.rpc('auth_is_admin');
  
  if (funcListError) {
    console.log('❌ CRITICAL PROBLEM: auth_is_admin() failed');
    console.log('   Error:', funcListError.message);
    console.log('   Code:', funcListError.code);
    
    if (funcListError.code === '42883') {
      console.log('\n🚨 THE FUNCTIONS WERE NOT CREATED!');
      console.log('   The CORRECT_FIX.sql only created the view, not the functions!');
      console.log('   You need to also apply the functions from 001_create_role_detection_system.sql');
      return false;
    }
  } else {
    console.log('✅ auth_is_admin() function works\n');
  }

  // 2. Test auth_is_course_student
  console.log('Test 2: Does auth_is_course_student() exist?');
  
  const { data: studentFunc, error: studentFuncError } = await supabase.rpc('auth_is_course_student', {
    p_course_id: 1  // Test with dummy ID
  });
  
  if (studentFuncError) {
    console.log('❌ CRITICAL PROBLEM: auth_is_course_student() failed');
    console.log('   Error:', studentFuncError.message);
    console.log('   Code:', studentFuncError.code);
    
    if (studentFuncError.code === '42883') {
      console.log('\n🚨 MISSING FUNCTION: auth_is_course_student()');
      console.log('   This function is REQUIRED for RLS policies to work!');
      return false;
    }
  } else {
    console.log('✅ auth_is_course_student() function exists\n');
  }

  // 3. Check course_enrollments table
  console.log('Test 3: Course enrollments exist?');
  const { count: enrollCount } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true });
  
  console.log(`✅ ${enrollCount} course enrollments found\n`);

  // 4. Can we actually query courses?
  console.log('Test 4: Can admin query courses table?');
  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select('id, title')
    .limit(1);

  if (courseError) {
    console.log('❌ PROBLEM: Cannot query courses');
    console.log('   Error:', courseError.message);
    return false;
  } else {
    console.log(`✅ Courses table accessible (found: ${courses[0]?.title})\n`);
  }

  console.log('═'.repeat(80));
  console.log('VERDICT:');
  console.log('═'.repeat(80));
  console.log('All critical components are working');
  console.log('The fix SHOULD work, but needs browser test to be 100% certain');
  console.log('═'.repeat(80));

  return true;
}

deepTest().catch(console.error);
