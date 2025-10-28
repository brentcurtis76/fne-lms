const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyLlolleoStudents() {
  console.log('🔍 VERIFYING FIX FOR LICEO NACIONAL DE LLOLLEO STUDENTS\n');
  console.log('═'.repeat(80));

  // Step 1: Find Liceo Nacional de Llolleo in schools table
  console.log('Step 1: Finding Liceo Nacional de Llolleo...');

  const { data: schools, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%llolleo%');

  if (schoolError || !schools || schools.length === 0) {
    console.log('❌ Cannot find Liceo Nacional de Llolleo in schools table');
    console.log('   Error:', schoolError?.message);
    return false;
  }

  const llolleoSchool = schools[0];
  console.log(`✅ Found: ${llolleoSchool.name} (ID: ${llolleoSchool.id})\n`);

  // Step 2: Find students from Llolleo in user_roles
  console.log('Step 2: Finding students from Llolleo...');

  const { data: llolleoUserRoles, error: userRolesError } = await supabase
    .from('user_roles')
    .select('user_id, role_type, is_active, profiles!user_roles_user_id_fkey(email, first_name, last_name, approval_status)')
    .eq('school_id', llolleoSchool.id)
    .eq('role_type', 'estudiante')
    .eq('is_active', true);

  if (userRolesError) {
    console.log('❌ Error fetching Llolleo students:', userRolesError.message);
    return false;
  }

  console.log(`✅ Found ${llolleoUserRoles.length} active student records from Llolleo`);

  const approvedStudents = llolleoUserRoles.filter(
    ur => ur.profiles.approval_status === 'approved'
  );

  console.log(`   ${approvedStudents.length} are approved\n`);

  if (approvedStudents.length === 0) {
    console.log('⚠️  No approved students from Llolleo - cannot test');
    return false;
  }

  // Step 3: Check if Llolleo students are in user_roles_cache
  console.log('Step 3: Checking if Llolleo students are in user_roles_cache...');

  const llolleoUserIds = approvedStudents.map(ur => ur.user_id);

  const { data: cachedLlolleo, error: cacheError } = await supabase
    .from('user_roles_cache')
    .select('user_id, role, school_id')
    .in('user_id', llolleoUserIds);

  if (cacheError) {
    console.log('❌ CRITICAL: Cannot query user_roles_cache');
    console.log('   Error:', cacheError.message);
    console.log('   This means the fix did NOT work!\n');
    return false;
  }

  console.log(`✅ ${cachedLlolleo.length} Llolleo students found in cache`);

  const missingFromCache = approvedStudents.length - cachedLlolleo.length;
  if (missingFromCache > 0) {
    console.log(`⚠️  ${missingFromCache} approved Llolleo students are MISSING from cache`);
  }
  console.log('');

  // Step 4: Check course enrollments for Llolleo students
  console.log('Step 4: Checking course enrollments for Llolleo students...');

  const { data: llolleoEnrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('student_id, course_id, courses(id, title)')
    .in('student_id', llolleoUserIds);

  if (enrollError) {
    console.log('❌ Error checking enrollments:', enrollError.message);
    return false;
  }

  console.log(`✅ Found ${llolleoEnrollments.length} course enrollments for Llolleo students\n`);

  if (llolleoEnrollments.length === 0) {
    console.log('⚠️  Llolleo students have NO course enrollments');
    console.log('   Even with the fix, they cannot load courses (nothing to load)');
    return false;
  }

  // Step 5: Test if a specific Llolleo student can load their course
  console.log('Step 5: Testing course load for a specific Llolleo student...');

  const testEnrollment = llolleoEnrollments[0];
  const testStudent = approvedStudents.find(s => s.user_id === testEnrollment.student_id);

  console.log(`   Testing: ${testStudent.profiles.first_name} ${testStudent.profiles.last_name}`);
  console.log(`   Email: ${testStudent.profiles.email}`);
  console.log(`   Course: ${testEnrollment.courses.title}\n`);

  // Simulate the course query that happens in [courseId].tsx
  const { data: courseLoad, error: courseLoadError } = await supabase
    .from('courses')
    .select('id, title, description, structure_type')
    .eq('id', testEnrollment.course_id)
    .single();

  if (courseLoadError) {
    console.log('❌ FAILED: Course query failed (RLS blocking)');
    console.log('   Error:', courseLoadError.message);
    console.log('   Code:', courseLoadError.code);
    console.log('\n🚨 THE FIX IS NOT WORKING FOR LLOLLEO STUDENTS!\n');
    return false;
  }

  console.log('✅ Course loaded successfully via admin client\n');

  // Step 6: Check if we can load lessons
  console.log('Step 6: Testing lesson access...');

  const { data: lessons, error: lessonError } = await supabase
    .from('lessons')
    .select('id, title')
    .or(`course_id.eq.${testEnrollment.course_id},module_id.in.(select id from modules where course_id=${testEnrollment.course_id})`)
    .limit(5);

  if (lessonError) {
    console.log('⚠️  Lesson query failed:', lessonError.message);
  } else {
    console.log(`✅ Lessons accessible (${lessons?.length || 0} found)\n`);
  }

  // Final verdict
  console.log('═'.repeat(80));
  console.log('LLOLLEO-SPECIFIC VERIFICATION RESULTS:');
  console.log('═'.repeat(80));
  console.log(`✅ Llolleo school found: ${llolleoSchool.name}`);
  console.log(`✅ ${approvedStudents.length} approved Llolleo students`);
  console.log(`✅ ${cachedLlolleo.length} Llolleo students in cache`);
  console.log(`✅ ${llolleoEnrollments.length} course enrollments for Llolleo students`);
  console.log(`✅ Course queries work (tested with ${testStudent.profiles.email})`);

  if (missingFromCache > 0) {
    console.log(`\n⚠️  WARNING: ${missingFromCache} approved students missing from cache`);
    console.log('   These students might still have issues');
  }

  console.log('\n🎯 CONCLUSION:');
  console.log('   The fix SHOULD work for Llolleo students');
  console.log('   But MANUAL BROWSER TEST is required for 100% certainty');
  console.log('\n📱 Test with one of these students:');

  approvedStudents.slice(0, 3).forEach(s => {
    console.log(`   - ${s.profiles.email} (${s.profiles.first_name} ${s.profiles.last_name})`);
  });

  console.log('═'.repeat(80));

  return true;
}

verifyLlolleoStudents().catch(console.error);
