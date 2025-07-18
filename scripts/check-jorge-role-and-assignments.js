const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkJorge() {
  const jorgeId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
  console.log('=== Jorge Parra Analysis ===');
  console.log('User ID:', jorgeId);
  
  // 1. Check Jorge's role
  console.log('\n1. Checking Jorge\'s role in user_roles table:');
  const { data: userRoles, error: roleError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', jorgeId);
  
  if (userRoles) {
    console.log('Jorge\'s roles:', userRoles);
    const isAdmin = userRoles.some(role => role.role_type === 'admin');
    console.log('Is Jorge an admin?', isAdmin ? 'YES' : 'NO');
  }
  
  // 2. Check courses created by Jorge
  console.log('\n2. Courses CREATED by Jorge:');
  const { data: createdCourses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('created_by', jorgeId);
  
  if (createdCourses) {
    console.log(`Jorge created ${createdCourses.length} course(s):`);
    createdCourses.forEach(c => console.log(`  - ${c.title} (ID: ${c.id})`));
  }
  
  // 3. Check course_assignments table
  console.log('\n3. Checking course_assignments table:');
  const { data: assignments } = await supabase
    .from('course_assignments')
    .select(`
      course_id,
      teacher_id,
      courses (
        id,
        title,
        created_by
      )
    `)
    .eq('teacher_id', jorgeId);
  
  if (assignments) {
    console.log(`Jorge is assigned to ${assignments.length} course(s):`);
    assignments.forEach(a => {
      if (a.courses) {
        console.log(`  - ${a.courses.title} (ID: ${a.course_id})`);
        console.log(`    Created by: ${a.courses.created_by}`);
        console.log(`    Is creator: ${a.courses.created_by === jorgeId ? 'YES' : 'NO'}`);
      }
    });
  }
  
  // 4. Summary
  console.log('\n=== ISSUE ANALYSIS ===');
  console.log('The dashboard logic:');
  console.log('- If user is ADMIN: Shows courses where created_by = user.id');
  console.log('- If user is TEACHER: Shows courses from course_assignments');
  console.log('\nJorge is being treated as ADMIN, so he only sees courses he created (1)');
  console.log('He should see courses from course_assignments (likely 2 total)');
  
  // 5. Check all assignments to see the expected second course
  console.log('\n=== Looking for the missing course ===');
  console.log('Checking which course Jorge should see but doesn\'t...');
  
  if (assignments && assignments.length > 0) {
    const nonCreatedAssignments = assignments.filter(a => 
      a.courses && a.courses.created_by !== jorgeId
    );
    
    if (nonCreatedAssignments.length > 0) {
      console.log('\nJorge is assigned to these courses he didn\'t create:');
      nonCreatedAssignments.forEach(a => {
        console.log(`  - ${a.courses.title} (ID: ${a.course_id})`);
      });
      console.log('\nThese are the courses missing from his dashboard!');
    }
  }
}

checkJorge().then(() => process.exit(0)).catch(console.error);