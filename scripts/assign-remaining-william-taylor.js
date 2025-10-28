/**
 * Assign the 2 remaining William Taylor users
 * These users have no generation, so assign them to the Tractor community
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

async function assignRemaining() {
  console.log('🔧 ASSIGN REMAINING WILLIAM TAYLOR USERS\n');

  const schoolId = 9;

  // 1. Find the 2 users without communities
  const { data: usersWithoutCommunity } = await supabase
    .from('user_roles')
    .select('*')
    .eq('school_id', schoolId)
    .is('community_id', null)
    .eq('is_active', true);

  console.log(`Found ${usersWithoutCommunity?.length || 0} users without communities`);

  if (!usersWithoutCommunity || usersWithoutCommunity.length === 0) {
    console.log('✅ All users already assigned!');
    return;
  }

  // 2. Get one of the communities (use Tractor)
  const { data: communities } = await supabase
    .from('growth_communities')
    .select('*')
    .eq('school_id', schoolId)
    .limit(1);

  if (!communities || communities.length === 0) {
    console.error('❌ No communities found for this school');
    return;
  }

  const targetCommunity = communities[0];
  console.log(`\nAssigning to: ${targetCommunity.name}`);
  console.log(`Community ID: ${targetCommunity.id}\n`);

  // 3. Assign users
  const { error: updateError } = await supabase
    .from('user_roles')
    .update({ community_id: targetCommunity.id })
    .eq('school_id', schoolId)
    .is('community_id', null)
    .eq('is_active', true);

  if (updateError) {
    console.error('❌ Failed:', updateError.message);
  } else {
    console.log(`✅ Assigned ${usersWithoutCommunity.length} users!`);
  }
}

assignRemaining().catch(console.error);
