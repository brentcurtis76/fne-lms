const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function fixEnrollmentsCorrect() {
  console.log('🔧 FIXING COURSE ENROLLMENTS WITH CORRECT SCHEMA');
  console.log('=' + '='.repeat(70));
  
  // Get Katherine first to test
  const { data: katherine } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  if (!katherine) {
    console.log('Katherine not found');
    return;
  }
  
  // Get her course assignments
  const { data: assignments } = await supabase
    .from('course_assignments')
    .select('course_id, status, created_at')
    .eq('teacher_id', katherine.id);
    
  console.log(`\n👤 Katherine González:`);
  console.log(`  Has ${assignments?.length || 0} course assignments`);
  
  if (assignments && assignments.length > 0) {
    // Try creating one enrollment with minimal fields
    const firstAssignment = assignments[0];
    
    console.log('\n🧪 Testing enrollment creation with minimal fields...');
    
    // Try different column name possibilities
    const attempts = [
      {
        user_id: katherine.id,
        course_id: firstAssignment.course_id,
        enrolled_at: new Date().toISOString(),
        status: 'active'
      },
      {
        user_id: katherine.id,
        course_id: firstAssignment.course_id,
        enrollment_date: new Date().toISOString(),
        status: 'active'
      },
      {
        user_id: katherine.id,
        course_id: firstAssignment.course_id,
        created_at: new Date().toISOString(),
        status: 'active'
      },
      {
        user_id: katherine.id,
        course_id: firstAssignment.course_id,
        status: 'active'
      },
      {
        user_id: katherine.id,
        course_id: firstAssignment.course_id
      }
    ];
    
    for (let i = 0; i < attempts.length; i++) {
      console.log(`\nAttempt ${i + 1}:`, JSON.stringify(attempts[i], null, 2));
      
      const { data, error } = await supabase
        .from('course_enrollments')
        .insert(attempts[i])
        .select();
        
      if (error) {
        console.log(`  ❌ Error:`, error.message);
      } else {
        console.log(`  ✅ SUCCESS! Created enrollment`);
        console.log(`  Created record:`, data);
        
        // Delete the test record
        await supabase
          .from('course_enrollments')
          .delete()
          .eq('user_id', katherine.id)
          .eq('course_id', firstAssignment.course_id);
          
        console.log(`  Cleaned up test record`);
        
        // Now we know the schema, create all enrollments
        await createAllEnrollments(attempts[i]);
        break;
      }
    }
  }
}

async function createAllEnrollments(workingSchema) {
  console.log('\n📋 CREATING ALL MISSING ENROLLMENTS');
  console.log('=' + '='.repeat(70));
  
  // Get all Santa Marta users
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('school_id', 25);
    
  let totalCreated = 0;
  
  for (const user of users || []) {
    // Get their assignments
    const { data: assignments } = await supabase
      .from('course_assignments')
      .select('course_id, status')
      .eq('teacher_id', user.id);
      
    if (assignments && assignments.length > 0) {
      // Check existing enrollments
      const { data: existing } = await supabase
        .from('course_enrollments')
        .select('course_id')
        .eq('user_id', user.id);
        
      const existingCourseIds = new Set((existing || []).map(e => e.course_id));
      const toCreate = assignments.filter(a => !existingCourseIds.has(a.course_id));
      
      if (toCreate.length > 0) {
        console.log(`\n${user.first_name} ${user.last_name}: Creating ${toCreate.length} enrollments`);
        
        // Create enrollments using the working schema structure
        const enrollments = toCreate.map(assignment => {
          const enrollment = { ...workingSchema };
          enrollment.user_id = user.id;
          enrollment.course_id = assignment.course_id;
          if (enrollment.status) {
            enrollment.status = assignment.status === 'completed' ? 'completed' : 'active';
          }
          return enrollment;
        });
        
        const { error } = await supabase
          .from('course_enrollments')
          .insert(enrollments);
          
        if (error) {
          console.log(`  ❌ Error:`, error.message);
        } else {
          console.log(`  ✅ Created ${toCreate.length} enrollments`);
          totalCreated += toCreate.length;
        }
      }
    }
  }
  
  console.log(`\n✅ TOTAL ENROLLMENTS CREATED: ${totalCreated}`);
  
  // Verify Katherine
  const { data: katherine } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'kgonzalez@liceosantamartatalca.cl')
    .single();
    
  const { count: enrollments } = await supabase
    .from('course_enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', katherine.id);
    
  console.log(`\n🔍 Katherine now has ${enrollments} course enrollments`);
}

fixEnrollmentsCorrect().catch(console.error);