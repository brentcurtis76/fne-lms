const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function properInvestigation() {
  console.log('🔍 PROPER INVESTIGATION - WHAT USERS ACTUALLY SEE');
  console.log('=' + '='.repeat(70));
  
  const pathId = 'c47136ef-058b-4dd5-a2d9-2d470cfbe5e4';
  
  // Get Katherine
  const { data: katherine } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  console.log('👤 Katherine González:');
  console.log('  ID:', katherine?.id);
  console.log('  School ID:', katherine?.school_id);
  
  // 1. Check learning_path_courses properly with different column names
  console.log('\n📚 LEARNING PATH COURSES (checking different column possibilities):');
  
  // Try different possible column names
  const possibleQueries = [
    { from: 'learning_path_courses', where: { learning_path_id: pathId }},
    { from: 'learning_path_courses', where: { path_id: pathId }},
    { from: 'path_courses', where: { path_id: pathId }},
    { from: 'path_courses', where: { learning_path_id: pathId }}
  ];
  
  for (const query of possibleQueries) {
    try {
      const { data, error } = await supabase
        .from(query.from)
        .select('*')
        .eq(Object.keys(query.where)[0], Object.values(query.where)[0])
        .limit(1);
        
      if (!error && data) {
        console.log(`  ✅ Found table: ${query.from} with column: ${Object.keys(query.where)[0]}`);
        
        // Get all courses in this path
        const { data: pathCourses } = await supabase
          .from(query.from)
          .select('*')
          .eq(Object.keys(query.where)[0], Object.values(query.where)[0]);
          
        console.log(`  Courses in path: ${pathCourses?.length || 0}`);
        if (pathCourses && pathCourses.length > 0) {
          console.log('  Sample record:', JSON.stringify(pathCourses[0], null, 2));
        }
        break;
      }
    } catch (e) {
      // Table doesn't exist, continue
    }
  }
  
  // 2. Check the actual learning path data structure
  console.log('\n📋 LEARNING PATH DATA STRUCTURE:');
  const { data: learningPath } = await supabase
    .from('learning_paths')
    .select('*')
    .eq('id', pathId)
    .single();
    
  if (learningPath) {
    console.log('  Path name:', learningPath.name);
    console.log('  Path data field:', typeof learningPath.path_data);
    
    if (learningPath.path_data) {
      console.log('  Path data contents:', JSON.stringify(learningPath.path_data, null, 2));
      
      // Check if courses are stored in the JSON field
      if (learningPath.path_data.courses || learningPath.path_data.course_ids) {
        console.log('  ✅ FOUND: Courses are stored in path_data JSON field!');
      }
    }
  }
  
  // 3. Check how the UI would query for Katherine's learning paths
  console.log('\n🖥️ WHAT KATHERINE SEES IN "MI APRENDIZAJE":');
  
  // Check learning path assignments
  const { data: lpAssignments } = await supabase
    .from('learning_path_assignments')
    .select(`
      *,
      path:learning_paths(*)
    `)
    .eq('user_id', katherine?.id);
    
  console.log('  Learning path assignments:', lpAssignments?.length || 0);
  if (lpAssignments && lpAssignments.length > 0) {
    lpAssignments.forEach(assignment => {
      console.log(`    - ${assignment.path?.name}`);
      if (assignment.path?.path_data?.courses) {
        console.log(`      Has ${assignment.path.path_data.courses.length} courses in path_data`);
      }
    });
  }
  
  // Check course assignments (the direct approach)
  const { data: courseAssignments } = await supabase
    .from('course_assignments')
    .select(`
      *,
      courses(id, title)
    `)
    .eq('teacher_id', katherine?.id);
    
  console.log('\n  Course assignments (direct):', courseAssignments?.length || 0);
  if (courseAssignments && courseAssignments.length > 0) {
    courseAssignments.slice(0, 3).forEach(ca => {
      console.log(`    - ${ca.courses?.title} (${ca.status})`);
    });
  }
  
  // 4. Check course enrollments
  const { data: courseEnrollments } = await supabase
    .from('course_enrollments')
    .select(`
      *,
      courses(id, title)
    `)
    .eq('user_id', katherine?.id);
    
  console.log('\n  Course enrollments:', courseEnrollments?.length || 0);
  if (courseEnrollments && courseEnrollments.length > 0) {
    courseEnrollments.forEach(ce => {
      console.log(`    - ${ce.courses?.title}`);
    });
  }
  
  // 5. The real question - when Katherine clicks on a learning path, what happens?
  console.log('\n🎯 KEY QUESTION:');
  console.log('  When Katherine clicks on "Elementos del plan personal" learning path,');
  console.log('  how does the UI fetch and display the courses?');
  console.log('  - Does it use path_data JSON field?');
  console.log('  - Does it use a join table?');
  console.log('  - Does it check course_enrollments?');
  console.log('  - Does it check course_assignments?');
}

properInvestigation().catch(console.error);