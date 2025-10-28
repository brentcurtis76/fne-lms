const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBrentProfile() {
  console.log('🔍 Checking profile for brent@perrotuertocm.cl\n');

  // Check profiles table
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', 'brent@perrotuertocm.cl')
    .maybeSingle();

  if (profileError) {
    console.error('Error fetching profile:', profileError);
    return;
  }

  if (!profile) {
    console.log('❌ Profile not found in profiles table');
    return;
  }

  console.log('✅ Profile found');
  console.log('Profile ID (user ID):', profile.id);
  console.log('Email:', profile.email);
  console.log('Name:', profile.name);

  // Now try to get auth user data
  console.log('\n--- Checking auth.users table ---');
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(profile.id);

  if (authError) {
    console.error('Error fetching auth user:', authError);
    return;
  }

  if (!authUser || !authUser.user) {
    console.log('❌ Auth user not found');
    return;
  }

  console.log('✅ Auth user found');
  console.log('\nUser metadata:');
  console.log(JSON.stringify(authUser.user.user_metadata, null, 2));

  const roles = authUser.user.user_metadata?.roles;
  console.log('\nRoles:');
  if (Array.isArray(roles)) {
    console.log('  Type: Array');
    roles.forEach(role => console.log(`  - ${role}`));
    console.log('\nIs Admin?', roles.includes('admin') ? '✅ YES' : '❌ NO');
  } else if (roles) {
    console.log('  Type:', typeof roles);
    console.log('  Value:', roles);
    console.log('\nIs Admin?', roles === 'admin' ? '✅ YES' : '❌ NO');
  } else {
    console.log('  ❌ No roles found in user_metadata');
    console.log('\nIs Admin? ❌ NO');
  }
}

checkBrentProfile().catch(console.error);
