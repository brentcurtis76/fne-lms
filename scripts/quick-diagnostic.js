/**
 * Quick Progress Tracking Diagnostic
 * Simplified version with timeouts
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

console.log('\n🔍 QUICK DIAGNOSTIC - FNE LMS Progress Tracking\n');
console.log(`Database: ${supabaseUrl}\n`);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runQuickCheck() {
  console.log('1️⃣  Checking lesson_progress records...');
  const { count: progressCount } = await supabase
    .from('lesson_progress')
    .select('*', { count: 'exact', head: true });

  console.log(`   → Total records: ${progressCount || 0}\n`);

  if (progressCount && progressCount > 0) {
    console.log('2️⃣  Getting recent progress samples...');
    const { data: samples } = await supabase
      .from('lesson_progress')
      .select('time_spent, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (samples) {
      const timeValues = samples.map(s => s.time_spent || 0);
      const avg = timeValues.reduce((a,b) => a+b, 0) / samples.length;
      const nonZero = timeValues.filter(t => t > 0).length;

      console.log(`   → Avg time_spent: ${avg.toFixed(0)} seconds`);
      console.log(`   → Non-zero values: ${nonZero}/${samples.length}\n`);

      console.log('   Recent entries:');
      samples.forEach((s, i) => {
        console.log(`   ${i+1}. ${(s.time_spent/60).toFixed(1)}min | ${s.completed_at ? '✓' : '○'} | ${s.created_at.substring(0,16)}`);
      });
    }
  }

  console.log('\n3️⃣  Checking course_assignments...');
  const { count: assignmentCount } = await supabase
    .from('course_assignments')
    .select('*', { count: 'exact', head: true });
  console.log(`   → Total assignments: ${assignmentCount || 0}\n`);

  console.log('4️⃣  Checking sessions table...');
  const { count: sessionCount, error: sessionError } = await supabase
    .from('learning_path_progress_sessions')
    .select('*', { count: 'exact', head: true });

  if (sessionError) {
    console.log('   → Table does NOT exist (needs migration)\n');
  } else {
    console.log(`   → Table exists with ${sessionCount || 0} records\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 ROOT CAUSE:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (progressCount === 0) {
    console.log('RC1: NO DATA - Nothing being saved to lesson_progress');
    console.log('→ Check client-side code is executing');
    console.log('→ Check RLS policies allow INSERT');
  } else {
    console.log('DATA EXISTS ✅');
    console.log(`→ ${progressCount} progress records found`);
    console.log(`→ ${assignmentCount} course assignments exist`);
    console.log('→ Time tracking appears to be working');
    console.log('\nIF REPORTS SHOW NO DATA:');
    console.log('→ Check if reports API has permission issues');
    console.log('→ Verify getReportableUsers() returns correct user IDs');
    console.log('→ Check RLS policies on lesson_progress for SELECT');
  }

  console.log('\n');
}

runQuickCheck()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  });
