/**
 * Identify Users Needing School Assignment in user_roles
 * Shows users who have school in profiles but NULL in user_roles
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function identifyUsersNeedingAssignment() {
  console.log('🔍 Identifying Users Needing School Assignment in user_roles\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get all profiles with school_id
  const { data: profilesWithSchool } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, school_id')
    .not('school_id', 'is', null);

  console.log(`📊 Users with school in profiles: ${profilesWithSchool?.length || 0}\n`);

  // Get all user_roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, school_id, role_type')
    .eq('is_active', true);

  // Get school names
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name');

  const schoolMap = new Map(schools?.map(s => [s.id, s.name]) || []);

  // Group by school
  const needsAssignmentBySchool = new Map();

  for (const profile of profilesWithSchool || []) {
    // Check if user has school_id in any active role
    const userRolesData = userRoles?.filter(r => r.user_id === profile.id) || [];
    const hasSchoolInRole = userRolesData.some(r => r.school_id !== null);

    if (!hasSchoolInRole && userRolesData.length > 0) {
      // User has active roles but school_id is NULL in all of them
      const schoolName = schoolMap.get(profile.school_id) || 'Unknown';

      if (!needsAssignmentBySchool.has(schoolName)) {
        needsAssignmentBySchool.set(schoolName, []);
      }

      needsAssignmentBySchool.get(schoolName).push({
        id: profile.id,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        email: profile.email,
        school_id: profile.school_id,
        roles: userRolesData.map(r => r.role_type)
      });
    }
  }

  // Sort schools by number of users needing assignment
  const sortedSchools = Array.from(needsAssignmentBySchool.entries())
    .sort((a, b) => b[1].length - a[1].length);

  console.log('📋 USERS NEEDING SCHOOL ASSIGNMENT BY SCHOOL:\n');
  console.log('These users have school in profiles but NULL in user_roles\n');

  let totalUsers = 0;
  sortedSchools.forEach(([schoolName, users]) => {
    totalUsers += users.length;
    console.log(`\n🏫 ${schoolName} (${users.length} users):`);
    console.log('─'.repeat(60));

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Roles: ${user.roles.join(', ')}`);
    });
  });

  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Total users needing assignment: ${totalUsers}`);
  console.log(`Schools affected: ${sortedSchools.length}\n`);

  // Check if it's safe to assign
  console.log('🔒 SAFETY CHECK:\n');

  let allSafe = true;
  const warnings = [];

  sortedSchools.forEach(([schoolName, users]) => {
    // Check if any user has multiple roles with different schools
    users.forEach(user => {
      const userAllRoles = userRoles?.filter(r => r.user_id === user.id) || [];
      const schoolsInRoles = [...new Set(userAllRoles.map(r => r.school_id).filter(Boolean))];

      if (schoolsInRoles.length > 1) {
        allSafe = false;
        warnings.push(`⚠️  ${user.name}: Has multiple different schools in roles - needs manual review`);
      }
    });
  });

  if (allSafe && totalUsers > 0) {
    console.log('✅ SAFE to assign all users - no conflicts detected\n');
    console.log('Recommended action:');
    console.log('1. Create SQL script to UPDATE user_roles.school_id = profiles.school_id');
    console.log('2. WHERE user_roles.school_id IS NULL AND user_roles.is_active = true');
    console.log('3. Test on staging first');
    console.log('4. Run on production with transaction + rollback capability\n');
  } else if (warnings.length > 0) {
    console.log('⚠️  WARNINGS - Manual review needed:\n');
    warnings.forEach(w => console.log(w));
  } else {
    console.log('✅ No users need assignment - all data is consistent\n');
  }

  // Generate SQL preview
  if (totalUsers > 0) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('📝 SQL PREVIEW (first 10 users):');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let count = 0;
    for (const [schoolName, users] of sortedSchools) {
      for (const user of users) {
        if (count >= 10) break;
        console.log(`-- ${user.name} → ${schoolName}`);
        console.log(`UPDATE user_roles SET school_id = ${user.school_id}`);
        console.log(`WHERE user_id = '${user.id}' AND school_id IS NULL AND is_active = true;\n`);
        count++;
      }
      if (count >= 10) break;
    }

    if (totalUsers > 10) {
      console.log(`... and ${totalUsers - 10} more users\n`);
    }
  }
}

identifyUsersNeedingAssignment().catch(console.error);
