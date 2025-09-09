const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.staging' });
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function detailedRLSCheck() {
  console.log('=== DETAILED RLS VERIFICATION ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Project: ${supabaseUrl}\n`);
  
  // Test 1: Raw HTTP with anon key
  console.log('1. RAW HTTP TEST (Anonymous)');
  console.log('----------------------------');
  
  const anonResponse = await fetch(`${supabaseUrl}/rest/v1/user_roles?select=id,user_id,role_type&limit=5`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'count=exact'
    }
  });
  
  const anonData = await anonResponse.json();
  const anonCount = anonResponse.headers.get('content-range');
  
  console.log(`Status: ${anonResponse.status}`);
  console.log(`Content-Range: ${anonCount || 'none'}`);
  console.log(`Response type: ${Array.isArray(anonData) ? 'array' : typeof anonData}`);
  
  if (anonResponse.status === 200 || anonResponse.status === 206) {
    if (Array.isArray(anonData)) {
      console.log(`Records returned: ${anonData.length}`);
      if (anonData.length === 0) {
        console.log('✅ GOOD: Empty array (RLS filtering working)');
      } else {
        console.log('❌ BAD: Anonymous can see data!');
        console.log('First record:', JSON.stringify(anonData[0], null, 2));
      }
    } else {
      console.log('Response:', JSON.stringify(anonData, null, 2));
    }
  } else if (anonResponse.status === 401 || anonResponse.status === 403) {
    console.log('✅ GOOD: Access denied with proper error');
    console.log('Error:', JSON.stringify(anonData, null, 2));
  } else {
    console.log(`Unexpected status: ${anonResponse.status}`);
    console.log('Response:', JSON.stringify(anonData, null, 2));
  }
  
  // Test 2: Service role
  console.log('\n2. SERVICE ROLE TEST');
  console.log('--------------------');
  
  const serviceResponse = await fetch(`${supabaseUrl}/rest/v1/user_roles?select=id&limit=1`, {
    headers: {
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'count=exact'
    }
  });
  
  const serviceData = await serviceResponse.json();
  const serviceCount = serviceResponse.headers.get('content-range');
  
  console.log(`Status: ${serviceResponse.status}`);
  console.log(`Total count: ${serviceCount || 'unknown'}`);
  
  if (serviceResponse.status === 200 || serviceResponse.status === 206) {
    console.log('✅ Service role has access (expected)');
  } else {
    console.log('⚠️ Service role issue:', serviceData);
  }
  
  // Test 3: Check if RLS is actually enabled
  console.log('\n3. RLS STATUS CHECK');
  console.log('-------------------');
  console.log('Note: Cannot check directly via API');
  console.log('Run this in SQL Editor to verify:');
  console.log(`
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'user_roles';
  `);
  
  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    anonymous: {
      status: anonResponse.status,
      recordCount: Array.isArray(anonData) ? anonData.length : 'N/A',
      canAccess: anonResponse.status === 200 && anonData.length > 0
    },
    service: {
      status: serviceResponse.status,
      canAccess: serviceResponse.status === 200
    }
  };
  
  fs.writeFileSync(
    'logs/mcp/20250904/rls-tests/detailed-verification.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n=== SUMMARY ===');
  if (results.anonymous.canAccess) {
    console.log('❌ FAILED: Anonymous users can still access user_roles');
    console.log('ACTION REQUIRED: Execute the fixed SQL in Supabase Dashboard');
  } else {
    console.log('✅ SUCCESS: Anonymous access is blocked');
  }
}

detailedRLSCheck().catch(console.error);