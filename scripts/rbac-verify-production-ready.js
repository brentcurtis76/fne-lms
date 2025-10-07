/**
 * RBAC Production Readiness Verification (Database-Only)
 * Checks database state to ensure RBAC is configured correctly
 * Does NOT require browser testing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let passed = 0;
let failed = 0;

function pass(test) {
  passed++;
  console.log(`✅ ${test}`);
}

function fail(test, reason) {
  failed++;
  console.error(`❌ ${test}`);
  console.error(`   Reason: ${reason}`);
}

async function main() {
  console.log('🔍 RBAC Production Readiness Verification\n');
  console.log('=' .repeat(60));
  console.log('\n');

  try {
    // Test 1: Feature flag enabled
    console.log('📋 Test 1: Feature Flag Configuration\n');
    if (process.env.FEATURE_SUPERADMIN_RBAC === 'true') {
      pass('Feature flag FEATURE_SUPERADMIN_RBAC is enabled');
    } else {
      fail('Feature flag FEATURE_SUPERADMIN_RBAC is enabled', 'Flag is not true');
    }
    console.log('');

    // Test 2: Superadmin setup
    console.log('📋 Test 2: Superadmin Configuration\n');
    const { data: superadmins, error: superError } = await supabase
      .from('superadmins')
      .select('user_id, is_active')
      .eq('is_active', true);

    if (superError) throw superError;

    if (superadmins.length === 1) {
      pass('Exactly one active superadmin configured');
    } else {
      fail('Exactly one active superadmin configured', `Found ${superadmins.length} superadmins`);
    }
    console.log('');

    // Test 3: Permission count
    console.log('📋 Test 3: Permission Database Integrity\n');
    const { count: permCount, error: permError } = await supabase
      .from('role_permissions')
      .select('*', { count: 'exact', head: true });

    if (permError) throw permError;

    if (permCount && permCount > 900) { // Should have ~1000 permissions
      pass(`Permission table populated (${permCount} records)`);
    } else {
      fail(`Permission table populated (${permCount || 0} records)`, 'Too few permissions');
    }
    console.log('');

    // Test 4: Critical permissions exist for admin
    console.log('📋 Test 4: Critical Admin Permissions\n');
    const criticalPerms = ['manage_permissions', 'manage_user_roles_all', 'manage_system_settings'];

    for (const perm of criticalPerms) {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('granted')
        .eq('role_type', 'admin')
        .eq('permission_key', perm)
        .single();

      if (error) {
        fail(`Admin has ${perm}`, error.message);
      } else if (data.granted === true) {
        pass(`Admin has ${perm}`);
      } else {
        fail(`Admin has ${perm}`, 'Permission denied');
      }
    }
    console.log('');

    // Test 5: Sidebar permission keys exist
    console.log('📋 Test 5: Sidebar Permission Keys Exist\n');
    const sidebarPerms = [
      'view_courses_all', 'view_news_all', 'view_events_all',
      'view_learning_paths_all', 'view_users_all', 'view_schools_all',
      'manage_networks', 'view_consultants_all', 'view_contracts_all',
      'view_reports_all', 'manage_communities_all', 'manage_permissions',
      'manage_system_settings'
    ];

    let missingPerms = [];
    for (const perm of sidebarPerms) {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_key')
        .eq('permission_key', perm)
        .limit(1);

      if (error || !data || data.length === 0) {
        missingPerms.push(perm);
      }
    }

    if (missingPerms.length === 0) {
      pass('All sidebar permission keys exist in database');
    } else {
      fail('All sidebar permission keys exist in database', `Missing: ${missingPerms.join(', ')}`);
    }
    console.log('');

    // Test 6: Audit logging table exists and is configured
    console.log('📋 Test 6: Audit Logging\n');
    const { data: auditCount, error: auditError } = await supabase
      .from('permission_audit_log')
      .select('id', { count: 'exact', head: true })
      .limit(1);

    if (auditError) {
      fail('Audit log table accessible', auditError.message);
    } else {
      pass('Audit log table accessible');
    }
    console.log('');

    // Test 7: All 8 roles have permissions
    console.log('📋 Test 7: All Roles Configured\n');
    const expectedRoles = [
      'admin', 'consultor', 'community_manager', 'supervisor_de_red',
      'equipo_directivo', 'docente', 'lider_comunidad', 'lider_generacion'
    ];

    for (const role of expectedRoles) {
      const { count, error } = await supabase
        .from('role_permissions')
        .select('*', { count: 'exact', head: true })
        .eq('role_type', role);

      if (error) {
        fail(`Role ${role} has permissions`, error.message);
      } else if (count && count > 0) {
        pass(`Role ${role} has permissions (${count} records)`);
      } else {
        fail(`Role ${role} has permissions`, 'No permissions found');
      }
    }
    console.log('');

    // Test 8: Test users exist with correct roles
    console.log('📋 Test 8: Test Users Configuration\n');
    const testUsers = [
      { email: 'test.admin@fne-test.com', expectedRole: 'admin' },
      { email: 'test.consultor@fne-test.com', expectedRole: 'consultor' },
      { email: 'test.docente@fne-test.com', expectedRole: 'docente' }
    ];

    let page = 1;
    let allUsers = [];
    let hasMore = true;

    while (hasMore && page < 20) {
      const { data: { users }, error } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: 100
      });

      if (error) throw error;
      allUsers = allUsers.concat(users);
      hasMore = users.length === 100;
      page++;
    }

    for (const testUser of testUsers) {
      const user = allUsers.find(u => u.email === testUser.email);
      if (user) {
        // Check user_roles table
        const { data: roles, error } = await supabase
          .from('user_roles')
          .select('role_type')
          .eq('user_id', user.id);

        if (error) {
          fail(`Test user ${testUser.email} has role`, error.message);
        } else if (roles && roles.some(r => r.role_type === testUser.expectedRole)) {
          pass(`Test user ${testUser.email} has ${testUser.expectedRole} role`);
        } else {
          fail(`Test user ${testUser.email} has ${testUser.expectedRole} role`, `Found roles: ${roles?.map(r => r.role_type).join(', ') || 'none'}`);
        }
      } else {
        fail(`Test user ${testUser.email} exists`, 'User not found');
      }
    }
    console.log('');

    // Test 9: API endpoint exists
    console.log('📋 Test 9: RBAC API Endpoint\n');
    const fs = require('fs');
    const path = require('path');
    const apiPath = path.join(__dirname, '..', 'pages', 'api', 'admin', 'roles', 'permissions', 'update.ts');

    if (fs.existsSync(apiPath)) {
      pass('RBAC API endpoint file exists');
    } else {
      fail('RBAC API endpoint file exists', 'File not found');
    }
    console.log('');

    // Test 10: Sidebar.tsx has permission checks
    console.log('📋 Test 10: Sidebar Permission Integration\n');
    const sidebarPath = path.join(__dirname, '..', 'components', 'layout', 'Sidebar.tsx');

    if (fs.existsSync(sidebarPath)) {
      const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

      // Check for permission property usage
      if (sidebarContent.includes('permission:') && sidebarContent.includes('view_news_all')) {
        pass('Sidebar uses RBAC permission checks');
      } else {
        fail('Sidebar uses RBAC permission checks', 'Permission properties not found');
      }

      // Check for old restrictedRoles array definitions (console.logs are OK)
      const restrictedRolesMatches = sidebarContent.match(/restrictedRoles:\s*\[/g);
      if (!restrictedRolesMatches || restrictedRolesMatches.length === 0) {
        pass('Sidebar has no hard-coded restrictedRoles arrays');
      } else {
        fail('Sidebar has no hard-coded restrictedRoles arrays', `Found ${restrictedRolesMatches.length} instances`);
      }
    } else {
      fail('Sidebar file exists', 'File not found');
    }
    console.log('');

    // Summary
    console.log('=' .repeat(60));
    console.log('\n📊 TEST SUMMARY\n');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    console.log('');

    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! RBAC is production-ready.\n');
      console.log('Next steps:');
      console.log('1. Run browser tests: npm run test:rbac (requires SUPERADMIN_PASSWORD)');
      console.log('2. Manual smoke test as different users');
      console.log('3. Deploy to production with feature flag enabled');
      console.log('');
      process.exit(0);
    } else {
      console.log('⚠️  TESTS FAILED. Fix issues before production deployment.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Verification failed with error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
