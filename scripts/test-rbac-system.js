/**
 * Automated RBAC System Tests
 * Tests all RBAC functionality without browser automation
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, message) {
  if (passed) {
    console.log(`✅ ${name}`);
    if (message) console.log(`   ${message}`);
    testsPassed++;
  } else {
    console.log(`❌ ${name}`);
    if (message) console.log(`   ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('🧪 RBAC System Automated Tests\n');
  console.log('='.repeat(60));
  console.log('\n📋 Test Suite 1: Environment & Feature Flags\n');

  // Test 1: Feature flags
  const serverFlag = process.env.FEATURE_SUPERADMIN_RBAC === 'true';
  const clientFlag = process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true';

  logTest(
    'Server-side feature flag enabled',
    serverFlag,
    serverFlag ? 'FEATURE_SUPERADMIN_RBAC=true' : 'FEATURE_SUPERADMIN_RBAC not set'
  );

  logTest(
    'Client-side feature flag enabled',
    clientFlag,
    clientFlag ? 'NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC=true' : 'NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC not set'
  );

  console.log('\n📋 Test Suite 2: Database Tables & Data\n');

  // Test 2: Superadmins table
  const { data: superadmins, error: saError } = await supabase
    .from('superadmins')
    .select('*')
    .eq('is_active', true);

  logTest(
    'Superadmins table accessible',
    !saError,
    saError ? `Error: ${saError.message}` : `Found ${superadmins?.length || 0} active superadmins`
  );

  if (superadmins && superadmins.length > 0) {
    // Get superadmin emails
    const superadminEmails = [];
    for (const sa of superadmins) {
      const { data: userData } = await supabase.auth.admin.getUserById(sa.user_id);
      if (userData?.user?.email) {
        superadminEmails.push(userData.user.email);
      }
    }

    logTest(
      'Superadmin users exist',
      superadminEmails.length > 0,
      `Superadmins: ${superadminEmails.join(', ')}`
    );
  }

  // Test 3: Permission audit log table
  const { error: auditError } = await supabase
    .from('permission_audit_log')
    .select('*')
    .limit(1);

  logTest(
    'Permission audit log table accessible',
    !auditError,
    auditError ? `Error: ${auditError.message}` : 'Table exists and is accessible'
  );

  // Test 4: Role permissions table
  const { data: permissions, error: permError, count } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact' })
    .eq('is_test', false)
    .eq('active', true);

  logTest(
    'Role permissions table accessible',
    !permError,
    permError ? `Error: ${permError.message}` : `Found ${count} permission records`
  );

  logTest(
    'Permissions seeded correctly',
    count === 72,
    count === 72 ? '72 permissions (9 roles × 8 permissions)' : `Expected 72, got ${count}`
  );

  // Test 5: Permission structure
  if (permissions && permissions.length > 0) {
    const roles = [...new Set(permissions.map(p => p.role_type))];
    const permKeys = [...new Set(permissions.map(p => p.permission_key))];

    logTest(
      'All 9 roles present',
      roles.length === 9,
      `Roles found: ${roles.length} - ${roles.join(', ')}`
    );

    logTest(
      'All 8 permission keys present',
      permKeys.length === 8,
      `Permission keys: ${permKeys.length} - ${permKeys.join(', ')}`
    );

    // Test 6: Admin has all permissions
    const adminPerms = permissions.filter(p => p.role_type === 'admin');
    const adminHasAll = adminPerms.every(p => p.granted === true);

    logTest(
      'Admin role has all permissions granted',
      adminHasAll && adminPerms.length === 8,
      `Admin has ${adminPerms.length} permissions, all granted: ${adminHasAll}`
    );

    // Test 7: Student has minimal permissions
    const studentPerms = permissions.filter(p => p.role_type === 'estudiante');
    const studentGranted = studentPerms.filter(p => p.granted).length;

    logTest(
      'Student role has minimal permissions',
      studentGranted <= 2,
      `Student has ${studentGranted} granted permissions out of ${studentPerms.length}`
    );
  }

  console.log('\n📋 Test Suite 3: Database Functions\n');

  // Test 8: auth_is_superadmin function
  if (superadmins && superadmins.length > 0) {
    const testUserId = superadmins[0].user_id;
    const { data: isSuperadmin, error: funcError } = await supabase
      .rpc('auth_is_superadmin', { check_user_id: testUserId });

    logTest(
      'auth_is_superadmin() function works',
      !funcError && isSuperadmin === true,
      funcError ? `Error: ${funcError.message}` : `Returns true for superadmin user`
    );

    // Test 9: Function returns false for non-superadmin
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const { data: isNotSuperadmin } = await supabase
      .rpc('auth_is_superadmin', { check_user_id: fakeUserId });

    logTest(
      'auth_is_superadmin() returns false for non-superadmin',
      isNotSuperadmin === false,
      `Returns false for fake user ID`
    );
  }

  console.log('\n📋 Test Suite 4: API Endpoint Tests\n');

  // Test 10: API endpoint responds (without auth)
  try {
    const response = await fetch('http://localhost:3000/api/admin/auth/is-superadmin');
    const isUnauthorized = response.status === 401;
    const isNotFound = response.status === 404;

    logTest(
      'API endpoint accessible (not 404)',
      !isNotFound,
      isNotFound
        ? 'Feature flag disabled - endpoint returns 404'
        : isUnauthorized
          ? 'Endpoint accessible, returns 401 without auth (expected)'
          : `Response: ${response.status}`
    );
  } catch (error) {
    logTest(
      'API endpoint accessible',
      false,
      `Error: ${error.message} - Is dev server running?`
    );
  }

  // Test 11: Permissions API endpoint
  try {
    const response = await fetch('http://localhost:3000/api/admin/roles/permissions');
    const isUnauthorized = response.status === 401;
    const isNotFound = response.status === 404;

    logTest(
      'Permissions API accessible (not 404)',
      !isNotFound,
      isNotFound
        ? 'Feature flag disabled - endpoint returns 404'
        : isUnauthorized
          ? 'Endpoint accessible, returns 401 without auth (expected)'
          : `Response: ${response.status}`
    );
  } catch (error) {
    logTest(
      'Permissions API accessible',
      false,
      `Error: ${error.message}`
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results Summary\n');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   Total: ${testsPassed + testsFailed}\n`);

  if (testsFailed === 0) {
    console.log('🎉 All tests passed! RBAC system is working correctly.\n');
    console.log('📋 Next steps:');
    console.log('   1. Log in to http://localhost:3000 as a superadmin');
    console.log('   2. Navigate to /admin/role-management');
    console.log('   3. Verify the permission matrix displays correctly\n');
    return 0;
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
    return 1;
  }
}

runTests()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error('💥 Test suite crashed:', err);
    process.exit(1);
  });
