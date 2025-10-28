const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function fixGlobalAdmin() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'; // brent@perrotuertocm.cl

  console.log('=== Fixing Global Admin Role for brent@perrotuertocm.cl ===\n');

  // 1. Show current state
  console.log('Current roles:');
  const { data: currentRoles } = await supabase
    .from('user_roles')
    .select('id, role_type, is_active, community_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  currentRoles.forEach(role => {
    const status = role.is_active ? '✅ ACTIVE' : '❌ INACTIVE';
    const scope = role.community_id ? `community-scoped (${role.community_id})` : 'GLOBAL';
    console.log(`  ${status} - ${role.role_type} - ${scope}`);
  });

  // 2. Find if there's already an active global admin
  const activeGlobalAdmin = currentRoles.find(
    r => r.role_type === 'admin' && !r.community_id && r.is_active
  );

  if (activeGlobalAdmin) {
    console.log('\n✅ User already has an active global admin role');
    return;
  }

  // 3. Find an inactive global admin role to activate
  const inactiveGlobalAdmin = currentRoles.find(
    r => r.role_type === 'admin' && !r.community_id && !r.is_active
  );

  if (inactiveGlobalAdmin) {
    console.log(`\n📝 Found inactive global admin role (ID: ${inactiveGlobalAdmin.id})`);
    console.log('   Activating this role...');

    const { data, error } = await supabase
      .from('user_roles')
      .update({ is_active: true })
      .eq('id', inactiveGlobalAdmin.id)
      .select();

    if (error) {
      console.error('❌ Failed to activate role:', error);
      return;
    }

    console.log('✅ Successfully activated global admin role!');

    // Verify
    console.log('\n=== Updated roles ===');
    const { data: updatedRoles } = await supabase
      .from('user_roles')
      .select('role_type, is_active, community_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    updatedRoles.forEach(role => {
      const scope = role.community_id ? 'community-scoped' : 'GLOBAL';
      console.log(`  ✅ ${role.role_type} - ${scope}`);
    });

  } else {
    console.log('\n⚠️  No inactive global admin role found');
    console.log('   Creating a new global admin role...');

    const { data, error } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role_type: 'admin',
        is_active: true,
        community_id: null,
        school_id: null,
        workspace_id: null
      })
      .select();

    if (error) {
      console.error('❌ Failed to create role:', error);
      return;
    }

    console.log('✅ Successfully created global admin role!');
  }

  console.log('\n=== Next Steps ===');
  console.log('1. User should log out and log back in');
  console.log('2. Try assigning learning paths again');
  console.log('3. The global admin role should now allow unrestricted assignment');
}

fixGlobalAdmin().catch(console.error);
