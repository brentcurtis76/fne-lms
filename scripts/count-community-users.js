#!/usr/bin/env node

/**
 * Quick diagnostic script to compare how many users belong to a given community
 * according to the legacy profiles table vs the new user_roles table.
 *
 * Usage:
 *   COMMUNITY_NAME="Comunidad LESLY DIAZ" node scripts/count-community-users.js
 *   COMMUNITY_ID="uuid-here" node scripts/count-community-users.js
 *
 * It prints:
 *  - Community metadata (id + name)
 *  - Count of distinct users from profiles.community_id
 *  - Count of distinct users from user_roles.community_id (active only)
 *  - Combined unique total
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const communityName = process.env.COMMUNITY_NAME;
  const communityIdInput = process.env.COMMUNITY_ID;

  if (!communityName && !communityIdInput) {
    console.error('❌ Provide COMMUNITY_NAME or COMMUNITY_ID env var.');
    process.exit(1);
  }

  // Resolve community id if caller passed a name.
  let communityId = communityIdInput;
  if (!communityId && communityName) {
    const { data, error } = await supabase
      .from('growth_communities')
      .select('id, name')
      .ilike('name', communityName)
      .limit(1)
      .single();

    if (error || !data) {
      console.error(`❌ Community "${communityName}" not found (${error?.message || 'no data'})`);
      process.exit(1);
    }
    communityId = data.id;
    console.log(`ℹ️  Found community "${data.name}" -> ${communityId}`);
  } else {
    const { data, error } = await supabase
      .from('growth_communities')
      .select('id, name')
      .eq('id', communityId)
      .single();
    if (error || !data) {
      console.error(`❌ Community ${communityId} not found (${error?.message || 'no data'})`);
      process.exit(1);
    }
    console.log(`ℹ️  Community: "${data.name}" (${communityId})`);
  }

  // Legacy profiles lookup.
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('community_id', communityId);

  if (profileError) {
    console.error('❌ profiles query failed:', profileError.message);
    process.exit(1);
  }

  const profileIds = new Set(profileRows?.map((row) => row.id) || []);

  // user_roles lookup.
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('community_id', communityId)
    .eq('is_active', true);

  if (roleError) {
    console.error('❌ user_roles query failed:', roleError.message);
    process.exit(1);
  }

  const roleIds = new Set(roleRows?.map((row) => row.user_id) || []);

  const combined = new Set([...profileIds, ...roleIds]);

  console.log('\n=== Community Membership Counts ===');
  console.log(`Profiles table      : ${profileIds.size}`);
  console.log(`user_roles (active) : ${roleIds.size}`);
  console.log(`Combined unique     : ${combined.size}`);
  console.log('\nDone ✅');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
