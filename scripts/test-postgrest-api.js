require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testPostgrestAPI() {
  console.log('Testing PostgREST API directly...\n');

  // Test 1: Check what RPC functions are available
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('RPC endpoint status:', response.status);
    const text = await response.text();
    console.log('Response:', text);
  } catch (error) {
    console.error('Error accessing RPC endpoint:', error);
  }

  // Test 2: Try to call the function directly via REST
  console.log('\nTrying to call get_user_learning_paths via REST API...');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_user_learning_paths`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        p_user_id: 'test-user-id'
      })
    });

    console.log('Function call status:', response.status);
    const result = await response.text();
    console.log('Result:', result);
  } catch (error) {
    console.error('Error calling function:', error);
  }

  // Test 3: Try the schema reload endpoint
  console.log('\nTrying schema reload...');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reload_schema_cache`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    console.log('Schema reload status:', response.status);
    const result = await response.text();
    console.log('Result:', result);
  } catch (error) {
    console.error('Error reloading schema:', error);
  }
}

testPostgrestAPI().catch(console.error);