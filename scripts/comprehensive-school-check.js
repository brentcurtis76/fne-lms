/**
 * Comprehensive School Assignment Check
 * Find ALL users and their actual school assignments vs profile school_id
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n🔍 COMPREHENSIVE SCHOOL ASSIGNMENT CHECK\n');

async function comprehensiveCheck() {
  // Get Los Pellines school ID
  const { data: losPellinesSchool } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%pellines%')
    .single();

  console.log(`Los Pellines School ID: ${losPellinesSchool.id}\n`);

  // Get ALL profiles
  console.log('1️⃣  Checking ALL user profiles...');
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, school_id');

  console.log(`   Total profiles: ${allProfiles?.length || 0}\n`);

  // Get ALL user_roles to check school assignments there
  console.log('2️⃣  Checking user_roles table for school assignments...');
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, school_id, role_type, is_active')
    .eq('is_active', true);

  console.log(`   Active user_roles records: ${userRoles?.length || 0}\n`);

  // Build map of users to their schools from user_roles
  const userSchoolMap = new Map();
  (userRoles || []).forEach(role => {
    if (role.school_id) {
      if (!userSchoolMap.has(role.user_id)) {
        userSchoolMap.set(role.user_id, []);
      }
      userSchoolMap.get(role.user_id).push(role.school_id);
    }
  });

  console.log(`   Users with school in user_roles: ${userSchoolMap.size}\n`);

  // Find Los Pellines users
  console.log('3️⃣  Finding ALL Los Pellines users...\n');

  const losPellinesUsers = [];

  (allProfiles || []).forEach(profile => {
    const schoolsFromRoles = userSchoolMap.get(profile.id) || [];
    const hasLosPellinesInProfile = profile.school_id === losPellinesSchool.id;
    const hasLosPellinesInRoles = schoolsFromRoles.includes(losPellinesSchool.id);

    if (hasLosPellinesInProfile || hasLosPellinesInRoles) {
      losPellinesUsers.push({
        ...profile,
        schoolsFromRoles,
        inProfile: hasLosPellinesInProfile,
        inRoles: hasLosPellinesInRoles
      });
    }
  });

  console.log(`   Found ${losPellinesUsers.length} Los Pellines users:\n`);
  console.log('   NAME                          | EMAIL                              | PROFILE | ROLES');
  console.log('   ' + '-'.repeat(100));

  losPellinesUsers.forEach(user => {
    const name = `${user.first_name} ${user.last_name}`.padEnd(29);
    const email = (user.email || 'no email').padEnd(34);
    const inProfile = user.inProfile ? '✓' : '✗';
    const inRoles = user.inRoles ? '✓' : '✗';
    console.log(`   ${name} | ${email} | ${inProfile.padEnd(7)} | ${inRoles}`);
  });

  // Check for discrepancies
  console.log('\n4️⃣  Checking for discrepancies...\n');

  const onlyInProfile = losPellinesUsers.filter(u => u.inProfile && !u.inRoles);
  const onlyInRoles = losPellinesUsers.filter(u => !u.inProfile && u.inRoles);

  if (onlyInProfile.length > 0) {
    console.log(`   ⚠️  ${onlyInProfile.length} users have Los Pellines in PROFILE but NOT in user_roles:`);
    onlyInProfile.forEach(u => {
      console.log(`      - ${u.first_name} ${u.last_name} (${u.email})`);
    });
    console.log('');
  }

  if (onlyInRoles.length > 0) {
    console.log(`   ⚠️  ${onlyInRoles.length} users have Los Pellines in USER_ROLES but NOT in profile:`);
    onlyInRoles.forEach(u => {
      console.log(`      - ${u.first_name} ${u.last_name} (${u.email})`);
      console.log(`         Current profile.school_id: ${u.school_id || 'NULL'}`);
    });
    console.log('');
  }

  // Check what the reports API actually uses
  console.log('5️⃣  Understanding report filtering logic...\n');

  console.log('   Reports API filters by: profile.school_id');
  console.log('   Users table has: user_roles.school_id\n');

  console.log('   ISSUE: There are TWO places where school is stored:');
  console.log('   1. profiles.school_id');
  console.log('   2. user_roles.school_id\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 ROOT CAUSE IDENTIFIED:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('TOTAL Los Pellines users found: ' + losPellinesUsers.length);
  console.log('Users with school in PROFILE: ' + losPellinesUsers.filter(u => u.inProfile).length);
  console.log('Users with school in ROLES: ' + losPellinesUsers.filter(u => u.inRoles).length);
  console.log('\nIf reports show fewer users than expected:');
  console.log('• Reports may be using profiles.school_id');
  console.log('• But school assignments may be in user_roles.school_id');
  console.log('• Need to sync these two sources\n');

  // Provide list of users to update
  if (onlyInRoles.length > 0) {
    console.log('ACTION NEEDED:');
    console.log('Update profiles.school_id for these users:\n');

    onlyInRoles.forEach(u => {
      console.log(`UPDATE profiles SET school_id = ${losPellinesSchool.id} WHERE id = '${u.id}'; -- ${u.first_name} ${u.last_name}`);
    });
    console.log('');
  }
}

comprehensiveCheck()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
