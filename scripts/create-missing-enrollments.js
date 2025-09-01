const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function createMissingEnrollments() {
  console.log('🔧 CREATING MISSING COURSE ENROLLMENTS FOR SANTA MARTA DE TALCA');
  console.log('=' + '='.repeat(70));
  
  // Get all Santa Marta de Talca users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('school_id', 25);
    
  console.log(`\n📋 Processing ${users?.length || 0} users from Santa Marta de Talca\n`);
  
  let totalCreated = 0;
  let usersFixed = 0;
  
  for (const user of users || []) {
    // Get course assignments
    const { data: assignments } = await supabase
      .from('course_assignments')
      .select('course_id, status, created_at')
      .eq('teacher_id', user.id);
      
    if (!assignments || assignments.length === 0) {
      continue;
    }
    
    // Get existing enrollments
    const { data: existingEnrollments } = await supabase
      .from('course_enrollments')
      .select('course_id')
      .eq('user_id', user.id);
      
    const existingCourseIds = new Set((existingEnrollments || []).map(e => e.course_id));
    
    // Find missing enrollments
    const missingAssignments = assignments.filter(a => !existingCourseIds.has(a.course_id));
    
    if (missingAssignments.length > 0) {
      console.log(`👤 ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(`   Has ${assignments.length} assignments, ${existingEnrollments?.length || 0} enrollments`);
      console.log(`   Creating ${missingAssignments.length} missing enrollments...`);
      
      // Create enrollments one by one to handle any errors
      let created = 0;
      for (const assignment of missingAssignments) {
        const enrollmentData = {
          user_id: user.id,
          course_id: assignment.course_id,
          status: assignment.status === 'completed' ? 'completed' : 'active',
          progress_percentage: assignment.status === 'completed' ? 100 : 0,
          enrolled_at: assignment.created_at || new Date().toISOString()
        };
        
        const { error } = await supabase
          .from('course_enrollments')
          .insert(enrollmentData);
          
        if (error) {
          // Try without optional fields
          const minimalData = {
            user_id: user.id,
            course_id: assignment.course_id
          };
          
          const { error: minimalError } = await supabase
            .from('course_enrollments')
            .insert(minimalData);
            
          if (minimalError) {
            console.log(`   ❌ Failed for course ${assignment.course_id}:`, minimalError.message);
          } else {
            created++;
          }
        } else {
          created++;
        }
      }
      
      if (created > 0) {
        console.log(`   ✅ Created ${created} enrollments`);
        totalCreated += created;
        usersFixed++;
      }
    }
  }
  
  console.log('\n📊 SUMMARY:');
  console.log(`  Users processed: ${users?.length || 0}`);
  console.log(`  Users fixed: ${usersFixed}`);
  console.log(`  Total enrollments created: ${totalCreated}`);
  
  // Verify Katherine specifically
  console.log('\n🔍 VERIFYING KATHERINE GONZÁLEZ:');
  const { data: katherine } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  if (katherine) {
    const { count: assignmentCount } = await supabase
      .from('course_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', katherine.id);
      
    const { count: enrollmentCount } = await supabase
      .from('course_enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', katherine.id);
      
    console.log(`  Course assignments: ${assignmentCount}`);
    console.log(`  Course enrollments: ${enrollmentCount}`);
    
    if (enrollmentCount > 0) {
      console.log(`  ✅ Katherine now has enrollments!`);
      
      // Check if she can see the learning path courses
      const pathId = 'c47136ef-058b-4dd5-a2d9-2d470cfbe5e4';
      const { data: pathCourses } = await supabase
        .from('learning_path_courses')
        .select('course_id')
        .eq('learning_path_id', pathId);
        
      const pathCourseIds = pathCourses?.map(pc => pc.course_id) || [];
      
      const { count: pathEnrollments } = await supabase
        .from('course_enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', katherine.id)
        .in('course_id', pathCourseIds);
        
      console.log(`  Enrolled in ${pathEnrollments}/${pathCourseIds.length} courses from "Elementos del plan personal"`);
    } else {
      console.log(`  ❌ Still no enrollments - check for errors above`);
    }
  }
  
  console.log('\n✅ COMPLETE!');
  console.log('Users should now be able to see their courses in learning paths.');
  console.log('They may need to refresh their browser or log out/in.');
}

createMissingEnrollments().catch(console.error);