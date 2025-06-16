#!/usr/bin/env node

// Diagnostic script to check consultant assignment data integrity
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseIssue() {
  console.log('🔍 Diagnosing Consultant Assignment Issues...\n');

  try {
    // 1. Check if growth_communities table has any data
    const { data: communities, error: commError } = await supabase
      .from('growth_communities')
      .select('id, name, school_id, generation_id')
      .order('name');

    if (commError) {
      console.error('❌ Error fetching communities:', commError);
      return;
    }

    console.log(`📊 Found ${communities?.length || 0} communities in growth_communities table:`);
    if (communities && communities.length > 0) {
      communities.forEach(c => {
        console.log(`  - ${c.name} (ID: ${c.id}, School: ${c.school_id}, Generation: ${c.generation_id || 'NULL'})`);
      });
    } else {
      console.log('  ⚠️  No communities found in database!');
    }
    console.log('');

    // 2. Check if there are any users with community_id set
    const { data: usersWithCommunity, error: userError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, community_id, school_id, generation_id')
      .not('community_id', 'is', null);

    if (userError) {
      console.error('❌ Error fetching users with community:', userError);
      return;
    }

    console.log(`👥 Found ${usersWithCommunity?.length || 0} users with community_id set:`);
    if (usersWithCommunity && usersWithCommunity.length > 0) {
      // Group by community_id
      const usersByCommunity = {};
      usersWithCommunity.forEach(u => {
        const cid = u.community_id;
        if (!usersByCommunity[cid]) {
          usersByCommunity[cid] = [];
        }
        usersByCommunity[cid].push(u);
      });

      // Check if these community IDs exist in growth_communities
      for (const [communityId, users] of Object.entries(usersByCommunity)) {
        const exists = communities?.some(c => c.id === communityId);
        const status = exists ? '✅' : '❌ MISSING IN growth_communities!';
        console.log(`  Community ${communityId}: ${users.length} users ${status}`);
        
        if (!exists) {
          console.log('    Affected users:');
          users.forEach(u => {
            console.log(`      - ${u.first_name} ${u.last_name} (School: ${u.school_id})`);
          });
        }
      }
    }
    console.log('');

    // 3. Check schools and their generation settings
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('name');

    if (schoolError) {
      console.error('❌ Error fetching schools:', schoolError);
      return;
    }

    console.log('🏫 Schools configuration:');
    schools?.forEach(s => {
      console.log(`  - ${s.name} (ID: ${s.id}, Has Generations: ${s.has_generations})`);
    });
    console.log('');

    // 4. Check for any existing consultant assignments with communities
    const { data: assignments, error: assignError } = await supabase
      .from('consultant_assignments')
      .select('id, consultant_id, student_id, school_id, generation_id, community_id, is_active')
      .not('community_id', 'is', null);

    console.log(`📋 Found ${assignments?.length || 0} consultant assignments with community_id:`);
    if (assignments && assignments.length > 0) {
      assignments.forEach(a => {
        const exists = communities?.some(c => c.id === a.community_id);
        const status = exists ? '✅' : '❌ INVALID community_id!';
        console.log(`  - Assignment ${a.id}: Community ${a.community_id} ${status}`);
      });
    }
    console.log('');

    // 5. Summary and recommendations
    console.log('📌 Summary:');
    console.log('  - Total communities in database:', communities?.length || 0);
    console.log('  - Users with community_id:', usersWithCommunity?.length || 0);
    console.log('  - Schools in system:', schools?.length || 0);
    console.log('  - Community-based assignments:', assignments?.length || 0);

    // Check for specific issues
    const orphanedUsers = usersWithCommunity?.filter(u => 
      !communities?.some(c => c.id === u.community_id)
    );

    if (orphanedUsers && orphanedUsers.length > 0) {
      console.log('\n⚠️  ISSUE FOUND: Users with non-existent community_id!');
      console.log('   This is likely causing the foreign key constraint error.');
      console.log('\n🔧 Recommended fixes:');
      console.log('   1. Create the missing communities in growth_communities table');
      console.log('   2. OR clear the community_id from affected users');
      console.log('   3. OR update users to use valid community IDs');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the diagnosis
diagnoseIssue();