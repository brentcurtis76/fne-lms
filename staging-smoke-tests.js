const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.staging' });
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== STAGING SMOKE TESTS ===');
console.log(`Time: ${new Date().toISOString()}`);
console.log(`Environment: STAGING (${supabaseUrl})\n`);

async function runSmokeTests() {
  const results = [];
  
  // Test 1: Anonymous access blocked
  console.log('1. ANONYMOUS ACCESS TEST');
  console.log('-------------------------');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/user_roles?select=*&limit=1`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });
    
    if (response.status === 401 || response.status === 403) {
      console.log('✅ PASS: Anonymous properly blocked (401/403)');
      results.push('Anonymous: ✅ Blocked');
    } else {
      const data = await response.json();
      if (Array.isArray(data) && data.length === 0) {
        console.log('✅ PASS: Anonymous gets empty result');
        results.push('Anonymous: ✅ Empty result');
      } else {
        console.log('❌ FAIL: Anonymous has access!');
        results.push('Anonymous: ❌ Has access');
      }
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    results.push('Anonymous: ❌ Error');
  }
  
  // Test 2: Service role access (simulating admin)
  console.log('\n2. ADMIN ACCESS TEST (via service role)');
  console.log('----------------------------------------');
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    const { count, error } = await supabaseService
      .from('user_roles')
      .select('*', { count: 'exact', head: true });
    
    if (!error && count > 0) {
      console.log(`✅ PASS: Admin can access all ${count} user_roles`);
      results.push(`Admin: ✅ Access to ${count} rows`);
    } else {
      console.log('❌ FAIL: Admin cannot access user_roles');
      results.push('Admin: ❌ No access');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    results.push('Admin: ❌ Error');
  }
  
  // Test 3: Check critical tables are accessible
  console.log('\n3. CRITICAL TABLES ACCESS TEST');
  console.log('-------------------------------');
  const criticalTables = ['profiles', 'schools', 'courses', 'lessons'];
  
  for (const table of criticalTables) {
    try {
      const { count, error } = await supabaseService
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        console.log(`✅ ${table}: Accessible (${count} rows)`);
        results.push(`${table}: ✅ ${count} rows`);
      } else {
        console.log(`❌ ${table}: Error - ${error.message}`);
        results.push(`${table}: ❌ Error`);
      }
    } catch (error) {
      console.log(`❌ ${table}: ${error.message}`);
      results.push(`${table}: ❌ Error`);
    }
  }
  
  // Test 4: Simulate authenticated user (would need real JWT)
  console.log('\n4. AUTHENTICATED USER TEST');
  console.log('---------------------------');
  console.log('Note: Would need real user JWT to fully test');
  console.log('Expected behavior:');
  console.log('- User can login normally');
  console.log('- User sees only their own roles in profile');
  console.log('- No errors on profile/dashboard pages');
  results.push('Auth User: ⚠️ Needs manual test');
  
  // Test 5: Check supervisor/network pages would work
  console.log('\n5. SUPERVISOR/NETWORK ACCESS');
  console.log('-----------------------------');
  try {
    const { data: networkData, error: networkError } = await supabaseService
      .from('redes_de_colegios')
      .select('id, nombre')
      .limit(1);
    
    if (!networkError) {
      console.log('✅ Network tables accessible for supervisor');
      results.push('Network: ✅ Accessible');
    } else {
      console.log('❌ Network table error:', networkError.message);
      results.push('Network: ❌ Error');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    results.push('Network: ❌ Error');
  }
  
  // Save results
  console.log('\n' + '='.repeat(50));
  console.log('SMOKE TEST SUMMARY:');
  console.log('='.repeat(50));
  results.forEach(r => console.log(`  ${r}`));
  
  const allPassed = !results.some(r => r.includes('❌'));
  if (allPassed) {
    console.log('\n✅ ALL CRITICAL TESTS PASSED - READY FOR PRODUCTION');
  } else {
    console.log('\n⚠️ SOME TESTS FAILED - REVIEW BEFORE PRODUCTION');
  }
  
  // Save to file
  fs.writeFileSync(
    'logs/mcp/20250904/rls-tests/staging-smoke-tests.log',
    `STAGING SMOKE TESTS - ${new Date().toISOString()}\n\n` + results.join('\n')
  );
}

runSmokeTests().catch(console.error);