/**
 * Activity Score Rebalancing Verification
 *
 * This script demonstrates that the new activity score formula prevents
 * time-spent from outweighing actual lesson completions.
 *
 * OLD FORMULA:
 * - lessonScore = min(lessons * 10, 500) = 50%
 * - timeScore = min(minutes * 1.33, 200) = 20% (linear)
 * - recentActivityScore = 200 max = 20%
 * - courseScore = min(courses * 10, 100) = 10%
 *
 * NEW FORMULA:
 * - lessonScore = min(lessons * 60, 600) = 60%
 * - timeScore = min(sqrt(minutes) * 8, 120) = 12% (diminishing returns)
 * - recentActivityScore = 200 max = 20%
 * - courseScore = min(courses * 10, 80) = 8%
 */

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(color, symbol, message) {
  console.log(`${color}${symbol}${colors.reset} ${message}`);
}

// OLD FORMULA
function calculateOldScore(lessons, minutes, courses, recentActivity = 200) {
  const lessonScore = Math.min(lessons * 10, 500);
  const timeScore = Math.min(minutes * 1.33, 200);
  const recentActivityScore = recentActivity;
  const courseScore = Math.min(courses * 10, 100);
  return Math.round(lessonScore + timeScore + recentActivityScore + courseScore);
}

// NEW FORMULA
function calculateNewScore(lessons, minutes, courses, recentActivity = 200) {
  const lessonScore = Math.min(lessons * 60, 600);
  const timeScore = Math.min(Math.round(Math.sqrt(minutes) * 8), 120);
  const recentActivityScore = recentActivity;
  const courseScore = Math.min(courses * 10, 80);
  return Math.round(lessonScore + timeScore + recentActivityScore + courseScore);
}

function displayScoreBreakdown(label, lessons, minutes, courses, recentActivity = 200) {
  console.log('\n' + '─'.repeat(70));
  log(colors.cyan, '👤', `${colors.bold}${label}${colors.reset}`);
  console.log('─'.repeat(70));

  console.log(`  Lessons: ${lessons} | Time: ${minutes} min | Courses: ${courses}`);

  // OLD FORMULA
  const oldLessonScore = Math.min(lessons * 10, 500);
  const oldTimeScore = Math.min(minutes * 1.33, 200);
  const oldRecentScore = recentActivity;
  const oldCourseScore = Math.min(courses * 10, 100);
  const oldTotal = calculateOldScore(lessons, minutes, courses, recentActivity);

  console.log(`\n  ${colors.yellow}OLD FORMULA:${colors.reset}`);
  console.log(`    Lessons:  ${oldLessonScore.toFixed(0).padStart(3)} pts (${lessons} × 10)`);
  console.log(`    Time:     ${oldTimeScore.toFixed(0).padStart(3)} pts (${minutes} × 1.33, linear)`);
  console.log(`    Recent:   ${oldRecentScore.toFixed(0).padStart(3)} pts`);
  console.log(`    Courses:  ${oldCourseScore.toFixed(0).padStart(3)} pts (${courses} × 10)`);
  console.log(`    ${colors.yellow}TOTAL:    ${oldTotal} pts${colors.reset}`);

  // NEW FORMULA
  const newLessonScore = Math.min(lessons * 60, 600);
  const newTimeScore = Math.min(Math.round(Math.sqrt(minutes) * 8), 120);
  const newRecentScore = recentActivity;
  const newCourseScore = Math.min(courses * 10, 80);
  const newTotal = calculateNewScore(lessons, minutes, courses, recentActivity);

  console.log(`\n  ${colors.green}NEW FORMULA:${colors.reset}`);
  console.log(`    Lessons:  ${newLessonScore.toFixed(0).padStart(3)} pts (${lessons} × 60)`);
  console.log(`    Time:     ${newTimeScore.toFixed(0).padStart(3)} pts (√${minutes} × 8, sqrt curve)`);
  console.log(`    Recent:   ${newRecentScore.toFixed(0).padStart(3)} pts`);
  console.log(`    Courses:  ${newCourseScore.toFixed(0).padStart(3)} pts (${courses} × 10)`);
  console.log(`    ${colors.green}TOTAL:    ${newTotal} pts${colors.reset}`);

  return { oldTotal, newTotal };
}

