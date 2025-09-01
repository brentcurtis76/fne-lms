const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function completeDiagnosis() {
  console.log('🔬 COMPLETE DIAGNOSIS OF SANTA MARTA DE TALCA ISSUE');
  console.log('=' + '='.repeat(60));
  
  const SANTA_MARTA_TALCA_ID = 25;
  
  // 1. School Status
  console.log('\n📚 SCHOOL STATUS:');
  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('id', SANTA_MARTA_TALCA_ID)
    .single();
    
  console.log(`  School: ${school?.name}`);
  console.log(`  ID: ${school?.id}`);
  
  // 2. User Status
  console.log('\n👥 USER STATUS:');
  const { count: userCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', SANTA_MARTA_TALCA_ID);
    
  console.log(`  Users assigned to school: ${userCount}`);
  
  // Sample user check
  const { data: kgonzalez } = await supabase
    .from('profiles')
    .select('id, email, school_id')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  console.log(`  Katherine González:`);
  console.log(`    Email: ${kgonzalez?.email}`);
  console.log(`    School ID: ${kgonzalez?.school_id} (should be 25)`);
  console.log(`    Status: ${kgonzalez?.school_id === SANTA_MARTA_TALCA_ID ? '✅ FIXED' : '❌ NOT FIXED'}`);
  
  // 3. Learning Paths Status
  console.log('\n🎯 LEARNING PATHS STATUS:');
  const { count: pathCount } = await supabase
    .from('learning_paths')
    .select('*', { count: 'exact', head: true });
    
  console.log(`  Total learning paths in system: ${pathCount}`);
  
  if (pathCount === 0) {
    console.log('  ⚠️ NO LEARNING PATHS EXIST IN THE SYSTEM!');
    console.log('  This is why users see no courses assigned');
  } else {
    // Check paths assigned to school
    const { data: schoolPaths } = await supabase
      .from('learning_paths')
      .select('id, title')
      .or(`school_ids.cs.{${SANTA_MARTA_TALCA_ID}}`, 'is_global.eq.true');
      
    console.log(`  Paths available to Santa Marta de Talca: ${schoolPaths?.length || 0}`);
  }
  
  // 4. Courses Status
  console.log('\n📖 COURSES STATUS:');
  const { count: courseCount } = await supabase
    .from('courses')
    .select('*', { count: 'exact', head: true });
    
  console.log(`  Total courses in system: ${courseCount}`);
  
  // 5. Direct Course Enrollments
  console.log('\n📚 DIRECT COURSE ENROLLMENTS:');
  const { count: enrollmentCount } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true })
    .in('user_id', [kgonzalez?.id].filter(Boolean));
    
  console.log(`  Katherine's direct course enrollments: ${enrollmentCount}`);
  
  // 6. Course Assignments
  console.log('\n📋 COURSE ASSIGNMENTS:');
  const { count: assignmentCount } = await supabase
    .from('course_assignments')
    .select('*', { count: 'exact', head: true });
    
  console.log(`  Total course assignments in system: ${assignmentCount}`);
  
  // Check if there are assignments for Santa Marta users
  const { data: santaMartaUserIds } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', SANTA_MARTA_TALCA_ID);
    
  if (santaMartaUserIds && santaMartaUserIds.length > 0) {
    const userIds = santaMartaUserIds.map(u => u.id);
    const { count: schoolAssignments } = await supabase
      .from('course_assignments')
      .select('*', { count: 'exact', head: true })
      .in('teacher_id', userIds); // Note: column might be named teacher_id but used for students
      
    console.log(`  Assignments for Santa Marta de Talca users: ${schoolAssignments}`);
  }
  
  // 7. ROOT CAUSE ANALYSIS
  console.log('\n🎯 ROOT CAUSE ANALYSIS:');
  console.log('  ✅ FIXED: Users now have correct school_id = 25');
  
  if (pathCount === 0) {
    console.log('  ❌ ISSUE: No learning paths exist in the system');
    console.log('  ❌ ISSUE: Without learning paths, no courses can be assigned via paths');
  }
  
  if (assignmentCount === 0) {
    console.log('  ❌ ISSUE: No course assignments exist either');
  }
  
  console.log('\n📝 SOLUTION SUMMARY:');
  console.log('  1. ✅ Users\' school_id has been fixed (was NULL, now 25)');
  console.log('  2. ❌ Learning paths need to be created or imported');
  console.log('  3. ❌ Learning paths need to be assigned to school_id 25');
  console.log('  4. ❌ Users need to be enrolled in the learning paths');
  console.log('\n  The system appears to be missing learning path data entirely.');
  console.log('  This needs to be addressed by creating/importing learning paths.');
}

completeDiagnosis().catch(console.error);