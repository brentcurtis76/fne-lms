const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const logFile = path.join(__dirname, '..', 'logs', 'mcp', '20250110', 'events-rls-fix', 'verify-staging.txt');

function log(message) {
  console.log(message);
  fs.appendFileSync(logFile, message + '\n');
}

async function verifyEventsRLS() {
  log('=== EVENTS RLS VERIFICATION ===');
  log(`Timestamp: ${new Date().toISOString()}`);
  log('Environment: STAGING (local development)');
  log('');
  
  // Test 1: Anonymous access
  log('1. ANONYMOUS ACCESS TEST');
  log('------------------------');
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const { data: anonData, error: anonError, count: anonCount } = await anonSupabase
    .from('events')
    .select('*', { count: 'exact' })
    .eq('is_published', true);
    
  if (anonError) {
    log(`❌ Anonymous SELECT failed: ${anonError.message}`);
    log(`   Error code: ${anonError.code}`);
  } else {
    log(`✅ Anonymous SELECT succeeded`);
    log(`   Published events count: ${anonCount || anonData?.length || 0}`);
  }
  
  // Test API endpoint
  log('');
  log('2. PUBLIC API ENDPOINT TEST');
  log('---------------------------');
  try {
    const response = await fetch('http://localhost:3000/api/public/events');
    const responseData = await response.json();
    
    if (response.ok) {
      log(`✅ API endpoint returned ${response.status}`);
      log(`   Future events: ${responseData.futureEvents?.length || 0}`);
      log(`   Past events: ${responseData.pastEvents?.length || 0}`);
    } else {
      log(`❌ API endpoint returned ${response.status}`);
      log(`   Error: ${responseData.error}`);
      if (responseData.details) {
        log(`   Details: ${responseData.details}`);
      }
    }
  } catch (error) {
    log(`❌ API endpoint failed: ${error.message}`);
  }
  
  // Test 3: Service role access (for comparison)
  log('');
  log('3. SERVICE ROLE ACCESS TEST');
  log('----------------------------');
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  
  const { data: serviceData, error: serviceError, count: serviceCount } = await serviceSupabase
    .from('events')
    .select('*', { count: 'exact' });
    
  if (serviceError) {
    log(`❌ Service role SELECT failed: ${serviceError.message}`);
  } else {
    log(`✅ Service role SELECT succeeded`);
    log(`   Total events count: ${serviceCount || serviceData?.length || 0}`);
    log(`   Published: ${serviceData?.filter(e => e.is_published).length || 0}`);
    log(`   Unpublished: ${serviceData?.filter(e => !e.is_published).length || 0}`);
  }
  
  log('');
  log('=== END OF VERIFICATION ===');
}

// Create log file
fs.mkdirSync(path.dirname(logFile), { recursive: true });
fs.writeFileSync(logFile, '');

verifyEventsRLS();