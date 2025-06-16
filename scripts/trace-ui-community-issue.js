#!/usr/bin/env node

// Script to trace the exact issue with community assignments from UI
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function traceUIIssue() {
  console.log('🔍 Tracing UI Community Assignment Issue...\n');

  try {
    // 1. Get the data that would be returned by the API
    console.log('1️⃣ Fetching data as returned by /api/admin/consultant-assignment-users...\n');

    // Fetch communities
    const { data: communities, error: commError } = await supabase
      .from('growth_communities')
      .select(`
        id,
        name,
        school_id,
        generation_id,
        school:schools(id, name),
        generation:generations(id, name)
      `)
      .order('name', { ascending: true });

    if (commError) {
      console.error('Error fetching communities:', commError);
      return;
    }

    console.log('📊 Communities returned by API:');
    communities.forEach(c => {
      console.log(`\n  Community: ${c.name}`);
      console.log(`    ID: "${c.id}" (Type: ${typeof c.id})`);
      console.log(`    School ID: ${c.school_id} (Type: ${typeof c.school_id})`);
      console.log(`    School Name: ${c.school?.name || 'N/A'}`);
      console.log(`    Generation ID: ${c.generation_id} (Type: ${typeof c.generation_id})`);
    });

    // 2. Check how students might have community data
    console.log('\n\n2️⃣ Checking how students might reference communities...\n');

    // First check if any profiles have community_id set
    const { data: profilesWithComm } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, community_id')
      .not('community_id', 'is', null)
      .limit(5);

    console.log(`Profiles with community_id: ${profilesWithComm?.length || 0}`);

    // Check user_roles for community references
    const { data: rolesWithComm } = await supabase
      .from('user_roles')
      .select(`
        user_id,
        community_id,
        user:profiles!user_roles_user_id_fkey(first_name, last_name),
        community:growth_communities(id, name)
      `)
      .not('community_id', 'is', null)
      .limit(5);

    console.log(`\nUser roles with community_id: ${rolesWithComm?.length || 0}`);
    if (rolesWithComm && rolesWithComm.length > 0) {
      rolesWithComm.forEach(r => {
        console.log(`  User: ${r.user?.first_name} ${r.user?.last_name}`);
        console.log(`    Community ID: "${r.community_id}" (Type: ${typeof r.community_id})`);
        console.log(`    Community Name: ${r.community?.name || 'NOT FOUND'}`);
      });
    }

    // 3. Simulate what happens when UI tries to create assignment
    console.log('\n\n3️⃣ Common UI scenarios that might cause errors:\n');

    console.log('Scenario A: User selects a student who appears to have a community');
    console.log('  - UI shows community name from somewhere (maybe hardcoded or from old data)');
    console.log('  - But the community_id doesn\'t exist in growth_communities table');
    console.log('  - Foreign key constraint fails\n');

    console.log('Scenario B: UI sends a string where number is expected');
    console.log('  - school_id might be sent as "19" instead of 19');
    console.log('  - This would cause a type mismatch error\n');

    console.log('Scenario C: UI sends community_id that\'s not a valid UUID');
    console.log('  - If UI generates or modifies the ID incorrectly');
    console.log('  - Database rejects invalid UUID format\n');

    // 4. Recommendations
    console.log('\n📌 Debugging Recommendations:\n');
    console.log('1. Check browser DevTools Network tab when creating assignment');
    console.log('2. Look at the exact payload being sent to /api/admin/consultant-assignments');
    console.log('3. Verify the community_id value matches one from growth_communities table');
    console.log('4. Ensure school_id is sent as a number, not a string');
    console.log('5. Check if the UI is showing "phantom" communities that don\'t exist in DB');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the trace
traceUIIssue();