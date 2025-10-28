const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTomProgress() {
  console.log('\n=== CHECKING TOM\'S COURSE PROGRESS ===\n');

  const tomId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';
  const pathId = 'fd37f95b-4a5b-4eae-8df8-56fe954e16b7';

  // Get courses in path
  const { data: pathCourses } = await supabase
    .from('learning_path_courses')
    .select('course_id, sequence_order, course:courses(id, title)')
    .eq('learning_path_id', pathId)
    .order('sequence_order');

  console.log('📚 Courses in Learning Path:');
  pathCourses.forEach((pc, i) => {
    console.log(`  ${i + 1}. [${pc.course_id}] ${pc.course.title}`);
  });

  const firstCourseId = pathCourses[0].course_id;
  console.log(`\n🎯 First Course: ${pathCourses[0].course.title}`);
  console.log(`   ID: ${firstCourseId}`);

  // Check enrollment details
  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', tomId)
    .eq('course_id', firstCourseId)
    .single();

  console.log('\n📊 Enrollment Details:');
  console.log(JSON.stringify(enrollment, null, 2));

  // Check lesson progress for this course
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, course_id')
    .eq('course_id', firstCourseId)
    .order('sequence_number');

  console.log(`\n📝 Lessons in Course (${lessons?.length || 0} total):`);
  if (lessons) {
    lessons.forEach((lesson, i) => {
      console.log(`  ${i + 1}. [${lesson.id}] ${lesson.title}`);
    });
  }

  // Check lesson completion status
  if (lessons && lessons.length > 0) {
    const { data: completions } = await supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', tomId)
      .in('lesson_id', lessons.map(l => l.id));

    console.log(`\n✅ Completed Lessons (${completions?.length || 0}):`);
    if (completions && completions.length > 0) {
      completions.forEach(completion => {
        const lesson = lessons.find(l => l.id === completion.lesson_id);
        console.log(`  - ${lesson?.title || completion.lesson_id}`);
        console.log(`    Completed at: ${completion.completed_at}`);
        console.log(`    Progress: ${completion.progress_percentage}%`);
      });
    } else {
      console.log('  (None)');
    }
  }

  // Check user progress records
  const { data: userProgress } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', tomId)
    .eq('course_id', firstCourseId);

  console.log(`\n📈 User Progress Records (${userProgress?.length || 0}):`);
  if (userProgress && userProgress.length > 0) {
    userProgress.forEach(progress => {
      console.log(`  Lesson: ${progress.lesson_id}`);
      console.log(`  Progress: ${progress.progress_percentage}%`);
      console.log(`  Completed: ${progress.completed}`);
      console.log(`  Last accessed: ${progress.last_accessed_at}`);
      console.log('  ---');
    });
  } else {
    console.log('  (None)');
  }

  // Now simulate what the mi-aprendizaje page would calculate
  console.log('\n🔍 SIMULATING mi-aprendizaje PAGE LOGIC:\n');

  const { data: pathProgress } = await supabase
    .from('learning_path_courses')
    .select('course_id')
    .eq('learning_path_id', pathId);

  const courseIds = pathProgress.map(p => p.course_id);
  console.log(`Total courses in path: ${courseIds.length}`);

  const { data: allEnrollments } = await supabase
    .from('course_enrollments')
    .select('course_id, progress_percentage, completed_at')
    .eq('user_id', tomId)
    .in('course_id', courseIds);

  console.log(`\nEnrollment data for calculation:`);
  allEnrollments.forEach(e => {
    const course = pathCourses.find(pc => pc.course_id === e.course_id);
    console.log(`  - ${course?.course?.title || e.course_id}`);
    console.log(`    progress_percentage: ${e.progress_percentage}`);
    console.log(`    completed_at: ${e.completed_at}`);
  });

  const completedCourses = allEnrollments.filter(e => e.progress_percentage >= 100).length;
  const progressPercentage = Math.round((completedCourses / courseIds.length) * 100);

  console.log(`\n📊 CALCULATED PROGRESS:`);
  console.log(`   Completed courses: ${completedCourses} / ${courseIds.length}`);
  console.log(`   Progress percentage: ${progressPercentage}%`);

  // Check what's in the enrollment's progress_percentage field
  console.log(`\n❓ WHY IS PROGRESS_PERCENTAGE 0?`);
  console.log(`   Checking how course_enrollments.progress_percentage gets updated...`);

  // Check for triggers or functions that update progress
  const { data: triggers } = await supabase.rpc('pg_get_functiondef', {
    func_oid: 'update_course_progress'
  }).then(() => ({ data: 'exists' })).catch(() => ({ data: 'not found' }));

  console.log(`   Trigger/Function check: ${triggers}`);
}

checkTomProgress().catch(console.error);
