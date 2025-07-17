require('dotenv').config({ path: '.env.local' });

async function forceSchemaReload() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('Attempting to force PostgREST schema reload...\n');

  // Method 1: Try the Supabase-specific reload endpoint
  console.log('Method 1: Supabase reload endpoint...');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/_schema_cache`, {
      method: 'DELETE',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });
    console.log('Status:', response.status);
    console.log('Response:', await response.text());
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Method 2: Try NOTIFY approach via a different endpoint
  console.log('\nMethod 2: PostgreSQL NOTIFY...');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_notify`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel: 'pgrst',
        payload: 'reload schema'
      })
    });
    console.log('Status:', response.status);
    console.log('Response:', await response.text());
  } catch (error) {
    console.error('Error:', error.message);
  }

  // Method 3: Try accessing the management API if available
  console.log('\nMethod 3: Management API...');
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (projectRef) {
    try {
      const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/postgrest/reload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Status:', response.status);
      console.log('Response:', await response.text());
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  console.log('\nIf none of these methods work, you may need to:');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to Settings > API');
  console.log('3. Click "Reload server" or restart the PostgREST service');
  console.log('4. Or wait for the automatic cache refresh (usually every 10 minutes)');
}

forceSchemaReload().catch(console.error);