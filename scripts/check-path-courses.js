const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkPathCourses() {
  console.log('🔍 CHECKING LEARNING PATH COURSES AND ENROLLMENTS');
  console.log('=' + '='.repeat(70));
  
  const pathId = 'c47136ef-058b-4dd5-a3d9-2d470cfbe5e4';
  
  // Get Katherine
  const { data: katherine } = await supabase
    .from('profiles')
    .select('id, email, school_id')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  // Get the learning path details from assignments
  console.log('\n📚 LEARNING PATH ASSIGNMENTS FOR KATHERINE:');
  const { data: assignments } = await supabase
    .from('learning_path_assignments')
    .select(`
      *,
      path:learning_paths(
        id,
        name,
        description
      )
    `)
    .eq('user_id', katherine?.id);
    
  if (assignments && assignments.length > 0) {
    console.log(`  Found ${assignments.length} learning path assignments:`);
    assignments.forEach(a => {
      console.log(`    - ${a.path?.name} (Path ID: ${a.path_id})`);
    });
  }
  
  // Get courses in the learning path
  console.log('\n📖 COURSES IN "ELEMENTOS DEL PLAN PERSONAL" PATH:');
  const { data: pathCourses } = await supabase
    .from('learning_path_courses')
    .select(`
      *,
      course:courses(
        id,
        title,
        is_active
      )
    `)
    .eq('learning_path_id', pathId)
    .order('sequence_order');
    
  if (pathCourses && pathCourses.length > 0) {
    console.log(`  Path contains ${pathCourses.length} courses:`);
    pathCourses.forEach(pc => {
      console.log(`    ${pc.sequence_order}. ${pc.course?.title} (Active: ${pc.course?.is_active})`);
    });
    
    // Check Katherine's enrollment in these courses
    const courseIds = pathCourses.map(pc => pc.course_id);
    
    console.log('\n📋 KATHERINE\'S ENROLLMENT IN THESE COURSES:');
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('course_id, status, enrollment_date')
      .eq('user_id', katherine?.id)
      .in('course_id', courseIds);
      
    if (enrollments && enrollments.length > 0) {
      console.log(`  Enrolled in ${enrollments.length}/${courseIds.length} courses`);
      enrollments.forEach(e => {
        const course = pathCourses.find(pc => pc.course_id === e.course_id);
        console.log(`    - ${course?.course?.title} (${e.status})`);
      });
    } else {
      console.log('  ❌ NOT ENROLLED IN ANY COURSES FROM THIS PATH!');
      console.log('  This might be why users don\'t see the courses');
    }
  } else {
    console.log('  ❌ NO COURSES FOUND IN THIS LEARNING PATH!');
  }
  
  // Check if there's a different enrollment mechanism
  console.log('\n🔄 CHECKING COURSE ASSIGNMENTS (ALTERNATIVE):');
  const { data: courseAssignments } = await supabase
    .from('course_assignments')
    .select(`
      *,
      courses(
        id,
        title
      )
    `)
    .eq('teacher_id', katherine?.id) // Note: using teacher_id for students
    .limit(5);
    
  if (courseAssignments && courseAssignments.length > 0) {
    console.log(`  Katherine has ${courseAssignments.length} course assignments:`);
    courseAssignments.forEach(ca => {
      console.log(`    - ${ca.courses?.title}`);
    });
    
    console.log('\n  ℹ️ Courses ARE assigned via course_assignments table');
    console.log('  But they might not be linked to the learning path');
  }
  
  // Final check - how does the admin UI assign users to learning paths?
  console.log('\n🎯 KEY FINDING:');
  console.log('  1. Learning path assignments exist for Katherine');
  console.log('  2. But she may not be enrolled in the individual courses');
  console.log('  3. The admin UI might only create learning_path_assignments');
  console.log('  4. But not create course_enrollments for the courses in the path');
  
  // Check if we need to create course enrollments
  if (pathCourses && pathCourses.length > 0) {
    const courseIds = pathCourses.map(pc => pc.course_id);
    
    console.log('\n🔧 SOLUTION NEEDED:');
    console.log(`  Create course_enrollments for all ${courseIds.length} courses`);
    console.log('  For all users assigned to this learning path');
  }
}

checkPathCourses().catch(console.error);