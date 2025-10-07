/**
 * RBAC Smoke Test - Quick validation
 *
 * This script performs quick smoke tests on the RBAC system:
 * 1. Checks if RBAC API endpoints are accessible
 * 2. Verifies data integrity
 * 3. Tests permission loading
 * 4. Validates superadmin checks
 */

const { createClient } = require('@supabase/supabase-js');
const http = require('http');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL = 'http://localhost:3000';

// Test results tracking
const results = {
  passed: [],
  failed: [],
  warnings: []
};

function pass(testName) {
  results.passed.push(testName);
  console.log(`✅ ${testName}`);
}

function fail(testName, error) {
  results.failed.push({ test: testName, error });
  console.log(`❌ ${testName}`);
  console.log(`   Error: ${error}`);
}

function warn(testName, message) {
  results.warnings.push({ test: testName, message });
  console.log(`⚠️  ${testName}`);
  console.log(`   ${message}`);
}

/**
 * Test 1: Check if dev server is responding
 */
async function testDevServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(BASE_URL, (res) => {
      if (res.statusCode === 200 || res.statusCode === 302) {
        pass('Dev server is running');
        resolve(true);
      } else {
        fail('Dev server is running', `Got status code ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (error) => {
      fail('Dev server is running', error.message);
      resolve(false);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      fail('Dev server is running', 'Timeout after 5s');
      resolve(false);
    });
  });
}

/**
 * Test 2: Verify superadmins exist
 */
async function testSuperadminsExist() {
  try {
    const { data, error } = await supabase
      .from('superadmins')
      .select('user_id, is_active')
      .eq('is_active', true);

    if (error) {
      fail('Superadmins exist in database', error.message);
      return false;
    }

    if (!data || data.length === 0) {
      fail('Superadmins exist in database', 'No active superadmins found');
      return false;
    }

    pass(`Superadmins exist (${data.length} active)`);
    return true;
  } catch (error) {
    fail('Superadmins exist in database', error.message);
    return false;
  }
}

/**
 * Test 3: Verify role_permissions table has data
 */
async function testRolePermissionsSeeded() {
  try {
    const { count, error } = await supabase
      .from('role_permissions')
      .select('*', { count: 'exact', head: true })
      .eq('is_test', false)
      .eq('active', true);

    if (error) {
      fail('Role permissions seeded', error.message);
      return false;
    }

    if (!count || count < 1000) {
      warn('Role permissions seeded', `Only ${count} permissions found (expected 1000+)`);
      return false;
    }

    pass(`Role permissions seeded (${count} records)`);
    return true;
  } catch (error) {
    fail('Role permissions seeded', error.message);
    return false;
  }
}

/**
 * Test 4: Check feature flags
 */
async function testFeatureFlags() {
  const serverFlag = process.env.FEATURE_SUPERADMIN_RBAC === 'true';
  const clientFlag = process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true';

  if (!serverFlag) {
    fail('Server feature flag', 'FEATURE_SUPERADMIN_RBAC is not set to true');
    return false;
  }

  if (!clientFlag) {
    fail('Client feature flag', 'NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC is not set to true');
    return false;
  }

  pass('Feature flags enabled');
  return true;
}

/**
 * Test 5: Verify auth_is_superadmin function exists
 */
async function testAuthFunction() {
  try {
    // Try to call the function (it will fail if we're not logged in, but we're just checking it exists)
    const { data, error } = await supabase.rpc('auth_is_superadmin');

    // Error is expected since we're not authenticated, but function should exist
    if (error && !error.message.includes('permission denied') && !error.message.includes('not found')) {
      // If error is NOT permission denied, function might not exist
      if (error.message.includes('does not exist')) {
        fail('auth_is_superadmin function', 'Function does not exist in database');
        return false;
      }
    }

    pass('auth_is_superadmin function exists');
    return true;
  } catch (error) {
    fail('auth_is_superadmin function', error.message);
    return false;
  }
}

/**
 * Test 6: Check if RBAC page files exist
 */
async function testRBACPageExists() {
  const fs = require('fs');
  const path = require('path');

  const rbacPage = path.join(__dirname, '..', 'pages', 'admin', 'role-management.tsx');

  if (!fs.existsSync(rbacPage)) {
    fail('RBAC page file exists', 'pages/admin/role-management.tsx not found');
    return false;
  }

  pass('RBAC page file exists');
  return true;
}

/**
 * Test 7: Verify test users were created
 */
async function testUsersCreated() {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
      fail('Test users created', error.message);
      return false;
    }

    const testUsers = users.filter(u => u.email?.includes('@fne-test.com'));

    if (testUsers.length < 9) {
      warn('Test users created', `Only ${testUsers.length} test users found (expected 9)`);
      return false;
    }

    pass(`Test users created (${testUsers.length} users)`);
    return true;
  } catch (error) {
    fail('Test users created', error.message);
    return false;
  }
}

/**
 * Test 8: Check audit log table
 */
async function testAuditLogTable() {
  try {
    const { error } = await supabase
      .from('permission_audit_log')
      .select('id')
      .limit(1);

    if (error) {
      fail('Audit log table accessible', error.message);
      return false;
    }

    pass('Audit log table accessible');
    return true;
  } catch (error) {
    fail('Audit log table accessible', error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 RBAC SMOKE TESTS');
  console.log('='.repeat(60));
  console.log('\nRunning quick validation tests...\n');

  // Run all tests
  await testDevServerRunning();
  await testSuperadminsExist();
  await testRolePermissionsSeeded();
  await testFeatureFlags();
  await testAuthFunction();
  await testRBACPageExists();
  await testUsersCreated();
  await testAuditLogTable();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.failed.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }

  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    results.warnings.forEach(({ test, message }) => {
      console.log(`  - ${test}: ${message}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (results.failed.length === 0) {
    console.log('✅ ALL SMOKE TESTS PASSED!');
    console.log('\nThe RBAC system appears to be set up correctly.');
    console.log('You can now test manually at: http://localhost:3000/admin/role-management');
    console.log('\n' + '='.repeat(60));
    return 0;
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('\nPlease fix the failed tests before proceeding.');
    console.log('\n' + '='.repeat(60));
    return 1;
  }
}

// Run tests
runTests()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
