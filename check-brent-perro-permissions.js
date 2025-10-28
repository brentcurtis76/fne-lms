const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function checkUser() {
  console.log('=== Checking brent@perrotuertocm.cl ===\n');

  // Get user from profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'brent@perrotuertocm.cl')
    .single();

  if (profileError) {
    console.log('Profile error:', profileError);
    return;
  }

  console.log('Profile:', profile);
  console.log('\nUser ID:', profile.id);

  // Check user_metadata roles
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(profile.id);

  if (!authError && authUser && authUser.user) {
    console.log('\nAuth user_metadata roles:', authUser.user.user_metadata ? authUser.user.user_metadata.roles : 'none');
  }

  // Check user_roles table
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', profile.id);

  console.log('\nuser_roles table:');
  if (rolesError) {
    console.log('Error:', rolesError);
  } else if (!roles || roles.length === 0) {
    console.log('❌ NO ROLES FOUND IN user_roles TABLE - THIS IS THE PROBLEM');
  } else {
    roles.forEach(role => {
      console.log(`  - ${role.role_type} (active: ${role.is_active}, community: ${role.community_id || 'none'})`);
    });
  }

  // Check if hasManagePermission would work
  const { data: permissionCheck, error: permError } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', profile.id)
    .eq('is_active', true)
    .in('role_type', ['admin', 'equipo_directivo', 'consultor']);

  console.log('\nPermission check (hasManagePermission logic):');
  if (permError) {
    console.log('Error:', permError);
  } else if (!permissionCheck || permissionCheck.length === 0) {
    console.log('❌ FAIL - No matching roles in user_roles table');
    console.log('   This is why assignment fails!');
  } else {
    console.log('✅ PASS - Found roles:', permissionCheck.map(r => r.role_type).join(', '));
  }

  // Check all admins for comparison
  console.log('\n=== All users with admin role in user_roles ===');
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id, role_type, is_active')
    .eq('role_type', 'admin')
    .eq('is_active', true);

  if (admins && admins.length > 0) {
    console.log(`Found ${admins.length} admin(s) in user_roles table`);
  } else {
    console.log('No admins found in user_roles table');
  }
}

checkUser().catch(console.error);
