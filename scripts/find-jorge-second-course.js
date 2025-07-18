const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findSecondCourse() {
  const jorgeId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
  
  console.log('=== Finding Jorge\'s expected second course ===');
  
  // Get all course assignments to understand the structure
  console.log('\n1. Sample course_assignments records:');
  const { data: sampleAssignments } = await supabase
    .from('course_assignments')
    .select('*')
    .limit(5);
  
  if (sampleAssignments && sampleAssignments.length > 0) {
    console.log('Sample assignment structure:', sampleAssignments[0]);
  } else {
    console.log('No assignments found in the table');
  }
  
  // Check if Jorge mentioned a specific course he should see
  console.log('\n2. Looking for "Introducción a Los Pellines" course:');
  const { data: pellinesCourse } = await supabase
    .from('courses')
    .select('*')
    .eq('title', 'Introducción a Los Pellines')
    .single();
  
  if (pellinesCourse) {
    console.log('Course found:');
    console.log(`  Title: ${pellinesCourse.title}`);
    console.log(`  ID: ${pellinesCourse.id}`);
    console.log(`  Created by: ${pellinesCourse.created_by}`);
    console.log(`  Is Jorge\'s: ${pellinesCourse.created_by === jorgeId ? 'YES' : 'NO'}`);
    
    // Check if there's an assignment for this course
    console.log('\n3. Checking assignments for this course:');
    const { data: courseAssignments } = await supabase
      .from('course_assignments')
      .select('*')
      .eq('course_id', pellinesCourse.id);
    
    if (courseAssignments && courseAssignments.length > 0) {
      console.log(`Found ${courseAssignments.length} assignment(s) for this course:`);
      courseAssignments.forEach(a => {
        console.log(`  Teacher ID: ${a.teacher_id}`);
        console.log(`  Is Jorge: ${a.teacher_id === jorgeId ? 'YES' : 'NO'}`);
      });
    } else {
      console.log('No assignments found for this course');
    }
  }
  
  // The real issue
  console.log('\n=== THE ISSUE ===');
  console.log('Jorge is an ADMIN user, and the dashboard for admins shows:');
  console.log('- "Mis Cursos" = courses where created_by = user.id');
  console.log('- "Todos los Cursos" = all courses in the system');
  console.log('\nJorge expects to see 2 courses in "Mis Cursos", but:');
  console.log('1. He only CREATED 1 course (Modelos Pedagógicos)');
  console.log('2. The other course was created by someone else');
  console.log('\nSOLUTION OPTIONS:');
  console.log('1. Assign Jorge to the second course in course_assignments table');
  console.log('2. Modify dashboard to show assigned courses for admins too');
  console.log('3. Jorge can see all courses in "Todos los Cursos" section as admin');
}

findSecondCourse().then(() => process.exit(0)).catch(console.error);