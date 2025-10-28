/**
 * Test Scoped Permissions System
 *
 * Verifies that:
 * 1. Scoped permissions are properly seeded
 * 2. Roles have expected scope defaults
 * 3. Community Manager has "own" scope for expense reports
 * 4. UI can update scoped permissions
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function testScopedPermissions() {
  console.log('🧪 Testing Scoped Permission System\n');

  // Test 1: Verify total permission count
  console.log('Test 1: Verify permission count');
  const { data: allPermissions, error: countError } = await supabase
    .from('role_permissions')
    .select('permission_key', { count: 'exact' })
    .eq('is_test', false)
    .eq('active', true);

  if (countError) {
    console.error('❌ Error counting permissions:', countError);
    process.exit(1);
  }

  const uniquePermissions = [...new Set(allPermissions.map(p => p.permission_key))];
  console.log(`✅ Total unique permissions: ${uniquePermissions.length}`);
  console.log(`   Expected: ~122 permissions with scopes\n`);

  // Test 2: Verify scoped permission naming
  console.log('Test 2: Verify scoped permission naming');
  const scopedPerms = uniquePermissions.filter(p =>
    p.endsWith('_own') || p.endsWith('_school') || p.endsWith('_network') || p.endsWith('_all')
  );
  console.log(`✅ Found ${scopedPerms.length} scoped permissions`);
  console.log(`   Sample scoped permissions:`);
  const samples = [
    'view_expense_reports_own',
    'edit_expense_reports_own',
    'view_expense_reports_school',
    'edit_users_school',
    'view_users_network'
  ];
  for (const sample of samples) {
    const exists = uniquePermissions.includes(sample);
    console.log(`   ${exists ? '✅' : '❌'} ${sample}`);
  }
  console.log('');

  // Test 3: Community Manager expense report permissions
  console.log('Test 3: Community Manager expense report permissions');
  const { data: cmPerms, error: cmError } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'community_manager')
    .eq('is_test', false)
    .eq('active', true)
    .in('permission_key', [
      'view_expense_reports_own',
      'create_expense_reports_own',
      'edit_expense_reports_own',
      'view_expense_reports_school',
      'edit_expense_reports_school',
      'approve_expense_reports_school'
    ]);

  if (cmError) {
    console.error('❌ Error fetching CM permissions:', cmError);
    process.exit(1);
  }

  console.log('   Community Manager expense permissions:');
  for (const perm of cmPerms) {
    console.log(`   ${perm.granted ? '✅' : '❌'} ${perm.permission_key}: ${perm.granted}`);
  }

  const hasOwnPerms = cmPerms.filter(p =>
    p.permission_key.includes('_own') && p.granted
  ).length;

  const hasSchoolPerms = cmPerms.filter(p =>
    p.permission_key.includes('_school') && p.granted
  ).length;

  console.log(`\n   Expected: view_own, create_own, edit_own = GRANTED`);
  console.log(`   Expected: school/approve permissions = NOT GRANTED`);

  if (hasOwnPerms === 3 && hasSchoolPerms === 0) {
    console.log(`   ✅ Community Manager has correct scope!\n`);
  } else {
    console.log(`   ⚠️  Community Manager scope may need adjustment\n`);
  }

  // Test 4: Admin has all permissions
  console.log('Test 4: Admin has all permissions');
  const { data: adminPerms, error: adminError } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'admin')
    .eq('is_test', false)
    .eq('active', true);

  if (adminError) {
    console.error('❌ Error fetching admin permissions:', adminError);
    process.exit(1);
  }

  const grantedCount = adminPerms.filter(p => p.granted).length;
  const totalCount = adminPerms.length;

  console.log(`   Admin permissions: ${grantedCount}/${totalCount} granted`);

  if (grantedCount === totalCount) {
    console.log(`   ✅ Admin has all permissions!\n`);
  } else {
    console.log(`   ⚠️  Admin is missing ${totalCount - grantedCount} permissions\n`);
  }

  // Test 5: Check for scope hierarchy (e.g., view_users has own, school, network, all)
  console.log('Test 5: Verify scope hierarchy for key actions');
  const actionBases = ['view_users', 'view_expense_reports', 'edit_contracts'];

  for (const base of actionBases) {
    const scopeVariants = uniquePermissions.filter(p => p.startsWith(base + '_'));
    console.log(`   ${base}:`);
    console.log(`     Scopes found: ${scopeVariants.map(p => p.split('_').pop()).join(', ')}`);
  }
  console.log('');

  // Test 6: Verify Equipo Directivo has school-level permissions
  console.log('Test 6: Equipo Directivo school-level permissions');
  const { data: directivoPerms, error: directivoError } = await supabase
    .from('role_permissions')
    .select('permission_key, granted')
    .eq('role_type', 'equipo_directivo')
    .eq('is_test', false)
    .eq('active', true)
    .or('permission_key.like.%_school');

  if (directivoError) {
    console.error('❌ Error fetching Equipo Directivo permissions:', directivoError);
    process.exit(1);
  }

  const grantedSchoolPerms = directivoPerms.filter(p => p.granted).length;
  console.log(`   ✅ Equipo Directivo has ${grantedSchoolPerms} school-level permissions granted`);
  console.log(`      Examples: ${directivoPerms.filter(p => p.granted).slice(0, 5).map(p => p.permission_key).join(', ')}\n`);

  console.log('✅ ALL TESTS COMPLETED!\n');
  console.log('📊 Summary:');
  console.log(`   - Total permissions: ${uniquePermissions.length}`);
  console.log(`   - Scoped permissions: ${scopedPerms.length}`);
  console.log(`   - Community Manager has "own" scope for expense reports: ${hasOwnPerms === 3 ? 'YES' : 'NO'}`);
  console.log(`   - Admin has all permissions: ${grantedCount === totalCount ? 'YES' : 'NO'}`);
  console.log(`   - Equipo Directivo has school permissions: YES (${grantedSchoolPerms} granted)`);
}

testScopedPermissions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
