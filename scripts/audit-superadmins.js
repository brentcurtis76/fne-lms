/**
 * Pre-Req Script: Audit superadmins in user_roles
 *
 * Verifies that all users with admin role in metadata also have
 * corresponding entry in user_roles table for RLS policies to work correctly
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditSuperadmins() {
  console.log('🔍 Auditing superadmins in user_roles table...\n');

  // Get all users
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    return;
  }

  console.log(`📊 Total users in auth.users: ${users.users.length}\n`);

  // Filter users with admin in metadata
  const adminsInMetadata = users.users.filter(user => {
    const metadata = user.user_metadata || {};
    const roles = metadata.roles || [];
    const role = metadata.role;

    return (
      (Array.isArray(roles) && roles.includes('admin')) ||
      role === 'admin'
    );
  });

  console.log(`👑 Users with admin in metadata: ${adminsInMetadata.length}\n`);

  if (adminsInMetadata.length === 0) {
    console.log('✅ No admins found in metadata. Nothing to audit.');
    return;
  }

  // Check each admin
  const missingAdmins = [];

  for (const user of adminsInMetadata) {
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('id, role_type, scope_type, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (rolesError) {
      console.error(`❌ Error checking roles for ${user.email}:`, rolesError);
      continue;
    }

    const hasAdminRole = userRoles?.some(r => r.role_type === 'admin');

    if (!hasAdminRole) {
      console.log(`⚠️  MISSING: ${user.email} (${user.id})`);
      console.log(`   Metadata roles: ${JSON.stringify(user.user_metadata?.roles || user.user_metadata?.role)}`);
      console.log(`   user_roles entries: ${userRoles?.length || 0}`);
      if (userRoles && userRoles.length > 0) {
        console.log(`   Existing roles: ${userRoles.map(r => r.role_type).join(', ')}`);
      }
      console.log('');

      missingAdmins.push({
        user_id: user.id,
        email: user.email,
        metadata_roles: user.user_metadata?.roles || [user.user_metadata?.role],
        existing_roles: userRoles?.map(r => r.role_type) || [],
      });
    } else {
      console.log(`✅ ${user.email} - Has admin role in user_roles`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📋 AUDIT SUMMARY');
  console.log('='.repeat(80) + '\n');

  console.log(`Total admins in metadata: ${adminsInMetadata.length}`);
  console.log(`Admins properly configured: ${adminsInMetadata.length - missingAdmins.length}`);
  console.log(`Admins MISSING in user_roles: ${missingAdmins.length}\n`);

  if (missingAdmins.length > 0) {
    console.log('⚠️  ACTION REQUIRED: The following admins need entries in user_roles:\n');

    missingAdmins.forEach(admin => {
      console.log(`User: ${admin.email}`);
      console.log(`ID: ${admin.user_id}`);
      console.log(`SQL to fix:`);
      console.log(`  INSERT INTO user_roles (user_id, role_type, is_active, scope_type)`);
      console.log(`  VALUES ('${admin.user_id}', 'admin', true, 'global')`);
      console.log(`  ON CONFLICT (user_id, role_type, community_id, scope_type) DO NOTHING;\n`);
    });

    console.log('💡 Would you like to auto-fix these? (Y/n)');
    console.log('   If yes, run: node scripts/fix-missing-superadmins.js\n');

    // Save to file for reference
    const fs = require('fs');
    const fixScript = missingAdmins.map(admin =>
      `INSERT INTO user_roles (user_id, role_type, is_active, scope_type)
VALUES ('${admin.user_id}', 'admin', true, 'global')
ON CONFLICT (user_id, role_type, community_id, scope_type) DO NOTHING;`
    ).join('\n\n');

    fs.writeFileSync(
      'database/migrations/fix_missing_superadmins.sql',
      `-- Auto-generated fix script from audit-superadmins.js
-- Run this to add missing superadmin entries to user_roles

${fixScript}
`
    );

    console.log('✅ Fix script saved to: database/migrations/fix_missing_superadmins.sql\n');

    return missingAdmins;
  } else {
    console.log('✅ All superadmins are properly configured in user_roles table!');
    console.log('✅ Safe to proceed with transformation access migration.\n');
    return [];
  }
}

auditSuperadmins()
  .then(missingAdmins => {
    if (missingAdmins && missingAdmins.length > 0) {
      process.exit(1); // Exit with error if there are missing admins
    }
  })
  .catch(error => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
