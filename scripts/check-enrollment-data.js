const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEnrollmentData() {
  console.log('📊 Checking enrollment and organizational data...');
  
  try {
    // Check total course enrollments
    console.log('\n1. Total course enrollments in database:');
    const { data: allEnrollments, error: allEnrollError } = await supabase
      .from('course_enrollments')
      .select('user_id, course_id, enrollment_data, completed_at, updated_at')
      .limit(10);
    
    if (allEnrollError) {
      console.error('❌ All enrollments error:', allEnrollError);
    } else {
      console.log('✅ Total enrollments in database:', allEnrollments?.length || 0);
      if (allEnrollments && allEnrollments.length > 0) {
        console.log('Sample enrollment:', allEnrollments[0]);
        console.log('Enrollment data keys:', Object.keys(allEnrollments[0]));
      }
    }
    
    // Check if there are any courses
    console.log('\n2. Available courses:');
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, created_at')
      .limit(5);
    
    if (coursesError) {
      console.error('❌ Courses error:', coursesError);
    } else {
      console.log('✅ Total courses:', courses?.length || 0);
      if (courses && courses.length > 0) {
        console.log('Sample course:', courses[0]);
      }
    }
    
    // Check organizational data
    console.log('\n3. Organizational data:');
    
    // Schools
    const { data: schools } = await supabase
      .from('schools')
      .select('id, name')
      .limit(3);
    console.log('Schools found:', schools?.length || 0);
    
    // Generations
    const { data: generations } = await supabase
      .from('generations')
      .select('id, name')
      .limit(3);
    console.log('Generations found:', generations?.length || 0);
    
    // Communities
    const { data: communities } = await supabase
      .from('communities')
      .select('id, name')
      .limit(3);
    console.log('Communities found:', communities?.length || 0);
    
    // Check users with organizational assignments
    console.log('\n4. Users with organizational assignments:');
    const { data: orgUsers } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, school_id, generation_id, community_id')
      .not('school_id', 'is', null)
      .limit(3);
    console.log('Users with school assignments:', orgUsers?.length || 0);
    
  } catch (error) {
    console.error('❌ Check error:', error);
  }
}

checkEnrollmentData();