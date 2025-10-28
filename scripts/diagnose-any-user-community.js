/**
 * Diagnostic Script: Check any user's community visibility
 * Usage: node scripts/diagnose-any-user-community.js <email>
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

async function diagnose(emailToCheck) {
  console.log('🔍 DIAGNOSTIC: Community Visibility Check');
  console.log('='.repeat(60));
  console.log(`Target: ${emailToCheck}\n`);

  // 1. Find the user by email using profiles table
  console.log('1️⃣ Searching for user...');
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', `%${emailToCheck}%`);

  if (profileError) {
    console.error('❌ Profile search error:', profileError.message);
    return;
  }

  if (!profiles || profiles.length === 0) {
    console.log(`❌ No profiles found matching: ${emailToCheck}`);
    console.log('\n💡 Trying auth.users search...');

    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (!authError && authData?.users) {
      const matchingUsers = authData.users.filter(u =>
        u.email?.toLowerCase().includes(emailToCheck.toLowerCase())
      );

      if (matchingUsers.length > 0) {
        console.log(`✅ Found ${matchingUsers.length} matching auth user(s):`);
        matchingUsers.forEach(u => console.log(`   - ${u.email} (ID: ${u.id})`));

        // Use first match
        await diagnoseUserId(matchingUsers[0].id, matchingUsers[0].email);
      } else {
        console.log('❌ No matching users in auth either');
      }
    }
    return;
  }

  console.log(`✅ Found ${profiles.length} matching profile(s):`);
  profiles.forEach(p => {
    console.log(`   - ${p.first_name} ${p.last_name} (${p.email})`);
    console.log(`     ID: ${p.id}`);
  });

  // Use first match
  await diagnoseUserId(profiles[0].id, profiles[0].email);
}

async function diagnoseUserId(userId, userEmail) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Diagnosing User ID: ${userId}`);
  console.log(`Email: ${userEmail}`);
  console.log('='.repeat(60));

  // 2. Check user_roles table
  console.log('\n2️⃣ Checking user_roles...');
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select(`
      *,
      community:growth_communities(id, name),
      school:schools(id, name),
      generation:generations(id, name)
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (rolesError) {
    console.error('❌ Roles error:', rolesError.message);
  } else {
    console.log(`✅ Found ${userRoles?.length || 0} active roles:`);
    if (userRoles && userRoles.length > 0) {
      userRoles.forEach(role => {
        console.log(`\n   Role: ${role.role_type}`);
        console.log(`   - Community ID: ${role.community_id || 'NULL'}`);
        console.log(`   - Community Name: ${role.community?.name || 'NULL'}`);
        console.log(`   - School ID: ${role.school_id || 'NULL'}`);
        console.log(`   - School Name: ${role.school?.name || 'NULL'}`);
        console.log(`   - Generation ID: ${role.generation_id || 'NULL'}`);
        console.log(`   - Generation Name: ${role.generation?.name || 'NULL'}`);
      });
    } else {
      console.log('   (No roles found)');
    }
  }

  // 3. Check what dashboard would show
  console.log('\n3️⃣ Dashboard Display Logic...');
  const hasAnyCommunityId = userRoles?.some(role => role.community_id);
  console.log(`   Condition: userRoles.some(role => role.community_id)`);
  console.log(`   Result: ${hasAnyCommunityId ? '✅ TRUE' : '❌ FALSE'}`);

  if (hasAnyCommunityId) {
    console.log('   ✅ Growth Community section WOULD display');
  } else {
    console.log('   ❌ Growth Community section would NOT display');
    console.log('   📍 This is the issue!');
  }

  // 4. Look for potential communities to assign
  if (!hasAnyCommunityId && userRoles && userRoles.length > 0) {
    console.log('\n4️⃣ Looking for matching communities...');

    for (const role of userRoles) {
      if (role.school_id && role.generation_id) {
        const { data: matchingCommunities } = await supabase
          .from('growth_communities')
          .select('*')
          .eq('school_id', role.school_id)
          .eq('generation_id', role.generation_id);

        if (matchingCommunities && matchingCommunities.length > 0) {
          console.log(`\n   ✅ Found matching community:`);
          matchingCommunities.forEach(comm => {
            console.log(`      Name: ${comm.name}`);
            console.log(`      ID: ${comm.id}`);
            console.log(`\n      💡 FIX: Run this SQL:`);
            console.log(`      UPDATE user_roles`);
            console.log(`      SET community_id = '${comm.id}'`);
            console.log(`      WHERE id = '${role.id}';`);
          });
        } else {
          console.log(`\n   ⚠️  No matching community exists for:`);
          console.log(`      School: ${role.school?.name} (${role.school_id})`);
          console.log(`      Generation: ${role.generation?.name} (${role.generation_id})`);
          console.log(`\n      💡 Need to create a community first`);
        }
      }
    }
  }

  // 5. Compare with working examples
  console.log('\n5️⃣ Checking other users with communities...');
  const { data: workingExamples } = await supabase
    .from('user_roles')
    .select(`
      user_id,
      role_type,
      community_id,
      profiles!inner(first_name, last_name, email)
    `)
    .not('community_id', 'is', null)
    .eq('is_active', true)
    .limit(3);

  if (workingExamples && workingExamples.length > 0) {
    console.log(`✅ Example users who CAN see their communities:`);
    workingExamples.forEach(ex => {
      console.log(`   - ${ex.profiles.email}`);
      console.log(`     Role: ${ex.role_type}, Community: ${ex.community_id}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnosis complete!');
  console.log('='.repeat(60) + '\n');
}

// Get email from command line or use default
const emailArg = process.argv[2] || 'admin';

diagnose(emailArg).catch(console.error);
