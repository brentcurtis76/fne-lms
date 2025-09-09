const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.staging' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('Testing staging connection...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    // Test basic connection
    const { data, error } = await supabase
      .from('schools')
      .select('id, name')
      .limit(1);
    
    if (error) {
      console.error('Connection error:', error);
    } else {
      console.log('✅ Successfully connected to staging!');
      console.log('Sample data:', data);
    }

    // Get table counts for verification
    const tables = ['profiles', 'user_roles', 'schools', 'generations'];
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      console.log(`${table}: ${error ? 'Error - ' + error.message : count + ' records'}`);
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

testConnection();