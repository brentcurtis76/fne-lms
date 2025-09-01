const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkSchema() {
  console.log('📋 CHECKING COURSE_ENROLLMENTS TABLE SCHEMA');
  console.log('=' + '='.repeat(70));
  
  // Try to get one enrollment to see the columns
  const { data: sample, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .limit(1);
    
  if (sample && sample[0]) {
    console.log('\nColumns in course_enrollments table:');
    Object.keys(sample[0]).forEach(col => {
      console.log(`  - ${col}: ${typeof sample[0][col]} = ${sample[0][col]}`);
    });
  } else if (error) {
    console.log('Error:', error.message);
  } else {
    console.log('No enrollments found, trying to insert a test record...');
    
    // Try minimal insert to see what's required
    const { error: insertError } = await supabase
      .from('course_enrollments')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        course_id: '00000000-0000-0000-0000-000000000000'
      });
      
    if (insertError) {
      console.log('\nInsert error reveals schema info:');
      console.log(insertError.message);
    }
  }
}

checkSchema().catch(console.error);