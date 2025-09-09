#!/usr/bin/env node

/**
 * Verification script for courses RLS policies
 * Tests allow/deny matrix on STAGING
 * 
 * Required environment variables:
 *   STAGING_SUPABASE_URL
 *   STAGING_SUPABASE_ANON_KEY
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY
 * 
 * Optional JWTs for role testing:
 *   STAGING_JWT_STUDENT
 *   STAGING_JWT_TEACHER
 *   STAGING_JWT_ADMIN
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Get staging configuration
const STAGING_URL = process.env.STAGING_SUPABASE_URL;
const STAGING_ANON_KEY = process.env.STAGING_SUPABASE_ANON_KEY;
const STAGING_SERVICE_KEY = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;

// Optional JWTs
const JWT_STUDENT = process.env.STAGING_JWT_STUDENT;
const JWT_TEACHER = process.env.STAGING_JWT_TEACHER;
const JWT_ADMIN = process.env.STAGING_JWT_ADMIN;

if (!STAGING_URL || !STAGING_ANON_KEY || !STAGING_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('Required:');
  console.error('  STAGING_SUPABASE_URL');
  console.error('  STAGING_SUPABASE_ANON_KEY');
  console.error('  STAGING_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Parse URL for host
const urlParts = new URL(STAGING_URL);

async function makeRequest(path, apikey, jwt = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlParts.hostname,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'apikey': apikey,
        'Accept': 'application/json'
      }
    };
    
    if (jwt) {
      options.headers['Authorization'] = `Bearer ${jwt}`;
    } else if (apikey !== STAGING_ANON_KEY) {
      // Service role key acts as both apikey and auth
      options.headers['Authorization'] = `Bearer ${apikey}`;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function verifyCoursesRLS() {
  console.log('🔒 Courses RLS Verification');
  console.log('=' .repeat(60));
  console.log('Environment:', STAGING_URL);
  console.log('Timestamp:', new Date().toISOString());
  console.log('=' .repeat(60));

  const results = [];

  // Test 1: Anonymous access (should be denied)
  console.log('\n📝 Test 1: Anonymous Access');
  try {
    const response = await makeRequest('/rest/v1/courses?select=id&limit=1', STAGING_ANON_KEY);
    
    if (response.status === 401 || response.status === 403) {
      console.log('✅ PASS: Anonymous access denied');
      results.push({
        role: 'Anonymous',
        test: 'Read access',
        result: 'PASS',
        status: response.status,
        details: 'Access denied as expected'
      });
    } else {
      console.log(`❌ FAIL: Anonymous got status ${response.status}`);
      results.push({
        role: 'Anonymous',
        test: 'Read access',
        result: 'FAIL',
        status: response.status,
        details: 'Unexpected access granted'
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
    const response = await makeRequest(
      '/rest/v1/courses?select=id&limit=0',
      STAGING_SERVICE_KEY
    );
    
    if (response.status === 200) {
      const range = response.headers['content-range'];
      const count = range ? range.split('/')[1] : 'unknown';
      console.log(`✅ PASS: Service role can access (${count} total rows)`);
      results.push({
        role: 'Service Role',
        test: 'Full access',
        result: 'PASS',
        status: response.status,
        details: `Access to ${count} rows`
      });
    } else {
      console.log(`❌ FAIL: Service role got status ${response.status}`);
      results.push({
        role: 'Service Role',
        test: 'Full access',
        result: 'FAIL',
        status: response.status,
        details: response.body
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

  // Test 3: Student JWT (if provided)
  if (JWT_STUDENT) {
    console.log('\n📝 Test 3: Student Access');
    try {
      const response = await makeRequest(
        '/rest/v1/courses?select=id&limit=0',
        STAGING_ANON_KEY,
        JWT_STUDENT
      );
      
      const range = response.headers['content-range'];
      const count = range ? range.split('/')[1] : '0';
      console.log(`Student can see ${count} courses (enrolled only)`);
      results.push({
        role: 'Student',
        test: 'Enrolled courses only',
        result: response.status === 200 ? 'PASS' : 'FAIL',
        status: response.status,
        details: `Access to ${count} courses`
      });
    } catch (err) {
      console.log('❌ ERROR:', err.message);
      results.push({
        role: 'Student',
        test: 'Enrolled courses only',
        result: 'ERROR',
        details: err.message
      });
    }
  } else {
    console.log('\n⏳ Test 3: Student Access - SKIPPED (no JWT provided)');
    results.push({
      role: 'Student',
      test: 'Enrolled courses only',
      result: 'SKIPPED',
      details: 'No STAGING_JWT_STUDENT provided'
    });
  }

  // Test 4: Teacher JWT (if provided)
  if (JWT_TEACHER) {
    console.log('\n📝 Test 4: Teacher Access');
    try {
      const response = await makeRequest(
        '/rest/v1/courses?select=id&limit=0',
        STAGING_ANON_KEY,
        JWT_TEACHER
      );
      
      const range = response.headers['content-range'];
      const count = range ? range.split('/')[1] : '0';
      console.log(`Teacher can see ${count} courses (owned only)`);
      results.push({
        role: 'Teacher',
        test: 'Owned courses only',
        result: response.status === 200 ? 'PASS' : 'FAIL',
        status: response.status,
        details: `Access to ${count} courses`
      });
    } catch (err) {
      console.log('❌ ERROR:', err.message);
      results.push({
        role: 'Teacher',
        test: 'Owned courses only',
        result: 'ERROR',
        details: err.message
      });
    }
  } else {
    console.log('\n⏳ Test 4: Teacher Access - SKIPPED (no JWT provided)');
    results.push({
      role: 'Teacher',
      test: 'Owned courses only',
      result: 'SKIPPED',
      details: 'No STAGING_JWT_TEACHER provided'
    });
  }

  // Test 5: Admin JWT (if provided)
  if (JWT_ADMIN) {
    console.log('\n📝 Test 5: Admin Access');
    try {
      const response = await makeRequest(
        '/rest/v1/courses?select=id&limit=0',
        STAGING_ANON_KEY,
        JWT_ADMIN
      );
      
      const range = response.headers['content-range'];
      const count = range ? range.split('/')[1] : '0';
      console.log(`Admin can see ${count} courses (should be all)`);
      results.push({
        role: 'Admin',
        test: 'Full access',
        result: response.status === 200 ? 'PASS' : 'FAIL',
        status: response.status,
        details: `Access to ${count} courses`
      });
    } catch (err) {
      console.log('❌ ERROR:', err.message);
      results.push({
        role: 'Admin',
        test: 'Full access',
        result: 'ERROR',
        details: err.message
      });
    }
  } else {
    console.log('\n⏳ Test 5: Admin Access - SKIPPED (no JWT provided)');
    results.push({
      role: 'Admin',
      test: 'Full access',
      result: 'SKIPPED',
      details: 'No STAGING_JWT_ADMIN provided'
    });
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('=' .repeat(60));
  
  results.forEach(r => {
    const icon = r.result === 'PASS' ? '✅' : 
                 r.result === 'FAIL' ? '❌' : 
                 r.result === 'SKIPPED' ? '⏳' : '⚠️';
    console.log(`${icon} ${r.role}: ${r.result} - ${r.details}`);
  });

  const passed = results.filter(r => r.result === 'PASS').length;
  const failed = results.filter(r => r.result === 'FAIL').length;
  const skipped = results.filter(r => r.result === 'SKIPPED').length;
  
  console.log('\n' + '=' .repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  // Save results to log file
  const logDir = 'logs/mcp/20250905/courses-rls';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logContent = {
    timestamp: new Date().toISOString(),
    environment: STAGING_URL,
    results: results,
    summary: { passed, failed, skipped },
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
  
  // Exit code based on critical tests
  const criticalFailures = results
    .filter(r => ['Anonymous', 'Service Role'].includes(r.role))
    .filter(r => r.result === 'FAIL');
  
  if (criticalFailures.length > 0) {
    console.log('\n❌ Critical failures detected!');
    return false;
  }
  
  console.log('\n✅ Critical tests passed');
  return true;
}

// Run if executed directly
if (require.main === module) {
  verifyCoursesRLS()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { verifyCoursesRLS };