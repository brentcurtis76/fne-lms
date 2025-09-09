#!/usr/bin/env node

/**
 * PRODUCTION Verification script for activity_feed RLS policies
 * Adapted to use PROD_ environment variables
 * 
 * IMPORTANT: Run only during approved PROD window
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get PRODUCTION configuration
const PROD_URL = process.env.PROD_SUPABASE_URL;
const PROD_ANON_KEY = process.env.PROD_SUPABASE_ANON_KEY;
const PROD_SERVICE_KEY = process.env.PROD_SUPABASE_SERVICE_ROLE_KEY;

if (!PROD_URL || !PROD_ANON_KEY || !PROD_SERVICE_KEY) {
  console.error('❌ Missing required PROD environment variables');
  console.error('Required:');
  console.error('  PROD_SUPABASE_URL');
  console.error('  PROD_SUPABASE_ANON_KEY');
  console.error('  PROD_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function verifyActivityFeedRLS() {
  console.log('🔒 PRODUCTION Activity Feed RLS Verification');
  console.log('=' .repeat(60));
  console.log('Environment: PRODUCTION -', PROD_URL);
  console.log('Timestamp:', new Date().toISOString());
  console.log('=' .repeat(60));

  const results = [];

  // Test 1: Anonymous access (should be denied)
  console.log('\n📝 Test 1: Anonymous Access');
  try {
    const anonClient = createClient(PROD_URL, PROD_ANON_KEY);
    const { data, error } = await anonClient
      .from('activity_feed')
      .select('id')
      .limit(1);

    if (error && (error.code === 'PGRST301' || error.message.includes('JWT'))) {
      console.log('✅ PASS: Anonymous access denied (401)');
      results.push({
        role: 'Anonymous',
        test: 'Read access',
        result: 'PASS',
        details: 'Access denied as expected'
      });
    } else if (data) {
      console.log('❌ FAIL: Anonymous can read data!');
      results.push({
        role: 'Anonymous',
        test: 'Read access',
        result: 'FAIL',
        details: `Found ${data.length} rows`
      });
    }
  } catch (err) {
    console.log('❌ ERROR:', err.message);
    results.push({
      role: 'Anonymous',
      test: 'Read access',
      result: 'ERROR',
      details: err.message
    });
  }

  // Test 2: Service role access (should work)
  console.log('\n📝 Test 2: Service Role Access');
  try {
    const serviceClient = createClient(PROD_URL, PROD_SERVICE_KEY);
    const { count, error } = await serviceClient
      .from('activity_feed')
      .select('id', { count: 'exact', head: true });

    if (!error) {
      console.log(`✅ PASS: Service role can access (${count || 0} total rows)`);
      results.push({
        role: 'Service Role',
        test: 'Full access',
        result: 'PASS',
        details: `Access to ${count || 0} rows`
      });
    } else {
      console.log('❌ FAIL: Service role cannot access');
      results.push({
        role: 'Service Role',
        test: 'Full access',
        result: 'FAIL',
        details: error.message
      });
    }
  } catch (err) {
    console.log('❌ ERROR:', err.message);
    results.push({
      role: 'Service Role',
      test: 'Full access',
      result: 'ERROR',
      details: err.message
    });
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 PRODUCTION VERIFICATION SUMMARY');
  console.log('=' .repeat(60));
  
  results.forEach(r => {
    const icon = r.result === 'PASS' ? '✅' : 
                 r.result === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.role}: ${r.result} - ${r.details}`);
  });

  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  
  console.log('\n' + '=' .repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  // Save results to log file
  const logDir = 'logs/mcp/20250905/prod-rls-activity-feed';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logContent = {
    timestamp: new Date().toISOString(),
    environment: 'PRODUCTION',
    url: PROD_URL,
    results: results,
    summary: { passed, failed },
    criticalTests: {
      anonymousBlocked: results.find(r => r.role === 'Anonymous')?.result === 'PASS',
      serviceRoleWorks: results.find(r => r.role === 'Service Role')?.result === 'PASS'
    }
  };
  
  fs.writeFileSync(
    path.join(logDir, 'verification-summary.json'),
    JSON.stringify(logContent, null, 2)
  );
  
  console.log(`\n📁 Results saved to: ${logDir}/verification-summary.json`);
  
  if (failed > 0) {
    console.log('\n❌ VERIFICATION FAILED - ROLLBACK REQUIRED');
    return false;
  }
  
  console.log('\n✅ VERIFICATION PASSED');
  return true;
}

if (require.main === module) {
  verifyActivityFeedRLS()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { verifyActivityFeedRLS };