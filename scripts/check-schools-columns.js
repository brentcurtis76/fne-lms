const { createClient } = require('@supabase/supabase-js');

// Use hardcoded values for quick check
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchoolsTable() {
  console.log('Checking schools table structure...\n');

  try {
    // Try to select all columns from schools
    const { data: schools, error } = await supabase
      .from('schools')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error accessing schools table:', error.message);
      return;
    }

    if (schools && schools.length > 0) {
      console.log('Schools table columns:');
      const school = schools[0];
      Object.keys(school).forEach(key => {
        console.log(`  - ${key}: ${typeof school[key]} (${school[key] === null ? 'null' : 'has value'})`);
      });
    } else {
      console.log('Schools table exists but has no data');
      
      // Try to insert a test school to see what columns are required
      const { error: insertError } = await supabase
        .from('schools')
        .insert([{ name: 'TEST_SCHOOL_DELETE_ME' }])
        .select();

      if (insertError) {
        console.log('\nRequired columns based on insert error:', insertError.message);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSchoolsTable();