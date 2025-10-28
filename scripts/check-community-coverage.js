/**
 * Check Community Assignment Coverage
 * Shows how many users have vs don't have communities
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

async function checkCoverage() {
  console.log('📊 COMMUNITY ASSIGNMENT COVERAGE REPORT');
  console.log('='.repeat(60));

  // Total active roles
  const { count: totalRoles } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Roles with communities
  const { count: rolesWithCommunities } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .not('community_id', 'is', null)
    .eq('is_active', true);

  // Roles without communities
  const { count: rolesWithoutCommunities } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .is('community_id', null)
    .eq('is_active', true);

  // Roles with school but no community
  const { count: rolesWithSchoolNoCommunity } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .is('community_id', null)
    .not('school_id', 'is', null)
    .eq('is_active', true);

  // Roles without school
  const { count: rolesWithoutSchool } = await supabase
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .is('school_id', null)
    .eq('is_active', true);

  console.log('\n📈 OVERALL STATS');
  console.log('-'.repeat(60));
  console.log(`Total active user roles: ${totalRoles}`);
  console.log(`  ✅ With communities: ${rolesWithCommunities} (${((rolesWithCommunities/totalRoles)*100).toFixed(1)}%)`);
  console.log(`  ❌ Without communities: ${rolesWithoutCommunities} (${((rolesWithoutCommunities/totalRoles)*100).toFixed(1)}%)`);
  console.log('');
  console.log(`Breakdown of roles WITHOUT communities:`);
  console.log(`  - Have school, need community: ${rolesWithSchoolNoCommunity}`);
  console.log(`  - No school assigned: ${rolesWithoutSchool}`);

  // Get details by school for users without communities
  console.log('\n🏫 SCHOOLS WITH USERS NEEDING COMMUNITIES');
  console.log('-'.repeat(60));

  const { data: schoolBreakdown } = await supabase
    .from('user_roles')
    .select('school_id, schools(name)')
    .is('community_id', null)
    .not('school_id', 'is', null)
    .eq('is_active', true);

  const schoolCounts = {};
  schoolBreakdown?.forEach(role => {
    const schoolId = role.school_id;
    const schoolName = role.schools?.name || 'Unknown';
    if (!schoolCounts[schoolId]) {
      schoolCounts[schoolId] = { name: schoolName, count: 0 };
    }
    schoolCounts[schoolId].count++;
  });

  const sortedSchools = Object.entries(schoolCounts)
    .sort((a, b) => b[1].count - a[1].count);

  if (sortedSchools.length > 0) {
    sortedSchools.forEach(([schoolId, data]) => {
      console.log(`  ${data.name}: ${data.count} users (School ID: ${schoolId})`);
    });
  } else {
    console.log('  ✅ All users with schools have communities!');
  }

  // Check if communities exist for these schools
  if (sortedSchools.length > 0) {
    console.log('\n🔍 CHECKING IF COMMUNITIES EXIST FOR THESE SCHOOLS');
    console.log('-'.repeat(60));

    for (const [schoolId, data] of sortedSchools) {
      const { data: communities, error } = await supabase
        .from('growth_communities')
        .select('id, name')
        .eq('school_id', schoolId);

      if (communities && communities.length > 0) {
        console.log(`  ✅ ${data.name}: ${communities.length} community(ies) exist`);
        communities.forEach(c => {
          console.log(`     - ${c.name} (${c.id})`);
        });
        console.log(`     ⚠️  BUT ${data.count} users not assigned!`);
      } else {
        console.log(`  ❌ ${data.name}: NO communities exist`);
      }
    }
  }

  // Get breakdown by role type for users without communities
  console.log('\n👥 ROLE TYPES WITHOUT COMMUNITIES');
  console.log('-'.repeat(60));

  const { data: roleBreakdown } = await supabase
    .from('user_roles')
    .select('role_type')
    .is('community_id', null)
    .eq('is_active', true);

  const roleCounts = {};
  roleBreakdown?.forEach(role => {
    roleCounts[role.role_type] = (roleCounts[role.role_type] || 0) + 1;
  });

  const sortedRoles = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1]);

  sortedRoles.forEach(([roleType, count]) => {
    console.log(`  ${roleType}: ${count}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Report complete!');
  console.log('='.repeat(60) + '\n');
}

checkCoverage().catch(console.error);
