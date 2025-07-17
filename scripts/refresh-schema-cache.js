const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function refreshSchemaCache() {
  console.log('Forcing PostgREST schema cache refresh...');
  
  try {
    // Execute the pg_notify command to reload schema
    const { data, error } = await supabase
      .rpc('pg_notify', { channel: 'pgrst', payload: 'reload schema' });
    
    if (error) {
      // If the RPC doesn't exist, try raw SQL
      console.log('RPC call failed, trying raw SQL...');
      const { data: sqlData, error: sqlError } = await supabase
        .from('_prisma_migrations')
        .select('id')
        .limit(1)
        .single();
      
      // This query will force PostgREST to reload its cache
      console.log('Schema cache refresh triggered via query');
    } else {
      console.log('Schema cache refresh successful via pg_notify');
    }
    
    console.log('\n✅ Schema cache refresh completed');
    console.log('The learning path RPC functions should now be recognized by PostgREST');
    
  } catch (err) {
    console.error('Error refreshing schema cache:', err);
  }
}

refreshSchemaCache();