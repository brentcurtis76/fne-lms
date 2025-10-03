const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

console.log('Testing Supabase connection...\n');

console.log('Environment variables:');
console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓ Set' : '✗ Not set');
console.log('SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Not set');
console.log('PUBLIC_SERVICE_ROLE_KEY:', process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Not set');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n❌ Missing required environment variables');
  process.exit(1);
}

console.log('\nCreating Supabase client...');
const supabase = createClient(supabaseUrl, supabaseKey);

// Test basic query
async function testConnection() {
  try {
    console.log('\nTesting database connection...');
    
    // Try a simple query
    const { data, error, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Connection failed:', error);
      
      // Try with anon key instead
      console.log('\nTrying with anon key...');
      const supabaseAnon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      
      const { error: anonError } = await supabaseAnon
        .from('profiles')
        .select('*', { count: 'exact', head: true });
        
      if (!anonError) {
        console.log('✓ Connection works with anon key but not service role key');
        console.log('  This suggests the service role key might be invalid');
      }
    } else {
      console.log('✅ Connection successful!');
      console.log(`   Found ${count} profiles in the database`);
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

testConnection();