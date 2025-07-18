const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTables() {
  // Get all tables with 'course' in the name
  console.log('=== Tables containing "course" ===');
  const { data: courseTables, error: courseError } = await supabase
    .rpc('get_tables_like', { pattern: '%course%' });
  
  if (courseError) {
    // Try alternative approach
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .ilike('table_name', '%course%');
    
    if (error) {
      console.log('Using direct query approach...');
      // Let's query known tables
      const knownTables = [
        'courses',
        'course_assignments',
        'course_enrollments',
        'user_courses',
        'course_instructors',
        'instructors',
        'assignments'
      ];
      
      for (const table of knownTables) {
        try {
          const { count, error } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });
          
          if (!error) {
            console.log(`✓ Table exists: ${table} (${count} rows)`);
          }
        } catch (e) {
          // Table doesn't exist
        }
      }
    } else if (tables) {
      console.log('Tables:', tables.map(t => t.table_name).join(', '));
    }
  } else if (courseTables) {
    console.log('Tables:', courseTables);
  }
  
  // Check course_enrollments specifically
  console.log('\n=== Checking course_enrollments ===');
  const { data: enrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('*')
    .limit(5);
  
  if (!enrollError) {
    console.log('course_enrollments table exists!');
    console.log('Sample structure:', enrollments.length > 0 ? Object.keys(enrollments[0]) : 'No data');
  }
  
  // Check if Jorge has any enrollments
  const jorgeId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
  console.log('\n=== Jorge\'s course enrollments ===');
  const { data: jorgeEnrollments, error: jorgeError } = await supabase
    .from('course_enrollments')
    .select('course_id, user_id, role')
    .eq('user_id', jorgeId);
  
  if (!jorgeError) {
    console.log('Jorge\'s enrollments:', jorgeEnrollments);
    
    // Get course details for each enrollment
    for (const enrollment of jorgeEnrollments) {
      const { data: course } = await supabase
        .from('courses')
        .select('id, title, created_by')
        .eq('id', enrollment.course_id)
        .single();
      
      if (course) {
        console.log(`\nCourse: ${course.title}`);
        console.log(`  Role: ${enrollment.role}`);
        console.log(`  Created by: ${course.created_by}`);
        console.log(`  Is creator: ${course.created_by === jorgeId ? 'YES' : 'NO'}`);
      }
    }
  }
}

checkTables().then(() => process.exit(0)).catch(console.error);