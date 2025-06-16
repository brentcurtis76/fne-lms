#!/usr/bin/env node

// Script to fix community reference issues in consultant assignments
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCommunityReferences() {
  console.log('🔧 Fixing Community Reference Issues...\n');

  try {
    // 1. Clear any invalid community_id values from profiles
    console.log('1️⃣ Checking for invalid community_id values in profiles...');
    
    // Get all profiles with community_id set
    const { data: profilesWithCommunity, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, community_id')
      .not('community_id', 'is', null);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }

    // Get all valid community IDs
    const { data: validCommunities, error: commError } = await supabase
      .from('growth_communities')
      .select('id');

    if (commError) {
      console.error('Error fetching communities:', commError);
      return;
    }

    const validCommunityIds = new Set(validCommunities.map(c => c.id));
    const invalidProfiles = profilesWithCommunity.filter(p => !validCommunityIds.has(p.community_id));

    if (invalidProfiles.length > 0) {
      console.log(`❌ Found ${invalidProfiles.length} profiles with invalid community_id values:`);
      invalidProfiles.forEach(p => {
        console.log(`   - ${p.first_name} ${p.last_name} (ID: ${p.id}, Invalid Community: ${p.community_id})`);
      });

      // Clear invalid community_id values
      console.log('\n🧹 Clearing invalid community_id values...');
      for (const profile of invalidProfiles) {
        const { error } = await supabase
          .from('profiles')
          .update({ community_id: null })
          .eq('id', profile.id);

        if (error) {
          console.error(`   ❌ Failed to clear community_id for ${profile.first_name} ${profile.last_name}:`, error);
        } else {
          console.log(`   ✅ Cleared community_id for ${profile.first_name} ${profile.last_name}`);
        }
      }
    } else {
      console.log('✅ All community_id values in profiles are valid');
    }

    // 2. Check user_roles table
    console.log('\n2️⃣ Checking user_roles table for invalid community references...');
    
    const { data: rolesWithCommunity, error: roleError } = await supabase
      .from('user_roles')
      .select('id, user_id, community_id')
      .not('community_id', 'is', null);

    if (roleError) {
      console.error('Error fetching user_roles:', roleError);
      return;
    }

    const invalidRoles = rolesWithCommunity.filter(r => !validCommunityIds.has(r.community_id));

    if (invalidRoles.length > 0) {
      console.log(`❌ Found ${invalidRoles.length} user_roles with invalid community_id values`);
      
      // Clear invalid community_id values in user_roles
      console.log('\n🧹 Clearing invalid community_id values from user_roles...');
      for (const role of invalidRoles) {
        const { error } = await supabase
          .from('user_roles')
          .update({ community_id: null })
          .eq('id', role.id);

        if (error) {
          console.error(`   ❌ Failed to clear community_id for role ${role.id}:`, error);
        } else {
          console.log(`   ✅ Cleared community_id for role ${role.id}`);
        }
      }
    } else {
      console.log('✅ All community_id values in user_roles are valid');
    }

    // 3. Create missing communities for schools without generations
    console.log('\n3️⃣ Checking for schools without communities...');
    
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .eq('has_generations', false);

    if (schoolError) {
      console.error('Error fetching schools:', schoolError);
      return;
    }

    for (const school of schools) {
      // Check if school has any communities
      const { data: schoolCommunities, error: checkError } = await supabase
        .from('growth_communities')
        .select('id')
        .eq('school_id', school.id);

      if (checkError) {
        console.error(`Error checking communities for ${school.name}:`, checkError);
        continue;
      }

      if (!schoolCommunities || schoolCommunities.length === 0) {
        console.log(`📝 Creating default community for ${school.name}...`);
        
        const { data: newCommunity, error: createError } = await supabase
          .from('growth_communities')
          .insert({
            school_id: school.id,
            name: `Comunidad General - ${school.name}`,
            description: `Comunidad general para ${school.name}`,
            generation_id: null // Schools without generations don't need this
          })
          .select()
          .single();

        if (createError) {
          console.error(`   ❌ Failed to create community:`, createError);
        } else {
          console.log(`   ✅ Created community: ${newCommunity.name} (ID: ${newCommunity.id})`);
        }
      }
    }

    // 4. Summary
    console.log('\n📊 Summary:');
    console.log(`  - Invalid profile community references cleared: ${invalidProfiles.length}`);
    console.log(`  - Invalid user_role community references cleared: ${invalidRoles.length}`);
    console.log(`  - Schools checked for communities: ${schools.length}`);
    
    console.log('\n✅ Community reference cleanup complete!');
    console.log('\n💡 Next steps:');
    console.log('  1. Users can be assigned to communities through the user management interface');
    console.log('  2. Consultant assignments can now use valid community IDs');
    console.log('  3. Consider running a user audit to ensure proper community assignments');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixCommunityReferences();