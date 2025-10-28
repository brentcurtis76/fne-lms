const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function investigate() {
  console.log('=== INVESTIGATING TOM COURSE ACCESS ERROR ===\n');

  // 1. Get tom user ID
  const { data: tomProfile } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'tom@nuevaeducacion.org')
    .single();

  if (!tomProfile) {
    console.log('❌ User tom@nuevaeducacion.org not found');
    return;
  }

  console.log('1. Tom User:', tomProfile);
  const tomUserId = tomProfile.id;

  // 2. Check learning path assignment
  const { data: assignments } = await supabase
    .from('learning_path_assignments')
    .select('*')
    .eq('user_id', tomUserId);

  console.log('\n2. Learning Path Assignments:', assignments);

  if (!assignments || assignments.length === 0) {
    console.log('❌ No assignments found');
    return;
  }

  const pathId = assignments[0].path_id;
  console.log('   Path ID:', pathId);

  // 3. Get learning path details
  const { data: path } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('id', pathId)
    .single();

  console.log('\n3. Learning Path:', path);

  // 4. Get courses in the path
  const { data: pathCourses } = await supabase
    .from('learning_path_courses')
    .select('*, course:courses(*)')
    .eq('learning_path_id', pathId)
    .order('sequence_order');

  console.log('\n4. Courses in Learning Path:');
  pathCourses.forEach((pc, i) => {
    console.log(`   ${i + 1}. ${pc.course.title} (ID: ${pc.course_id})`);
  });

  const firstCourseId = pathCourses[0].course_id;
  console.log('\n   First course ID:', firstCourseId);
  console.log('   URL from screenshot:', 'c5fee76b-b0d5-4d44-874b-b7788ade4258');
  console.log('   Match:', firstCourseId === 'c5fee76b-b0d5-4d44-874b-b7788ade4258');

  // 5. Check if user is enrolled in the first course
  const { data: enrollment, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', tomUserId)
    .eq('course_id', firstCourseId);

  console.log('\n5. Course Enrollment Check:');
  if (enrollError) {
    console.log('   ❌ Error:', enrollError.message);
    console.log('   Code:', enrollError.code);
  } else if (!enrollment || enrollment.length === 0) {
    console.log('   ❌ NOT ENROLLED IN THIS COURSE!');
    console.log('   This is a critical issue - user cannot access course');
  } else {
    console.log('   ✅ Enrolled:', enrollment);
  }

  // 6. Check RLS policies on courses table
  console.log('\n6. Checking courses table RLS:');

  const { data: courseData, error: courseError } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', firstCourseId)
    .single();

  if (courseError) {
    console.log('   ❌ Error reading course:', courseError);
  } else {
    console.log('   ✅ Course readable:', courseData.title);
  }

  // 7. Check what enrollments tom DOES have
  const { data: tomEnrollments } = await supabase
    .from('course_enrollments')
    .select('course_id, courses(title)')
    .eq('user_id', tomUserId);

  console.log('\n7. Tom\'s Actual Course Enrollments:');
  if (!tomEnrollments || tomEnrollments.length === 0) {
    console.log('   ❌ NO ENROLLMENTS AT ALL!');
  } else {
    tomEnrollments.forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.courses.title} (${e.course_id})`);
    });
  }

  // 8. Check session tracker API issue (403 error)
  console.log('\n8. Session Tracker API (403 error):');
  console.log('   Error from logs: /api/learning-paths/session/start → 403');
  console.log('   This suggests RLS or permission issue');

  // 9. Root cause summary
  console.log('\n=== ROOT CAUSE IDENTIFICATION ===');
  console.log('');
  console.log('🔍 Key Findings:');
  console.log('   1. User tom@nuevaeducacion.org was assigned learning path');
  console.log('   2. Learning path contains courses');
  console.log('   3. User clicks to start first course');
  console.log('   4. Page loads but shows "No se pudo cargar el curso"');
  console.log('');
  console.log('🚨 Errors from Console:');
  console.log('   - 406 on courses table query');
  console.log('   - 403 on session/start API');
  console.log('');
  console.log('💡 ROOT CAUSE:');
  if (!enrollment || enrollment.length === 0) {
    console.log('   ✅ CONFIRMED: User is NOT enrolled in the course');
    console.log('   ');
    console.log('   When a learning path is ASSIGNED to a user, it does NOT');
    console.log('   automatically ENROLL them in the courses within that path.');
    console.log('   ');
    console.log('   The assignment creates a learning_path_assignments record,');
    console.log('   but course_enrollments records are never created.');
    console.log('   ');
    console.log('   Without enrollment:');
    console.log('   - RLS blocks access to course data (406 error)');
    console.log('   - Session tracking fails (403 error)');
    console.log('   - Course page cannot load');
  }
}

investigate().catch(console.error);
