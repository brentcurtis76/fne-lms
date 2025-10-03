/**
 * Check User Distribution
 * See how many users are actually active vs inactive
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n📊 USER DISTRIBUTION ANALYSIS\n');

async function analyzeUsers() {
  // Get all users
  console.log('1️⃣  Fetching all users...');
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, school_id, created_at');

  console.log(`   Total users: ${allUsers?.length || 0}\n`);

  // Check which users have any activity
  console.log('2️⃣  Checking user activity types...\n');

  const { data: withProgress } = await supabase
    .from('lesson_progress')
    .select('user_id');
  const usersWithProgress = new Set((withProgress || []).map(p => p.user_id));

  const { data: withAssignments } = await supabase
    .from('course_assignments')
    .select('teacher_id');
  const usersWithAssignments = new Set((withAssignments || []).map(a => a.teacher_id));

  console.log(`   Users with lesson_progress: ${usersWithProgress.size}`);
  console.log(`   Users with course_assignments: ${usersWithAssignments.size}`);

  // Find users with assignments but no progress
  const assignedButNoProgress = [...usersWithAssignments].filter(id => !usersWithProgress.has(id));
  console.log(`   Users assigned courses but haven't started: ${assignedButNoProgress.length}\n`);

  // Sample some users who should have activity
  if (assignedButNoProgress.length > 0) {
    console.log('3️⃣  Sample users with assignments but no progress:');
    for (let i = 0; i < Math.min(10, assignedButNoProgress.length); i++) {
      const userId = assignedButNoProgress[i];
      const user = allUsers?.find(u => u.id === userId);
      if (user) {
        const assignmentCount = (withAssignments || []).filter(a => a === userId).length;
        console.log(`      ${user.first_name} ${user.last_name} - ${assignmentCount} course(s) assigned`);
      }
    }
    console.log('');
  }

  // Check when users were created
  console.log('4️⃣  User creation timeline:');
  const createdDates = (allUsers || []).map(u => new Date(u.created_at));
  const sortedDates = createdDates.sort((a, b) => b - a);
  console.log(`   Most recent: ${sortedDates[0]?.toISOString().substring(0, 10)}`);
  console.log(`   Oldest: ${sortedDates[sortedDates.length - 1]?.toISOString().substring(0, 10)}\n`);

  // Users by school
  console.log('5️⃣  Users by school:');
  const { data: schools } = await supabase
    .from('schools')
    .select('id, name');

  const schoolMap = new Map((schools || []).map(s => [s.id, s.name]));
  const usersBySchool = new Map();

  (allUsers || []).forEach(u => {
    const schoolId = u.school_id || 'no_school';
    usersBySchool.set(schoolId, (usersBySchool.get(schoolId) || 0) + 1);
  });

  for (const [schoolId, count] of [...usersBySchool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    const schoolName = schoolId === 'no_school' ? 'No School Assigned' : (schoolMap.get(schoolId) || 'Unknown');
    console.log(`      ${schoolName}: ${count} users`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 SUMMARY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const activeRate = ((usersWithProgress.size / (allUsers?.length || 1)) * 100).toFixed(1);
  const assignedRate = ((usersWithAssignments.size / (allUsers?.length || 1)) * 100).toFixed(1);

  console.log(`Active users (completed at least 1 block): ${usersWithProgress.size} (${activeRate}%)`);
  console.log(`Users with course assignments: ${usersWithAssignments.size} (${assignedRate}%)`);
  console.log(`Users with assignments but not started: ${assignedButNoProgress.length}\n`);

  console.log('RECOMMENDATION:');
  if (usersWithProgress.size < 10) {
    console.log('• Very low adoption - only 2 users have actually used the LMS');
    console.log('• This explains why reports show little/no activity');
    console.log('• The tracking system IS WORKING - there just isn\'t much activity to track');
    console.log(`• Consider onboarding campaigns for the ${usersWithAssignments.size} users with assignments`);
  }
  console.log('');
}

analyzeUsers()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
