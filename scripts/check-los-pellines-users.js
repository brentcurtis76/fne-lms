/**
 * Check Los Pellines Users
 * Verify how many users actually belong to Los Pellines school
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n🔍 INVESTIGATING LOS PELLINES FILTER ISSUE\n');

async function checkLosPellines() {
  // Find Los Pellines school ID
  console.log('1️⃣  Finding Los Pellines school...');
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name')
    .ilike('name', '%pellines%');

  if (!schools || schools.length === 0) {
    console.log('   ❌ Los Pellines school not found!\n');
    return;
  }

  const losPellinesSchool = schools[0];
  console.log(`   ✅ Found: ${losPellinesSchool.name} (ID: ${losPellinesSchool.id})\n`);

  // Count total users from Los Pellines
  console.log('2️⃣  Counting all users from Los Pellines...');
  const { data: allUsers, count: totalCount } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, school_id', { count: 'exact' })
    .eq('school_id', losPellinesSchool.id);

  console.log(`   Total users: ${totalCount}\n`);

  // Check which users have progress
  console.log('3️⃣  Checking which users have lesson progress...');
  const userIds = (allUsers || []).map(u => u.id);

  const { data: progressRecords } = await supabase
    .from('lesson_progress')
    .select('user_id')
    .in('user_id', userIds);

  const usersWithProgress = new Set((progressRecords || []).map(p => p.user_id));
  console.log(`   Users with progress: ${usersWithProgress.size}\n`);

  // Check which users have course assignments
  console.log('4️⃣  Checking which users have course assignments...');
  const { data: assignments } = await supabase
    .from('course_assignments')
    .select('teacher_id')
    .in('teacher_id', userIds);

  const usersWithAssignments = new Set((assignments || []).map(a => a.teacher_id));
  console.log(`   Users with assignments: ${usersWithAssignments.size}\n`);

  // List all users and their status
  console.log('5️⃣  Full user list:\n');
  console.log('   NAME                      | HAS PROGRESS | HAS ASSIGNMENTS');
  console.log('   ' + '-'.repeat(70));

  (allUsers || []).forEach(user => {
    const name = `${user.first_name} ${user.last_name}`.padEnd(25);
    const hasProgress = usersWithProgress.has(user.id) ? '✓' : '✗';
    const hasAssignments = usersWithAssignments.has(user.id) ? '✓' : '✗';
    console.log(`   ${name} | ${hasProgress.padEnd(12)} | ${hasAssignments}`);
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 SUMMARY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Total users in Los Pellines: ${totalCount}`);
  console.log(`Users visible in reports (filtered): 4`);
  console.log(`\nPOTENTIAL ISSUES:`);

  if (totalCount > 4) {
    console.log(`• Reports showing only 4 out of ${totalCount} users`);
    console.log(`• Missing ${totalCount - 4} users from results`);
    console.log('\nPOSSIBLE CAUSES:');
    console.log('• Report query may have additional filters');
    console.log('• RLS policies may be blocking access');
    console.log('• Users may not meet certain criteria (active, has assignments, etc.)');
  }

  console.log('\n');
}

checkLosPellines()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
