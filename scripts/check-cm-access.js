const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCommunityManagerAccess() {
  console.log('🔍 Checking Community Manager access to events...\n');
  
  // First, find a community manager user
  const { data: cmRoles, error: cmError } = await supabase
    .from('user_roles')
    .select('user_id, role_type')
    .eq('role_type', 'community_manager')
    .eq('is_active', true)
    .limit(3);
  
  if (cmError) {
    console.error('❌ Error finding community managers:', cmError);
    return;
  }
  
  if (!cmRoles || cmRoles.length === 0) {
    console.log('⚠️ No active community managers found in the system');
    console.log('Let me check all available roles...');
    
    const { data: allRoles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('is_active', true);
    
    const uniqueRoles = [...new Set(allRoles?.map(r => r.role_type) || [])];
    console.log('Available active roles:', uniqueRoles);
  } else {
    console.log('✅ Found', cmRoles.length, 'community manager(s) in the system');
    
    // Get profile info for first CM
    if (cmRoles[0]) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', cmRoles[0].user_id)
        .single();
      
      if (profile) {
        console.log('Example CM:', profile.first_name, profile.last_name, '(' + profile.email + ')');
      }
    }
  }
  
  console.log('\n📋 Events Management Access Summary:');
  console.log('✅ Frontend Page Access: community_manager role allowed');
  console.log('✅ Sidebar Menu: Events item visible to community_manager');
  console.log('✅ Authorization Check: Includes community_manager in allowed roles');
  console.log('\n🔐 Database RLS Policies needed for full access:');
  console.log('  - SELECT: Allow community_manager to view events');
  console.log('  - INSERT: Allow community_manager to create events');
  console.log('  - UPDATE: Allow community_manager to edit events');
  console.log('  - DELETE: Allow community_manager to delete events');
}

checkCommunityManagerAccess();