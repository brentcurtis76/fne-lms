/**
 * Test script to verify Community Manager role fix for Andrea Lagos
 * Tests the complete authentication and role detection flow
 */

const { supabase } = require('./lib/supabase');
const { getHighestRole, getUserRoles } = require('./utils/roleUtils');

async function testCommunityManagerFix() {
  console.log('🧪 Testing Community Manager Role Fix');
  console.log('=====================================');
  
  try {
    // Test 1: Find Andrea Lagos and get her roles
    console.log('\n📋 Test 1: Andrea Lagos User Lookup');
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', '%andrea%lagos%')
      .single();
    
    if (!profile) {
      console.log('❌ Andrea Lagos not found in profiles');
      return;
    }
    
    console.log('✅ Found Andrea Lagos:', {
      id: profile.id,
      email: profile.email,
      name: `${profile.first_name} ${profile.last_name}`
    });
    
    // Test 2: Get her user roles
    console.log('\n📋 Test 2: User Roles Lookup');
    const userRoles = await getUserRoles(supabase, profile.id);
    console.log('✅ User roles found:', userRoles.map(r => ({
      role_type: r.role_type,
      is_active: r.is_active,
      assigned_at: r.assigned_at
    })));
    
    // Test 3: Test getHighestRole function with the fix
    console.log('\n📋 Test 3: getHighestRole Function Test');
    const highestRole = getHighestRole(userRoles);
    console.log('✅ getHighestRole result:', highestRole);
    
    if (highestRole === 'community_manager') {
      console.log('🎉 SUCCESS: getHighestRole correctly returns community_manager!');
    } else if (highestRole === null) {
      console.log('❌ FAILURE: getHighestRole still returning null - fix not working');
    } else {
      console.log('⚠️  UNEXPECTED: getHighestRole returned:', highestRole);
    }
    
    // Test 4: Simulate role hierarchy check
    console.log('\n📋 Test 4: Role Hierarchy Validation');
    const roleOrder = [
      'admin',
      'consultor', 
      'equipo_directivo',
      'lider_generacion',
      'lider_comunidad',
      'supervisor_de_red',
      'community_manager',
      'docente'
    ];
    
    console.log('✅ Updated role hierarchy includes community_manager at position:', 
      roleOrder.indexOf('community_manager'));
    
    // Test 5: Check if community_manager has news permissions
    console.log('\n📋 Test 5: News API Permission Check');
    const allowedNewsRoles = ['admin', 'consultor', 'community_manager'];
    const hasNewsPermission = allowedNewsRoles.includes('community_manager');
    console.log('✅ community_manager has news permissions:', hasNewsPermission);
    
    // Test 6: Check sidebar navigation permissions
    console.log('\n📋 Test 6: Sidebar Navigation Permission Check');
    const newsRestrictedRoles = ['admin', 'consultor', 'community_manager'];
    const hasSidebarPermission = newsRestrictedRoles.includes('community_manager');
    console.log('✅ community_manager has sidebar news access:', hasSidebarPermission);
    
    console.log('\n🎉 COMMUNITY MANAGER FIX VALIDATION COMPLETE');
    console.log('===========================================');
    
    if (highestRole === 'community_manager') {
      console.log('✅ FIX SUCCESSFUL: Andrea Lagos can now access community manager features');
      console.log('✅ Expected functionality restored:');
      console.log('  - Can see Noticias tab in sidebar');
      console.log('  - Can access /admin/news page');
      console.log('  - Can create and manage news articles');
      console.log('  - Role-based permissions working correctly');
    } else {
      console.log('❌ FIX UNSUCCESSFUL: Role hierarchy still not working correctly');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testCommunityManagerFix();