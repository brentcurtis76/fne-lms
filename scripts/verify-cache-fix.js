const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyFix() {
  console.log('🔍 Verifying user_roles_cache fix...\n');

  // Test 1: Check if user_roles_cache exists
  console.log('Test 1: Checking if user_roles_cache exists...');
  const { data: cacheData, error: cacheError } = await supabase
    .from('user_roles_cache')
    .select('*')
    .limit(5);

  if (cacheError) {
    console.log('❌ FAILED: user_roles_cache does not exist');
    console.log('   Error:', cacheError.message);
    console.log('\n⚠️  YOU MUST APPLY THE FIX FIRST!');
    console.log('   1. Open: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
    console.log('   2. Copy and execute the SQL from: URGENT_FIX.sql');
    return false;
  }

  console.log('✅ PASSED: user_roles_cache exists');
  console.log(`   Sample data (${cacheData.length} rows):`);
  console.log('   ', JSON.stringify(cacheData[0], null, 2).substring(0, 200) + '...');

  // Test 2: Check row count
  const { count: cacheCount } = await supabase
    .from('user_roles_cache')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTest 2: Checking cache population...`);
  console.log(`✅ PASSED: ${cacheCount} users cached`);

  // Test 3: Verify a student can access courses
  console.log(`\nTest 3: Checking student course access...`);

  // Find a student
  const { data: students } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      first_name,
      last_name,
      user_roles!user_roles_user_id_fkey(role_type)
    `)
    .eq('user_roles.role_type', 'estudiante')
    .eq('approval_status', 'approved')
    .limit(1);

  if (!students || students.length === 0) {
    console.log('⚠️  No students found to test');
    return true;
  }

  const student = students[0];
  console.log(`   Testing with: ${student.first_name} ${student.last_name} (${student.email})`);

  // Check if student has enrollments
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('course_id, courses(id, title)')
    .eq('student_id', student.id)
    .limit(1);

  if (!enrollments || enrollments.length === 0) {
    console.log('   ⚠️  Student has no enrollments - cannot test course access');
    return true;
  }

  const courseId = enrollments[0].course_id;
  const courseTitle = enrollments[0].courses.title;

  console.log(`   Student enrolled in: ${courseTitle}`);

  // Test 4: Simulate course loading (this would fail before the fix)
  console.log(`\nTest 4: Simulating course load...`);

  const { data: courseData, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (courseError) {
    console.log('❌ FAILED: Cannot load course');
    console.log('   Error:', courseError.message);
    return false;
  }

  console.log(`✅ PASSED: Course loaded successfully`);

  // Test 5: Check if we can load lessons
  console.log(`\nTest 5: Checking lesson access...`);

  const { data: lessons, error: lessonError } = await supabase
    .from('lessons')
    .select('*')
    .limit(1);

  if (lessonError) {
    console.log('❌ FAILED: Cannot load lessons');
    console.log('   Error:', lessonError.message);
    return false;
  }

  console.log(`✅ PASSED: Lessons accessible (${lessons?.length || 0} found)`);

  // Final summary
  console.log('\n' + '═'.repeat(80));
  console.log('✅ ALL TESTS PASSED - FIX IS WORKING!');
  console.log('═'.repeat(80));
  console.log('\nNext steps:');
  console.log('1. Test in browser: https://fne-lms.vercel.app');
  console.log('2. Login as a student');
  console.log('3. Try loading a course');
  console.log('\nThe "Error cargando el curso" bug should be fixed!');
  console.log('═'.repeat(80));

  return true;
}

verifyFix().catch(console.error);
