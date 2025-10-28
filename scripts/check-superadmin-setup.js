/**
 * Check if superadmin RBAC system is set up in database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSetup() {
  console.log('🔍 Checking Superadmin RBAC Setup...\n');

  // Check if superadmins table exists
  const { data: tables, error: tableError } = await supabase
    .from('superadmins')
    .select('*')
    .limit(1);

  if (tableError) {
    if (tableError.message.includes('does not exist')) {
      console.log('❌ superadmins table: NOT FOUND');
      console.log('   → Need to run migration: database/migrations/001_bootstrap_superadmin.sql\n');
      return false;
    } else {
      console.log('❌ Error checking superadmins table:', tableError.message);
      return false;
    }
  }

  console.log('✅ superadmins table: EXISTS');

  // Check if permission_audit_log exists
  const { error: auditError } = await supabase
    .from('permission_audit_log')
    .select('*')
    .limit(1);

  if (auditError && auditError.message.includes('does not exist')) {
    console.log('❌ permission_audit_log table: NOT FOUND\n');
    return false;
  }

  console.log('✅ permission_audit_log table: EXISTS');

  // Check if auth_is_superadmin function exists
  const { data: funcData, error: funcError } = await supabase
    .rpc('auth_is_superadmin', { check_user_id: '00000000-0000-0000-0000-000000000000' });

  if (funcError && funcError.message.includes('does not exist')) {
    console.log('❌ auth_is_superadmin() function: NOT FOUND\n');
    return false;
  }

  console.log('✅ auth_is_superadmin() function: EXISTS');

  // Check for existing superadmins
  const { data: superadmins, error: saError } = await supabase
    .from('superadmins')
    .select('*')
    .eq('is_active', true);

  if (saError) {
    console.log('⚠️  Could not fetch superadmins:', saError.message);
  } else {
    console.log(`\n👥 Active Superadmins: ${superadmins.length}`);
    if (superadmins.length > 0) {
      // Get emails separately
      for (const sa of superadmins) {
        const { data: userData } = await supabase.auth.admin.getUserById(sa.user_id);
        console.log(`   - ${userData?.user?.email || sa.user_id}`);
      }
    } else {
      console.log('   (No active superadmins found)');
    }
  }

  return true;
}

checkSetup()
  .then(success => {
    if (success) {
      console.log('\n✅ Superadmin RBAC system is set up');
    } else {
      console.log('\n❌ Superadmin RBAC system needs setup');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('💥 Error:', err);
    process.exit(1);
  });
