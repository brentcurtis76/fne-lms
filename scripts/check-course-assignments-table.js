const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTable() {
  const query = `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'course_assignments'
    ORDER BY ordinal_position;
  `;

  const { data, error } = await supabase.rpc('execute_sql', { query });
  
  if (error) {
    // Try direct query
    const { data: cols, error: colError } = await supabase
      .from('course_assignments')
      .select('*')
      .limit(0);
    
    if (!colError) {
      console.log('Course assignments table structure (from empty select):');
      const sampleRow = await supabase
        .from('course_assignments')
        .select('*')
        .limit(1);
      
      if (sampleRow.data && sampleRow.data.length > 0) {
        console.log('Columns:', Object.keys(sampleRow.data[0]));
      } else {
        // Insert a dummy row to see structure
        console.log('Trying to insert a test row to see structure...');
        const { error: insertError } = await supabase
          .from('course_assignments')
          .insert({
            teacher_id: '00000000-0000-0000-0000-000000000000',
            course_id: '00000000-0000-0000-0000-000000000000',
            role: 'student'
          });
        
        console.log('Insert error reveals structure:', insertError);
      }
    } else {
      console.error('Error:', colError);
    }
  } else {
    console.log('Course assignments table columns:');
    console.table(data);
  }
}

checkTable();