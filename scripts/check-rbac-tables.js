const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  console.log('🔍 Checking RBAC database tables...\n');

  // Check role_permissions table
  console.log('1. Checking role_permissions table...');
  const { data: rolePerms, error: rolePermsError } = await supabase
    .from('role_permissions')
    .select('*')
    .limit(1);

  if (rolePermsError) {
    console.log('❌ role_permissions table does NOT exist');
    console.log('   Error:', rolePermsError.message);
    console.log('   You need to apply: database/migrations/002_create_role_permissions.sql\n');
  } else {
    console.log('✅ role_permissions table exists\n');
  }

  // Check permission_audit_log table
  console.log('2. Checking permission_audit_log table...');
  const { data: auditLog, error: auditError } = await supabase
    .from('permission_audit_log')
    .select('*')
    .limit(1);

  if (auditError) {
    console.log('❌ permission_audit_log table does NOT exist');
    console.log('   Error:', auditError.message);
    console.log('   You need to create this table\n');
  } else {
    console.log('✅ permission_audit_log table exists\n');
  }

  // Check superadmin function
  console.log('3. Checking auth_is_superadmin() function...');
  const { error: superadminError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: '00000000-0000-0000-0000-000000000000' });

  if (superadminError && superadminError.code === '42883') {
    console.log('❌ auth_is_superadmin() function does NOT exist');
    console.log('   You need to create this function\n');
  } else {
    console.log('✅ auth_is_superadmin() function exists\n');
  }

  console.log('═'.repeat(70));
  console.log('VERDICT:');
  console.log('═'.repeat(70));

  if (rolePermsError || auditError || (superadminError && superadminError.code === '42883')) {
    console.log('❌ RBAC system is NOT ready for testing');
    console.log('   Missing database components need to be created first');
  } else {
    console.log('✅ RBAC system appears ready for testing');
  }
  console.log('═'.repeat(70));
}

checkTables().catch(console.error);
