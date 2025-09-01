const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function investigate() {
  console.log('🔍 INVESTIGATING SANTA MARTA DE TALCA LEARNING PATH BUG');
  console.log('=' + '='.repeat(60));
  
  // 1. Find the user
  const userEmail = 'kgonzalez@liceosantamartatalca.cl';
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, school_id, created_at')
    .eq('email', userEmail)
    .single();
    
  if (userError || !user) {
    console.log('❌ User not found:', userEmail);
    console.log('Error:', userError);
    return;
  }
  
  console.log('\n✅ USER FOUND:');
  console.log('  ID:', user.id);
  console.log('  Name:', user.first_name, user.last_name);
  console.log('  Email:', user.email);
  console.log('  School ID:', user.school_id);
  
  // 2. Get school details
  if (user.school_id) {
    const { data: school } = await supabase
      .from('schools')
      .select('id, name, code')
      .eq('id', user.school_id)
      .single();
      
    console.log('\n📚 SCHOOL DETAILS:');
    console.log('  ID:', school?.id);
    console.log('  Name:', school?.name);
    console.log('  Code:', school?.code);
  }
  
  // 3. Check learning paths assigned to this school
  console.log('\n🎯 CHECKING LEARNING PATHS FOR SCHOOL:', user.school_id);
  
  const { data: schoolPaths, error: pathsError } = await supabase
    .from('learning_paths')
    .select('id, title, school_ids, is_active, created_at')
    .or(`school_ids.cs.{${user.school_id}}`, 'is_global.eq.true');
    
  console.log('\nLearning paths that should be visible to this school:');
  if (schoolPaths && schoolPaths.length > 0) {
    schoolPaths.forEach(path => {
      const hasSchool = path.school_ids && path.school_ids.includes(user.school_id);
      console.log(`  - ${path.title} (ID: ${path.id})`);
      console.log(`    Active: ${path.is_active}, Has school: ${hasSchool}`);
      console.log(`    School IDs: ${path.school_ids ? path.school_ids.join(', ') : 'none'}`);
    });
  } else {
    console.log('  ❌ NO LEARNING PATHS FOUND FOR THIS SCHOOL!');
  }
  
  // 4. Check learning_path_enrollments for this user
  console.log('\n📋 CHECKING USER ENROLLMENTS:');
  const { data: enrollments } = await supabase
    .from('learning_path_enrollments')
    .select(`
      id,
      learning_path_id,
      enrolled_at,
      status,
      learning_paths (
        id,
        title,
        school_ids
      )
    `)
    .eq('user_id', user.id);
    
  if (enrollments && enrollments.length > 0) {
    console.log('  User has', enrollments.length, 'learning path enrollments:');
    enrollments.forEach(e => {
      console.log(`    - ${e.learning_paths?.title || 'Unknown'} (Status: ${e.status})`);
    });
  } else {
    console.log('  ❌ NO ENROLLMENTS FOUND FOR THIS USER!');
  }
  
  // 5. Check course_enrollments directly
  console.log('\n📚 CHECKING DIRECT COURSE ENROLLMENTS:');
  const { data: courseEnrollments } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      course_id,
      enrollment_date,
      status,
      courses (
        id,
        title
      )
    `)
    .eq('user_id', user.id);
    
  if (courseEnrollments && courseEnrollments.length > 0) {
    console.log('  User has', courseEnrollments.length, 'direct course enrollments:');
    courseEnrollments.forEach(ce => {
      console.log(`    - ${ce.courses?.title || 'Unknown'} (Status: ${ce.status})`);
    });
  } else {
    console.log('  ❌ NO DIRECT COURSE ENROLLMENTS FOUND!');
  }
  
  // 6. Check learning_path_courses to see what courses are in the paths
  if (schoolPaths && schoolPaths.length > 0) {
    console.log('\n🔗 CHECKING COURSES IN LEARNING PATHS:');
    for (const path of schoolPaths) {
      const { data: pathCourses } = await supabase
        .from('learning_path_courses')
        .select(`
          course_id,
          order_index,
          courses (
            id,
            title,
            is_active
          )
        `)
        .eq('learning_path_id', path.id)
        .order('order_index');
        
      console.log(`\n  Path: ${path.title}`);
      if (pathCourses && pathCourses.length > 0) {
        console.log(`    Contains ${pathCourses.length} courses:`);
        pathCourses.forEach(pc => {
          console.log(`      - ${pc.courses?.title} (Active: ${pc.courses?.is_active})`);
        });
      } else {
        console.log('    ❌ NO COURSES IN THIS PATH!');
      }
    }
  }
  
  // 7. Check if there's a bulk enrollment record
  console.log('\n📊 CHECKING FOR BULK ENROLLMENT RECORDS:');
  const { data: bulkEnrollments } = await supabase
    .from('bulk_enrollments')
    .select('*')
    .eq('school_id', user.school_id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (bulkEnrollments && bulkEnrollments.length > 0) {
    console.log('  Found', bulkEnrollments.length, 'bulk enrollment records:');
    bulkEnrollments.forEach(be => {
      console.log(`    - Created: ${be.created_at}`);
      console.log(`      Path ID: ${be.learning_path_id}`);
      console.log(`      Status: ${be.status}`);
      console.log(`      User count: ${be.user_count}`);
    });
  } else {
    console.log('  No bulk enrollment records found');
  }
  
  // 8. Final check - count all users from this school
  const { count: schoolUserCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', user.school_id);
    
  console.log('\n📈 SCHOOL STATISTICS:');
  console.log('  Total users in school:', schoolUserCount);
  
  // Check how many have enrollments
  const { data: schoolUsersWithEnrollments } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', user.school_id);
    
  if (schoolUsersWithEnrollments) {
    const userIds = schoolUsersWithEnrollments.map(u => u.id);
    const { count: enrolledCount } = await supabase
      .from('learning_path_enrollments')
      .select('*', { count: 'exact', head: true })
      .in('user_id', userIds);
      
    console.log('  Users with learning path enrollments:', enrolledCount);
  }
}

investigate().catch(console.error);