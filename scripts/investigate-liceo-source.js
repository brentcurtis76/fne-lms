/**
 * Investigate Source of Liceo Juana Ross Data in Profiles
 * Determine how and when profiles.school_id was set incorrectly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateSource() {
  console.log('🔍 Investigating Source of Liceo Juana Ross in Profiles Table\n');

  // Get school IDs
  const { data: fneSchool } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%Fundación Nueva Educación%')
    .single();

  const { data: liceoSchool } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%Juana Ross%')
    .single();

  console.log(`FNE School ID: ${fneSchool.id}`);
  console.log(`Liceo School ID: ${liceoSchool.id}\n`);

  // Get all users with Liceo in profiles
  const { data: liceoProfileUsers } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, school_id, created_at, updated_at')
    .eq('school_id', liceoSchool.id)
    .order('created_at', { ascending: false });

  console.log(`📊 Total users with Liceo in profiles.school_id: ${liceoProfileUsers?.length || 0}\n`);

  // For each Liceo profile user, check their user_roles
  console.log('🔎 ANALYZING MISMATCH PATTERNS:\n');

  let fneEmailCount = 0;
  let correctLiceoCount = 0;
  let mismatchDetails = [];

  for (const profile of liceoProfileUsers || []) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('school_id, role_type, created_at')
      .eq('user_id', profile.id)
      .eq('is_active', true);

    const roleSchoolIds = [...new Set(userRoles?.map(r => r.school_id).filter(Boolean) || [])];
    const hasFneInRoles = roleSchoolIds.includes(fneSchool.id);
    const hasLiceoInRoles = roleSchoolIds.includes(liceoSchool.id);
    const hasFneEmail = profile.email?.includes('nuevaeducacion.org');

    if (hasFneEmail) {
      fneEmailCount++;
    }

    if (hasFneInRoles && !hasLiceoInRoles) {
      // This is a mismatch - profile says Liceo but roles say FNE
      mismatchDetails.push({
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        email: profile.email,
        profileSchool: 'Liceo',
        roleSchool: 'FNE',
        hasFneEmail,
        profileCreated: profile.created_at,
        profileUpdated: profile.updated_at
      });
    } else if (hasLiceoInRoles) {
      correctLiceoCount++;
    }
  }

  console.log(`SUMMARY:`);
  console.log(`- Users with @nuevaeducacion.org email but Liceo in profiles: ${fneEmailCount}`);
  console.log(`- Users correctly assigned to Liceo (in both tables): ${correctLiceoCount}`);
  console.log(`- Users with mismatch (Liceo in profiles, FNE in roles): ${mismatchDetails.length}\n`);

  console.log(`❌ MISMATCH DETAILS (${mismatchDetails.length} users):\n`);
  mismatchDetails.forEach((detail, index) => {
    console.log(`${index + 1}. ${detail.name} (${detail.email})`);
    console.log(`   profiles.school_id: Liceo`);
    console.log(`   user_roles.school_id: FNE`);
    console.log(`   Has @nuevaeducacion.org email: ${detail.hasFneEmail ? '✅' : '❌'}`);
    console.log(`   Profile created: ${detail.profileCreated}`);
    console.log(`   Profile updated: ${detail.profileUpdated || 'Never'}`);
    console.log('');
  });

  // Check if there's a default school being set somewhere
  console.log('\n🔧 CHECKING FOR DEFAULT SCHOOL LOGIC:\n');

  // Look at auth.users metadata to see if school_id is stored there
  const { data: authUsers } = await supabase
    .from('profiles')
    .select('id, email, school_id')
    .in('id', mismatchDetails.map(d => liceoProfileUsers.find(p => p.email === d.email)?.id).filter(Boolean))
    .limit(3);

  if (authUsers && authUsers.length > 0) {
    console.log('Sample users with Liceo in profiles:');
    authUsers.forEach(user => {
      console.log(`- ${user.email}: school_id = ${user.school_id} (Liceo ID)`);
    });
  }

  // Check if Liceo is the first school in the database (might be used as default)
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name, created_at')
    .order('id', { ascending: true })
    .limit(5);

  console.log('\n📋 First 5 schools in database (by ID):');
  schools?.forEach((school, index) => {
    const isLiceo = school.id === liceoSchool.id ? ' ⚠️ LICEO (Default?)' : '';
    console.log(`${index + 1}. ID ${school.id}: ${school.name}${isLiceo}`);
  });

  // Check for potential triggers or default value on profiles table
  console.log('\n\n💡 HYPOTHESIS:');
  console.log('If Liceo Juana Ross (ID: 1) is the first/default school, it might be:');
  console.log('1. Set as a database default value on profiles.school_id column');
  console.log('2. Used in signup/onboarding logic as a fallback');
  console.log('3. Set by a database trigger when profiles.school_id is NULL');
  console.log('\nRecommendation: Check database schema and triggers for profiles table');
}

investigateSource().catch(console.error);
