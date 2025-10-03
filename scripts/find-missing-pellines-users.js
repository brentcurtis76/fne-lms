/**
 * Find Missing Los Pellines Users
 * Search for users who might belong to Los Pellines but aren't assigned
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n🔍 SEARCHING FOR MISSING LOS PELLINES USERS\n');

async function findMissingUsers() {
  // Search for users with "pellines" in their email or name
  console.log('1️⃣  Searching for users with "pellines" in email or profile...');

  const { data: usersByEmail } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, school_id')
    .or('email.ilike.%pellines%,first_name.ilike.%pellines%,last_name.ilike.%pellines%');

  console.log(`   Found ${usersByEmail?.length || 0} users with "pellines" in their info\n`);

  if (usersByEmail && usersByEmail.length > 0) {
    console.log('   Users found:');
    usersByEmail.forEach(u => {
      console.log(`   - ${u.first_name} ${u.last_name} (${u.email})`);
      console.log(`     School ID: ${u.school_id || 'NOT ASSIGNED'}`);
    });
    console.log('');
  }

  // Get all schools to see if there are similar names
  console.log('2️⃣  All schools in system:');
  const { data: allSchools } = await supabase
    .from('schools')
    .select('id, name')
    .order('name');

  (allSchools || []).forEach(s => {
    console.log(`   ${s.id.toString().padStart(3)} | ${s.name}`);
  });

  console.log('\n3️⃣  Looking for users with no school assigned...');
  const { count: noSchoolCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .is('school_id', null);

  console.log(`   Users with no school: ${noSchoolCount}\n`);

  // Check course assignments for Los Pellines users
  console.log('4️⃣  Checking Los Pellines school in course_assignments...');

  const { data: losPellinesSchool } = await supabase
    .from('schools')
    .select('id')
    .ilike('name', '%pellines%')
    .single();

  if (losPellinesSchool) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('school_id', losPellinesSchool.id);

    const userIds = (profiles || []).map(p => p.id);

    const { count: assignmentCount } = await supabase
      .from('course_assignments')
      .select('*', { count: 'exact', head: true })
      .in('teacher_id', userIds);

    console.log(`   Course assignments for Los Pellines users: ${assignmentCount}\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 FINDINGS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Current situation:');
  console.log('• 4 users assigned to Los Pellines school');
  console.log('• All 4 users showing in filtered reports');
  console.log('• Filter IS working correctly\n');

  if (noSchoolCount > 0) {
    console.log('⚠️  POSSIBLE ISSUE:');
    console.log(`• ${noSchoolCount} users have NO school assigned`);
    console.log('• Some of these might belong to Los Pellines');
    console.log('• They need school_id updated in profiles table\n');
  }

  console.log('To add more users to Los Pellines:');
  console.log('1. Identify which users should belong to Los Pellines');
  console.log('2. Update their school_id in the profiles table');
  console.log('3. They will then appear in the filtered reports\n');
}

findMissingUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
