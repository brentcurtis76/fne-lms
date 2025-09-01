const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function createAllEnrollments() {
  console.log('🔧 CREATING ALL MISSING ENROLLMENTS FOR SANTA MARTA DE TALCA');
  console.log('=' + '='.repeat(70));
  
  // Get all Santa Marta de Talca users (school_id = 25)
  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('school_id', 25);
    
  if (usersError) {
    console.log('Error fetching users:', usersError);
    return;
  }
  
  console.log(`\nFound ${users.length} users from Santa Marta de Talca\n`);
  
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  for (const user of users) {
    // Get course assignments for this user
    const { data: assignments } = await supabase
      .from('course_assignments')
      .select('course_id, status, assigned_at')
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
    
    // Find assignments without enrollments
    const missingEnrollments = assignments.filter(a => !existingCourseIds.has(a.course_id));
    
    if (missingEnrollments.length > 0) {
      console.log(`\n👤 ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(`   Has ${assignments.length} assignments, ${existingEnrollments?.length || 0} enrollments`);
      console.log(`   Creating ${missingEnrollments.length} missing enrollments...`);
      
      let userCreated = 0;
      let userErrors = 0;
      
      for (const assignment of missingEnrollments) {
        const enrollmentData = {
          user_id: user.id,
          course_id: assignment.course_id
        };
        
        const { error: createError } = await supabase
          .from('course_enrollments')
          .insert(enrollmentData);
          
        if (createError) {
          console.log(`   ❌ Error for course ${assignment.course_id}:`, createError.message);
          userErrors++;
          totalErrors++;
        } else {
          userCreated++;
          totalCreated++;
        }
      }
      
      if (userCreated > 0) {
        console.log(`   ✅ Created ${userCreated} enrollments`);
      }
      if (userErrors > 0) {
        console.log(`   ❌ Failed ${userErrors} enrollments`);
      }
    } else if (existingEnrollments?.length === assignments.length) {
      totalSkipped += assignments.length;
    }
  }
  
  console.log('\n' + '=' + '='.repeat(35));
  console.log('📊 FINAL SUMMARY:');
  console.log(`   Total enrollments created: ${totalCreated}`);
  console.log(`   Total already existed: ${totalSkipped}`);
  console.log(`   Total errors: ${totalErrors}`);
  
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
      
    console.log(`   Course assignments: ${assignmentCount}`);
    console.log(`   Course enrollments: ${enrollmentCount}`);
    
    if (enrollmentCount === assignmentCount) {
      console.log(`   ✅ Katherine's enrollments are complete!`);
    } else {
      console.log(`   ⚠️ Mismatch: ${assignmentCount - enrollmentCount} enrollments still missing`);
    }
    
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
      
    console.log(`   Enrolled in ${pathEnrollments}/${pathCourseIds.length} courses from "Elementos del plan personal"`);
  }
  
  console.log('\n✅ ENROLLMENT CREATION COMPLETE!');
  console.log('Users should now be able to see their courses in learning paths.');
}

createAllEnrollments().catch(console.error);