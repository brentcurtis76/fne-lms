/**
 * Check FNE Users - Profiles vs User_Roles Mismatch
 * Identifies users where profiles.school_id differs from user_roles.school_id
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMismatch() {
  console.log('🔍 Checking FNE Users - Profile vs Role School Mismatch\n');

  // Get FNE school ID
  const { data: fneSchool } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%Fundación Nueva Educación%')
    .single();

  console.log(`📚 FNE School: ${fneSchool.name} (ID: ${fneSchool.id})\n`);

  // Get Liceo Juana Ross school ID
  const { data: liceoSchool } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%Juana Ross%')
    .single();

  console.log(`📚 Liceo School: ${liceoSchool.name} (ID: ${liceoSchool.id})\n`);

  // Get users who have FNE in user_roles
  const { data: fneRoleUsers } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('school_id', fneSchool.id)
    .eq('is_active', true);

  const fneRoleUserIds = fneRoleUsers?.map(r => r.user_id) || [];

  console.log(`👥 Users with FNE in user_roles: ${fneRoleUserIds.length}\n`);

  // Get their profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, school_id')
    .in('id', fneRoleUserIds);

  // Get school names for profiles
  const schoolIds = [...new Set(profiles?.map(p => p.school_id).filter(Boolean) || [])];
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name')
    .in('id', schoolIds);

  const schoolMap = new Map(schools?.map(s => [s.id, s.name]) || []);

  // Show mismatches
  console.log('❌ MISMATCHES (user_roles says FNE, but profiles shows different school):\n');

  let mismatchCount = 0;
  profiles?.forEach(profile => {
    const profileSchoolName = schoolMap.get(profile.school_id) || 'Sin escuela';

    if (profile.school_id !== fneSchool.id) {
      mismatchCount++;
      console.log(`${mismatchCount}. ${profile.first_name} ${profile.last_name} (${profile.email})`);
      console.log(`   user_roles.school_id: FNE (${fneSchool.id})`);
      console.log(`   profiles.school_id: ${profileSchoolName} (${profile.school_id})`);
      console.log('');
    }
  });

  if (mismatchCount === 0) {
    console.log('✅ No mismatches found!\n');
  } else {
    console.log(`\n📊 Total Mismatches: ${mismatchCount} out of ${fneRoleUserIds.length} users\n`);
  }

  // Check specific users visible in screenshot
  console.log('🔎 CHECKING SPECIFIC USERS FROM SCREENSHOT:\n');

  const testUsers = [
    'mdelfresno@nuevaeducacion.org',
    'brent@perrotuertocm.cl',
    'tom@nuevaeducacion.org'
  ];

  for (const email of testUsers) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, school_id')
      .eq('email', email)
      .single();

    if (!profile) {
      console.log(`❌ ${email} - NOT FOUND`);
      continue;
    }

    const { data: userRole } = await supabase
      .from('user_roles')
      .select('school_id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .not('school_id', 'is', null)
      .single();

    const profileSchoolName = schoolMap.get(profile.school_id) || 'Sin escuela';
    const roleSchoolName = userRole?.school_id === fneSchool.id ? 'FNE' :
                           userRole?.school_id === liceoSchool.id ? 'Liceo Juana Ross' :
                           'Unknown';

    console.log(`${profile.first_name} ${profile.last_name} (${email})`);
    console.log(`  profiles.school_id: ${profileSchoolName}`);
    console.log(`  user_roles.school_id: ${roleSchoolName}`);
    console.log(`  MATCH: ${profile.school_id === userRole?.school_id ? '✅' : '❌'}\n`);
  }
}

checkMismatch().catch(console.error);