function runVerification() {
  console.log('\n' + '='.repeat(70));
  log(colors.cyan, '🎯', `${colors.bold}Activity Score Rebalancing Verification${colors.reset}`);
  console.log('='.repeat(70));

  // TEST CASE 1: The gaming scenario (1 lesson + idle time)
  log(colors.blue, '\n📊', 'TEST CASE 1: Gaming Scenario (1 lesson + 300 min idle time)');
  const userA = displayScoreBreakdown(
    'User A: 1 lesson, 300 minutes, 2 courses',
    1,    // lessons
    300,  // minutes (idle time)
    2,    // courses
    200   // recent activity
  );

  // TEST CASE 2: Real progress (4 lessons + reasonable time)
  log(colors.blue, '\n📊', 'TEST CASE 2: Real Progress (4 lessons + 60 min active time)');
  const userB = displayScoreBreakdown(
    'User B: 4 lessons, 60 minutes, 2 courses',
    4,   // lessons
    60,  // minutes (active learning)
    2,   // courses
    200  // recent activity
  );

  // TEST CASE 3: High achiever (10 lessons + moderate time)
  log(colors.blue, '\n📊', 'TEST CASE 3: High Achiever (10 lessons + 150 min)');
  const userC = displayScoreBreakdown(
    'User C: 10 lessons, 150 minutes, 3 courses',
    10,  // lessons
    150, // minutes
    3,   // courses
    200  // recent activity
  );

  // VERIFICATION RESULTS
  console.log('\n' + '='.repeat(70));
  log(colors.cyan, '✓', `${colors.bold}VERIFICATION RESULTS${colors.reset}`);
  console.log('='.repeat(70) + '\n');

  // Test 1: User B should now rank higher than User A
  const test1Pass = userB.newTotal > userA.newTotal;
  const test1OldFail = userA.oldTotal > userB.oldTotal;

  if (test1Pass && test1OldFail) {
    log(colors.green, '✓', `TEST 1 PASSED: Real progress now ranks higher than gaming`);
    console.log(`  OLD: User A (${userA.oldTotal}) > User B (${userB.oldTotal}) ❌ WRONG`);
    console.log(`  NEW: User B (${userB.newTotal}) > User A (${userA.newTotal}) ✓ CORRECT`);
  } else {
    log(colors.red, '✗', `TEST 1 FAILED: Real progress should rank higher`);
  }

  // Test 2: Lesson completions should dominate scoring
  console.log();
  const lessonDominanceOld = ((userC.oldTotal - userA.oldTotal) / userC.oldTotal * 100).toFixed(1);
  const lessonDominanceNew = ((userC.newTotal - userA.newTotal) / userC.newTotal * 100).toFixed(1);

  const test2Pass = lessonDominanceNew > lessonDominanceOld;

  if (test2Pass) {
    log(colors.green, '✓', `TEST 2 PASSED: Lesson completions dominate scoring`);
    console.log(`  User C vs User A score difference: ${lessonDominanceOld}% (old) → ${lessonDominanceNew}% (new)`);
  } else {
    log(colors.red, '✗', `TEST 2 FAILED: Lessons should have greater weight`);
  }

  // Test 3: Time spent uses diminishing returns
  console.log();
  // Test with values that won't hit the 120pt cap
  const time25 = Math.round(Math.sqrt(25) * 8);    // 40 pts (uncapped)
  const time100 = Math.round(Math.sqrt(100) * 8);  // 80 pts (uncapped)
  const time144 = Math.round(Math.sqrt(144) * 8);  // 96 pts (uncapped, just before cap)

  // Capped values
  const time25Capped = Math.min(time25, 120);
  const time100Capped = Math.min(time100, 120);
  const time225Capped = Math.min(Math.round(Math.sqrt(225) * 8), 120); // 120 pts (hits cap)

  // Diminishing returns means: gain from 25→100 should be GREATER than gain from 100→144
  // (Earlier minutes give more points per minute than later minutes)
  const firstGain = time100 - time25;      // 40 pts for 75 minutes
  const secondGain = time144 - time100;    // 16 pts for 44 minutes
  const test3Pass = firstGain > secondGain;

  if (test3Pass) {
    log(colors.green, '✓', `TEST 3 PASSED: Diminishing returns on time spent`);
    console.log(`  Uncapped curve: 25 min → ${time25} pts | 100 min → ${time100} pts | 144 min → ${time144} pts`);
    console.log(`  Gain from 25→100 min (75 min): ${firstGain} pts`);
    console.log(`  Gain from 100→144 min (44 min): ${secondGain} pts`);
    console.log(`  ✓ Earlier minutes give more points (${firstGain} > ${secondGain})`);
    console.log(`  Cap at 120 pts reached at 225 minutes (√225 × 8 = ${Math.round(Math.sqrt(225) * 8)})`);
  } else {
    log(colors.red, '✗', `TEST 3 FAILED: Time should have diminishing returns`);
    console.log(`  First gain: ${firstGain} pts | Second gain: ${secondGain} pts`);
  }

  // SUMMARY
  console.log('\n' + '='.repeat(70));
  const allPass = test1Pass && test2Pass && test3Pass;

  if (allPass) {
    log(colors.green, '🎉', `${colors.bold}ALL TESTS PASSED - Activity score rebalancing verified!${colors.reset}`);
    console.log('='.repeat(70) + '\n');
    process.exit(0);
  } else {
    log(colors.red, '❌', `${colors.bold}SOME TESTS FAILED - Review rebalancing logic${colors.reset}`);
    console.log('='.repeat(70) + '\n');
    process.exit(1);
  }
}

runVerification();
