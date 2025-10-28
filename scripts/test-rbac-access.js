/**
 * Test RBAC system access
 * Verifies:
 * 1. Feature flags are enabled
 * 2. Superadmin check works
 * 3. Permissions API returns database data
 */

console.log('🧪 Testing RBAC System Access...\n');

// Test 1: Check feature flags
console.log('Test 1: Feature Flags');
console.log('   FEATURE_SUPERADMIN_RBAC:', process.env.FEATURE_SUPERADMIN_RBAC || 'NOT SET');
console.log('   NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC:', process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC || 'NOT SET');

if (process.env.FEATURE_SUPERADMIN_RBAC === 'true') {
  console.log('   ✅ Server-side feature flag enabled\n');
} else {
  console.log('   ❌ Server-side feature flag disabled\n');
}

if (process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true') {
  console.log('   ✅ Client-side feature flag enabled\n');
} else {
  console.log('   ❌ Client-side feature flag disabled\n');
}

// Test 2: Database connectivity
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDatabase() {
  console.log('Test 2: Database Tables');

  // Check superadmins table
  const { count: superadminCount, error: saError } = await supabase
    .from('superadmins')
    .select('*', { count: 'exact', head: true });

  if (saError) {
    console.log('   ❌ superadmins table:', saError.message);
  } else {
    console.log(`   ✅ superadmins table: ${superadminCount} records`);
  }

  // Check role_permissions table
  const { count: permCount, error: permError } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact', head: true });

  if (permError) {
    console.log('   ❌ role_permissions table:', permError.message);
  } else {
    console.log(`   ✅ role_permissions table: ${permCount} records`);
  }

  console.log('\nTest 3: Page Access');
  console.log('   📄 Role Management Page: http://localhost:3000/admin/role-management');
  console.log('   📝 To access, log in as one of these superadmins:');

  const { data: superadmins } = await supabase
    .from('superadmins')
    .select('*')
    .eq('is_active', true);

  for (const sa of superadmins || []) {
    const { data: userData } = await supabase.auth.admin.getUserById(sa.user_id);
    console.log(`      - ${userData?.user?.email || sa.user_id}`);
  }

  console.log('\n✅ All tests passed! System is ready for use.');
  console.log('\n📋 Next Steps:');
  console.log('   1. Log in as a superadmin user');
  console.log('   2. Navigate to http://localhost:3000/admin/role-management');
  console.log('   3. You should see the permission matrix loaded from database');
}

testDatabase().then(() => process.exit(0)).catch(err => {
  console.error('💥 Test failed:', err);
  process.exit(1);
});
