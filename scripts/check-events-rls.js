const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEventsRLS() {
  try {
    console.log('Checking events table RLS policies...\n');
    
    // Check RLS policies
    const { data: policies, error: polError } = await supabase
      .rpc('check_table_policies', { table_name: 'events' });
      
    if (polError) {
      console.log('Could not fetch policies via RPC, trying direct query...');
      
      // Try a direct query to pg_policies
      const { data: directPolicies, error: directError } = await supabase
        .from('pg_policies')
        .select('*')
        .eq('tablename', 'events');
        
      if (directError) {
        console.error('Error fetching policies:', directError);
      } else {
        console.log('Policies found:', directPolicies);
      }
    } else {
      console.log('RLS Policies:', policies);
    }
    
    // Test with anon key
    const anonSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    console.log('\nTesting with anon key (as public user):');
    const { data: anonEvents, error: anonError } = await anonSupabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .limit(1);
      
    if (anonError) {
      console.error('Anon access error:', anonError.message);
      console.error('Full error:', JSON.stringify(anonError, null, 2));
    } else {
      console.log(`Anon can access ${anonEvents?.length || 0} events`);
    }
    
    // Test with service role key
    console.log('\nTesting with service role key:');
    const { data: serviceEvents, error: serviceError } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .limit(1);
      
    if (serviceError) {
      console.error('Service role error:', serviceError.message);
    } else {
      console.log(`Service role can access ${serviceEvents?.length || 0} events`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkEventsRLS();