const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function verifyCurrentState() {
  console.log('🔍 VERIFYING CURRENT STATE OF SANTA MARTA DE TALCA');
  console.log('=' + '='.repeat(70));
  
  // Get Katherine
  const { data: katherine } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  console.log('\n👤 KATHERINE GONZÁLEZ:');
  console.log('  ID:', katherine?.id);
  console.log('  School ID:', katherine?.school_id);
  console.log('  Email:', katherine?.email);
  
  if (!katherine) {
    console.log('  ❌ User not found!');
    return;
  }
  
  // Check course assignments
  const { data: assignments, count: assignmentCount } = await supabase
    .from('course_assignments')
    .select('*', { count: 'exact' })
    .eq('teacher_id', katherine.id);
    
  console.log('\n📋 COURSE ASSIGNMENTS:');
  console.log('  Total:', assignmentCount);
  if (assignments && assignments.length > 0) {
    assignments.slice(0, 3).forEach(a => {
      console.log('    - Course ID:', a.course_id, '| Status:', a.status);
    });
  }
  
  // Check course enrollments
  const { data: enrollments, count: enrollmentCount } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact' })
    .eq('user_id', katherine.id);
    
  console.log('\n📚 COURSE ENROLLMENTS:');
  console.log('  Total:', enrollmentCount);
  if (enrollments && enrollments.length > 0) {
    enrollments.slice(0, 3).forEach(e => {
      console.log('    - Course ID:', e.course_id, '| Status:', e.status || 'N/A');
    });
  }
  
  // Check learning path assignments
  const { data: lpAssignments } = await supabase
    .from('learning_path_assignments')
    .select(`
      *,
      path:learning_paths(name)
    `)
    .eq('user_id', katherine.id);
    
  console.log('\n🎯 LEARNING PATH ASSIGNMENTS:');
  console.log('  Total:', lpAssignments?.length || 0);
  if (lpAssignments && lpAssignments.length > 0) {
    lpAssignments.forEach(lpa => {
      console.log('    -', lpa.path?.name, '| Path ID:', lpa.path_id);
    });
  }
  
  // Check the learning path courses
  const pathId = 'c47136ef-058b-4dd5-a2d9-2d470cfbe5e4';
  const { data: pathCourses } = await supabase
    .from('learning_path_courses')
    .select(`
      course_id,
      sequence_order,
      course:courses(title)
    `)
    .eq('learning_path_id', pathId)
    .order('sequence_order');
    
  console.log('\n📖 COURSES IN "ELEMENTOS DEL PLAN PERSONAL":');
  if (pathCourses && pathCourses.length > 0) {
    pathCourses.forEach(pc => {
      console.log(`    ${pc.sequence_order}. ${pc.course?.title}`);
      console.log(`       Course ID: ${pc.course_id}`);
    });
    
    // Check if Katherine is enrolled in these specific courses
    const courseIds = pathCourses.map(pc => pc.course_id);
    
    const { data: pathEnrollments } = await supabase
      .from('course_enrollments')
      .select('course_id')
      .eq('user_id', katherine.id)
      .in('course_id', courseIds);
      
    console.log(`\n  Katherine enrolled in ${pathEnrollments?.length || 0}/${courseIds.length} of these courses`);
    
    // Check course assignments for these courses
    const { data: pathAssignments } = await supabase
      .from('course_assignments')
      .select('course_id')
      .eq('teacher_id', katherine.id)
      .in('course_id', courseIds);
      
    console.log(`  Katherine assigned to ${pathAssignments?.length || 0}/${courseIds.length} of these courses`);
  }
  
  // Overall Santa Marta stats
  console.log('\n📊 SANTA MARTA DE TALCA STATISTICS:');
  
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', 25);
    
  const { count: totalAssignments } = await supabase
    .from('course_assignments')
    .select('*', { count: 'exact', head: true })
    .in('teacher_id', (await supabase.from('profiles').select('id').eq('school_id', 25)).data?.map(p => p.id) || []);
    
  console.log('  Total users with school_id=25:', totalUsers);
  console.log('  Total course assignments for these users:', totalAssignments);
  
  console.log('\n🎯 DIAGNOSIS:');
  if (assignmentCount === 0 && enrollmentCount === 0) {
    console.log('  ❌ Katherine has NO course assignments or enrollments');
    console.log('  This explains why she sees no courses');
  } else if (assignmentCount > 0 && enrollmentCount === 0) {
    console.log('  ⚠️ Katherine has assignments but no enrollments');
    console.log('  Need to create enrollments from assignments');
  } else if (assignmentCount === 0 && enrollmentCount > 0) {
    console.log('  ⚠️ Katherine has enrollments but no assignments');
    console.log('  Unusual state - enrollments without assignments');
  } else {
    console.log('  ✅ Katherine has both assignments and enrollments');
    console.log('  She should be able to see courses');
  }
}

verifyCurrentState().catch(console.error);