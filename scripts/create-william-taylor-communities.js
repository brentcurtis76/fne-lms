/**
 * Create Communities for Colegio Metodista William Taylor
 * This school has generations, so we need to create one community per generation
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createWilliamTaylorCommunities(dryRun = true) {
  console.log('🏫 CREATE WILLIAM TAYLOR COMMUNITIES');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  const schoolId = 9; // Colegio Metodista William Taylor

  // 1. Get all generations for this school's users
  console.log('1️⃣ Finding generations for William Taylor users...');

  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select(`
      *,
      generation:generations(id, name)
    `)
    .eq('school_id', schoolId)
    .eq('is_active', true);

  if (rolesError) {
    console.error('❌ Error:', rolesError.message);
    return;
  }

  console.log(`✅ Found ${userRoles.length} user roles at this school`);

  // Group by generation
  const generationMap = new Map();
  const noGeneration = [];

  userRoles.forEach(role => {
    if (role.generation_id) {
      const genId = role.generation_id;
      if (!generationMap.has(genId)) {
        generationMap.set(genId, {
          id: genId,
          name: role.generation?.name || 'Unknown',
          users: []
        });
      }
      generationMap.get(genId).users.push(role);
    } else {
      noGeneration.push(role);
    }
  });

  console.log(`\nGeneration breakdown:`);
  console.log(`  - ${generationMap.size} generation(s) with users`);
  console.log(`  - ${noGeneration.length} users with no generation`);

  generationMap.forEach((data, genId) => {
    console.log(`    • ${data.name}: ${data.users.length} users`);
  });

  // 2. Check existing communities
  console.log('\n2️⃣ Checking existing communities...');

  const { data: existingCommunities } = await supabase
    .from('growth_communities')
    .select('*')
    .eq('school_id', schoolId);

  console.log(`✅ Found ${existingCommunities?.length || 0} existing communities`);

  const existingGenIds = new Set(
    existingCommunities?.map(c => c.generation_id).filter(Boolean) || []
  );

  // 3. Create communities for each generation
  const communitiesToCreate = [];

  for (const [genId, data] of generationMap.entries()) {
    if (!existingGenIds.has(genId)) {
      communitiesToCreate.push({
        generationId: genId,
        generationName: data.name,
        userCount: data.users.length
      });
    } else {
      console.log(`  ✅ Community already exists for ${data.name}`);
    }
  }

  // Handle users without generation
  if (noGeneration.length > 0 && !existingCommunities?.some(c => c.generation_id === null)) {
    communitiesToCreate.push({
      generationId: null,
      generationName: 'General',
      userCount: noGeneration.length
    });
  }

  if (communitiesToCreate.length === 0) {
    console.log('\n✅ All generations already have communities!');
    return;
  }

  console.log(`\n3️⃣ Need to create ${communitiesToCreate.length} communities:`);
  communitiesToCreate.forEach((comm, i) => {
    console.log(`  ${i + 1}. ${comm.generationName} (${comm.userCount} users)`);
  });

  // 4. Create communities
  if (!dryRun) {
    console.log('\n4️⃣ Creating communities...\n');

    for (const comm of communitiesToCreate) {
      const communityName = comm.generationId
        ? `Comunidad William Taylor - ${comm.generationName}`
        : `Comunidad William Taylor`;

      console.log(`Creating: ${communityName}...`);

      const { data: community, error: createError } = await supabase
        .from('growth_communities')
        .insert({
          name: communityName,
          school_id: schoolId,
          generation_id: comm.generationId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error(`❌ Failed: ${createError.message}`);
        continue;
      }

      console.log(`✅ Created: ${community.id}`);

      // Assign users
      const updateQuery = supabase
        .from('user_roles')
        .update({ community_id: community.id })
        .eq('school_id', schoolId)
        .is('community_id', null)
        .eq('is_active', true);

      if (comm.generationId) {
        updateQuery.eq('generation_id', comm.generationId);
      } else {
        updateQuery.is('generation_id', null);
      }

      const { error: updateError } = await updateQuery;

      if (updateError) {
        console.error(`❌ Failed to assign: ${updateError.message}`);
      } else {
        console.log(`✅ Assigned ${comm.userCount} users\n`);
      }
    }

    console.log('✅ All communities created!');
  } else {
    console.log('\n💡 To create these communities, run:');
    console.log('   node scripts/create-william-taylor-communities.js --apply');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Complete!');
  console.log('='.repeat(60) + '\n');
}

const shouldApply = process.argv.includes('--apply');
createWilliamTaylorCommunities(!shouldApply).catch(console.error);
