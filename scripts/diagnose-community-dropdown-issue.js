#!/usr/bin/env node

// Script to diagnose why Growth Community dropdown isn't showing communities
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseCommunityDropdown() {
  console.log('🔍 Diagnosing Growth Community Dropdown Issue...\n');

  try {
    // 1. Get all schools and their growth communities
    console.log('1️⃣ Fetching all schools and their communities...\n');
    
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('*')
      .order('name');

    if (schoolError) {
      console.error('Error fetching schools:', schoolError);
      return;
    }

    console.log(`Found ${schools.length} schools:`);
    for (const school of schools) {
      console.log(`\n📚 School: ${school.name} (ID: ${school.id})`);
      console.log(`   Has Generations: ${school.has_generations}`);
      
      // Get communities for this school
      const { data: communities, error: commError } = await supabase
        .from('growth_communities')
        .select('*')
        .eq('school_id', school.id);
      
      if (commError) {
        console.error('   Error fetching communities:', commError);
        continue;
      }
      
      console.log(`   Communities: ${communities.length}`);
      communities.forEach(c => {
        console.log(`     - ${c.name} (ID: ${c.id})`);
        console.log(`       Generation ID: ${c.generation_id || 'NULL (direct to school)'}`);
      });
    }

    // 2. Check for any type mismatches
    console.log('\n\n2️⃣ Checking for type mismatches...\n');
    
    const { data: sampleCommunities } = await supabase
      .from('growth_communities')
      .select('id, school_id, generation_id')
      .limit(5);
    
    console.log('Sample community data types:');
    sampleCommunities?.forEach(c => {
      console.log(`Community ID: ${c.id} (Type: ${typeof c.id})`);
      console.log(`  school_id: ${c.school_id} (Type: ${typeof c.school_id})`);
      console.log(`  generation_id: ${c.generation_id} (Type: ${typeof c.generation_id})\n`);
    });

    // 3. Test the exact query used in roleUtils.ts
    console.log('3️⃣ Testing roleUtils.getAvailableCommunitiesForAssignment() logic...\n');
    
    // Test without school filter (should return all)
    const { data: allCommunities, error: allError } = await supabase
      .from('growth_communities')
      .select(`
        *,
        generation:generations(*),
        school:schools(*)
      `)
      .order('name');
    
    console.log(`All communities query returned: ${allCommunities?.length || 0} results`);
    if (allError) console.error('Error:', allError);
    
    // Test with a specific school (pick the first one with communities)
    const schoolWithCommunities = schools.find(s => s.id);
    if (schoolWithCommunities) {
      console.log(`\nTesting with school filter: ${schoolWithCommunities.name} (ID: ${schoolWithCommunities.id})`);
      
      // Test with string ID (as might come from UI)
      const stringId = String(schoolWithCommunities.id);
      const { data: stringFiltered } = await supabase
        .from('growth_communities')
        .select(`
          *,
          generation:generations(*),
          school:schools(*)
        `)
        .eq('school_id', stringId)
        .order('name');
      
      console.log(`  String ID filter: ${stringFiltered?.length || 0} results`);
      
      // Test with parseInt (as done in roleUtils)
      const intId = parseInt(stringId);
      const { data: intFiltered } = await supabase
        .from('growth_communities')
        .select(`
          *,
          generation:generations(*),
          school:schools(*)
        `)
        .eq('school_id', intId)
        .order('name');
      
      console.log(`  Integer ID filter: ${intFiltered?.length || 0} results`);
      
      // Show the difference
      if (stringFiltered?.length !== intFiltered?.length) {
        console.log('\n⚠️  FOUND TYPE MISMATCH ISSUE!');
        console.log('   The school_id type matters for filtering.');
      }
    }

    // 4. Check for users with community leader roles
    console.log('\n\n4️⃣ Checking for community leaders in the same schools...\n');
    
    const { data: communityLeaders } = await supabase
      .from('user_roles')
      .select(`
        *,
        user:profiles!user_roles_user_id_fkey(first_name, last_name, email),
        school:schools(*),
        community:growth_communities(*)
      `)
      .eq('role_type', 'lider_comunidad')
      .eq('is_active', true);
    
    console.log(`Found ${communityLeaders?.length || 0} community leaders:`);
    communityLeaders?.forEach(leader => {
      console.log(`\n👤 ${leader.user?.first_name} ${leader.user?.last_name} (${leader.user?.email})`);
      console.log(`   School: ${leader.school?.name || 'N/A'}`);
      console.log(`   Community: ${leader.community?.name || 'N/A'}`);
      console.log(`   Community ID: ${leader.community_id}`);
    });

    // 5. Recommendations
    console.log('\n\n📌 Key Findings & Recommendations:\n');
    console.log('1. Check if the dropdown is filtering by the correct school_id');
    console.log('2. Ensure school_id is being converted to integer if needed');
    console.log('3. Verify the user being edited belongs to a school that has communities');
    console.log('4. Check browser console for any JavaScript errors when opening the role modal');
    console.log('5. Use browser DevTools to inspect the state of availableCommunities in React');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the diagnostic
diagnoseCommunityDropdown();