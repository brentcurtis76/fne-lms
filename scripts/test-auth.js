const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

console.log('=== Testing Supabase Authentication ===\n');

// Check environment variables
console.log('1. Environment Variables Check:');
console.log('   URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('   Anon Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log('   Anon Key length:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length);
console.log('   Anon Key preview:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...\n');

// Create client with same config as production
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

// Test API connectivity
async function testConnection() {
  console.log('2. Testing API Connectivity:');
  
  try {
    // Test with direct fetch
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      }
    });
    
    console.log('   Direct API call status:', response.status);
    console.log('   Direct API call statusText:', response.statusText);
    
    if (response.status === 401) {
      const errorText = await response.text();
      console.log('   401 Error details:', errorText);
    }
  } catch (error) {
    console.log('   Direct API call error:', error.message);
  }
  
  console.log('\n');
}

// Test authentication
async function testAuth(email, password) {
  console.log(`3. Testing Authentication for ${email}:`);
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.log('   ❌ Authentication failed');
      console.log('   Error message:', error.message);
      console.log('   Error status:', error.status);
      console.log('   Error details:', JSON.stringify(error, null, 2));
    } else {
      console.log('   ✅ Authentication successful');
      console.log('   User:', data.user?.email);
      console.log('   Session:', !!data.session);
    }
  } catch (e) {
    console.log('   ❌ Exception:', e.message);
  }
  
  console.log('\n');
}

// Run tests
async function runTests() {
  await testConnection();
  
  // You'll need to provide the password
  console.log('To test authentication, run:');
  console.log('node scripts/test-auth.js <password>');
  
  if (process.argv[2]) {
    await testAuth('brent@perrotuertocm.cl', process.argv[2]);
  }
  
  process.exit(0);
}

runTests();