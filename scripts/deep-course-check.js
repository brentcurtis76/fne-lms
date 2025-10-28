const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deepCourseCheck() {
  console.log('\n=== DEEP COURSE CHECK ===\n');

  const courseId = 'c5fee76b-b0d5-4d44-874b-b7788ade4258';
  const tomId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';

  // Get lesson with ALL fields
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', courseId);

  console.log('📝 Lessons query result:');
  console.log('  Error:', error);
  console.log('  Count:', lessons?.length);
  console.log('  Data:', JSON.stringify(lessons, null, 2));

  if (lessons && lessons.length > 0) {
    // Now check if Tom completed this lesson
    for (const lesson of lessons) {
      console.log(`\n🔍 Checking lesson: ${lesson.title}`);

      // Check user_progress
      const { data: progress } = await supabase
        .from('user_progress')
        .select('*')
        .eq('user_id', tomId)
        .eq('lesson_id', lesson.id);

      console.log('  user_progress records:', progress?.length || 0);
      if (progress && progress.length > 0) {
        console.log('  Details:', JSON.stringify(progress, null, 2));
      }

      // Check lesson_completions
      const { data: completions } = await supabase
        .from('lesson_completions')
        .select('*')
        .eq('user_id', tomId)
        .eq('lesson_id', lesson.id);

      console.log('  lesson_completions records:', completions?.length || 0);
      if (completions && completions.length > 0) {
        console.log('  Details:', JSON.stringify(completions, null, 2));
      }
    }
  }

  // Check the enrollment again
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', tomId)
    .eq('course_id', courseId)
    .single();

  console.log('\n📊 Current Enrollment State:');
  console.log(`  progress_percentage: ${enrollment.progress_percentage}`);
  console.log(`  lessons_completed: ${enrollment.lessons_completed}`);
  console.log(`  total_lessons: ${enrollment.total_lessons}`);
  console.log(`  is_completed: ${enrollment.is_completed}`);

  console.log('\n❓ WHY total_lessons = 0?');
  console.log('   Checking if there is a trigger that sets this field...');

  // Try to find update triggers
  const { data: triggers } = await supabase.rpc('get_triggers_for_table', {
    table_name: 'course_enrollments'
  }).catch(() => null);

  if (!triggers) {
    console.log('   Could not query triggers directly.');
    console.log('   Checking for RPC functions that might update enrollments...');
  }

  // Manually check if completing the lesson should trigger an update
  console.log('\n🔍 HYPOTHESIS:');
  console.log('   The total_lessons field in course_enrollments is set to 0');
  console.log('   because there might be:');
  console.log('   1. A bug in the enrollment creation that does not count lessons');
  console.log('   2. A missing trigger to update total_lessons when enrollment is created');
  console.log('   3. The lesson was added AFTER the enrollment was created');
}

deepCourseCheck().catch(console.error);
