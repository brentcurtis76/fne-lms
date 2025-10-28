const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function diagnose() {
  const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'; // brent@perrotuertocm.cl

  console.log('=== Diagnosing Learning Path Assignment Issue ===\n');

  // 1. Check current role situation
  console.log('1. Current roles in user_roles:');
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role_type, is_active, community_id')
    .eq('user_id', userId)
    .order('is_active', { ascending: false });

  roles.forEach(role => {
    const status = role.is_active ? '✅' : '❌';
    console.log(`   ${status} ${role.role_type} ${role.community_id ? `(community: ${role.community_id})` : '(global)'}`);
  });

  // 2. Check what hasManagePermission returns
  console.log('\n2. hasManagePermission check:');
  const { data: permCheck, error: permError } = await supabase
    .from('user_roles')
    .select('role_type')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role_type', ['admin', 'equipo_directivo', 'consultor']);

  console.log('   Query result:', permCheck);
  console.log('   Has permission:', permCheck && permCheck.length > 0);

  // 3. Check auth.users metadata
  console.log('\n3. Auth metadata check:');
  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  console.log('   user_metadata.roles:', authData?.user?.user_metadata?.roles || 'NOT SET');
  console.log('   NOTE: The system checks user_roles table, not user_metadata');

  // 4. Try to get a learning path to test assignment
  console.log('\n4. Testing assignment capability:');
  const { data: paths } = await supabase
    .from('learning_paths')
    .select('id, name')
    .limit(1);

  if (paths && paths.length > 0) {
    console.log(`   Test path: ${paths[0].name} (${paths[0].id})`);

    // Get a test user to assign to
    const { data: testUser } = await supabase
      .from('profiles')
      .select('id, email')
      .neq('id', userId)
      .limit(1);

    if (testUser && testUser.length > 0) {
      console.log(`   Test assignee: ${testUser[0].email}`);

      // Try the assignment (this will test RLS policies)
      const { data: assignResult, error: assignError } = await supabase
        .from('learning_path_assignments')
        .insert({
          path_id: paths[0].id,
          user_id: testUser[0].id,
          assigned_by: userId
        })
        .select();

      if (assignError) {
        console.log('   ❌ Assignment FAILED:', assignError.message);
        console.log('   Error details:', assignError);
      } else {
        console.log('   ✅ Assignment SUCCEEDED');
        // Clean up test assignment
        await supabase
          .from('learning_path_assignments')
          .delete()
          .eq('id', assignResult[0].id);
        console.log('   (Test assignment cleaned up)');
      }
    }
  }

  // 5. Check the actual problem - does the active admin role being scoped matter?
  console.log('\n5. Role scoping analysis:');
  const activeAdminRole = roles.find(r => r.role_type === 'admin' && r.is_active);
  if (activeAdminRole) {
    if (activeAdminRole.community_id) {
      console.log('   ⚠️  Active admin role is COMMUNITY-SCOPED');
      console.log(`   Community ID: ${activeAdminRole.community_id}`);
      console.log('   This may limit assignment capabilities to that community only');

      // Check if there should be a global admin role
      const globalAdminRole = roles.find(r => r.role_type === 'admin' && !r.community_id);
      if (globalAdminRole && !globalAdminRole.is_active) {
        console.log('\n   💡 SOLUTION: There are INACTIVE global admin roles');
        console.log('   Need to activate one of these global admin roles');
      }
    } else {
      console.log('   ✅ Active admin role is GLOBAL (not community-scoped)');
    }
  }

  console.log('\n=== Summary ===');
  console.log('The hasManagePermission check passes (finds active admin role)');
  console.log('But if assignments are failing, it may be due to:');
  console.log('1. RLS policies on learning_path_assignments table');
  console.log('2. The admin role being scoped to a specific community');
  console.log('3. Frontend not properly handling the session/auth state');
}

diagnose().catch(console.error);
