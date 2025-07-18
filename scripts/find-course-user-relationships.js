const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findRelationships() {
  const jorgeId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
  
  console.log('=== Searching for course-user relationship tables ===');
  
  // Check course_instructors table structure
  console.log('\n1. Checking course_instructors table:');
  const { data: courseInstructors, error: ciError } = await supabase
    .from('course_instructors')
    .select('*')
    .limit(5);
  
  if (!ciError && courseInstructors) {
    if (courseInstructors.length > 0) {
      console.log('Columns:', Object.keys(courseInstructors[0]));
      console.log('Sample data:', courseInstructors);
      
      // Look for Jorge
      const { data: jorgeInstructor } = await supabase
        .from('course_instructors')
        .select('*')
        .or(`instructor_id.eq.${jorgeId},teacher_id.eq.${jorgeId},user_id.eq.${jorgeId}`);
      
      if (jorgeInstructor && jorgeInstructor.length > 0) {
        console.log('\nJorge found in course_instructors:', jorgeInstructor);
      }
    } else {
      console.log('course_instructors table is empty');
    }
  } else {
    console.log('Error or table not found:', ciError);
  }
  
  // Check user_courses table structure
  console.log('\n2. Checking user_courses table:');
  const { data: userCourses, error: ucError } = await supabase
    .from('user_courses')
    .select('*')
    .limit(5);
  
  if (!ucError && userCourses) {
    if (userCourses.length > 0) {
      console.log('Columns:', Object.keys(userCourses[0]));
      console.log('Sample data:', userCourses);
      
      // Look for Jorge
      const { data: jorgeCourses } = await supabase
        .from('user_courses')
        .select('*')
        .eq('user_id', jorgeId);
      
      if (jorgeCourses && jorgeCourses.length > 0) {
        console.log('\nJorge found in user_courses:', jorgeCourses);
      }
    } else {
      console.log('user_courses table is empty');
    }
  }
  
  // Check course_enrollments
  console.log('\n3. Checking course_enrollments table:');
  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', jorgeId);
  
  if (enrollments && enrollments.length > 0) {
    console.log('Jorge enrollments:', enrollments);
  } else {
    console.log('No enrollments found for Jorge');
  }
  
  // Look at the dashboard page source
  console.log('\n=== DASHBOARD PAGE ANALYSIS ===');
  console.log('Need to check how the dashboard filters courses...');
}

findRelationships().then(() => process.exit(0)).catch(console.error);