/**
 * Analyze Sync Safety - Profiles vs User_Roles
 * This script identifies what would change if we sync profiles.school_id from user_roles
 * WITHOUT making any changes - just analysis
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeSyncSafety() {
  console.log('🔍 SYNC SAFETY ANALYSIS - Profiles vs User_Roles\n');
  console.log('This analysis shows what WOULD change without making any changes\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, school_id, generation_id, community_id');

  // Get all user_roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, school_id, generation_id, community_id')
    .eq('is_active', true);

  // Get school names for reference
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name');

  const schoolMap = new Map(schools?.map(s => [s.id, s.name]) || []);

  // Create lookup map for user_roles (one role per user for org data)
  const userRoleOrgMap = new Map();
  userRoles?.forEach(role => {
    if (!userRoleOrgMap.has(role.user_id)) {
      userRoleOrgMap.set(role.user_id, {
        school_id: role.school_id,
        generation_id: role.generation_id,
        community_id: role.community_id
      });
    }
  });

  // Analyze what would change
  let noChange = 0;
  let wouldUpdate = [];
  let wouldClear = [];
  let noRoleData = [];
  let multipleRoles = [];

  for (const profile of profiles || []) {
    const roleOrg = userRoleOrgMap.get(profile.id);
    const userRoleCount = userRoles?.filter(r => r.user_id === profile.id).length || 0;

    if (!roleOrg) {
      noRoleData.push({
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre',
        email: profile.email,
        currentSchool: schoolMap.get(profile.school_id) || 'Sin escuela',
        roleSchool: 'Sin roles activos'
      });
      continue;
    }

    if (userRoleCount > 1) {
      const userRoleSchools = userRoles
        ?.filter(r => r.user_id === profile.id)
        .map(r => schoolMap.get(r.school_id))
        .filter(Boolean);

      multipleRoles.push({
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre',
        email: profile.email,
        roleCount: userRoleCount,
        schools: [...new Set(userRoleSchools)]
      });
    }

    // Check if school_id would change
    if (profile.school_id === roleOrg.school_id) {
      noChange++;
    } else if (roleOrg.school_id === null && profile.school_id !== null) {
      wouldClear.push({
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre',
        email: profile.email,
        currentSchool: schoolMap.get(profile.school_id) || 'Unknown',
        roleSchool: 'NULL (no school in user_roles)'
      });
    } else {
      wouldUpdate.push({
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre',
        email: profile.email,
        currentSchool: schoolMap.get(profile.school_id) || 'NULL',
        roleSchool: schoolMap.get(roleOrg.school_id) || 'NULL'
      });
    }
  }

  // Print summary
  console.log('📊 SUMMARY:\n');
  console.log(`Total profiles analyzed: ${profiles?.length || 0}`);
  console.log(`  ✅ Already in sync (no change needed): ${noChange}`);
  console.log(`  🔄 Would be UPDATED (profile ≠ user_roles): ${wouldUpdate.length}`);
  console.log(`  ⚠️  Would be CLEARED (user_roles has NULL): ${wouldClear.length}`);
  console.log(`  ❓ No active user_roles data: ${noRoleData.length}`);
  console.log(`  🔀 Users with multiple roles: ${multipleRoles.length}\n`);

  // Show users that would be updated
  if (wouldUpdate.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🔄 USERS THAT WOULD BE UPDATED (${wouldUpdate.length}):`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    wouldUpdate.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Current (profiles): ${user.currentSchool}`);
      console.log(`   Would change to (user_roles): ${user.roleSchool}`);
      console.log('');
    });
  }

  // Show users that would be cleared (DANGER)
  if (wouldClear.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`⚠️  DANGER: USERS THAT WOULD LOSE SCHOOL DATA (${wouldClear.length}):`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    wouldClear.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Current (profiles): ${user.currentSchool}`);
      console.log(`   Would change to: NULL ❌`);
      console.log('');
    });
  }

  // Show users with no role data
  if (noRoleData.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`❓ USERS WITH NO ACTIVE ROLES (${noRoleData.length}):`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    noRoleData.slice(0, 10).forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Current school: ${user.currentSchool}`);
      console.log(`   No active user_roles - would not change`);
      console.log('');
    });

    if (noRoleData.length > 10) {
      console.log(`   ... and ${noRoleData.length - 10} more users\n`);
    }
  }

  // Show users with multiple roles
  if (multipleRoles.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🔀 USERS WITH MULTIPLE ROLES (${multipleRoles.length}):`);
    console.log('These users have multiple active roles - sync would use FIRST role');
    console.log('═══════════════════════════════════════════════════════════════\n');

    multipleRoles.slice(0, 10).forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   ${user.roleCount} active roles`);
      console.log(`   Schools in roles: ${user.schools.join(', ')}`);
      console.log('');
    });

    if (multipleRoles.length > 10) {
      console.log(`   ... and ${multipleRoles.length - 10} more users\n`);
    }
  }

  // Safety recommendations
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('💡 SAFETY RECOMMENDATIONS:');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (wouldClear.length > 0) {
    console.log('❌ NOT SAFE TO SYNC - Would clear data for some users');
    console.log('   Action: Investigate why user_roles has NULL for these users\n');
  }

  if (multipleRoles.length > 0) {
    console.log('⚠️  CAUTION - Users with multiple roles need review');
    console.log('   Action: Determine which role should be the source of truth\n');
  }

  if (wouldUpdate.length > 0 && wouldClear.length === 0) {
    console.log('✅ SAFE to update these users (no data loss)');
    console.log(`   Would update ${wouldUpdate.length} users to match user_roles\n`);
  }

  console.log('\n🔒 NEXT STEPS:');
  console.log('1. Review the users that would change');
  console.log('2. Verify changes make sense (e.g., FNE users should have FNE school)');
  console.log('3. If safe, create a migration script with transaction rollback');
  console.log('4. Test on staging/dev environment first');
  console.log('5. Create backup before running on production\n');
}

analyzeSyncSafety().catch(console.error);
