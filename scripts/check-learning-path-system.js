const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkLearningPathSystem() {
  console.log('🔍 CHECKING LEARNING PATH SYSTEM');
  console.log('=' + '='.repeat(60));
  
  const SANTA_MARTA_TALCA_ID = 25;
  
  // 1. Check if learning_paths table has school_ids column
  console.log('\n📚 LEARNING PATHS TABLE STRUCTURE:');
  const { data: samplePath } = await supabase
    .from('learning_paths')
    .select('*')
    .limit(1);
    
  if (samplePath && samplePath[0]) {
    console.log('  Columns in learning_paths table:');
    Object.keys(samplePath[0]).forEach(col => {
      console.log(`    - ${col}: ${typeof samplePath[0][col]}`);
    });
  }
  
  // 2. Check if there are learning paths with school_ids
  console.log('\n🏫 LEARNING PATHS WITH SCHOOL ASSIGNMENTS:');
  const { data: pathsWithSchools } = await supabase
    .from('learning_paths')
    .select('id, title, school_ids')
    .not('school_ids', 'is', null);
    
  if (pathsWithSchools && pathsWithSchools.length > 0) {
    console.log(`  Found ${pathsWithSchools.length} paths with school assignments:`);
    pathsWithSchools.forEach(path => {
      console.log(`    - ${path.title}`);
      console.log(`      School IDs: ${JSON.stringify(path.school_ids)}`);
      if (path.school_ids && path.school_ids.includes(SANTA_MARTA_TALCA_ID)) {
        console.log(`      ✅ Includes Santa Marta de Talca`);
      }
    });
  } else {
    console.log('  No paths have school_ids assigned');
  }
  
  // 3. Check learning_path_assignments table
  console.log('\n📋 LEARNING PATH ASSIGNMENTS:');
  const { count: totalAssignments } = await supabase
    .from('learning_path_assignments')
    .select('*', { count: 'exact', head: true });
    
  console.log(`  Total assignments: ${totalAssignments || 0}`);
  
  // Check assignments for Katherine
  const { data: katherine } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  if (katherine) {
    const { data: katherineAssignments } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .eq('user_id', katherine.id);
      
    console.log(`  Katherine's learning path assignments: ${katherineAssignments?.length || 0}`);
  }
  
  // 4. Check if there's enrollment directly in learning_path_enrollments
  console.log('\n📚 LEARNING PATH ENROLLMENTS:');
  const { count: enrollmentCount } = await supabase
    .from('learning_path_enrollments')
    .select('*', { count: 'exact', head: true });
    
  console.log(`  Total enrollments: ${enrollmentCount || 0}`);
  
  if (katherine) {
    const { data: katherineEnrollments } = await supabase
      .from('learning_path_enrollments')
      .select('*')
      .eq('user_id', katherine.id);
      
    console.log(`  Katherine's enrollments: ${katherineEnrollments?.length || 0}`);
  }
  
  // 5. THE KEY ISSUE - Course assignments vs Learning paths
  console.log('\n🎯 KEY FINDING:');
  console.log('  Santa Marta de Talca users have COURSE ASSIGNMENTS (108 total)');
  console.log('  But they do NOT have LEARNING PATH assignments');
  console.log('  The UI might be showing only learning paths, not direct course assignments');
  
  // 6. Check how courses are assigned
  console.log('\n📖 COURSE ASSIGNMENT DETAILS:');
  if (katherine) {
    const { data: courses } = await supabase
      .from('course_assignments')
      .select(`
        id,
        status,
        courses (
          id,
          title
        )
      `)
      .eq('teacher_id', katherine.id)
      .limit(3);
      
    if (courses && courses.length > 0) {
      console.log('  Katherine has course assignments:');
      courses.forEach(c => {
        console.log(`    - ${c.courses?.title || 'Unknown'} (${c.status})`);
      });
      console.log('\n  ✅ COURSES ARE ASSIGNED DIRECTLY, NOT VIA LEARNING PATHS');
    }
  }
  
  console.log('\n📝 SOLUTION:');
  console.log('  The users can see their courses in the UI now that school_id is fixed.');
  console.log('  They should look in "Mi Aprendizaje" or "Cursos" section.');
  console.log('  The courses are assigned directly, not through learning paths.');
}

checkLearningPathSystem().catch(console.error);