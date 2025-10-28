const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('=== DIAGNOSTIC: Daniel Course Access Issue ===\n');

  // 1. Find Daniel's user ID from auth.users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.log('Error listing auth users:', authError);
    return;
  }

  const daniel = authUsers.users.find(u => u.email === 'daniel.romeroac@liceonacionaldellolleo.cl');

  if (!daniel) {
    console.log('Daniel not found in auth.users');
    return;
  }

  console.log('1. Daniel found:');
  console.log('   User ID:', daniel.id);
  console.log('   Email:', daniel.email);
  console.log();

  // 2. Check learning path assignments
  const { data: assignments, error: assignError } = await supabase
    .from('learning_path_assignments')
    .select('*, learning_paths(id, name)')
    .eq('user_id', daniel.id);

  console.log('2. Learning Path Assignments:', assignments?.length || 0);
  if (assignments) {
    assignments.forEach((a, i) => {
      console.log(`   ${i+1}. ${a.learning_paths.name}`);
      console.log(`      Path ID: ${a.learning_path_id}`);
      console.log(`      Assigned: ${a.assigned_at}`);
    });
  }
  console.log();

  // 3. Check the specific course from the URL
  const courseId = 'cfb259f8-5e59-4a2f-a842-a36f2f84ef90';
  console.log('3. Checking problematic course:', courseId);

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (courseError) {
    console.log('   ERROR fetching course:', courseError);
    console.log('   This matches the 406 error in console logs!');
  } else {
    console.log('   Course found:', course.title);
  }
  console.log();

  // 4. Check if course exists at all (bypass RLS with service role)
  const { data: courseExists, error: existsError } = await supabase
    .from('courses')
    .select('id, title, status, created_by')
    .eq('id', courseId);

  console.log('4. Course existence check:');
  if (existsError) {
    console.log('   Error:', existsError);
  } else if (!courseExists || courseExists.length === 0) {
    console.log('   ❌ COURSE DOES NOT EXIST IN DATABASE');
    console.log('   This is the root cause!');
  } else {
    console.log('   ✅ Course exists');
    console.log('   Title:', courseExists[0].title);
    console.log('   Status:', courseExists[0].status);
  }
  console.log();

  // 5. Check learning_path_courses for this course
  const { data: pathCourses, error: pathCourseError } = await supabase
    .from('learning_path_courses')
    .select('*, learning_paths(name)')
    .eq('course_id', courseId);

  console.log('5. Learning paths containing this course:', pathCourses?.length || 0);
  if (pathCourses && pathCourses.length > 0) {
    pathCourses.forEach(pc => {
      console.log(`   - ${pc.learning_paths.name} (position: ${pc.position})`);
    });
  }
  console.log();

  // 6. Check Daniel's course enrollments
  const { data: enrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('course_id, courses(title, status)')
    .eq('user_id', daniel.id);

  console.log('6. Daniel enrollments:', enrollments?.length || 0);
  if (enrollments) {
    enrollments.forEach((e, i) => {
      const title = e.courses ? e.courses.title : 'Unknown';
      const status = e.courses ? e.courses.status : 'unknown';
      console.log(`   ${i+1}. ${title} (${status})`);
    });
  }
  console.log();

  // 7. Check if the course is in Daniel's assigned learning paths
  if (assignments && assignments.length > 0) {
    console.log('7. Checking if problematic course is in assigned learning paths...');
    for (const assignment of assignments) {
      const { data: pathCourseIds } = await supabase
        .from('learning_path_courses')
        .select('course_id, position')
        .eq('learning_path_id', assignment.learning_path_id);

      const hasCourse = pathCourseIds?.some(pc => pc.course_id === courseId);
      console.log(`   ${assignment.learning_paths.name}: ${hasCourse ? '✅ Contains course' : '❌ Does not contain'}`);

      if (hasCourse) {
        const pos = pathCourseIds.find(pc => pc.course_id === courseId).position;
        console.log(`      Position in path: ${pos}`);
      }
    }
  }
  console.log();

  console.log('=== CONCLUSION ===');
  console.log('The 406 error typically means:');
  console.log('1. Course does not exist in the database');
  console.log('2. RLS policies are blocking access');
  console.log('3. Course is in draft/archived status');
  console.log('4. Missing Accept header in request');
}

diagnose().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
