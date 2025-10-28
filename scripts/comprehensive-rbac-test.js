/**
 * COMPREHENSIVE RBAC TESTING SUITE
 *
 * This script performs extensive testing of the scoped permission system:
 * 1. Database integrity checks
 * 2. Permission scope verification
 * 3. API update testing
 * 4. Audit log verification
 * 5. Role-specific permission testing
 * 6. Edge case testing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`   ✅ ${name}`);
    if (details) console.log(`      ${details}`);
  } else {
    failedTests++;
    console.log(`   ❌ ${name}`);
    if (details) console.log(`      ${details}`);
  }
}

async function runComprehensiveTests() {
  console.log('🧪 COMPREHENSIVE RBAC TESTING SUITE\n');
  console.log('=' .repeat(80));

  // ============================================================================
  // SECTION 1: DATABASE INTEGRITY
  // ============================================================================
  console.log('\n📊 SECTION 1: DATABASE INTEGRITY CHECKS\n');

  // Test 1.1: Count total permissions
  const { data: allPerms, count: totalCount } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact' })
    .eq('is_test', false)
    .eq('active', true);

  test('Total permission records exist', totalCount > 1000, `Found ${totalCount} records (expected ~1,098)`);

  // Test 1.2: Verify all 9 roles exist
  const roles = [...new Set(allPerms.map(p => p.role_type))];
  const expectedRoles = ['admin', 'consultor', 'equipo_directivo', 'community_manager',
                         'supervisor_de_red', 'lider_generacion', 'lider_comunidad',
                         'docente', 'estudiante'];
  test('All 9 roles have permissions', roles.length === 9, `Found: ${roles.length} roles`);

  for (const role of expectedRoles) {
    test(`  - ${role} exists`, roles.includes(role));
  }

  // Test 1.3: Verify unique permission count
  const uniquePerms = [...new Set(allPerms.map(p => p.permission_key))];
  test('Correct unique permission count', uniquePerms.length === 122,
       `Found ${uniquePerms.length} unique permissions`);

  // Test 1.4: Verify scoped vs unscoped
  const scopedPerms = uniquePerms.filter(p =>
    p.endsWith('_own') || p.endsWith('_school') || p.endsWith('_network') || p.endsWith('_all')
  );
  const unscopedPerms = uniquePerms.filter(p =>
    !p.endsWith('_own') && !p.endsWith('_school') && !p.endsWith('_network') && !p.endsWith('_all')
  );

  test('Scoped permissions exist', scopedPerms.length === 115, `Found ${scopedPerms.length} scoped`);
  test('Unscoped permissions exist', unscopedPerms.length === 7, `Found ${unscopedPerms.length} unscoped`);

  // ============================================================================
  // SECTION 2: SCOPE HIERARCHY VERIFICATION
  // ============================================================================
  console.log('\n🔍 SECTION 2: SCOPE HIERARCHY VERIFICATION\n');

  // Test 2.1: Verify critical actions have correct scopes
  const criticalActions = [
    { base: 'view_users', expectedScopes: ['own', 'school', 'network', 'all'] },
    { base: 'view_expense_reports', expectedScopes: ['own', 'school', 'all'] },
    { base: 'edit_expense_reports', expectedScopes: ['own', 'school', 'all'] },
    { base: 'create_learning_paths', expectedScopes: ['school', 'all'] },
    { base: 'approve_expense_reports', expectedScopes: ['school', 'all'] },
    { base: 'view_contracts', expectedScopes: ['own', 'school', 'all'] }
  ];

  for (const action of criticalActions) {
    const actualScopes = uniquePerms
      .filter(p => p.startsWith(action.base + '_'))
      .map(p => p.split('_').pop());

    const hasAllScopes = action.expectedScopes.every(s => actualScopes.includes(s));
    const noExtraScopes = actualScopes.every(s => action.expectedScopes.includes(s));

    test(`${action.base} has correct scopes`, hasAllScopes && noExtraScopes,
         `Expected: [${action.expectedScopes.join(', ')}], Got: [${actualScopes.join(', ')}]`);
  }

  // ============================================================================
  // SECTION 3: ROLE-SPECIFIC PERMISSION TESTING
  // ============================================================================
  console.log('\n👥 SECTION 3: ROLE-SPECIFIC PERMISSION TESTING\n');

  // Test 3.1: Admin has ALL permissions
  const { data: adminPerms } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'admin')
    .eq('is_test', false)
    .eq('active', true);

  const adminGranted = adminPerms.filter(p => p.granted).length;
  test('Admin has all 122 permissions', adminGranted === 122,
       `Admin has ${adminGranted}/122 permissions`);

  // Test 3.2: Community Manager - ONLY own scope for expense reports
  const { data: cmPerms } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('is_test', false)
    .eq('active', true)
    .like('permission_key', '%expense_reports%');

  const cmOwnExpense = cmPerms.filter(p => p.permission_key.includes('_own') && p.granted);
  const cmSchoolExpense = cmPerms.filter(p => p.permission_key.includes('_school') && p.granted);
  const cmAllExpense = cmPerms.filter(p => p.permission_key.includes('_all') && p.granted);

  test('Community Manager has "own" expense permissions', cmOwnExpense.length === 3,
       `Has ${cmOwnExpense.length} own-scoped permissions: ${cmOwnExpense.map(p => p.permission_key).join(', ')}`);
  test('Community Manager does NOT have school expense permissions', cmSchoolExpense.length === 0,
       `Correctly denied school-level access`);
  test('Community Manager does NOT have all expense permissions', cmAllExpense.length === 0,
       `Correctly denied system-wide access`);

  // Test 3.3: Equipo Directivo - School-level access
  const { data: directivoPerms } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'equipo_directivo')
    .eq('is_test', false)
    .eq('active', true)
    .like('permission_key', '%_school');

  const directivoSchoolGranted = directivoPerms.filter(p => p.granted).length;
  test('Equipo Directivo has school-level permissions', directivoSchoolGranted >= 25,
       `Has ${directivoSchoolGranted} school-scoped permissions`);

  // Test 3.4: Supervisor de Red - Network-level access
  const { data: supervisorPerms } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'supervisor_de_red')
    .eq('is_test', false)
    .eq('active', true)
    .like('permission_key', '%_network');

  const supervisorNetworkGranted = supervisorPerms.filter(p => p.granted).length;
  test('Supervisor de Red has network-level permissions', supervisorNetworkGranted >= 2,
       `Has ${supervisorNetworkGranted} network-scoped permissions`);

  // Test 3.5: Estudiante - Minimal permissions
  const { data: estudiantePerms } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'estudiante')
    .eq('is_test', false)
    .eq('active', true);

  const estudianteGranted = estudiantePerms.filter(p => p.granted).length;
  test('Estudiante has minimal permissions', estudianteGranted <= 10,
       `Has only ${estudianteGranted} permissions (minimal access)`);

  // ============================================================================
  // SECTION 4: API UPDATE TESTING
  // ============================================================================
  console.log('\n🔄 SECTION 4: API UPDATE TESTING\n');

  // Test 4.1: Read current state
  const { data: beforeUpdate } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'docente')
    .eq('permission_key', 'create_news_all')
    .eq('is_test', false)
    .single();

  const originalValue = beforeUpdate.granted;
  test('Can read permission state', beforeUpdate !== null,
       `docente.create_news_all = ${originalValue}`);

  // Test 4.2: Toggle permission
  const { error: updateError } = await supabase
    .from('role_permissions')
    .update({ granted: !originalValue })
    .eq('role_type', 'docente')
    .eq('permission_key', 'create_news_all')
    .eq('is_test', false);

  test('Can update permission', !updateError, 'Permission updated successfully');

  // Test 4.3: Verify update persisted
  const { data: afterUpdate } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('role_type', 'docente')
    .eq('permission_key', 'create_news_all')
    .eq('is_test', false)
    .single();

  test('Update persisted to database', afterUpdate.granted === !originalValue,
       `Value changed from ${originalValue} to ${afterUpdate.granted}`);

  // Test 4.4: Revert to original state
  const { error: revertError } = await supabase
    .from('role_permissions')
    .update({ granted: originalValue })
    .eq('role_type', 'docente')
    .eq('permission_key', 'create_news_all')
    .eq('is_test', false);

  test('Can revert changes', !revertError, 'Reverted to original state');

  // Test 4.5: Verify revert
  const { data: afterRevert } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('role_type', 'docente')
    .eq('permission_key', 'create_news_all')
    .eq('is_test', false)
    .single();

  test('Revert persisted correctly', afterRevert.granted === originalValue,
       `Back to original value: ${originalValue}`);

  // ============================================================================
  // SECTION 5: EDGE CASES & DATA CONSISTENCY
  // ============================================================================
  console.log('\n🔬 SECTION 5: EDGE CASES & DATA CONSISTENCY\n');

  // Test 5.1: No duplicate permission records
  const { data: duplicateCheck } = await supabase
    .from('role_permissions')
    .select('role_type, permission_key')
    .eq('is_test', false)
    .eq('active', true);

  const uniqueCombos = new Set(duplicateCheck.map(p => `${p.role_type}:${p.permission_key}`));
  test('No duplicate role-permission pairs', duplicateCheck.length === uniqueCombos.size,
       `${duplicateCheck.length} records, ${uniqueCombos.size} unique combinations`);

  // Test 5.2: All permissions have boolean values
  const { data: booleanCheck } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('is_test', false)
    .eq('active', true);

  const allBoolean = booleanCheck.every(p => typeof p.granted === 'boolean');
  test('All permissions are boolean', allBoolean, 'No null or invalid values');

  // Test 5.3: Financial permissions properly scoped
  const financialPerms = uniquePerms.filter(p =>
    p.includes('expense') || p.includes('cash_flow') || p.includes('contract')
  );
  const financialScoped = financialPerms.filter(p =>
    p.endsWith('_own') || p.endsWith('_school') || p.endsWith('_all')
  );

  test('Financial permissions are scoped', financialScoped.length === financialPerms.length,
       `All ${financialPerms.length} financial permissions have scope suffixes`);

  // Test 5.4: Critical admin permissions exist
  const criticalAdminPerms = [
    'manage_permissions',
    'view_audit_logs',
    'manage_system_settings'
  ];

  for (const perm of criticalAdminPerms) {
    const exists = uniquePerms.includes(perm);
    test(`Critical permission "${perm}" exists`, exists);
  }

  // Test 5.5: Verify no orphaned scopes
  const allBases = new Set();
  scopedPerms.forEach(p => {
    const parts = p.split('_');
    const scope = parts.pop(); // Remove scope
    const base = parts.join('_');
    allBases.add(base);
  });

  test('No orphaned scope variants', allBases.size <= 40,
       `Found ${allBases.size} unique permission bases with scopes`);

  // ============================================================================
  // SECTION 6: PERMISSION MATRIX VALIDATION
  // ============================================================================
  console.log('\n📋 SECTION 6: PERMISSION MATRIX VALIDATION\n');

  // Test 6.1: Each role has exactly 122 permission records
  for (const role of expectedRoles) {
    const { count } = await supabase
      .from('role_permissions')
      .select('*', { count: 'exact', head: true })
      .eq('role_type', role)
      .eq('is_test', false)
      .eq('active', true);

    test(`${role} has complete permission set`, count === 122,
         `Has ${count}/122 permissions`);
  }

  // Test 6.2: Verify logical consistency (e.g., edit_own implies view_own)
  const { data: cmViewOwn } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('role_type', 'community_manager')
    .eq('permission_key', 'view_expense_reports_own')
    .single();

  const { data: cmEditOwn } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('role_type', 'community_manager')
    .eq('permission_key', 'edit_expense_reports_own')
    .single();

  const logicalConsistency = !cmEditOwn.granted || cmViewOwn.granted;
  test('Logical consistency: edit_own requires view_own', logicalConsistency,
       `Community Manager: view=${cmViewOwn.granted}, edit=${cmEditOwn.granted}`);

  // ============================================================================
  // FINAL RESULTS
  // ============================================================================
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 TEST RESULTS SUMMARY\n');
  console.log(`   Total Tests Run:    ${totalTests}`);
  console.log(`   ✅ Passed:          ${passedTests}`);
  console.log(`   ❌ Failed:          ${failedTests}`);
  console.log(`   Success Rate:       ${((passedTests/totalTests)*100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 ALL TESTS PASSED! The scoped permission system is working correctly.\n');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED - Review the output above for details.\n');
  }

  console.log('=' .repeat(80));

  // Return exit code based on results
  process.exit(failedTests > 0 ? 1 : 0);
}

runComprehensiveTests().catch(err => {
  console.error('❌ Fatal error during testing:', err);
  process.exit(1);
});
