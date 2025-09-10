const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testEventsAccess() {
  console.log('Testing events table access...\n');
  
  // Test 1: Using anon key (simulating public API call)
  console.log('1. Testing with ANON key (public access):');
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  // Try simple select without any joins
  const { data: simpleData, error: simpleError } = await anonSupabase
    .from('events')
    .select('id, title, is_published')
    .eq('is_published', true)
    .limit(1);
    
  if (simpleError) {
    console.error('  Simple select error:', simpleError.message);
  } else {
    console.log('  Simple select success:', simpleData?.length || 0, 'events');
  }
  
  // Try with all columns
  const { data: allData, error: allError } = await anonSupabase
    .from('events')
    .select('*')
    .eq('is_published', true)
    .limit(1);
    
  if (allError) {
    console.error('  Full select error:', allError.message);
  } else {
    console.log('  Full select success:', allData?.length || 0, 'events');
  }
  
  // Test 2: Using service role key
  console.log('\n2. Testing with SERVICE ROLE key:');
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data: serviceData, error: serviceError } = await serviceSupabase
    .from('events')
    .select('*')
    .eq('is_published', true)
    .limit(1);
    
  if (serviceError) {
    console.error('  Service role error:', serviceError.message);
  } else {
    console.log('  Service role success:', serviceData?.length || 0, 'events');
    if (serviceData && serviceData.length > 0) {
      console.log('  Sample event:', serviceData[0].title);
    }
  }
  
  // Test 3: Check if auth_is_superadmin function exists
  console.log('\n3. Checking auth_is_superadmin function:');
  const { data: funcData, error: funcError } = await serviceSupabase
    .rpc('auth_is_superadmin');
    
  if (funcError) {
    console.error('  Function error:', funcError.message);
    console.log('  This might be causing the RLS policy issue');
  } else {
    console.log('  Function exists and returns:', funcData);
  }
}

testEventsAccess();