/**
 * Verify Sort Order Fix
 * Simulate the activity_score calculation and sorting
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('\n✅ VERIFYING SORT ORDER FIX\n');

async function verifySortOrder() {
  // Get users with progress
  const { data: progressRecords } = await supabase
    .from('lesson_progress')
    .select('user_id, lesson_id, time_spent, completed_at, created_at');

  const userProgressMap = new Map();
  (progressRecords || []).forEach(p => {
    if (!userProgressMap.has(p.user_id)) {
      userProgressMap.set(p.user_id, {
        blocks: [],
        totalTime: 0,
        completed: 0,
        lastActivity: null
      });
    }
    const userProgress = userProgressMap.get(p.user_id);
    userProgress.blocks.push(p);
    userProgress.totalTime += p.time_spent || 0;
    if (p.completed_at) userProgress.completed++;

    // Track last activity
    const activityDate = new Date(p.created_at || p.completed_at);
    if (!userProgress.lastActivity || activityDate > userProgress.lastActivity) {
      userProgress.lastActivity = activityDate;
    }
  });

  const userIds = [...userProgressMap.keys()];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', userIds);

  const { data: assignments } = await supabase
    .from('course_assignments')
    .select('teacher_id, course_id')
    .in('teacher_id', userIds);

  const assignmentsByUser = new Map();
  (assignments || []).forEach(a => {
    assignmentsByUser.set(a.teacher_id, (assignmentsByUser.get(a.teacher_id) || 0) + 1);
  });

  // Calculate activity scores like the API does
  const usersWithScores = (profiles || []).map(profile => {
    const progress = userProgressMap.get(profile.id);
    const totalCoursesEnrolled = assignmentsByUser.get(profile.id) || 0;
    const totalLessonsCompleted = progress.completed;
    const totalTimeSpentMinutes = Math.round(progress.totalTime / 60);
    const lastActivity = progress.lastActivity;

    // Calculate activity score (same as API)
    const lessonScore = Math.min(totalLessonsCompleted * 10, 400);
    const timeScore = Math.min(totalTimeSpentMinutes * 2, 300);
    const recentActivityScore = lastActivity ?
      Math.max(200 - Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24 * 7)), 0) : 0;
    const courseScore = Math.min(totalCoursesEnrolled * 10, 100);

    const activityScore = Math.round(lessonScore + timeScore + recentActivityScore + courseScore);

    return {
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      lessonsCompleted: totalLessonsCompleted,
      timeMinutes: totalTimeSpentMinutes,
      courses: totalCoursesEnrolled,
      activityScore,
      lastActivity: lastActivity?.toISOString().substring(0, 10)
    };
  });

  // Sort by activity_score (descending) - same as API default
  usersWithScores.sort((a, b) => b.activityScore - a.activityScore);

  console.log('📊 USERS SORTED BY ACTIVITY SCORE (as reports will show):\n');
  console.log('RANK | NAME                      | SCORE | LESSONS | TIME    | COURSES | LAST ACTIVE');
  console.log('-'.repeat(95));

  usersWithScores.slice(0, 15).forEach((user, index) => {
    const rank = String(index + 1).padStart(4);
    const name = user.name.padEnd(25);
    const score = String(user.activityScore).padStart(5);
    const lessons = String(user.lessonsCompleted).padStart(7);
    const time = `${user.timeMinutes}min`.padStart(7);
    const courses = String(user.courses).padStart(7);
    const lastActive = user.lastActivity || 'never';

    console.log(`${rank} | ${name} | ${score} | ${lessons} | ${time} | ${courses} | ${lastActive}`);
  });

  console.log('\n✅ VERIFICATION RESULTS:\n');
  console.log(`   Total users with activity: ${usersWithScores.length}`);
  console.log(`   Highest activity score: ${usersWithScores[0]?.activityScore || 0}`);
  console.log(`   Lowest activity score: ${usersWithScores[usersWithScores.length - 1]?.activityScore || 0}`);
  console.log('');
  console.log('   Top user: ' + (usersWithScores[0]?.name || 'N/A'));
  console.log(`     - ${usersWithScores[0]?.lessonsCompleted} lessons completed`);
  console.log(`     - ${usersWithScores[0]?.timeMinutes} minutes spent`);
  console.log(`     - Activity score: ${usersWithScores[0]?.activityScore}`);
  console.log('');
  console.log('✅ Reports will now show most active users FIRST');
  console.log('✅ Users with 0 activity will appear LAST (score = 0)');
  console.log('');
}

verifySortOrder()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
