const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
  // 1. Find Jorge Parra
  console.log('=== Looking for Jorge Parra ===');
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .or('email.ilike.%parra%,first_name.ilike.%jorge%,last_name.ilike.%parra%');
  
  if (profileError) {
    console.error('Error finding Jorge:', profileError);
    return;
  }
  
  console.log('Found profiles:', JSON.stringify(profiles, null, 2));
  
  // Assuming we find Jorge, let's use his ID
  const jorge = profiles.find(p => 
    p.first_name?.toLowerCase().includes('jorge') || 
    p.email?.toLowerCase().includes('parra')
  );
  
  if (!jorge) {
    console.log('Jorge Parra not found!');
    return;
  }
  
  console.log('\n=== Jorge Parra ID:', jorge.id, '===');
  
  // 2. Get all courses and their created_by
  console.log('\n=== All Courses ===');
  const { data: courses, error: courseError } = await supabase
    .from('courses')
    .select('id, title, created_by, created_at')
    .order('created_at', { ascending: false });
  
  if (courseError) {
    console.error('Error fetching courses:', courseError);
    return;
  }
  
  console.log('Total courses:', courses.length);
  const coursesCreatedByJorge = courses.filter(c => c.created_by === jorge.id);
  console.log('Courses created BY Jorge:', coursesCreatedByJorge.length);
  coursesCreatedByJorge.forEach(course => {
    console.log(`  - ${course.title} (ID: ${course.id})`);
  });
  
  // 3. Check course_teachers table separately
  console.log('\n=== Course Teachers (where Jorge is instructor) ===');
  const { data: courseTeachers, error: teacherError } = await supabase
    .from('course_teachers')
    .select('course_id, teacher_id')
    .eq('teacher_id', jorge.id);
  
  if (teacherError) {
    console.error('Error fetching course teachers:', teacherError);
    return;
  }
  
  console.log('Course teacher assignments for Jorge:', courseTeachers.length);
  
  // Get course details for each assignment
  for (const ct of courseTeachers) {
    const { data: course, error } = await supabase
      .from('courses')
      .select('id, title, created_by')
      .eq('id', ct.course_id)
      .single();
    
    if (course) {
      console.log(`\nCourse: ${course.title} (ID: ${course.id})`);
      console.log(`  Created by: ${course.created_by}`);
      console.log(`  Jorge is teacher: YES`);
      console.log(`  Jorge created it: ${course.created_by === jorge.id ? 'YES' : 'NO'}`);
    }
  }
  
  // 4. Look at the dashboard page code to understand the filter
  console.log('\n=== DASHBOARD ANALYSIS ===');
  console.log('The dashboard uses: myCourses = courses.filter(course => course.created_by === user.id)');
  console.log('This means it only shows courses the user CREATED, not where they are ASSIGNED as teacher.');
  
  // 5. Summary
  console.log('\n=== SUMMARY ===');
  console.log('Courses created BY Jorge:', coursesCreatedByJorge.length);
  console.log('Courses where Jorge is TEACHER:', courseTeachers.length);
  
  if (courseTeachers.length > coursesCreatedByJorge.length) {
    console.log('\n⚠️  ISSUE FOUND: Jorge is assigned as teacher to more courses than he created!');
    console.log('The dashboard should show courses where user is either:');
    console.log('  1. The creator (created_by = user.id)');
    console.log('  2. Assigned as teacher (exists in course_teachers table)');
    console.log('\nThis is why Jorge only sees 1 course instead of 2.');
  }
}

investigate().then(() => process.exit(0)).catch(console.error);