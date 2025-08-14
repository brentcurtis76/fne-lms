const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMyRole() {
  console.log('🔍 Checking your current user role...\n');
  
  try {
    // Your user ID from the console logs
    const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
    
    // Get profile info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .single();
    
    if (profile) {
      console.log('👤 User Profile:');
      console.log(`  Name: ${profile.first_name} ${profile.last_name}`);
      console.log(`  Email: ${profile.email}`);
      console.log(`  User ID: ${userId}`);
    }
    
    // Get all roles for this user
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role_type, is_active')
      .eq('user_id', userId);
    
    if (rolesError) {
      console.error('❌ Error fetching roles:', rolesError);
      return;
    }
    
    console.log('\n📋 Your roles in the database:');
    console.log('=' .repeat(50));
    
    const activeRoles = [];
    const inactiveRoles = [];
    
    roles.forEach(role => {
      if (role.is_active) {
        activeRoles.push(role.role_type);
        console.log(`  ✅ ${role.role_type} (ACTIVE)`);
      } else {
        inactiveRoles.push(role.role_type);
        console.log(`  ⚠️  ${role.role_type} (inactive)`);
      }
    });
    
    console.log('=' .repeat(50));
    console.log(`\nActive roles: ${activeRoles.join(', ') || 'None'}`);
    
    // Check if you have admin role
    if (activeRoles.includes('admin')) {
      console.log('\n✅ You have ADMIN role - you should see the Eventos menu item');
    } else if (activeRoles.includes('community_manager')) {
      console.log('\n✅ You have COMMUNITY_MANAGER role - you should see the Eventos menu item');
    } else {
      console.log('\n❌ You do NOT have admin or community_manager role');
      console.log('   The Eventos menu item will not be visible to you');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkMyRole();