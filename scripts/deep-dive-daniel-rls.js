const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
  const danielId = '351f761f-33db-4b98-80db-e7bc1469814b';
  const courseId = 'cfb259f8-5e59-4a2f-a842-a36f2f84ef90';

  console.log('=== DEEP DIVE: RLS AND ENROLLMENT INVESTIGATION ===\n');

  // 1. Check course details
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  console.log('1. COURSE DETAILS:');
  if (courseErr) {
    console.log('   Error:', courseErr.message);
  } else {
    console.log('   Title:', course.title);
    console.log('   Status:', course.status);
    console.log('   Created by:', course.created_by);
    console.log('   Structure type:', course.structure_type);
  }
  console.log();

  // 2. Check ALL enrollments for Daniel
  const { data: allEnrollments, error: enrollErr } = await supabase
    .from('course_enrollments')
    .select('*, courses(title)')
    .eq('user_id', danielId);

  console.log('2. DANIEL\'S ENROLLMENTS:', allEnrollments?.length || 0);
  if (allEnrollments && allEnrollments.length > 0) {
    allEnrollments.forEach((e, i) => {
      console.log(`   ${i+1}. ${e.courses.title}`);
      console.log(`      Course ID: ${e.course_id}`);
      console.log(`      Type: ${e.enrollment_type}`);
      console.log(`      Status: ${e.status}`);
      if (e.course_id === courseId) {
        console.log('      ⭐ THIS IS THE PROBLEMATIC COURSE!');
      }
    });
  } else {
    console.log('   No enrollments found');
  }
  console.log();

  // 3. Check learning path assignments
  const { data: assignments, error: assignErr } = await supabase
    .from('learning_path_assignments')
    .select('*, learning_paths(id, name)')
    .eq('user_id', danielId);

  console.log('3. LEARNING PATH ASSIGNMENTS:', assignments?.length || 0);

  if (assignments && assignments.length > 0) {
    const uniquePaths = new Map();
    assignments.forEach(a => {
      uniquePaths.set(a.learning_path_id, a.learning_paths.name);
    });

    console.log('   Unique paths:', uniquePaths.size);
    for (const [pathId, pathName] of uniquePaths) {
      console.log(`   - ${pathName} (${pathId})`);

      // Get courses in this path
      const { data: pathCourses } = await supabase
        .from('learning_path_courses')
        .select('course_id, position, courses(title)')
        .eq('learning_path_id', pathId)
        .order('position');

      if (pathCourses) {
        console.log(`     Contains ${pathCourses.length} courses:`);
        pathCourses.forEach(pc => {
          const match = pc.course_id === courseId ? ' ⭐ MATCH!' : '';
          console.log(`       ${pc.position}. ${pc.courses.title} (${pc.course_id})${match}`);
        });
      }
    }
  }
  console.log();

  // 4. Check if course should have been auto-enrolled
  console.log('4. CHECKING AUTO-ENROLLMENT LOGIC:');

  const { data: pathsWithCourse, error: pathErr } = await supabase
    .from('learning_path_courses')
    .select('learning_path_id, learning_paths(name)')
    .eq('course_id', courseId);

  if (pathsWithCourse && pathsWithCourse.length > 0) {
    console.log(`   Course is in ${pathsWithCourse.length} learning paths:`);
    pathsWithCourse.forEach(p => {
      console.log(`   - ${p.learning_paths.name} (${p.learning_path_id})`);

      // Check if Daniel is assigned to this path
      const assigned = assignments?.some(a => a.learning_path_id === p.learning_path_id);
      console.log(`     Daniel assigned to this path: ${assigned ? 'YES' : 'NO'}`);
    });
  } else {
    console.log('   ❌ Course is NOT in any learning path!');
    console.log('   This is the root cause - orphaned course');
  }
  console.log();

  // 5. Check lessons in the course
  const { data: lessons, error: lessonErr } = await supabase
    .from('lessons')
    .select('id, title')
    .eq('course_id', courseId)
    .order('position');

  console.log('5. COURSE LESSONS:', lessons?.length || 0);
  if (lessons && lessons.length > 0) {
    lessons.forEach((l, i) => {
      console.log(`   ${i+1}. ${l.title}`);
    });
  } else {
    console.log('   ⚠️  No lessons in course!');
  }
  console.log();

  console.log('=== ROOT CAUSE ANALYSIS ===');

  // Check if the course is in a learning path Daniel is assigned to
  const isInAssignedPath = pathsWithCourse?.some(pwc =>
    assignments?.some(a => a.learning_path_id === pwc.learning_path_id)
  );

  // Check if Daniel is enrolled
  const isEnrolled = allEnrollments?.some(e => e.course_id === courseId);

  console.log('Is course in a learning path Daniel is assigned to?', isInAssignedPath ? 'YES' : 'NO');
  console.log('Is Daniel enrolled in the course?', isEnrolled ? 'YES' : 'NO');

  if (isInAssignedPath && !isEnrolled) {
    console.log('\n❌ ROOT CAUSE: Daniel is assigned to a learning path containing');
    console.log('this course, but the auto-enrollment did NOT happen.');
    console.log('This is a bug in the batch_assign_learning_path() function.');
  } else if (!isInAssignedPath) {
    console.log('\n❌ ROOT CAUSE: Course is not in any learning path Daniel is');
    console.log('assigned to. This is a data integrity issue.');
  } else if (isEnrolled) {
    console.log('\n✅ Daniel IS enrolled. The 406/401 error must be from RLS policies');
    console.log('blocking anonymous access to the courses table.');
  }
}

diagnose().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
