const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBrentAdminStatus() {
  console.log('🔍 Checking admin status for brent@perrotuertocm.cl\n');

  // Get all users to find Brent
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }

  const brentUser = users.find(u => u.email === 'brent@perrotuertocm.cl');

  if (!brentUser) {
    console.log('❌ User not found');
    return;
  }

  console.log('✅ User found');
  console.log('User ID:', brentUser.id);
  console.log('Email:', brentUser.email);
  console.log('\nUser metadata:');
  console.log(JSON.stringify(brentUser.user_metadata, null, 2));

  const roles = brentUser.user_metadata?.roles;
  console.log('\nRoles:');
  if (Array.isArray(roles)) {
    console.log('  Type: Array');
    roles.forEach(role => console.log(`  - ${role}`));
  } else if (roles) {
    console.log('  Type:', typeof roles);
    console.log('  Value:', roles);
  } else {
    console.log('  ❌ No roles found in user_metadata');
  }

  const isAdmin = Array.isArray(roles) ? roles.includes('admin') : roles === 'admin';
  console.log('\nIs Admin?', isAdmin ? '✅ YES' : '❌ NO');
}

checkBrentAdminStatus().catch(console.error);
