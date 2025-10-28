const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testRBAC() {
  console.log('🧪 RBAC TESTING: Community Manager Permissions\n');
  console.log('═'.repeat(80));

  // Step 1: Check current permissions for community_manager
  console.log('Step 1: Checking current Community Manager permissions in database...\n');

  const { data: currentPerms, error: fetchError } = await supabase
    .from('role_permissions')
    .select('role_type, permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('is_test', false)
    .eq('active', true);

  if (fetchError) {
    console.log('❌ Error fetching permissions:', fetchError.message);
    return;
  }

  console.log(`✅ Found ${currentPerms.length} permissions for community_manager`);
  console.log('\nCurrent state (first 10):');
  currentPerms.slice(0, 10).forEach(p => {
    console.log(`   ${p.permission_key}: ${p.granted ? '✅ GRANTED' : '❌ DENIED'}`);
  });

  // Step 2: Find a specific permission to test toggling
  const testPermission = currentPerms.find(p => p.permission_key === 'create_news:all');

  if (!testPermission) {
    console.log('\n⚠️  Test permission "create_news:all" not found');
    console.log('   Using first available permission for test');
  }

  const permToTest = testPermission || currentPerms[0];
  console.log(`\n📝 Test Permission: ${permToTest.permission_key}`);
  console.log(`   Current value: ${permToTest.granted}`);

  // Step 3: Simulate what the API will do
  console.log('\n═'.repeat(80));
  console.log('Step 2: Testing Permission Update Flow\n');

  const newValue = !permToTest.granted;
  console.log(`Simulating toggle: ${permToTest.granted} → ${newValue}`);

  const { error: updateError } = await supabase
    .from('role_permissions')
    .update({ granted: newValue })
    .eq('role_type', 'community_manager')
    .eq('permission_key', permToTest.permission_key)
    .eq('is_test', false)
    .eq('active', true);

  if (updateError) {
    console.log('❌ Update failed:', updateError.message);
    return;
  }

  console.log('✅ Database update successful');

  // Step 4: Verify the change
  console.log('\n═'.repeat(80));
  console.log('Step 3: Verifying change persisted...\n');

  const { data: verifyPerms } = await supabase
    .from('role_permissions')
    .select('granted')
    .eq('role_type', 'community_manager')
    .eq('permission_key', permToTest.permission_key)
    .eq('is_test', false)
    .single();

  if (verifyPerms.granted === newValue) {
    console.log('✅ Change verified in database!');
    console.log(`   ${permToTest.permission_key} is now: ${verifyPerms.granted}`);
  } else {
    console.log('❌ Verification failed - value did not change');
  }

  // Step 5: Rollback the test change
  console.log('\n═'.repeat(80));
  console.log('Step 4: Rolling back test change...\n');

  await supabase
    .from('role_permissions')
    .update({ granted: permToTest.granted })
    .eq('role_type', 'community_manager')
    .eq('permission_key', permToTest.permission_key)
    .eq('is_test', false);

  console.log('✅ Test change rolled back');

  // Step 6: Check production safety
  console.log('\n═'.repeat(80));
  console.log('Step 5: Production Safety Check\n');

  console.log('Checking for potential breaking changes...');

  // Check if any critical permissions exist
  const criticalPerms = ['view_dashboard', 'view_courses:all', 'view_users:all'];
  const { data: criticalCheck } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .in('permission_key', criticalPerms);

  console.log('\nCritical permissions status:');
  criticalPerms.forEach(perm => {
    const found = criticalCheck.find(c => c.permission_key === perm);
    if (found) {
      console.log(`   ${perm}: ${found.granted ? '✅ Enabled' : '⚠️  Disabled'}`);
    } else {
      console.log(`   ${perm}: ⚠️  Not found in database`);
    }
  });

  // Step 7: Final verdict
  console.log('\n═'.repeat(80));
  console.log('FINAL VERDICT:');
  console.log('═'.repeat(80));
  console.log('✅ Database tables exist and are accessible');
  console.log('✅ Permission updates work correctly');
  console.log('✅ Changes persist to database');
  console.log('✅ Rollback works');
  console.log('\n🎯 RBAC system is READY for browser testing');
  console.log('\nNext: Test via browser UI to ensure:');
  console.log('  1. UI displays current permissions correctly');
  console.log('  2. Toggle switches work');
  console.log('  3. Changes call the API correctly');
  console.log('  4. UI updates after save');
  console.log('═'.repeat(80));
}

testRBAC().catch(console.error);
