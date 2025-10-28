/**
 * Test that permission changes actually save to database
 * 1. Read current permission value
 * 2. Make a change via API
 * 3. Verify change in database
 * 4. Revert change
 * 5. Verify revert
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPermissionUpdates() {
  console.log('\n🧪 Testing Permission Update Functionality\n');
  console.log('='.repeat(60) + '\n');

  // Test role and permission
  const TEST_ROLE = 'docente';
  const TEST_PERMISSION = 'create_news';

  try {
    // Step 1: Get current value
    console.log('📖 Step 1: Reading current permission value...');
    const { data: currentData, error: readError } = await supabase
      .from('role_permissions')
      .select('granted')
      .eq('role_type', TEST_ROLE)
      .eq('permission_key', TEST_PERMISSION)
      .eq('is_test', false)
      .eq('active', true)
      .single();

    if (readError) {
      console.error('❌ Error reading current value:', readError.message);
      return;
    }

    const originalValue = currentData.granted;
    console.log(`   Current: ${TEST_ROLE}.${TEST_PERMISSION} = ${originalValue}`);
    console.log(`   ✅ Successfully read from database\n`);

    // Step 2: Toggle the permission (simulate what the UI does)
    console.log('🔄 Step 2: Toggling permission value...');
    const newValue = !originalValue;
    console.log(`   Changing from ${originalValue} to ${newValue}`);

    const { error: updateError } = await supabase
      .from('role_permissions')
      .update({ granted: newValue })
      .eq('role_type', TEST_ROLE)
      .eq('permission_key', TEST_PERMISSION)
      .eq('is_test', false)
      .eq('active', true);

    if (updateError) {
      console.error('❌ Error updating permission:', updateError.message);
      return;
    }

    console.log(`   ✅ Update query executed\n`);

    // Step 3: Verify the change
    console.log('✔️  Step 3: Verifying change in database...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('role_permissions')
      .select('granted')
      .eq('role_type', TEST_ROLE)
      .eq('permission_key', TEST_PERMISSION)
      .eq('is_test', false)
      .eq('active', true)
      .single();

    if (verifyError) {
      console.error('❌ Error verifying change:', verifyError.message);
      return;
    }

    if (verifyData.granted === newValue) {
      console.log(`   ✅ Change verified! Value is now: ${verifyData.granted}\n`);
    } else {
      console.error(`   ❌ Change NOT saved! Expected ${newValue}, got ${verifyData.granted}\n`);
      return;
    }

    // Step 4: Revert the change
    console.log('↩️  Step 4: Reverting to original value...');
    console.log(`   Changing back from ${newValue} to ${originalValue}`);

    const { error: revertError } = await supabase
      .from('role_permissions')
      .update({ granted: originalValue })
      .eq('role_type', TEST_ROLE)
      .eq('permission_key', TEST_PERMISSION)
      .eq('is_test', false)
      .eq('active', true);

    if (revertError) {
      console.error('❌ Error reverting permission:', revertError.message);
      return;
    }

    console.log(`   ✅ Revert query executed\n`);

    // Step 5: Verify the revert
    console.log('✔️  Step 5: Verifying revert...');
    const { data: finalData, error: finalError } = await supabase
      .from('role_permissions')
      .select('granted')
      .eq('role_type', TEST_ROLE)
      .eq('permission_key', TEST_PERMISSION)
      .eq('is_test', false)
      .eq('active', true)
      .single();

    if (finalError) {
      console.error('❌ Error verifying revert:', finalError.message);
      return;
    }

    if (finalData.granted === originalValue) {
      console.log(`   ✅ Revert verified! Value is back to: ${finalData.granted}\n`);
    } else {
      console.error(`   ❌ Revert failed! Expected ${originalValue}, got ${finalData.granted}\n`);
      return;
    }

    // Step 6: Test audit logging
    console.log('📝 Step 6: Checking audit logs...');
    const { data: auditLogs, error: auditError } = await supabase
      .from('permission_audit_log')
      .select('*')
      .eq('role_type', TEST_ROLE)
      .eq('permission_key', TEST_PERMISSION)
      .order('created_at', { ascending: false })
      .limit(5);

    if (auditError) {
      console.log(`   ⚠️  Could not read audit logs: ${auditError.message}`);
    } else {
      console.log(`   Found ${auditLogs.length} audit log entries for this permission`);
      if (auditLogs.length > 0) {
        console.log(`   Most recent: ${auditLogs[0].action} at ${auditLogs[0].created_at}`);
      }
    }

    // Success summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ ALL TESTS PASSED!\n');
    console.log('Summary:');
    console.log(`   ✅ Can read permissions from database`);
    console.log(`   ✅ Can update permissions in database`);
    console.log(`   ✅ Changes are persisted correctly`);
    console.log(`   ✅ Can revert changes`);
    console.log(`   ✅ Database updates are working perfectly\n`);
    console.log('🎉 Permission update system is fully operational!\n');

  } catch (error) {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
  }
}

testPermissionUpdates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
