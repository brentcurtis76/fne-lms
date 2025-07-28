#!/usr/bin/env node

/**
 * Check user community assignments for testing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkUserCommunities() {
  console.log('👥 Checking User Community Assignments\n');
  
  try {
    // Get all users with their community info
    const { data: users, error } = await supabase
      .from('profiles')
      .select(`
        id, 
        email, 
        first_name, 
        last_name, 
        community_id,
        growth_communities!inner(
          id,
          name,
          school_id,
          schools(name)
        )
      `)
      .not('community_id', 'is', null)
      .order('community_id');

    if (error) {
      console.error('❌ Error fetching users:', error);
      return;
    }

    if (!users || users.length === 0) {
      console.log('❌ No active users found');
      return;
    }

    // Group users by community
    const communitiesMap = {};
    users.forEach(user => {
      const communityId = user.community_id;
      if (!communitiesMap[communityId]) {
        communitiesMap[communityId] = {
          id: communityId,
          name: user.growth_communities?.name || 'Unknown Community',
          school: user.growth_communities?.schools?.name || 'Unknown School',
          users: []
        };
      }
      communitiesMap[communityId].users.push({
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email
      });
    });

    // Display results
    console.log(`📊 Found ${users.length} users across ${Object.keys(communitiesMap).length} communities\n`);

    Object.values(communitiesMap).forEach(community => {
      console.log(`🏫 Community: ${community.name}`);
      console.log(`   School: ${community.school}`);
      console.log(`   ID: ${community.id}`);
      console.log(`   Users (${community.users.length}):`);
      
      community.users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name} (${user.email})`);
      });
      
      if (community.users.length >= 2) {
        console.log('   ✅ This community has enough users for testing');
      } else {
        console.log('   ⚠️  This community needs more users for testing');
      }
      console.log('');
    });

    // Check for workspaces
    console.log('🏢 Checking Community Workspaces...\n');
    const { data: workspaces, error: wsError } = await supabase
      .from('community_workspaces')
      .select(`
        id,
        name,
        community_id,
        growth_communities(name, schools(name))
      `);

    if (wsError) {
      console.error('❌ Error fetching workspaces:', wsError);
      return;
    }

    if (workspaces && workspaces.length > 0) {
      workspaces.forEach(ws => {
        const communityUsers = communitiesMap[ws.community_id];
        console.log(`💼 Workspace: ${ws.name}`);
        console.log(`   Community: ${ws.growth_communities?.name}`);
        console.log(`   School: ${ws.growth_communities?.schools?.name}`);
        console.log(`   Available Users: ${communityUsers ? communityUsers.users.length : 0}`);
        console.log(`   ID: ${ws.id}\n`);
      });
    } else {
      console.log('❌ No active workspaces found\n');
    }

    // Recommendations
    console.log('🎯 Testing Recommendations:\n');
    const testableCommunities = Object.values(communitiesMap).filter(c => c.users.length >= 2);
    
    if (testableCommunities.length > 0) {
      const bestCommunity = testablecommunities[0];
      console.log(`✅ Use Community: ${bestCommunity.name}`);
      console.log(`   Test Users:`);
      console.log(`   - User A: ${bestCommunity.users[0].name} (${bestCommunity.users[0].email})`);
      console.log(`   - User B: ${bestCommunity.users[1].name} (${bestCommunity.users[1].email})`);
    } else {
      console.log('❌ No communities have enough users for testing');
      console.log('   Solution: Assign more users to existing communities');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkUserCommunities();