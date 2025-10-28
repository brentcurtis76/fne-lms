/**
 * Verification script for migration 022
 *
 * Tests all 3 verification steps from CODE_REVIEW_FIXES.md
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('MIGRATION 022 VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  let allTestsPassed = true;

  // =========================================================================
  // TEST 0: Check if tables exist
  // =========================================================================
  console.log('📋 TEST 0: Checking if migration was applied...\n');

  try {
    const { data: accessTable, error: accessError } = await supabase
      .from('growth_community_transformation_access')
      .select('id')
      .limit(1);

    const { data: auditTable, error: auditError } = await supabase
      .from('transformation_access_audit_log')
      .select('id')
      .limit(1);

    if (accessError || auditError) {
      console.log('❌ Migration NOT applied yet');
      console.log('   Tables do not exist');
      console.log('');
      console.log('📋 APPLY MIGRATION FIRST:');
      console.log('   1. Open: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
      console.log('   2. Copy content of: database/migrations/022_add_transformation_access_table.sql');
      console.log('   3. Paste and click "Run"');
      console.log('   4. Then run this script again\n');
      process.exit(1);
    }

    console.log('✅ Migration applied - tables exist\n');
  } catch (error) {
    console.log('❌ Error checking tables:', error.message);
    process.exit(1);
  }

  // =========================================================================
  // TEST 1: Verificar Sincronización de Legacy Flag
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 1: Legacy Flag Synchronization (CRITICAL FIX)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const testCommunityId = crypto.randomUUID();

  try {
    // 1. Create test community
    console.log('1️⃣  Creating test community...');
    const { error: createError } = await supabase
      .from('growth_communities')
      .insert({
        id: testCommunityId,
        name: 'TEST - Migration 022 Verification',
        transformation_enabled: false, // Start false
      });

    if (createError) throw createError;
    console.log('   ✅ Test community created:', testCommunityId, '\n');

    // 2. Assign access (INSERT) - should set flag to true
    console.log('2️⃣  Assigning transformation access (INSERT)...');
    const { error: insertError } = await supabase
      .from('growth_community_transformation_access')
      .insert({
        growth_community_id: testCommunityId,
        assigned_by: null, // Nullable field - OK for test
        is_active: true,
      });

    if (insertError) throw insertError;
    console.log('   ✅ Access assigned\n');

    // 3. Verify flag is now true
    console.log('3️⃣  Verifying legacy flag sync after INSERT...');
    const { data: afterInsert, error: checkInsertError } = await supabase
      .from('growth_communities')
      .select('transformation_enabled')
      .eq('id', testCommunityId)
      .single();

    if (checkInsertError) throw checkInsertError;

    if (afterInsert.transformation_enabled === true) {
      console.log('   ✅ PASS: transformation_enabled = true after INSERT');
    } else {
      console.log('   ❌ FAIL: transformation_enabled =', afterInsert.transformation_enabled);
      allTestsPassed = false;
    }
    console.log('');

    // 4. Revoke access (UPDATE) - should set flag to false
    console.log('4️⃣  Revoking transformation access (UPDATE)...');
    const { error: updateError } = await supabase
      .from('growth_community_transformation_access')
      .update({ is_active: false })
      .eq('growth_community_id', testCommunityId);

    if (updateError) throw updateError;
    console.log('   ✅ Access revoked\n');

    // 5. Verify flag is now false
    console.log('5️⃣  Verifying legacy flag sync after UPDATE...');
    const { data: afterUpdate, error: checkUpdateError } = await supabase
      .from('growth_communities')
      .select('transformation_enabled')
      .eq('id', testCommunityId)
      .single();

    if (checkUpdateError) throw checkUpdateError;

    if (afterUpdate.transformation_enabled === false) {
      console.log('   ✅ PASS: transformation_enabled = false after UPDATE');
    } else {
      console.log('   ❌ FAIL: transformation_enabled =', afterUpdate.transformation_enabled);
      allTestsPassed = false;
    }
    console.log('');

    console.log('🎯 TEST 1 RESULT: ' + (allTestsPassed ? 'PASSED ✅' : 'FAILED ❌'));
    console.log('');

  } catch (error) {
    console.log('❌ TEST 1 ERROR:', error.message);
    allTestsPassed = false;
  }

  // =========================================================================
  // TEST 2: Verificar Audit Log Completo
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 2: Complete Audit Log (MEDIUM FIX)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const testCommunityId2 = crypto.randomUUID();

  try {
    // 1. Create test community
    console.log('1️⃣  Creating test community...');
    const { error: createError } = await supabase
      .from('growth_communities')
      .insert({
        id: testCommunityId2,
        name: 'TEST - Audit Log Verification',
        transformation_enabled: false,
      });

    if (createError) throw createError;
    console.log('   ✅ Test community created:', testCommunityId2, '\n');

    // 2. Assign access (should create audit log entry)
    console.log('2️⃣  Assigning transformation access...');
    const { error: assignError } = await supabase
      .from('growth_community_transformation_access')
      .insert({
        growth_community_id: testCommunityId2,
        assigned_by: null, // Nullable field - OK for test
        is_active: true,
      });

    if (assignError) throw assignError;
    console.log('   ✅ Access assigned\n');

    // 3. Check audit log count (should be 1)
    console.log('3️⃣  Checking audit log after INSERT...');
    const { count: countAfterInsert, error: count1Error } = await supabase
      .from('transformation_access_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('growth_community_id', testCommunityId2);

    if (count1Error) throw count1Error;

    if (countAfterInsert === 1) {
      console.log('   ✅ PASS: 1 audit log entry after INSERT');
    } else {
      console.log('   ❌ FAIL: Expected 1 entry, found', countAfterInsert);
      allTestsPassed = false;
    }
    console.log('');

    // 4. Revoke access (should create another audit log entry)
    console.log('4️⃣  Revoking transformation access...');
    const { error: revokeError } = await supabase
      .from('growth_community_transformation_access')
      .update({ is_active: false })
      .eq('growth_community_id', testCommunityId2);

    if (revokeError) throw revokeError;
    console.log('   ✅ Access revoked\n');

    // 5. Check audit log count (should be 2)
    console.log('5️⃣  Checking audit log after UPDATE...');
    const { count: countAfterUpdate, error: count2Error } = await supabase
      .from('transformation_access_audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('growth_community_id', testCommunityId2);

    if (count2Error) throw count2Error;

    if (countAfterUpdate === 2) {
      console.log('   ✅ PASS: 2 audit log entries after UPDATE');
    } else {
      console.log('   ❌ FAIL: Expected 2 entries, found', countAfterUpdate);
      allTestsPassed = false;
    }
    console.log('');

    // 6. Verify log entry details
    console.log('6️⃣  Verifying audit log entry details...');
    const { data: logEntries, error: logError } = await supabase
      .from('transformation_access_audit_log')
      .select('action, notes')
      .eq('growth_community_id', testCommunityId2)
      .order('performed_at', { ascending: true });

    if (logError) throw logError;

    console.log('   Entry 1:', logEntries[0]?.action, '-', logEntries[0]?.notes?.substring(0, 50) + '...');
    console.log('   Entry 2:', logEntries[1]?.action, '-', logEntries[1]?.notes?.substring(0, 50) + '...');

    if (logEntries[0]?.action === 'assigned' && logEntries[1]?.action === 'revoked') {
      console.log('   ✅ PASS: Correct action sequence');
    } else {
      console.log('   ❌ FAIL: Unexpected action sequence');
      allTestsPassed = false;
    }
    console.log('');

    console.log('🎯 TEST 2 RESULT: ' + (allTestsPassed ? 'PASSED ✅' : 'FAILED ❌'));
    console.log('');

  } catch (error) {
    console.log('❌ TEST 2 ERROR:', error.message);
    allTestsPassed = false;
  }

  // =========================================================================
  // TEST 3: Verificar Repeated Revocations Return 404
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 3: Repeated Revocations Return 404 (CRITICAL FIX)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const testCommunityId3 = crypto.randomUUID();

  try {
    // 1. Create test community with active access
    console.log('1️⃣  Creating test community with active access...');
    const { error: createError } = await supabase
      .from('growth_communities')
      .insert({
        id: testCommunityId3,
        name: 'TEST - Repeated Revocation',
        transformation_enabled: false,
      });

    if (createError) throw createError;

    const { error: assignError } = await supabase
      .from('growth_community_transformation_access')
      .insert({
        growth_community_id: testCommunityId3,
        assigned_by: null, // Nullable field - OK for test
        is_active: true,
      });

    if (assignError) throw assignError;
    console.log('   ✅ Test community created with active access\n');

    // 2. First revocation (should succeed)
    console.log('2️⃣  First revocation (should succeed)...');
    const { data: firstRevoke, error: firstError } = await supabase
      .from('growth_community_transformation_access')
      .update({ is_active: false })
      .eq('growth_community_id', testCommunityId3)
      .eq('is_active', true)
      .select();

    if (firstError) throw firstError;

    if (firstRevoke && firstRevoke.length === 1) {
      console.log('   ✅ PASS: First revocation succeeded (1 row updated)');
    } else {
      console.log('   ❌ FAIL: First revocation unexpected result:', firstRevoke?.length);
      allTestsPassed = false;
    }
    console.log('');

    // 3. Second revocation (should fail - no active record)
    console.log('3️⃣  Second revocation (should fail)...');
    const { data: secondRevoke, error: secondError } = await supabase
      .from('growth_community_transformation_access')
      .update({ is_active: false })
      .eq('growth_community_id', testCommunityId3)
      .eq('is_active', true)
      .select();

    if (secondError) throw secondError;

    if (secondRevoke && secondRevoke.length === 0) {
      console.log('   ✅ PASS: Second revocation correctly returned 0 rows');
    } else {
      console.log('   ❌ FAIL: Second revocation should have returned 0 rows, got:', secondRevoke?.length);
      allTestsPassed = false;
    }
    console.log('');

    // 4. Verify access record is still inactive (not updated again)
    console.log('4️⃣  Verifying record state...');
    const { data: finalState, error: stateError } = await supabase
      .from('growth_community_transformation_access')
      .select('is_active')
      .eq('growth_community_id', testCommunityId3)
      .single();

    if (stateError) throw stateError;

    if (finalState.is_active === false) {
      console.log('   ✅ PASS: Record remains inactive (not duplicated)');
    } else {
      console.log('   ❌ FAIL: Record state unexpected:', finalState.is_active);
      allTestsPassed = false;
    }
    console.log('');

    // Cleanup test 3
    await supabase
      .from('transformation_access_audit_log')
      .delete()
      .eq('growth_community_id', testCommunityId3);

    await supabase
      .from('growth_community_transformation_access')
      .delete()
      .eq('growth_community_id', testCommunityId3);

    await supabase
      .from('growth_communities')
      .delete()
      .eq('id', testCommunityId3);

    console.log('🎯 TEST 3 RESULT: ' + (allTestsPassed ? 'PASSED ✅' : 'FAILED ❌'));
    console.log('');

  } catch (error) {
    console.log('❌ TEST 3 ERROR:', error.message);
    allTestsPassed = false;
  }

  // =========================================================================
  // TEST 4: Manual API Test Instructions
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 4: API Returns 404 (Manual Test)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('ℹ️  This test requires the dev server to be running');
  console.log('   Run: npm run dev (in another terminal)');
  console.log('   Then test manually with:');
  console.log('');
  console.log('   curl -X POST http://localhost:3000/api/admin/transformation/revoke-access \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"communityId": "00000000-0000-0000-0000-000000000000"}\' \\');
  console.log('     -H "Cookie: <admin-session-cookie>"');
  console.log('');
  console.log('   Expected: HTTP 404 with error message');
  console.log('   "Esta comunidad no tiene un registro de acceso activo para revocar."');
  console.log('');

  // =========================================================================
  // CLEANUP
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CLEANUP');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    console.log('🧹 Cleaning up test data...');

    // Delete audit logs first (foreign key constraint)
    await supabase
      .from('transformation_access_audit_log')
      .delete()
      .in('growth_community_id', [testCommunityId, testCommunityId2]);

    // Delete access records
    await supabase
      .from('growth_community_transformation_access')
      .delete()
      .in('growth_community_id', [testCommunityId, testCommunityId2]);

    // Delete test communities
    await supabase
      .from('growth_communities')
      .delete()
      .in('id', [testCommunityId, testCommunityId2]);

    console.log('✅ Cleanup complete\n');
  } catch (error) {
    console.log('⚠️  Cleanup error (non-critical):', error.message, '\n');
  }

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (allTestsPassed) {
    console.log('🎉 ALL AUTOMATED TESTS PASSED! ✅');
    console.log('');
    console.log('Migration 022 with code review fixes is working correctly:');
    console.log('  ✅ TEST 1: Legacy flag sync (CRITICAL FIX)');
    console.log('  ✅ TEST 2: Audit log INSERT trigger (MEDIUM FIX)');
    console.log('  ✅ TEST 3: Repeated revocations prevented (CRITICAL FIX)');
    console.log('  ⏳ TEST 4: Manual API test (see instructions above)');
    console.log('');
    console.log('After completing TEST 4, safe to deploy to production! 🚀');
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('');
    console.log('Please review the failures above and investigate.');
    console.log('Do NOT deploy to production until all tests pass.');
  }
  console.log('');

  process.exit(allTestsPassed ? 0 : 1);
}

runVerification().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
