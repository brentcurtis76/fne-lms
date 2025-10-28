const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserPermissions(email) {
  console.log(`🔍 Checking permissions for ${email}\n`);

  // Find user
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .single();

  if (profileError || !profile) {
    console.log('❌ User not found');
    return;
  }

  console.log(`User ID: ${profile.id}\n`);

  // Get user roles
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role_type, is_active')
    .eq('user_id', profile.id);

  console.log('Roles:');
  roles.forEach(r => {
    const status = r.is_active ? 'active' : 'inactive';
    console.log(`  ${r.role_type} (${status})`);
  });

  // Get internship-related permissions for their role(s)
  const roleTypes = roles.filter(r => r.is_active).map(r => r.role_type);

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('role_type, permission_key, granted')
    .in('role_type', roleTypes)
    .ilike('permission_key', '%internship%')
    .eq('is_test', false);

  console.log('\nInternship-related permissions:');
  perms.forEach(p => {
    const status = p.granted ? '✅ GRANTED' : '❌ DENIED';
    console.log(`  [${p.role_type}] ${p.permission_key}: ${status}`);
  });

  console.log('\n' + '═'.repeat(70));
  console.log('EXPECTED BEHAVIOR:');
  console.log('═'.repeat(70));

  const viewPerm = perms.find(p => p.permission_key === 'view_internship_proposals_all');

  if (viewPerm && viewPerm.granted) {
    console.log('✅ User SHOULD see the Quotes page');
  } else {
    console.log('❌ User SHOULD be redirected with "Access Denied" message');
  }

  console.log('═'.repeat(70));
}

const email = process.argv[2] || 'brent@perrotuertocm.cl';
checkUserPermissions(email).catch(console.error);
