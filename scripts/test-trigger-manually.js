const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testTriggerManually() {
  console.log('\n=== MANUALLY TESTING TRIGGER LOGIC ===\n');

  const tomId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';
  const lessonId = 'cb57c517-f67c-4a0d-be52-99be535b4a86';

  // Get course_id for this lesson
  console.log('[1] Getting course_id for completed lesson...\n');
  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, course_id, courses(title)')
    .eq('id', lessonId)
    .single();

  console.log(`Lesson: ${lesson.title}`);
  console.log(`Course: ${lesson.courses.title}`);
  console.log(`Course ID: ${lesson.course_id}\n`);

  const courseId = lesson.course_id;

  // Count total lessons in course
  console.log('[2] Counting total lessons in course...\n');
  const { data: allLessons } = await supabase
    .from('lessons')
    .select('id, title')
    .eq('course_id', courseId);

  console.log(`Total lessons in course: ${allLessons.length}`);
  allLessons.forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.title}`);
  });

  // Check blocks for the completed lesson
  console.log('\n[3] Checking blocks in completed lesson...\n');
  const { data: blocks } = await supabase
    .from('blocks')
    .select('id, is_mandatory')
    .eq('lesson_id', lessonId);

  console.log(`Total blocks: ${blocks.length}`);
  console.log(`Mandatory blocks: ${blocks.filter(b => b.is_mandatory).length}\n`);

  // Check which blocks Tom completed
  const { data: completedBlocks } = await supabase
    .from('lesson_progress')
    .select('block_id, completed_at')
    .eq('user_id', tomId)
    .eq('lesson_id', lessonId)
    .not('completed_at', 'is', null);

  console.log(`Tom completed: ${completedBlocks.length} blocks`);
  completedBlocks.forEach(cb => {
    const block = blocks.find(b => b.id === cb.block_id);
    console.log(`  - Block ${cb.block_id.substring(0, 8)}... (mandatory: ${block?.is_mandatory})`);
  });

  // Check if all mandatory blocks are completed
  const mandatoryBlocks = blocks.filter(b => b.is_mandatory);
  const completedMandatoryBlocks = completedBlocks.filter(cb => {
    const block = blocks.find(b => b.id === cb.block_id);
    return block?.is_mandatory;
  });

  console.log(`\nMandatory blocks completed: ${completedMandatoryBlocks.length} / ${mandatoryBlocks.length}`);

  const lessonFullyCompleted = completedMandatoryBlocks.length === mandatoryBlocks.length;
  console.log(`Lesson fully completed: ${lessonFullyCompleted ? 'YES ✅' : 'NO ❌'}\n`);

  // Now simulate what the trigger SHOULD calculate
  console.log('[4] Simulating trigger calculation...\n');

  // Count completed lessons using the same logic as trigger
  const { data: lessonsInCourse } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);

  let completedLessonCount = 0;

  for (const l of lessonsInCourse) {
    const { data: lessonBlocks } = await supabase
      .from('blocks')
      .select('id, is_mandatory')
      .eq('lesson_id', l.id);

    const { data: lessonProgress } = await supabase
      .from('lesson_progress')
      .select('block_id')
      .eq('user_id', tomId)
      .eq('lesson_id', l.id)
      .not('completed_at', 'is', null);

    const mandatoryBlocksForLesson = lessonBlocks.filter(b => b.is_mandatory);
    const completedMandatoryForLesson = lessonProgress.filter(lp => {
      const block = lessonBlocks.find(b => b.id === lp.block_id);
      return block?.is_mandatory;
    });

    const isComplete = mandatoryBlocksForLesson.length === completedMandatoryForLesson.length;

    if (isComplete) {
      completedLessonCount++;
      console.log(`  ✅ Lesson ${l.id.substring(0, 8)}... is complete`);
    } else {
      console.log(`  ❌ Lesson ${l.id.substring(0, 8)}... NOT complete (${completedMandatoryForLesson.length}/${mandatoryBlocksForLesson.length} blocks)`);
    }
  }

  const expectedProgress = Math.round((completedLessonCount / lessonsInCourse.length) * 100);

  console.log(`\nExpected calculation:`);
  console.log(`  Completed lessons: ${completedLessonCount}`);
  console.log(`  Total lessons: ${lessonsInCourse.length}`);
  console.log(`  Progress: ${expectedProgress}%\n`);

  // Check actual enrollment
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', tomId)
    .eq('course_id', courseId)
    .single();

  console.log(`Actual enrollment state:`);
  console.log(`  lessons_completed: ${enrollment.lessons_completed}`);
  console.log(`  progress_percentage: ${enrollment.progress_percentage}%`);
  console.log(`  updated_at: ${enrollment.updated_at}\n`);

  console.log('='.repeat(70));
  console.log('CONCLUSION:');
  console.log('='.repeat(70));

  if (enrollment.progress_percentage !== expectedProgress) {
    console.log('\n❌ TRIGGER IS NOT WORKING');
    console.log(`   Expected: ${expectedProgress}%`);
    console.log(`   Actual: ${enrollment.progress_percentage}%`);
    console.log('\n   Trigger may have an error in its logic or is not firing at all.');
    console.log('   Checking trigger installation...\n');
  } else {
    console.log('\n✅ VALUES MATCH - Trigger is working correctly');
  }

  console.log('='.repeat(70));
}

testTriggerManually().catch(console.error);
