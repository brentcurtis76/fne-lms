/**
 * Create Growth Communities for Schools That Need Them
 * This will create one community per school for schools with users but no communities
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

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

async function createCommunitiesAndAssign(dryRun = true) {
  console.log('🏘️  CREATE MISSING COMMUNITIES SCRIPT');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚠️  LIVE MODE (will create communities)'}\n`);

  // 1. Find schools with users but no communities
  console.log('1️⃣ Finding schools that need communities...');

  const { data: schoolsWithUsers, error: schoolsError } = await supabase
    .from('user_roles')
    .select('school_id, schools(id, name)')
    .not('school_id', 'is', null)
    .eq('is_active', true);

  if (schoolsError) {
    console.error('❌ Error:', schoolsError.message);
    return;
  }

  // Get unique schools
  const schoolsMap = new Map();
  schoolsWithUsers.forEach(role => {
    if (role.school_id && role.schools) {
      schoolsMap.set(role.school_id, role.schools);
    }
  });

  console.log(`✅ Found ${schoolsMap.size} unique schools with users`);

  // 2. Check which schools already have communities
  const { data: existingCommunities, error: commError } = await supabase
    .from('growth_communities')
    .select('school_id');

  if (commError) {
    console.error('❌ Error:', commError.message);
    return;
  }

  const schoolsWithCommunities = new Set(
    existingCommunities?.map(c => c.school_id).filter(Boolean) || []
  );

  // 3. Find schools that need communities
  const schoolsNeedingCommunities = [];
  for (const [schoolId, school] of schoolsMap.entries()) {
    if (!schoolsWithCommunities.has(schoolId)) {
      // Count users at this school
      const { data: userCount } = await supabase
        .from('user_roles')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('is_active', true);

      schoolsNeedingCommunities.push({
        id: schoolId,
        name: school.name,
        userCount: userCount?.length || 0
      });
    }
  }

  console.log(`\n✅ Found ${schoolsNeedingCommunities.length} schools needing communities:`);
  schoolsNeedingCommunities.forEach((school, i) => {
    console.log(`   ${i + 1}. ${school.name} (${school.userCount} users)`);
  });

  if (schoolsNeedingCommunities.length === 0) {
    console.log('\n✅ All schools already have communities!');
    return;
  }

  // 4. Create communities
  if (!dryRun) {
    console.log('\n2️⃣ Creating communities...\n');

    for (const school of schoolsNeedingCommunities) {
      console.log(`Creating community for ${school.name}...`);

      // Create the community
      const { data: community, error: createError } = await supabase
        .from('growth_communities')
        .insert({
          name: `Comunidad ${school.name}`,
          school_id: school.id,
          generation_id: null,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error(`❌ Failed to create community: ${createError.message}`);
        continue;
      }

      console.log(`✅ Created: ${community.name} (ID: ${community.id})`);

      // Assign to all users at this school
      const { error: updateError } = await supabase
        .from('user_roles')
        .update({ community_id: community.id })
        .eq('school_id', school.id)
        .is('community_id', null)
        .eq('is_active', true);

      if (updateError) {
        console.error(`❌ Failed to assign users: ${updateError.message}`);
      } else {
        console.log(`✅ Assigned ${school.userCount} users to community`);
      }

      console.log('');
    }

    console.log('✅ All communities created and assigned!');
  } else {
    console.log('\n🔍 DRY RUN - Would create these communities:');
    schoolsNeedingCommunities.forEach((school, i) => {
      console.log(`\n${i + 1}. Comunidad ${school.name}`);
      console.log(`   School ID: ${school.id}`);
      console.log(`   Users to assign: ${school.userCount}`);
    });

    console.log('\n💡 To create these communities, run:');
    console.log('   node scripts/create-missing-communities.js --apply');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Script complete!');
  console.log('='.repeat(60) + '\n');
}

// Check for --apply flag
const shouldApply = process.argv.includes('--apply');

createCommunitiesAndAssign(!shouldApply).catch(console.error);
