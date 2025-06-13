const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('=== Node.js Authentication Test ===\n');
console.log('Environment:', {
  url: SUPABASE_URL,
  keyLength: SUPABASE_ANON_KEY?.length,
  nodeVersion: process.version
});

async function testDirectFetch(email, password) {
  console.log('\n--- Test 1: Direct Fetch ---');
  
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        password,
        gotrue_meta_security: {}
      })
    });
    
    const data = await response.json();
    console.log('Response:', {
      status: response.status,
      statusText: response.statusText,
      data: data.error || 'Success'
    });
    
    return { success: response.status === 200, data };
  } catch (error) {
    console.error('Error:', error.message);
    return { success: false, error };
  }
}

async function testSupabaseClient(email, password) {
  console.log('\n--- Test 2: Supabase Client ---');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.log('Auth Error:', error);
      return { success: false, error };
    }
    
    console.log('Auth Success:', {
      user: data.user?.email,
      session: !!data.session
    });
    
    return { success: true, data };
  } catch (error) {
    console.error('Exception:', error.message);
    return { success: false, error };
  }
}

async function main() {
  const email = process.argv[2] || 'brent@perrotuertocm.cl';
  const password = process.argv[3];
  
  if (!password) {
    console.error('\nUsage: node test-auth-node.js <email> <password>');
    process.exit(1);
  }
  
  console.log(`\nTesting with: ${email}`);
  
  await testDirectFetch(email, password);
  await testSupabaseClient(email, password);
  
  console.log('\n=== Test Complete ===');
}

main().catch(console.error);