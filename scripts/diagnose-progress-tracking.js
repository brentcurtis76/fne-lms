/**
 * FNE LMS Progress Tracking Diagnostic Script
 *
 * This script queries the production Supabase database to definitively identify
 * the root cause of missing progress data in reports.
 *
 * Usage: node scripts/diagnose-progress-tracking.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Supabase connection using service role key (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ ERROR: Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🔍 FNE LMS PROGRESS TRACKING DIAGNOSTIC REPORT');
console.log('='.repeat(80));
console.log(`📅 Date: ${new Date().toISOString()}`);
console.log(`🌐 Database: ${supabaseUrl}`);
console.log('='.repeat(80));
console.log('');

async function runDiagnostics() {
  const results = {
    lessonProgress: {},
    courseAssignments: {},
    sessions: {},
    sampleData: {},
    conclusion: ''
  };

  try {
    // ========================================================================
    // QUERY 1: Check if ANY progress data exists
    // ========================================================================
    console.log('📊 QUERY 1: Checking lesson_progress table...');

    const { count: progressCount, error: countError } = await supabase
      .from('lesson_progress')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error querying lesson_progress:', countError.message);
      results.lessonProgress.error = countError.message;
    } else {
      console.log(`✅ Total lesson_progress records: ${progressCount || 0}`);
      results.lessonProgress.totalRecords = progressCount || 0;
    }
    console.log('');

    // ========================================================================
    // QUERY 2: Check time_spent statistics
    // ========================================================================
    console.log('⏱️  QUERY 2: Analyzing time_spent values...');

    // Get sample data to calculate manually
    const { data: progressSamples, error: sampleError } = await supabase
      .from('lesson_progress')
      .select('time_spent, completed_at')
      .limit(1000);

    if (sampleError) {
      console.error('❌ Error fetching progress samples:', sampleError.message);
      results.lessonProgress.timeStatsError = sampleError.message;
    } else if (progressSamples && progressSamples.length > 0) {
      const timeValues = progressSamples.map(p => p.time_spent || 0);
      const nonZero = timeValues.filter(t => t > 0).length;
      const completed = progressSamples.filter(p => p.completed_at).length;

      console.log(`   Min time_spent: ${Math.min(...timeValues)} seconds`);
      console.log(`   Max time_spent: ${Math.max(...timeValues)} seconds`);
      console.log(`   Avg time_spent: ${(timeValues.reduce((a,b) => a+b, 0) / timeValues.length).toFixed(2)} seconds`);
      console.log(`   Non-zero values: ${nonZero} / ${progressSamples.length}`);
      console.log(`   Completed blocks: ${completed}`);

      results.lessonProgress.minTime = Math.min(...timeValues);
      results.lessonProgress.maxTime = Math.max(...timeValues);
      results.lessonProgress.avgTime = timeValues.reduce((a,b) => a+b, 0) / timeValues.length;
      results.lessonProgress.nonZeroCount = nonZero;
      results.lessonProgress.completedCount = completed;
      results.lessonProgress.sampleSize = progressSamples.length;
    } else {
      console.log('⚠️  No progress data to analyze');
      results.lessonProgress.avgTime = 0;
      results.lessonProgress.nonZeroCount = 0;
    }
    console.log('');

    // ========================================================================
    // QUERY 3: Get recent progress entries
    // ========================================================================
    console.log('📋 QUERY 3: Recent lesson_progress entries (last 10)...');

    const { data: recentProgress, error: recentError } = await supabase
      .from('lesson_progress')
      .select('user_id, lesson_id, block_id, completed_at, time_spent, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error fetching recent progress:', recentError.message);
    } else if (recentProgress && recentProgress.length > 0) {
      console.log(`✅ Found ${recentProgress.length} recent entries:`);
      recentProgress.forEach((entry, index) => {
        const timeSpentMin = ((entry.time_spent || 0) / 60).toFixed(1);
        const completedStatus = entry.completed_at ? '✓ Completed' : '○ In Progress';
        console.log(`   ${index + 1}. ${completedStatus} | ${timeSpentMin} min | ${entry.created_at?.substring(0, 19)}`);
      });
      results.sampleData.recentProgress = recentProgress;
    } else {
      console.log('⚠️  No progress entries found in database');
      results.sampleData.recentProgress = [];
    }
    console.log('');

    // ========================================================================
    // QUERY 4: Check users with progress
    // ========================================================================
    console.log('👥 QUERY 4: User progress statistics...');

    const { data: allProgress, error: allProgressError } = await supabase
      .from('lesson_progress')
      .select('user_id, time_spent, completed_at');

    if (!allProgressError && allProgress) {
      const uniqueUsers = new Set(allProgress.map(p => p.user_id)).size;
      const totalSeconds = allProgress.reduce((sum, p) => sum + (p.time_spent || 0), 0);
      const completedBlocks = allProgress.filter(p => p.completed_at).length;

      console.log(`   Users with progress: ${uniqueUsers}`);
      console.log(`   Total progress records: ${allProgress.length}`);
      console.log(`   Total time tracked: ${(totalSeconds / 60).toFixed(0)} minutes`);
      console.log(`   Completed blocks: ${completedBlocks}`);

      results.lessonProgress.uniqueUsers = uniqueUsers;
      results.lessonProgress.totalTimeMinutes = Math.round(totalSeconds / 60);
    }
    console.log('');

    // ========================================================================
    // QUERY 5: Check course_assignments
    // ========================================================================
    console.log('📚 QUERY 5: Course assignments status...');

    const { data: assignments, error: assignmentsError } = await supabase
      .from('course_assignments')
      .select('teacher_id, course_id, status, progress_percentage');

    if (assignmentsError) {
      console.error('❌ Error querying course_assignments:', assignmentsError.message);
      results.courseAssignments.error = assignmentsError.message;
    } else if (assignments) {
      const uniqueUsers = new Set(assignments.map(a => a.teacher_id)).size;
      const completed = assignments.filter(a => a.status === 'completed').length;
      const avgProgress = assignments.reduce((sum, a) => sum + (a.progress_percentage || 0), 0) / assignments.length;

      console.log(`   Total assignments: ${assignments.length}`);
      console.log(`   Unique users enrolled: ${uniqueUsers}`);
      console.log(`   Completed courses: ${completed}`);
      console.log(`   Average progress: ${avgProgress.toFixed(1)}%`);

      results.courseAssignments = {
        totalAssignments: assignments.length,
        uniqueUsers,
        completed,
        avgProgress: avgProgress.toFixed(1)
      };
    }
    console.log('');

    // ========================================================================
    // QUERY 6: Check learning_path_progress_sessions table
    // ========================================================================
    console.log('🔄 QUERY 6: Learning path sessions...');

    const { count: sessionsCount, error: sessionsError } = await supabase
      .from('learning_path_progress_sessions')
      .select('*', { count: 'exact', head: true });

    if (sessionsError) {
      if (sessionsError.message.includes('does not exist')) {
        console.log('⚠️  learning_path_progress_sessions table does NOT exist');
        console.log('   → Migrations 013-015 have not been applied to production');
        results.sessions.exists = false;
        results.sessions.needsMigration = true;
      } else {
        console.error('❌ Error querying sessions:', sessionsError.message);
        results.sessions.error = sessionsError.message;
      }
    } else {
      console.log(`✅ Sessions table exists with ${sessionsCount || 0} records`);
      results.sessions.exists = true;
      results.sessions.count = sessionsCount || 0;
    }
    console.log('');

    // ========================================================================
    // QUERY 7: Check for blocks table data
    // ========================================================================
    console.log('🧱 QUERY 7: Blocks availability...');

    const { count: blocksCount, error: blocksError } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true });

    if (blocksError) {
      console.error('❌ Error querying blocks:', blocksError.message);
    } else {
      console.log(`✅ Total blocks in system: ${blocksCount || 0}`);
      results.sampleData.blocksCount = blocksCount || 0;
    }
    console.log('');

    // ========================================================================
    // ANALYSIS & CONCLUSION
    // ========================================================================
    console.log('='.repeat(80));
    console.log('🎯 DEFINITIVE ROOT CAUSE ANALYSIS');
    console.log('='.repeat(80));
    console.log('');

    // Determine root cause based on data
    if (results.lessonProgress.totalRecords === 0) {
      console.log('🔴 ROOT CAUSE IDENTIFIED: RC1 - NO DATA BEING SAVED');
      console.log('');
      console.log('Evidence:');
      console.log('  • lesson_progress table has 0 records');
      console.log('  • No user activity is being tracked');
      console.log('');
      console.log('Likely Issues:');
      console.log('  1. Client-side progress tracking code not executing');
      console.log('  2. JavaScript errors preventing upsert calls');
      console.log('  3. RLS policies blocking INSERT operations');
      console.log('  4. Students not actually viewing/completing lessons');
      console.log('');
      console.log('Next Steps:');
      console.log('  → Use Chrome DevTools to monitor network requests');
      console.log('  → Add console.log to updateProgress() function');
      console.log('  → Check browser console for errors');
      console.log('  → Verify RLS INSERT policy on lesson_progress table');

      results.conclusion = 'RC1: No data being saved';

    } else if (results.lessonProgress.avgTime === 0 || results.lessonProgress.nonZeroCount === 0) {
      console.log('🟡 ROOT CAUSE IDENTIFIED: RC2 - TIME TRACKING BUG');
      console.log('');
      console.log('Evidence:');
      console.log(`  • lesson_progress has ${results.lessonProgress.totalRecords} records`);
      console.log(`  • But time_spent is always 0 or very low`);
      console.log('');
      console.log('Likely Issues:');
      console.log('  1. startTime state not being set correctly');
      console.log('  2. Time calculation logic has a bug');
      console.log('  3. timeSpent parameter not passed to upsert');
      console.log('');
      console.log('Next Steps:');
      console.log('  → Fix time calculation in updateProgress() function');
      console.log('  → Verify Date.now() - startTime logic');
      console.log('  → Test with actual lesson completion');

      results.conclusion = 'RC2: Time tracking calculation bug';

    } else if (!results.sessions.exists) {
      console.log('🟠 ROOT CAUSE IDENTIFIED: RC4 - MIGRATIONS NOT APPLIED');
      console.log('');
      console.log('Evidence:');
      console.log('  • lesson_progress data exists and looks good');
      console.log('  • learning_path_progress_sessions table does NOT exist');
      console.log('');
      console.log('Impact:');
      console.log('  • Session-based time tracking not working');
      console.log('  • Advanced analytics unavailable');
      console.log('');
      console.log('Next Steps:');
      console.log('  → Apply migrations 013, 014, 015 to production database');
      console.log('  → Verify tables and RPC functions created');
      console.log('  → Test session tracking on lesson pages');

      results.conclusion = 'RC4: Session tracking migrations not applied';

    } else if (results.lessonProgress.totalRecords > 0 && results.lessonProgress.avgTime > 0) {
      console.log('🟢 DATA QUALITY LOOKS GOOD');
      console.log('');
      console.log('Evidence:');
      console.log(`  • lesson_progress has ${results.lessonProgress.totalRecords} records`);
      console.log(`  • ${results.lessonProgress.uniqueUsers} users have progress`);
      console.log(`  • Average time_spent: ${results.lessonProgress.avgTime?.toFixed(0)} seconds`);
      console.log(`  • ${results.lessonProgress.completedCount} blocks completed`);
      console.log('');
      console.log('Possible Issues:');
      console.log('  1. Reports may have RLS/permission issues preventing data access');
      console.log('  2. Reports query logic may have bugs');
      console.log('  3. Time values are low because test users completed quickly');
      console.log('');
      console.log('Next Steps:');
      console.log('  → Check if reports API is using service role key correctly');
      console.log('  → Verify getReportableUsers() returns correct user IDs');
      console.log('  → Test reports with a known user who has progress');

      results.conclusion = 'RC3: Data exists but reports may have access issues';
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('📄 RAW DATA SUMMARY');
    console.log('='.repeat(80));
    console.log(JSON.stringify(results, null, 2));
    console.log('');

  } catch (error) {
    console.error('❌ FATAL ERROR during diagnostics:', error);
    console.error(error.stack);
  }
}

// Run the diagnostics
runDiagnostics()
  .then(() => {
    console.log('✅ Diagnostic complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  });
