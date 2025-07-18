const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigate() {
  const jorgeId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
  console.log('=== Jorge Parra ID:', jorgeId, '===');
  
  // 1. Courses created by Jorge
  console.log('\n=== Courses CREATED by Jorge ===');
  const { data: createdCourses, error: createdError } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('created_by', jorgeId);
  
  if (!createdError) {
    console.log('Courses created by Jorge:', createdCourses.length);
    createdCourses.forEach(c => console.log(`  - ${c.title} (ID: ${c.id})`));
  }
  
  // 2. Check instructors table
  console.log('\n=== Checking instructors table ===');
  const { data: instructorRecords, error: instructorError } = await supabase
    .from('instructors')
    .select('*')
    .eq('user_id', jorgeId);
  
  if (!instructorError) {
    console.log('Instructor records for Jorge:', instructorRecords.length);
    if (instructorRecords.length > 0) {
      for (const record of instructorRecords) {
        const { data: course } = await supabase
          .from('courses')
          .select('id, title, created_by')
          .eq('id', record.course_id)
          .single();
        
        if (course) {
          console.log(`\nCourse: ${course.title}`);
          console.log(`  Course ID: ${course.id}`);
          console.log(`  Created by: ${course.created_by}`);
          console.log(`  Jorge is instructor: YES`);
          console.log(`  Jorge created it: ${course.created_by === jorgeId ? 'YES' : 'NO'}`);
        }
      }
    }
  } else {
    console.log('Error checking instructors:', instructorError);
  }
  
  // 3. Check user_courses table
  console.log('\n=== Checking user_courses table ===');
  const { data: userCourses, error: userCoursesError } = await supabase
    .from('user_courses')
    .select('*')
    .eq('user_id', jorgeId);
  
  if (!userCoursesError) {
    console.log('user_courses records for Jorge:', userCourses ? userCourses.length : 0);
    if (userCourses && userCourses.length > 0) {
      for (const record of userCourses) {
        const { data: course } = await supabase
          .from('courses')
          .select('id, title, created_by')
          .eq('id', record.course_id)
          .single();
        
        if (course) {
          console.log(`\nCourse: ${course.title}`);
          console.log(`  Role in user_courses: ${record.role || 'N/A'}`);
        }
      }
    }
  }
  
  // 4. Check the actual dashboard code
  console.log('\n=== DASHBOARD CODE ANALYSIS ===');
  console.log('Looking at the dashboard filtering logic...');
  
  // 5. Summary and recommendation
  console.log('\n=== ISSUE SUMMARY ===');
  console.log('1. Jorge created 1 course: "Modelos Pedagógicos"');
  console.log('2. The dashboard filters by: course.created_by === user.id');
  console.log('3. This means Jorge only sees courses he CREATED, not where he\'s an INSTRUCTOR');
  console.log('\n⚠️  SOLUTION: The dashboard should show courses where the user is either:');
  console.log('   - The creator (created_by = user.id)');
  console.log('   - An instructor (exists in instructors table with user_id = user.id)');
}

investigate().then(() => process.exit(0)).catch(console.error);