/**
 * RBAC Manual Testing Plan with Chrome DevTools MCP
 *
 * This script provides a structured test plan for manually testing
 * the RBAC system to ensure no breaking changes.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test scenarios
const TEST_SCENARIOS = [
  {
    name: '1. Superadmin Access Test',
    user: 'brent@perrotuertocm.cl',
    steps: [
      'Login as superadmin',
      'Navigate to /admin/role-management',
      'Verify page loads without errors',
      'Verify "Roles y Permisos" appears in sidebar',
      'Verify permission matrix displays all 9 roles',
      'Verify all 122 permissions are visible'
    ],
    expectedResult: 'Full access to RBAC UI',
    criticalPath: true
  },
  {
    name: '2. Permission Matrix Display Test',
    user: 'brent@perrotuertocm.cl',
    steps: [
      'Open /admin/role-management',
      'Expand each role accordion (all 9 roles)',
      'Verify scope buttons display correctly (Propio/Colegio/Red/Todos)',
      'Verify blue = granted, gray = denied',
      'Check console for errors',
      'Verify no layout breaking issues'
    ],
    expectedResult: 'Clean UI with no visual or console errors',
    criticalPath: true
  },
  {
    name: '3. Permission Toggle Test',
    user: 'brent@perrotuertocm.cl',
    steps: [
      'Open /admin/role-management',
      'Expand "Docente" role',
      'Toggle a non-critical permission (e.g., view_news_all)',
      'Verify button changes color (blue ↔ gray)',
      'Verify Save/Cancel buttons appear',
      'Click Cancel',
      'Verify changes revert',
      'Toggle again and click Save',
      'Verify success message appears'
    ],
    expectedResult: 'Permission changes save correctly',
    criticalPath: true
  },
  {
    name: '4. Critical Permission Warning Test',
    user: 'brent@perrotuertocm.cl',
    steps: [
      'Open /admin/role-management',
      'Expand "Admin" role',
      'Try to disable admin.manage_users_all',
      'Verify red warning modal appears',
      'Verify warning explains lockout risk',
      'Click "Cancelar" to abort',
      'Verify permission NOT changed'
    ],
    expectedResult: 'Lockout protection prevents accidental removal',
    criticalPath: true
  },
  {
    name: '5. Audit Log Test',
    user: 'brent@perrotuertocm.cl',
    steps: [
      'Make a permission change and save',
      'Open Supabase dashboard',
      'Query permission_audit_log table',
      'Verify entry exists with correct data',
      'Verify timestamp, user_id, old/new values recorded'
    ],
    expectedResult: 'All changes logged to audit table',
    criticalPath: true
  },
  {
    name: '6. Non-Superadmin Access Test',
    user: 'test.admin@fne-test.com',
    steps: [
      'Login as regular admin (not superadmin)',
      'Try to access /admin/role-management',
      'Verify "Roles y Permisos" does NOT appear in sidebar',
      'Try direct URL navigation',
      'Verify access denied or redirect'
    ],
    expectedResult: 'Non-superadmins cannot access RBAC',
    criticalPath: true
  },
  {
    name: '7. Student Role Access Test',
    user: 'test.estudiante@fne-test.com',
    steps: [
      'Login as student',
      'Verify dashboard loads normally',
      'Verify course access works',
      'Verify no RBAC menu items visible',
      'Check console for errors',
      'Verify student features still work'
    ],
    expectedResult: 'Student functionality unaffected',
    criticalPath: true
  },
  {
    name: '8. Teacher Role Access Test',
    user: 'test.docente@fne-test.com',
    steps: [
      'Login as teacher',
      'Verify dashboard loads',
      'Verify course management works',
      'Verify reports access works',
      'Check console for errors',
      'Verify no breaking changes'
    ],
    expectedResult: 'Teacher functionality unaffected',
    criticalPath: false
  },
  {
    name: '9. Community Manager Test',
    user: 'test.community.manager@fne-test.com',
    steps: [
      'Login as community manager',
      'Verify community features work',
      'Verify expense reports accessible (own only)',
      'Check console for errors',
      'Verify RBAC doesn\'t break existing features'
    ],
    expectedResult: 'Community manager functionality unaffected',
    criticalPath: false
  },
  {
    name: '10. Multiple Permission Changes Test',
    user: 'brent@perrotuertocm.cl',
    steps: [
      'Open /admin/role-management',
      'Make 5 different permission changes across roles',
      'Click Save once',
      'Verify all 5 changes saved correctly',
      'Refresh page',
      'Verify changes persisted',
      'Check audit log for 5 entries'
    ],
    expectedResult: 'Batch updates work correctly',
    criticalPath: true
  }
];

async function checkSystemHealth() {
  console.log('🏥 Checking System Health...\n');

  const checks = [];

  // Check superadmins
  const { data: superadmins, error: saError } = await supabase
    .from('superadmins')
    .select('user_id, is_active')
    .eq('is_active', true);

  checks.push({
    name: 'Superadmins configured',
    passed: !saError && superadmins?.length >= 1,
    details: `${superadmins?.length || 0} active superadmin(s)`
  });

  // Check role_permissions
  const { count: permCount, error: permError } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact', head: true })
    .eq('is_test', false)
    .eq('active', true);

  checks.push({
    name: 'Role permissions seeded',
    passed: !permError && permCount > 1000,
    details: `${permCount || 0} permission records`
  });

  // Check feature flags
  const ffEnabled = process.env.FEATURE_SUPERADMIN_RBAC === 'true' &&
                    process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true';

  checks.push({
    name: 'Feature flags enabled',
    passed: ffEnabled,
    details: ffEnabled ? 'Both flags enabled' : 'Check .env.local'
  });

  // Check audit log table
  const { error: auditError } = await supabase
    .from('permission_audit_log')
    .select('id')
    .limit(1);

  checks.push({
    name: 'Audit log table accessible',
    passed: !auditError,
    details: auditError ? auditError.message : 'Table exists and accessible'
  });

  // Print results
  console.log('Health Check Results:');
  console.log('='.repeat(60));
  checks.forEach(check => {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    console.log(`   ${check.details}\n`);
  });

  const allPassed = checks.every(c => c.passed);
  if (allPassed) {
    console.log('✅ All health checks passed!\n');
  } else {
    console.log('⚠️  Some health checks failed. Fix before testing.\n');
  }

  return allPassed;
}

function printTestPlan() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 RBAC MANUAL TEST PLAN');
  console.log('='.repeat(60));
  console.log('\nThis test plan ensures the RBAC system works correctly');
  console.log('and does NOT break existing functionality.\n');

  TEST_SCENARIOS.forEach((scenario, index) => {
    const criticalBadge = scenario.criticalPath ? '🔴 CRITICAL' : '🟡 IMPORTANT';

    console.log(`\n${criticalBadge} Test ${index + 1}: ${scenario.name}`);
    console.log('─'.repeat(60));
    console.log(`User: ${scenario.user}`);
    console.log(`\nSteps:`);
    scenario.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step}`);
    });
    console.log(`\nExpected Result: ${scenario.expectedResult}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST CHECKLIST');
  console.log('='.repeat(60));
  console.log('\nBefore starting tests:');
  console.log('  [ ] Dev server running (npm run dev on port 3000)');
  console.log('  [ ] Chrome DevTools MCP installed');
  console.log('  [ ] Test users created (run create-rbac-test-users.js)');
  console.log('  [ ] .env.local has RBAC feature flags enabled');
  console.log('  [ ] Database has 1,098 permission records');

  console.log('\n' + '='.repeat(60));
  console.log('🚀 STARTING THE TEST SESSION');
  console.log('='.repeat(60));
  console.log('\n1. Start Chrome DevTools MCP:');
  console.log('   npx chrome-devtools-mcp');
  console.log('\n2. Open Chrome to:');
  console.log('   http://localhost:3000');
  console.log('\n3. Open Chrome DevTools (F12)');
  console.log('\n4. Keep Console tab open to monitor errors');
  console.log('\n5. Follow the test scenarios above one by one');
  console.log('\n6. Document any errors or unexpected behavior');

  console.log('\n' + '='.repeat(60));
  console.log('🎯 CRITICAL SUCCESS CRITERIA');
  console.log('='.repeat(60));
  console.log('  ✅ No console errors during normal operation');
  console.log('  ✅ Permission matrix loads and displays correctly');
  console.log('  ✅ Permission changes save and persist');
  console.log('  ✅ Lockout protection prevents critical changes');
  console.log('  ✅ Audit logging captures all changes');
  console.log('  ✅ Non-superadmins cannot access RBAC');
  console.log('  ✅ Existing features (courses, reports, etc.) still work');
  console.log('  ✅ All user roles can still access their features');

  console.log('\n' + '='.repeat(60));
  console.log('📝 REPORT TEMPLATE');
  console.log('='.repeat(60));
  console.log('\nAfter testing, provide results in this format:');
  console.log('\nTest Results:');
  console.log('  - Test 1 (Superadmin Access): ✅/❌');
  console.log('  - Test 2 (Matrix Display): ✅/❌');
  console.log('  - Test 3 (Permission Toggle): ✅/❌');
  console.log('  - ... (continue for all tests)');
  console.log('\nIssues Found:');
  console.log('  - [Describe any issues]');
  console.log('\nConsole Errors:');
  console.log('  - [List any console errors]');
  console.log('\nRecommendation:');
  console.log('  - [✅ Safe to deploy / ⚠️ Fix issues first]');

  console.log('\n');
}

async function main() {
  console.log('🚀 RBAC Manual Testing Setup\n');

  // Run health checks
  const healthy = await checkSystemHealth();

  if (!healthy) {
    console.log('⚠️  System health checks failed. Please fix issues first.\n');
    process.exit(1);
  }

  // Print test plan
  printTestPlan();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
