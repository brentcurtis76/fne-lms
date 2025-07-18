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
  courses.forEach(course => {
    console.log(`\nCourse: ${course.title} (ID: ${course.id})`);
    console.log(`  Created by: ${course.created_by}`);
    console.log(`  Is Jorge's: ${course.created_by === jorge.id ? 'YES' : 'NO'}`);
  });
  
  // 3. Check course_teachers table
  console.log('\n=== Course Teachers (where Jorge is instructor) ===');
  const { data: courseTeachers, error: teacherError } = await supabase
    .from('course_teachers')
    .select('course_id, teacher_id, courses(id, title, created_by)')
    .eq('teacher_id', jorge.id);
  
  if (teacherError) {
    console.error('Error fetching course teachers:', teacherError);
    return;
  }
  
  console.log('Courses where Jorge is assigned as teacher:', courseTeachers.length);
  courseTeachers.forEach(ct => {
    console.log(`\nCourse: ${ct.courses.title} (ID: ${ct.course_id})`);
    console.log(`  Created by: ${ct.courses.created_by}`);
    console.log(`  Jorge is teacher: YES`);
  });
  
  // 4. Summary
  console.log('\n=== SUMMARY ===');
  const coursesCreatedByJorge = courses.filter(c => c.created_by === jorge.id);
  console.log('Courses created BY Jorge:', coursesCreatedByJorge.length);
  console.log('Courses where Jorge is TEACHER:', courseTeachers.length);
  console.log('\nThe dashboard shows "My Courses" filtered by created_by = user.id');
  console.log('This explains why Jorge only sees courses he created, not where he\'s assigned as teacher.');
  
  // 5. Check if there's a specific inconsistency
  if (courseTeachers.length > coursesCreatedByJorge.length) {
    console.log('\n⚠️  ISSUE FOUND: Jorge is assigned as teacher to more courses than he created!');
    console.log('The dashboard should probably show courses where user is either creator OR teacher.');
  }
}

investigate().then(() => process.exit(0)).catch(console.error);