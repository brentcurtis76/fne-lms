/**
 * Enable transformation feature for the current logged-in user's community
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// User ID from the console logs (the admin user currently logged in)
const USER_ID = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

async function enableTransformation() {
  console.log('🔍 Finding communities for user:', USER_ID);

  // Get user's community IDs
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('community_id')
    .eq('user_id', USER_ID)
    .eq('is_active', true);

  if (rolesError) {
    console.error('❌ Error fetching user roles:', rolesError);
    return;
  }

  if (!userRoles || userRoles.length === 0) {
    console.error('❌ No communities found for this user');
    return;
  }

  const communityIds = userRoles
    .map(r => r.community_id)
    .filter(id => id !== null && id !== undefined);

  // Get community details
  const { data: communities, error: commError } = await supabase
    .from('growth_communities')
    .select('id, name, transformation_enabled')
    .in('id', communityIds);

  if (commError) {
    console.error('❌ Error fetching communities:', commError);
    return;
  }

  console.log(`\n📋 Found ${communities.length} communities:\n`);

  communities.forEach((comm, index) => {
    console.log(`${index + 1}. ${comm.name}`);
    console.log(`   ID: ${comm.id}`);
    console.log(`   Transformation Enabled: ${comm.transformation_enabled ? '✅ YES' : '❌ NO'}`);
    console.log('');
  });

  // Enable transformation for ALL communities

  console.log(`\n🔧 Enabling transformation for all ${communityIds.length} communities...\n`);

  const { data, error } = await supabase
    .from('growth_communities')
    .update({ transformation_enabled: true })
    .in('id', communityIds)
    .select('id, name, transformation_enabled');

  if (error) {
    console.error('❌ Error updating communities:', error);
    return;
  }

  console.log('✅ Success! Updated communities:\n');
  data.forEach((comm) => {
    console.log(`   ✓ ${comm.name} - Transformation: ${comm.transformation_enabled}`);
  });

  console.log('\n🎉 Transformation feature enabled!');
  console.log('🔄 Refresh the page in your browser to see the assessment form.\n');
}

enableTransformation().catch(console.error);
