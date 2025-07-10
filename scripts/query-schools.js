const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

async function querySchools() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log('Querying schools table...\n');
  
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .order('name')
    .limit(10);
  
  if (error) {
    console.error('Error querying schools:', error);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('No schools found in the database.');
    return;
  }
  
  console.log(`Found ${data.length} schools:\n`);
  
  // Display all available columns for the first record
  if (data.length > 0) {
    console.log('Available columns:', Object.keys(data[0]).join(', '));
    console.log('-'.repeat(60));
  }
  
  data.forEach(school => {
    console.log(`ID: ${school.id}`);
    console.log(`Name: ${school.name}`);
    // Display all fields
    Object.entries(school).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'name') {
        console.log(`${key}: ${value || 'N/A'}`);
      }
    });
    console.log('-'.repeat(60));
  });
}

querySchools().catch(console.error);