/**
 * Setup transformation access for current user
 * This assigns the user to the test community and enables transformation
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// User ID from console logs
const USER_ID = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

// Community ID from Day 1 documentation
const TEST_COMMUNITY_ID = 'eeac5776-98f3-4169-8ba6-3bdec1d84e03';

async function setup() {
  console.log('🔧 Setting up transformation access...\n');

  // Step 1: Enable transformation for the test community
  console.log('1️⃣ Enabling transformation for test community...');

  const { data: community, error: enableError } = await supabase
    .from('growth_communities')
    .update({ transformation_enabled: true })
    .eq('id', TEST_COMMUNITY_ID)
    .select('id, name, transformation_enabled')
    .single();

  if (enableError) {
    console.error('❌ Error enabling transformation:', enableError);
    console.log('\n💡 The community might not exist. Let me check...\n');

    // Check if community exists
    const { data: existingCommunity } = await supabase
      .from('growth_communities')
      .select('id, name, transformation_enabled')
      .eq('id', TEST_COMMUNITY_ID)
      .maybeSingle();

    if (!existingCommunity) {
      console.error(`❌ Community ${TEST_COMMUNITY_ID} does not exist.`);
      console.log('\n📋 Let me find ALL communities...\n');

      const { data: allCommunities } = await supabase
        .from('growth_communities')
        .select('id, name, transformation_enabled')
        .limit(10);

      if (allCommunities && allCommunities.length > 0) {
        console.log('Available communities:');
        allCommunities.forEach((c, i) => {
          console.log(`${i + 1}. ${c.name} (${c.id}) - Transformation: ${c.transformation_enabled}`);
        });

        // Use the first community
        const firstCommunity = allCommunities[0];
        console.log(`\n✅ Using first community: ${firstCommunity.name}\n`);

        // Enable transformation for it
        await supabase
          .from('growth_communities')
          .update({ transformation_enabled: true })
          .eq('id', firstCommunity.id);

        // Assign user to it
        await assignUserToCommunity(firstCommunity.id, firstCommunity.name);
      } else {
        console.error('❌ No communities found in database!');
      }
      return;
    } else {
      console.log(`✅ Community exists: ${existingCommunity.name}`);
    }
  } else {
    console.log(`✅ Transformation enabled for: ${community.name}\n`);
  }

  // Step 2: Assign user to community
  await assignUserToCommunity(TEST_COMMUNITY_ID, community?.name);
}

async function assignUserToCommunity(communityId, communityName) {
  console.log(`2️⃣ Assigning user to community: ${communityName}...`);

  // Check if user_role already exists
  const { data: existing } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', USER_ID)
    .eq('community_id', communityId)
    .maybeSingle();

  if (existing) {
    console.log('   ℹ️  User already assigned to this community\n');

    // Make sure it's active
    await supabase
      .from('user_roles')
      .update({ is_active: true })
      .eq('id', existing.id);

    console.log('✅ Setup complete! Refresh your browser.\n');
    return;
  }

  // Create user_role
  const { data: newRole, error: roleError } = await supabase
    .from('user_roles')
    .insert({
      user_id: USER_ID,
      community_id: communityId,
      role_type: 'community_manager',
      is_active: true,
    })
    .select()
    .single();

  if (roleError) {
    console.error('❌ Error assigning user to community:', roleError);
    return;
  }

  console.log(`✅ User assigned as community_manager\n`);
  console.log('🎉 Setup complete!');
  console.log('🔄 Refresh the browser page to see the assessment form.\n');
}

setup().catch(console.error);
