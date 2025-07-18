const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnoseMoraPermissions() {
  console.log('🔍 Diagnosing Mora Del Fresno\'s Permission Issues');
  console.log('==================================================\n');

  // First, find Mora's user ID
  const { data: userData, error: userError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'mdelfresno@nuevaeducacion.org')
    .single();

  if (userError || !userData) {
    console.error('❌ Could not find user with email mdelfresno@nuevaeducacion.org');
    return;
  }

  console.log('✅ User Found:');
  console.log(`   ID: ${userData.id}`);
  console.log(`   Name: ${userData.first_name} ${userData.last_name}`);
  console.log(`   Email: ${userData.email}\n`);

  // Check all her roles
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userData.id)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false });

  console.log('📋 All Roles for Mora:');
  console.log('=====================');
  
  if (roleData && roleData.length > 0) {
    roleData.forEach((role, index) => {
      console.log(`\n${index + 1}. Role: ${role.role_type}`);
      console.log(`   ID: ${role.id}`);
      console.log(`   Active: ${role.is_active ? '✅ YES' : '❌ NO'}`);
      console.log(`   School ID: ${role.school_id || 'None'}`);
      console.log(`   Community ID: ${role.community_id || 'None'}`);
      console.log(`   Assigned: ${new Date(role.assigned_at).toLocaleString()}`);
    });
  } else {
    console.log('   No roles found');
  }

  // Check specifically for active admin role
  console.log('\n\n🔑 Admin Role Check:');
  console.log('====================');
  
  const { data: adminCheck, error: adminError } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', userData.id)
    .eq('role_type', 'admin')
    .eq('is_active', true)
    .limit(1);

  if (adminCheck && adminCheck.length > 0) {
    console.log('✅ Has active admin role');
  } else {
    console.log('❌ No active admin role found');
  }

  // Check highest role according to system
  console.log('\n\n🎯 Effective Role Analysis:');
  console.log('============================');
  
  const activeRoles = roleData?.filter(r => r.is_active) || [];
  const roleOrder = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'docente'];
  
  let highestRole = null;
  for (const roleType of roleOrder) {
    if (activeRoles.some(role => role.role_type === roleType)) {
      highestRole = roleType;
      break;
    }
  }

  console.log(`Highest active role: ${highestRole || 'None'}`);
  console.log(`Number of active roles: ${activeRoles.length}`);

  // Test the isGlobalAdmin function logic
  console.log('\n\n🧪 Permission Test Results:');
  console.log('============================');
  
  const hasGlobalAdmin = activeRoles.some(r => r.role_type === 'admin' && r.is_active);
  console.log(`Should have global admin privileges: ${hasGlobalAdmin ? '✅ YES' : '❌ NO'}`);

  if (!hasGlobalAdmin) {
    console.log('\n⚠️  ISSUE IDENTIFIED: Mora does not have an active admin role');
    console.log('   This is why she cannot change user roles or assign users to communities.');
    
    const inactiveAdmin = roleData?.find(r => r.role_type === 'admin' && !r.is_active);
    if (inactiveAdmin) {
      console.log('\n   Found inactive admin role:');
      console.log(`   - Role ID: ${inactiveAdmin.id}`);
      console.log(`   - Assigned: ${new Date(inactiveAdmin.assigned_at).toLocaleString()}`);
      console.log('\n   SOLUTION: Reactivate this admin role');
    }
  }

  // Additional debugging - check for potential RLS issues
  console.log('\n\n🔒 RLS Policy Check:');
  console.log('=====================');
  
  // Try to query user_roles as if we were Mora (this will fail with service role, but shows the concept)
  console.log('Note: RLS policies would apply when Mora accesses through the app');
  console.log('Service role bypasses RLS, so we cannot fully simulate her experience here');

  // Provide recommendations
  console.log('\n\n💡 RECOMMENDATIONS:');
  console.log('====================');
  
  if (!hasGlobalAdmin) {
    console.log('1. Activate Mora\'s admin role by updating is_active to true');
    console.log('2. SQL to fix: UPDATE user_roles SET is_active = true WHERE id = \'4c1cecb8-2bc8-4525-aa00-6b8c543f140c\';');
    console.log('3. Alternatively, deactivate her consultor role if she should only be admin');
  } else {
    console.log('1. Check browser console for any client-side errors');
    console.log('2. Have Mora log out and log back in to refresh her session');
    console.log('3. Clear browser cache and cookies');
  }
}

diagnoseMoraPermissions().catch(console.error);