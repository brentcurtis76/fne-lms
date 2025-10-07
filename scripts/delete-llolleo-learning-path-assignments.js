const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function deleteLlolleoAssignments() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('DELETE LEARNING PATH ASSIGNMENTS - LICEO NACIONAL DE LLOLLEO');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Step 1: Find Liceo Nacional de Llolleo school
  const { data: school, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%llolleo%')
    .single();

  if (schoolError || !school) {
    console.log('❌ Error finding Liceo Nacional de Llolleo:', schoolError?.message || 'Not found');
    return;
  }

  console.log('1. SCHOOL FOUND:');
  console.log(`   Name: ${school.name}`);
  console.log(`   ID: ${school.id}\n`);

  // Step 2: Find all users from this school
  const { data: userRoles, error: usersError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('school_id', school.id)
    .eq('is_active', true);

  if (usersError) {
    console.log('❌ Error finding users:', usersError.message);
    return;
  }

  const uniqueUserIds = [...new Set(userRoles.map(u => u.user_id))];

  console.log('2. USERS FROM THIS SCHOOL:', uniqueUserIds.length);

  // Get user details from auth
  const { data: authData } = await supabase.auth.admin.listUsers();
  const userMap = new Map();
  if (authData?.users) {
    authData.users.forEach(u => {
      if (uniqueUserIds.includes(u.id)) {
        userMap.set(u.id, { email: u.email, full_name: u.user_metadata?.full_name || u.email });
      }
    });
  }

  if (userMap.size > 0) {
    Array.from(userMap.entries()).forEach(([userId, user], i) => {
      console.log(`   ${i + 1}. ${user.full_name} (${user.email})`);
    });
  }
  console.log();

  // Step 3: Find all learning path assignments for these users
  const { data: assignments, error: assignError } = await supabase
    .from('learning_path_assignments')
    .select('id, user_id, path_id, learning_paths(name), assigned_at')
    .in('user_id', uniqueUserIds);

  if (assignError) {
    console.log('❌ Error finding assignments:', assignError.message);
    return;
  }

  console.log('3. LEARNING PATH ASSIGNMENTS TO DELETE:', assignments?.length || 0);
  if (assignments && assignments.length > 0) {
    // Group by user
    const byUser = new Map();
    assignments.forEach(a => {
      if (!byUser.has(a.user_id)) {
        byUser.set(a.user_id, []);
      }
      byUser.get(a.user_id).push(a);
    });

    console.log('\n   Assignments by user:');
    for (const [userId, userAssignments] of byUser.entries()) {
      const user = userMap.get(userId);
      console.log(`   - ${user?.full_name || 'Unknown'}: ${userAssignments.length} assignments`);

      // Show unique learning paths
      const uniquePaths = new Map();
      userAssignments.forEach(a => {
        if (a.learning_paths) {
          uniquePaths.set(a.path_id, a.learning_paths.name);
        }
      });

      uniquePaths.forEach((name, id) => {
        const count = userAssignments.filter(a => a.path_id === id).length;
        console.log(`     - "${name}" (${count} assignment(s))`);
      });
    }
  }
  console.log();

  // Step 4: Confirm deletion
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('READY TO DELETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Total assignments to delete: ${assignments?.length || 0}`);
  console.log(`Affected users: ${uniqueUserIds.length}`);
  console.log(`School: ${school.name}\n`);

  if (!assignments || assignments.length === 0) {
    console.log('✅ No assignments to delete. Done.');
    return;
  }

  // Proceed with deletion
  console.log('Proceeding with deletion...\n');

  const { data: deleted, error: deleteError } = await supabase
    .from('learning_path_assignments')
    .delete()
    .in('user_id', uniqueUserIds);

  if (deleteError) {
    console.log('❌ ERROR during deletion:', deleteError.message);
    return;
  }

  console.log('✅ DELETION COMPLETE!');
  console.log(`   Deleted ${assignments.length} learning path assignments`);
  console.log(`   for ${uniqueUserIds.length} users from ${school.name}\n`);

  // Step 5: Verify deletion
  const { data: remaining, error: verifyError } = await supabase
    .from('learning_path_assignments')
    .select('id')
    .in('user_id', uniqueUserIds);

  if (verifyError) {
    console.log('⚠️  Could not verify deletion:', verifyError.message);
  } else {
    console.log('VERIFICATION:');
    console.log(`   Remaining assignments: ${remaining?.length || 0}`);
    if (remaining && remaining.length > 0) {
      console.log('   ⚠️  Some assignments still exist!');
    } else {
      console.log('   ✅ All assignments successfully deleted');
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('You can now re-assign learning paths to these users.');
  console.log('═══════════════════════════════════════════════════════════════');
}

deleteLlolleoAssignments().then(() => process.exit(0)).catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
