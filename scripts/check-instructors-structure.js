const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkInstructors() {
  const jorgeId = '372ab00b-1d39-4574-8eff-d756b9d6b861';
  
  // 1. Get sample from instructors table to see structure
  console.log('=== Instructors table structure ===');
  const { data: sampleInstructors, error: sampleError } = await supabase
    .from('instructors')
    .select('*')
    .limit(5);
  
  if (!sampleError && sampleInstructors && sampleInstructors.length > 0) {
    console.log('Columns in instructors table:', Object.keys(sampleInstructors[0]));
    console.log('\nSample records:');
    sampleInstructors.forEach(inst => {
      console.log(JSON.stringify(inst, null, 2));
    });
  }
  
  // 2. Try to find Jorge using different column names
  console.log('\n=== Looking for Jorge in instructors table ===');
  
  // First, let's see all instructors
  const { data: allInstructors, error: allError } = await supabase
    .from('instructors')
    .select('*');
  
  if (!allError && allInstructors) {
    console.log(`\nTotal instructors: ${allInstructors.length}`);
    
    // Look for Jorge's ID in any field
    const jorgeRecords = allInstructors.filter(inst => 
      Object.values(inst).some(value => 
        value && value.toString().includes(jorgeId)
      )
    );
    
    if (jorgeRecords.length > 0) {
      console.log(`\nFound ${jorgeRecords.length} records potentially related to Jorge:`);
      jorgeRecords.forEach(record => {
        console.log(JSON.stringify(record, null, 2));
        
        // Get course details if course_id exists
        if (record.course_id) {
          supabase
            .from('courses')
            .select('id, title')
            .eq('id', record.course_id)
            .single()
            .then(({ data: course }) => {
              if (course) {
                console.log(`  Course: ${course.title}`);
              }
            });
        }
      });
    } else {
      console.log('\nNo records found for Jorge in instructors table');
    }
  }
  
  // 3. Check who is teaching "Introducción a Los Pellines"
  console.log('\n=== Looking for instructors of "Introducción a Los Pellines" ===');
  const { data: introCourse } = await supabase
    .from('courses')
    .select('id, title, created_by')
    .eq('title', 'Introducción a Los Pellines')
    .single();
  
  if (introCourse) {
    console.log('Course found:', introCourse);
    
    // Find instructors for this course
    const { data: courseInstructors } = await supabase
      .from('instructors')
      .select('*')
      .eq('course_id', introCourse.id);
    
    if (courseInstructors && courseInstructors.length > 0) {
      console.log('\nInstructors for this course:');
      courseInstructors.forEach(inst => console.log(JSON.stringify(inst, null, 2)));
    }
  }
}

checkInstructors().then(() => process.exit(0)).catch(console.error);