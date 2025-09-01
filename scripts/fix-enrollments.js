const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function fixEnrollments() {
  console.log('🔧 FIXING COURSE ENROLLMENTS FOR SANTA MARTA DE TALCA');
  console.log('=' + '='.repeat(70));
  
  // Get all Santa Marta de Talca users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('school_id', 25);
    
  console.log(`\n📋 Found ${users?.length || 0} users from Santa Marta de Talca`);
  
  let totalFixed = 0;
  let totalCreated = 0;
  
  for (const user of users || []) {
    // Get their course assignments
    const { data: assignments } = await supabase
      .from('course_assignments')
      .select('course_id, status')
      .eq('teacher_id', user.id); // Note: using teacher_id for students
      
    if (assignments && assignments.length > 0) {
      console.log(`\n👤 ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(`   Has ${assignments.length} course assignments`);
      
      // Check existing enrollments
      const { data: existingEnrollments } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('user_id', user.id);
        
      const existingCourseIds = new Set((existingEnrollments || []).map(e => e.course_id));
      console.log(`   Has ${existingEnrollments?.length || 0} existing enrollments`);
      
      // Create missing enrollments
      const missingAssignments = assignments.filter(a => !existingCourseIds.has(a.course_id));
      
      if (missingAssignments.length > 0) {
        console.log(`   Creating ${missingAssignments.length} missing enrollments...`);
        
        const enrollmentsToCreate = missingAssignments.map(assignment => ({
          user_id: user.id,
          course_id: assignment.course_id,
          status: assignment.status === 'completed' ? 'completed' : 'active',
          enrollment_date: new Date().toISOString(),
          progress_percentage: assignment.status === 'completed' ? 100 : 0,
          completed_at: assignment.status === 'completed' ? new Date().toISOString() : null
        }));
        
        const { error } = await supabase
          .from('course_enrollments')
          .insert(enrollmentsToCreate);
          
        if (error) {
          console.log(`   ❌ Error creating enrollments:`, error.message);
        } else {
          console.log(`   ✅ Created ${missingAssignments.length} enrollments`);
          totalCreated += missingAssignments.length;
          totalFixed++;
        }
      } else {
        console.log(`   ✅ All assignments already have enrollments`);
      }
    }
  }
  
  console.log('\n📊 SUMMARY:');
  console.log(`  Users processed: ${users?.length || 0}`);
  console.log(`  Users fixed: ${totalFixed}`);
  console.log(`  Total enrollments created: ${totalCreated}`);
  
  // Verify Katherine specifically
  console.log('\n🔍 VERIFYING KATHERINE GONZÁLEZ:');
  const { data: katherine } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  if (katherine) {
    const { count: enrollmentCount } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', katherine.id);
      
    const { count: assignmentCount } = await supabase
      .from('course_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', katherine.id);
      
    console.log(`  Course assignments: ${assignmentCount}`);
    console.log(`  Course enrollments: ${enrollmentCount}`);
    console.log(`  Status: ${enrollmentCount === assignmentCount ? '✅ SYNCED' : '❌ MISMATCH'}`);
  }
  
  console.log('\n✅ FIX COMPLETE!');
  console.log('Users should now be able to see their courses in learning paths.');
}

fixEnrollments().catch(console.error);