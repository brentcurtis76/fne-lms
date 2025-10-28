/**
 * Diagnostic Script: Brent Perro Community Visibility Issue
 * Investigates why brent@perrotuertocm.cl doesn't see Growth Community
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

async function diagnose() {
  console.log('🔍 DIAGNOSTIC: Brent Perro Community Visibility');
  console.log('='.repeat(60));

  const searchEmail = 'bcurtis';  // Search for users with 'bcurtis' in email

  // 1. Find the user
  console.log('\n1️⃣ Finding user...');
  const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('❌ Error listing users:', authError.message);
    return;
  }

  console.log(`📊 Total users in system: ${authUser?.users?.length || 0}`);

  const brentUsers = authUser?.users?.filter(u => u.email?.toLowerCase().includes(searchEmail.toLowerCase()));

  if (!brentUsers || brentUsers.length === 0) {
    console.error('❌ No users found matching:', searchEmail);
    console.log('\n🔍 Showing first 10 users for reference:');
    authUser?.users?.slice(0, 10).forEach((u, i) => {
      console.log(`   ${i + 1}. ${u.email}`);
    });
    return;
  }

  console.log(`\n📧 Found ${brentUsers.length} user(s) with '${searchEmail}' in email:`);
  brentUsers.forEach((u, i) => {
    console.log(`   ${i + 1}. ${u.email} (ID: ${u.id})`);
  });

  // Use the first match or ask for clarification
  const email = 'brent@perrotuertocm.cl';  // Keep this for logging
  let user = brentUsers.find(u => u.email === email);

  // If exact match not found, use first result
  if (!user && brentUsers.length > 0) {
    user = brentUsers[0];
    console.log(`\n⚠️  Using: ${user.email}`);
  }

  if (!user) {
    console.error('❌ User not found');
    return;
  }

  console.log('✅ User found:', user.id);
  console.log('   Email:', user.email);
  console.log('   Metadata roles:', user.user_metadata?.roles);

  // 2. Check profile
  console.log('\n2️⃣ Checking profile...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('❌ Profile error:', profileError.message);
  } else {
    console.log('✅ Profile found:');
    console.log('   Name:', profile.first_name, profile.last_name);
    console.log('   School:', profile.school);
  }

  // 3. Check user_roles table
  console.log('\n3️⃣ Checking user_roles...');
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select(`
      *,
      community:growth_communities(id, name),
      school:schools(id, name),
      generation:generations(id, name)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (rolesError) {
    console.error('❌ Roles error:', rolesError.message);
  } else {
    console.log(`✅ Found ${userRoles?.length || 0} active roles:`);
    userRoles?.forEach(role => {
      console.log(`   - ${role.role_type}`);
      console.log(`     Community: ${role.community?.name || 'NULL'} (ID: ${role.community_id || 'NULL'})`);
      console.log(`     School: ${role.school?.name || 'NULL'} (ID: ${role.school_id || 'NULL'})`);
      console.log(`     Generation: ${role.generation?.name || 'NULL'} (ID: ${role.generation_id || 'NULL'})`);
    });
  }

  // 4. Check all growth communities
  console.log('\n4️⃣ Checking all Growth Communities...');
  const { data: allCommunities, error: communitiesError } = await supabase
    .from('growth_communities')
    .select('*')
    .order('name');

  if (communitiesError) {
    console.error('❌ Communities error:', communitiesError.message);
  } else {
    console.log(`✅ Found ${allCommunities?.length || 0} growth communities:`);
    allCommunities?.forEach(comm => {
      console.log(`   - ${comm.name} (ID: ${comm.id})`);
      console.log(`     School: ${comm.school_id}, Generation: ${comm.generation_id}`);
    });
  }

  // 5. Check for matching community based on school/generation
  if (userRoles && userRoles.length > 0 && allCommunities) {
    console.log('\n5️⃣ Looking for matching communities...');

    userRoles.forEach(role => {
      if (role.school_id && role.generation_id) {
        const matchingCommunity = allCommunities.find(
          c => c.school_id === role.school_id && c.generation_id === role.generation_id
        );

        if (matchingCommunity) {
          console.log(`✅ Found matching community for role ${role.role_type}:`);
          console.log(`   Community: ${matchingCommunity.name} (ID: ${matchingCommunity.id})`);
          console.log(`   Role has community_id: ${role.community_id || 'NULL'}`);

          if (!role.community_id) {
            console.log('   ⚠️  WARNING: Role is missing community_id!');
          } else if (role.community_id !== matchingCommunity.id) {
            console.log('   ⚠️  WARNING: Role community_id does NOT match!');
            console.log(`      Expected: ${matchingCommunity.id}`);
            console.log(`      Actual: ${role.community_id}`);
          }
        } else {
          console.log(`⚠️  No matching community found for:`);
          console.log(`   School: ${role.school_id}`);
          console.log(`   Generation: ${role.generation_id}`);
        }
      }
    });
  }

  // 6. Check what dashboard.tsx would see
  console.log('\n6️⃣ Simulating dashboard.tsx logic...');
  console.log('   Condition: userRoles.some(role => role.community_id)');
  const hasAnyCommunityId = userRoles?.some(role => role.community_id);
  console.log(`   Result: ${hasAnyCommunityId ? '✅ TRUE - Would show section' : '❌ FALSE - Would NOT show section'}`);

  if (!hasAnyCommunityId) {
    console.log('   🔍 This is why the Growth Community section is not showing!');
  }

  // 7. Compare with a working user
  console.log('\n7️⃣ Comparing with other users who have communities...');
  const { data: usersWithCommunities, error: compareError } = await supabase
    .from('user_roles')
    .select(`
      user_id,
      role_type,
      community_id,
      school_id,
      generation_id
    `)
    .not('community_id', 'is', null)
    .eq('is_active', true)
    .limit(5);

  if (!compareError && usersWithCommunities && usersWithCommunities.length > 0) {
    console.log(`✅ Found ${usersWithCommunities.length} users with communities:`);
    usersWithCommunities.forEach(u => {
      console.log(`   - User: ${u.user_id}`);
      console.log(`     Role: ${u.role_type}, Community: ${u.community_id}`);
    });
  } else {
    console.log('⚠️  No other users found with community assignments');
  }

  // 8. Recommendations
  console.log('\n' + '='.repeat(60));
  console.log('📋 DIAGNOSIS SUMMARY');
  console.log('='.repeat(60));

  if (!userRoles || userRoles.length === 0) {
    console.log('❌ ISSUE: User has NO roles assigned');
    console.log('   FIX: Assign appropriate roles to the user');
  } else if (!hasAnyCommunityId) {
    console.log('❌ ISSUE: User has roles but NO community_id assigned');
    console.log('   FIX: Update user_roles to include community_id');

    // Suggest the fix
    userRoles.forEach(role => {
      if (role.school_id && role.generation_id) {
        const matchingCommunity = allCommunities?.find(
          c => c.school_id === role.school_id && c.generation_id === role.generation_id
        );
        if (matchingCommunity) {
          console.log(`\n   Suggested SQL fix for role ID ${role.id}:`);
          console.log(`   UPDATE user_roles`);
          console.log(`   SET community_id = '${matchingCommunity.id}'`);
          console.log(`   WHERE id = '${role.id}';`);
        }
      }
    });
  } else {
    console.log('✅ User has community assignments - investigating further...');
  }

  console.log('\n✅ Diagnosis complete!\n');
}

diagnose().catch(console.error);
