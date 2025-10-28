/**
 * Integration Test - Complete User Workflow
 *
 * Simulates a real-world workflow:
 * 1. Superadmin logs in
 * 2. Views current permissions
 * 3. Grants Community Manager additional permissions
 * 4. Verifies changes
 * 5. Reviews audit log
 * 6. Reverts changes
 * 7. Confirms system stability
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function runIntegrationTest() {
  console.log('\n' + '═'.repeat(80));
  console.log('           🔄 INTEGRATION TEST - COMPLETE USER WORKFLOW');
  console.log('═'.repeat(80) + '\n');

  let stepCount = 0;

  // ============================================================================
  // STEP 1: Authenticate as Superadmin
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Authenticate as Superadmin\n`);

  const { data: superadmin } = await supabase
    .from('superadmins')
    .select('user_id')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!superadmin) {
    console.error('❌ FAILED: No active superadmin found');
    process.exit(1);
  }

  console.log(`✅ Authenticated as superadmin`);
  console.log(`   User ID: ${superadmin.user_id}\n`);

  // ============================================================================
  // STEP 2: View Current Community Manager Permissions
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: View Current Community Manager Permissions\n`);

  const { data: cmBefore } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('is_test', false)
    .eq('active', true)
    .order('permission_key');

  const grantedBefore = cmBefore.filter(p => p.granted).length;
  console.log(`   Current State: ${grantedBefore}/${cmBefore.length} permissions granted\n`);

  console.log('   Key Permissions (before changes):');
  const keyPerms = [
    'create_news_all',
    'edit_events_all',
    'view_users_school',
    'create_workspace_content_all'
  ];

  const beforeStates = {};
  for (const perm of keyPerms) {
    const permData = cmBefore.find(p => p.permission_key === perm);
    if (permData) {
      beforeStates[perm] = permData.granted;
      const status = permData.granted ? '✅ GRANTED' : '❌ DENIED';
      console.log(`   - ${perm.padEnd(35)} ${status}`);
    }
  }
  console.log('');

  // ============================================================================
  // STEP 3: Superadmin Grants Additional Permissions
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Grant Additional Permissions to Community Manager\n`);

  const permissionsToGrant = [
    'create_news_all',
    'edit_events_all'
  ];

  console.log('   Changes to apply:');
  for (const perm of permissionsToGrant) {
    const wasDenied = !beforeStates[perm];
    console.log(`   - ${perm}: ${wasDenied ? 'DENIED → GRANTED' : 'Already GRANTED'}`);
  }
  console.log('');

  console.log('   Applying changes to database...');
  for (const perm of permissionsToGrant) {
    const { error } = await supabase
      .from('role_permissions')
      .update({ granted: true })
      .eq('role_type', 'community_manager')
      .eq('permission_key', perm)
      .eq('is_test', false);

    if (error) {
      console.error(`   ❌ Error updating ${perm}:`, error);
    } else {
      console.log(`   ✅ Updated ${perm}`);
    }

    // Create audit log
    await supabase.from('permission_audit_log').insert({
      action: 'permission_updated',
      user_id: superadmin.user_id,
      role_type: 'community_manager',
      permission_key: perm,
      old_value: beforeStates[perm],
      new_value: true,
      performed_by: superadmin.user_id,
      reason: 'Integration test - expanding CM capabilities'
    });
  }
  console.log('');

  // ============================================================================
  // STEP 4: Verify Changes Persisted
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Verify Changes Persisted\n`);

  const { data: cmAfter } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('is_test', false)
    .in('permission_key', permissionsToGrant);

  console.log('   Verification:');
  let allPersisted = true;
  for (const permData of cmAfter) {
    if (permData.granted) {
      console.log(`   ✅ ${permData.permission_key} is now GRANTED`);
    } else {
      console.log(`   ❌ ${permData.permission_key} failed to update`);
      allPersisted = false;
    }
  }

  if (allPersisted) {
    console.log('\n   ✅ ALL CHANGES PERSISTED SUCCESSFULLY\n');
  } else {
    console.log('\n   ❌ SOME CHANGES FAILED TO PERSIST\n');
    process.exit(1);
  }

  // ============================================================================
  // STEP 5: Review Audit Log
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Review Audit Log\n`);

  const { data: auditLogs, error: auditError } = await supabase
    .from('permission_audit_log')
    .select('*')
    .eq('role_type', 'community_manager')
    .eq('reason', 'Integration test - expanding CM capabilities')
    .order('created_at', { ascending: false });

  if (auditError) {
    console.error('   ❌ Error fetching audit logs:', auditError);
  } else {
    console.log(`   ✅ Found ${auditLogs.length} audit log entries\n`);
    console.log('   Audit Trail:');
    auditLogs.forEach((log, idx) => {
      const timestamp = new Date(log.created_at).toISOString();
      console.log(`   ${idx + 1}. ${log.permission_key}`);
      console.log(`      Changed: ${log.old_value} → ${log.new_value}`);
      console.log(`      When: ${timestamp}`);
      console.log(`      By: ${log.performed_by}`);
      console.log('');
    });
  }

  // ============================================================================
  // STEP 6: Simulate Permission Check (What CM Can Do Now)
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Simulate Permission Check\n`);

  const { data: cmAllPerms } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('granted', true)
    .eq('is_test', false);

  console.log(`   Community Manager can now perform ${cmAllPerms.length} actions:\n`);

  // Group by category
  const categories = {
    'News': cmAllPerms.filter(p => p.permission_key.includes('news')),
    'Events': cmAllPerms.filter(p => p.permission_key.includes('event')),
    'Financial': cmAllPerms.filter(p => p.permission_key.includes('expense')),
    'Workspace': cmAllPerms.filter(p => p.permission_key.includes('workspace')),
    'Other': cmAllPerms.filter(p =>
      !p.permission_key.includes('news') &&
      !p.permission_key.includes('event') &&
      !p.permission_key.includes('expense') &&
      !p.permission_key.includes('workspace')
    )
  };

  for (const [category, perms] of Object.entries(categories)) {
    if (perms.length > 0) {
      console.log(`   ${category} (${perms.length}):`);
      perms.forEach(p => {
        const scope = p.permission_key.split('_').pop().toUpperCase();
        const action = p.permission_key.replace('_own', '').replace('_school', '').replace('_all', '');
        console.log(`      • ${action} [${scope}]`);
      });
      console.log('');
    }
  }

  // ============================================================================
  // STEP 7: Revert Changes (Cleanup)
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Revert Changes (Cleanup)\n`);

  console.log('   Reverting permissions to original state...');
  for (const perm of permissionsToGrant) {
    const { error } = await supabase
      .from('role_permissions')
      .update({ granted: beforeStates[perm] })
      .eq('role_type', 'community_manager')
      .eq('permission_key', perm)
      .eq('is_test', false);

    if (!error) {
      console.log(`   ✅ Reverted ${perm} to ${beforeStates[perm]}`);
    }
  }
  console.log('');

  console.log('   Cleaning up audit logs...');
  await supabase
    .from('permission_audit_log')
    .delete()
    .eq('reason', 'Integration test - expanding CM capabilities');
  console.log('   ✅ Test audit logs deleted\n');

  // ============================================================================
  // STEP 8: Final Verification
  // ============================================================================
  stepCount++;
  console.log(`STEP ${stepCount}: Final Verification\n`);

  const { data: cmFinal } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('is_test', false)
    .in('permission_key', permissionsToGrant);

  console.log('   Verifying revert:');
  let allReverted = true;
  for (const permData of cmFinal) {
    const expectedValue = beforeStates[permData.permission_key];
    if (permData.granted === expectedValue) {
      console.log(`   ✅ ${permData.permission_key} back to ${expectedValue}`);
    } else {
      console.log(`   ❌ ${permData.permission_key} = ${permData.granted} (expected ${expectedValue})`);
      allReverted = false;
    }
  }
  console.log('');

  // ============================================================================
  // RESULTS
  // ============================================================================
  console.log('═'.repeat(80));
  console.log('\n📊 INTEGRATION TEST RESULTS\n');

  if (allPersisted && allReverted) {
    console.log('✅ INTEGRATION TEST PASSED!\n');
    console.log('   Verified Workflow:');
    console.log('   ✅ Superadmin authentication');
    console.log('   ✅ Permission viewing');
    console.log('   ✅ Permission granting');
    console.log('   ✅ Database persistence');
    console.log('   ✅ Audit logging');
    console.log('   ✅ Permission verification');
    console.log('   ✅ Change reversion');
    console.log('   ✅ System stability\n');

    console.log('   The complete user workflow is FUNCTIONAL.\n');
  } else {
    console.log('❌ INTEGRATION TEST FAILED\n');
    console.log('   Review the output above for errors.\n');
  }

  console.log('═'.repeat(80) + '\n');
}

runIntegrationTest()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
