/**
 * Fix Script: Assign generations and communities to users
 * This script identifies users with schools but no communities and fixes them
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

async function analyzeAndFix(dryRun = true) {
  console.log('🔧 COMMUNITY ASSIGNMENT FIX SCRIPT');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚠️  LIVE MODE (will make changes)'}\n`);

  // 1. Get all generations
  console.log('1️⃣ Fetching generations...');
  const { data: generations, error: genError } = await supabase
    .from('generations')
    .select('*')
    .order('name');

  if (genError) {
    console.error('❌ Error fetching generations:', genError.message);
    return;
  }

  console.log(`✅ Found ${generations?.length || 0} generations:`);
  generations?.forEach(g => {
    console.log(`   - ${g.name} (ID: ${g.id})`);
  });

  // 2. Get all growth communities
  console.log('\n2️⃣ Fetching growth communities...');
  const { data: communities, error: commError } = await supabase
    .from('growth_communities')
    .select('*')
    .order('name');

  if (commError) {
    console.error('❌ Error fetching communities:', commError.message);
    return;
  }

  console.log(`✅ Found ${communities?.length || 0} growth communities:`);
  communities?.forEach(c => {
    console.log(`   - ${c.name} (ID: ${c.id})`);
    console.log(`     School: ${c.school_id}, Generation: ${c.generation_id}`);
  });

  // 3. Get all user_roles without community_id
  console.log('\n3️⃣ Finding users without community assignments...');
  const { data: rolesWithoutCommunity, error: rolesError } = await supabase
    .from('user_roles')
    .select(`
      *,
      school:schools(id, name)
    `)
    .is('community_id', null)
    .not('school_id', 'is', null)
    .eq('is_active', true);

  if (rolesError) {
    console.error('❌ Error fetching roles:', rolesError.message);
    return;
  }

  // Fetch all needed profiles in bulk
  if (rolesWithoutCommunity && rolesWithoutCommunity.length > 0) {
    const userIds = rolesWithoutCommunity.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    // Map profiles to roles
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    rolesWithoutCommunity.forEach(role => {
      role.profiles = profileMap.get(role.user_id);
    });
  }

  console.log(`✅ Found ${rolesWithoutCommunity?.length || 0} roles without communities:`);

  if (!rolesWithoutCommunity || rolesWithoutCommunity.length === 0) {
    console.log('\n✅ No fixes needed! All users with schools have communities assigned.');
    return;
  }

  // 4. Analyze and suggest fixes
  console.log('\n4️⃣ Analyzing potential fixes...\n');

  const fixes = [];

  for (const role of rolesWithoutCommunity) {
    const userEmail = role.profiles?.email || 'unknown';
    const schoolId = role.school_id;
    const schoolName = role.school?.name || 'Unknown';

    console.log(`User: ${userEmail}`);
    console.log(`  Role: ${role.role_type}`);
    console.log(`  School: ${schoolName} (${schoolId})`);
    console.log(`  Current Generation: ${role.generation_id || 'NULL'}`);

    // Find communities for this school
    const matchingCommunities = communities?.filter(c => c.school_id === schoolId);

    if (matchingCommunities && matchingCommunities.length > 0) {
      console.log(`  ✅ Found ${matchingCommunities.length} community(ies) for this school:`);

      matchingCommunities.forEach(comm => {
        console.log(`     - ${comm.name} (Gen: ${comm.generation_id})`);
      });

      // Use first matching community
      const selectedCommunity = matchingCommunities[0];

      fixes.push({
        roleId: role.id,
        userId: role.user_id,
        userEmail,
        schoolId: schoolId,
        schoolName: schoolName,
        currentGenerationId: role.generation_id,
        newGenerationId: selectedCommunity.generation_id,
        newCommunityId: selectedCommunity.id,
        communityName: selectedCommunity.name
      });

      console.log(`  💡 Will assign:`);
      console.log(`     Generation: ${selectedCommunity.generation_id}`);
      console.log(`     Community: ${selectedCommunity.name} (${selectedCommunity.id})`);
    } else {
      console.log(`  ⚠️  No community exists for school ${schoolId}`);
      console.log(`     Need to create a community first!`);
    }

    console.log('');
  }

  // 5. Apply fixes if not dry run
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total users affected: ${fixes.length}`);

  if (fixes.length > 0) {
    console.log('\nFixes to apply:');
    fixes.forEach((fix, i) => {
      console.log(`\n${i + 1}. ${fix.userEmail}`);
      console.log(`   Generation: ${fix.currentGenerationId || 'NULL'} → ${fix.newGenerationId}`);
      console.log(`   Community: NULL → ${fix.communityName}`);
    });

    if (!dryRun) {
      console.log('\n⚠️  Applying fixes...\n');

      for (const fix of fixes) {
        const { error: updateError } = await supabase
          .from('user_roles')
          .update({
            generation_id: fix.newGenerationId,
            community_id: fix.newCommunityId
          })
          .eq('id', fix.roleId);

        if (updateError) {
          console.error(`❌ Failed to update ${fix.userEmail}:`, updateError.message);
        } else {
          console.log(`✅ Updated ${fix.userEmail}`);
        }
      }

      console.log('\n✅ All fixes applied!');
    } else {
      console.log('\n🔍 DRY RUN - No changes made');
      console.log('To apply these fixes, run:');
      console.log('node scripts/fix-community-assignments.js --apply');
    }
  } else {
    console.log('\n✅ No fixes needed!');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Check for --apply flag
const shouldApply = process.argv.includes('--apply');

analyzeAndFix(!shouldApply).catch(console.error);
