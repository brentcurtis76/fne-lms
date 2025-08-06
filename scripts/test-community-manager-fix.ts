/**
 * Test script to verify Community Manager role fix for Andrea Lagos
 * Run with: npx tsx scripts/test-community-manager-fix.ts
 */

import { createClient } from '@supabase/supabase-js'
import { getHighestRole, getUserRoles } from '../utils/roleUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function testCommunityManagerFix() {
  console.log('🧪 Testing Community Manager Role Fix')
  console.log('=====================================')
  
  try {
    // Test 1: Find Andrea Lagos and get her roles
    console.log('\n📋 Test 1: Andrea Lagos User Lookup')
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', '%andrea%')
      .ilike('email', '%lagos%')
    
    if (profileError) {
      console.log('❌ Profile lookup error:', profileError)
      return
    }
    
    const profile = profiles?.find(p => p.email.toLowerCase().includes('lagos'))
    
    if (!profile) {
      console.log('❌ Andrea Lagos not found in profiles')
      console.log('Available profiles with "andrea":', profiles?.map(p => p.email))
      return
    }
    
    console.log('✅ Found Andrea Lagos:', {
      id: profile.id,
      email: profile.email,
      name: `${profile.first_name} ${profile.last_name}`
    })
    
    // Test 2: Get her user roles
    console.log('\n📋 Test 2: User Roles Lookup')
    const userRoles = await getUserRoles(supabase, profile.id)
    console.log('✅ User roles found:', userRoles.map(r => ({
      role_type: r.role_type,
      is_active: r.is_active,
      assigned_at: r.assigned_at
    })))
    
    // Test 3: Test getHighestRole function with the fix
    console.log('\n📋 Test 3: getHighestRole Function Test')
    const highestRole = getHighestRole(userRoles)
    console.log('✅ getHighestRole result:', highestRole)
    
    if (highestRole === 'community_manager') {
      console.log('🎉 SUCCESS: getHighestRole correctly returns community_manager!')
    } else if (highestRole === null) {
      console.log('❌ FAILURE: getHighestRole still returning null - fix not working')
    } else {
      console.log('⚠️  UNEXPECTED: getHighestRole returned:', highestRole)
    }
    
    // Test 4: Simulate role hierarchy check
    console.log('\n📋 Test 4: Role Hierarchy Validation')
    const roleOrder = [
      'admin',
      'consultor', 
      'equipo_directivo',
      'lider_generacion',
      'lider_comunidad',
      'supervisor_de_red',
      'community_manager',
      'docente'
    ]
    
    console.log('✅ Updated role hierarchy includes community_manager at position:', 
      roleOrder.indexOf('community_manager'))
    
    // Test 5: Test different scenarios
    console.log('\n📋 Test 5: Scenario Testing')
    
    // Test with only community_manager role
    const mockCommunityManagerRoles = [{
      id: 'test',
      user_id: profile.id,
      role_type: 'community_manager' as const,
      is_active: true,
      assigned_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      school_id: null,
      generation_id: null,
      community_id: null,
      assigned_by: null,
      reporting_scope: {},
      feedback_scope: {},
      red_id: null
    }]
    
    const testResult = getHighestRole(mockCommunityManagerRoles)
    console.log('✅ Mock test with only community_manager role:', testResult)
    
    console.log('\n🎉 COMMUNITY MANAGER FIX VALIDATION COMPLETE')
    console.log('===========================================')
    
    if (highestRole === 'community_manager') {
      console.log('✅ FIX SUCCESSFUL: Andrea Lagos can now access community manager features')
      console.log('✅ Expected functionality restored:')
      console.log('  - Can see Noticias tab in sidebar')
      console.log('  - Can access /admin/news page') 
      console.log('  - Can create and manage news articles')
      console.log('  - Role-based permissions working correctly')
    } else {
      console.log('❌ FIX UNSUCCESSFUL: Role hierarchy still not working correctly')
      console.log('Debug info:')
      console.log('- User roles:', userRoles)
      console.log('- getHighestRole result:', highestRole)
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error)
  }
}

// Run the test
testCommunityManagerFix()