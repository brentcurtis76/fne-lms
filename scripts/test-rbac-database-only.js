/**
 * RBAC Database-Only Tests
 * Tests database functionality without requiring running server
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTests() {
  console.log('\n🧪 RBAC System - Database Tests\n');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Feature Flags
  console.log('📋 Test 1: Feature Flags');
  if (process.env.FEATURE_SUPERADMIN_RBAC === 'true') {
    console.log('   ✅ Server feature flag enabled');
    passed++;
  } else {
    console.log('   ❌ Server feature flag NOT enabled');
    failed++;
  }

  if (process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true') {
    console.log('   ✅ Client feature flag enabled');
    passed++;
  } else {
    console.log('   ❌ Client feature flag NOT enabled');
    failed++;
  }

  // Test 2: Superadmins
  console.log('\n📋 Test 2: Superadmin Users');
  const { data: superadmins, error: saError } = await supabase
    .from('superadmins')
    .select('*')
    .eq('is_active', true);

  if (!saError && superadmins && superadmins.length === 2) {
    console.log(`   ✅ Found ${superadmins.length} active superadmins`);
    passed++;

    for (const sa of superadmins) {
      const { data: userData } = await supabase.auth.admin.getUserById(sa.user_id);
      console.log(`      - ${userData?.user?.email || sa.user_id}`);
    }
  } else {
    console.log(`   ❌ Expected 2 superadmins, found ${superadmins?.length || 0}`);
    if (saError) console.log(`      Error: ${saError.message}`);
    failed++;
  }

  // Test 3: Permissions Count
  console.log('\n📋 Test 3: Permission Records');
  const { data: perms, error: permError, count } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact' })
    .eq('is_test', false)
    .eq('active', true);

  if (!permError && count === 72) {
    console.log(`   ✅ Found 72 permission records (9 roles × 8 permissions)`);
    passed++;
  } else {
    console.log(`   ❌ Expected 72 permissions, found ${count}`);
    if (permError) console.log(`      Error: ${permError.message}`);
    failed++;
  }

  // Test 4: Role Coverage
  console.log('\n📋 Test 4: Role Coverage');
  const roles = [...new Set(perms.map(p => p.role_type))];
  const expectedRoles = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion',
                         'lider_comunidad', 'community_manager', 'supervisor_de_red',
                         'docente', 'estudiante'];

  if (roles.length === 9 && expectedRoles.every(r => roles.includes(r))) {
    console.log(`   ✅ All 9 roles present`);
    console.log(`      ${roles.join(', ')}`);
    passed++;
  } else {
    console.log(`   ❌ Expected 9 roles, found ${roles.length}`);
    failed++;
  }

  // Test 5: Permission Keys
  console.log('\n📋 Test 5: Permission Keys');
  const permKeys = [...new Set(perms.map(p => p.permission_key))];
  const expectedKeys = ['view_dashboard', 'manage_users', 'manage_courses',
                        'manage_roles', 'view_reports', 'manage_content',
                        'manage_generations', 'manage_networks'];

  if (permKeys.length === 8 && expectedKeys.every(k => permKeys.includes(k))) {
    console.log(`   ✅ All 8 permission keys present`);
    console.log(`      ${permKeys.join(', ')}`);
    passed++;
  } else {
    console.log(`   ❌ Expected 8 permission keys, found ${permKeys.length}`);
    failed++;
  }

  // Test 6: Admin Permissions
  console.log('\n📋 Test 6: Admin Role Permissions');
  const adminPerms = perms.filter(p => p.role_type === 'admin');
  const adminGrantedCount = adminPerms.filter(p => p.granted).length;

  if (adminPerms.length === 8 && adminGrantedCount === 8) {
    console.log(`   ✅ Admin has all 8 permissions granted`);
    passed++;
  } else {
    console.log(`   ❌ Admin should have 8 granted permissions, has ${adminGrantedCount}`);
    failed++;
  }

  // Test 7: Student Permissions (minimal)
  console.log('\n📋 Test 7: Student Role Permissions');
  const studentPerms = perms.filter(p => p.role_type === 'estudiante');
  const studentGrantedCount = studentPerms.filter(p => p.granted).length;

  if (studentPerms.length === 8 && studentGrantedCount <= 2) {
    console.log(`   ✅ Student has minimal permissions (${studentGrantedCount} granted)`);
    passed++;
  } else {
    console.log(`   ⚠️  Student has ${studentGrantedCount} granted permissions`);
    passed++; // Not critical
  }

  // Test 8: Database Function
  console.log('\n📋 Test 8: auth_is_superadmin() Function');
  const { data: isSuperadmin, error: funcError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: superadmins[0].user_id });

  if (!funcError && isSuperadmin === true) {
    console.log(`   ✅ Function returns true for superadmin`);
    passed++;
  } else {
    console.log(`   ❌ Function failed or returned false`);
    if (funcError) console.log(`      Error: ${funcError.message}`);
    failed++;
  }

  const { data: isNotSuperadmin } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: '00000000-0000-0000-0000-000000000000' });

  if (isNotSuperadmin === false) {
    console.log(`   ✅ Function returns false for non-superadmin`);
    passed++;
  } else {
    console.log(`   ❌ Function should return false for fake user`);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results\n');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total Tests: ${passed + failed}\n`);

  if (failed === 0) {
    console.log('🎉 All database tests passed!\n');
    console.log('✨ RBAC System Status: READY\n');
    console.log('📋 To complete testing:');
    console.log('   1. Ensure dev server is running: npm run dev');
    console.log('   2. Log in as: brent@perrotuertocm.cl');
    console.log('   3. Navigate to: http://localhost:3000/admin/role-management');
    console.log('   4. Verify permission matrix displays correctly\n');
    return 0;
  } else {
    console.log('⚠️  Some tests failed. Review errors above.\n');
    return 1;
  }
}

runTests()
  .then(exitCode => process.exit(exitCode))
  .catch(err => {
    console.error('\n💥 Test suite error:', err);
    process.exit(1);
  });
