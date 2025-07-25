const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function testApproaches() {
  console.log('Testing different approaches for creating tables...\n');
  
  // Check if we can at least see what tables exist
  try {
    const { data: tablesData, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
      
    if (tablesError) {
      console.log('Cannot access information_schema.tables:', tablesError.message);
    } else {
      console.log('Existing tables:', tablesData.map(t => t.table_name));
    }
  } catch (err) {
    console.log('Error accessing tables:', err.message);
  }

  // Test the specific problem - try to create a simple table using API
  console.log('\nTesting table creation via API...');
  
  // Instead of using exec_sql, let's check if we can create tables through schema introspection
  try {
    const { data, error } = await supabase
      .from('redes_de_colegios')
      .select('*')
      .limit(0);
    
    if (error && error.code === '42P01') {
      console.log('✅ Confirmed: redes_de_colegios table does not exist');
      console.log('Need to create tables via Supabase Dashboard SQL Editor');
    } else if (error) {
      console.log('Other error:', error);
    } else {
      console.log('Table exists!');
    }
  } catch (err) {
    console.log('API Error:', err.message);
  }
}

testApproaches().catch(console.error);