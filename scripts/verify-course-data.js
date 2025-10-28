const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyCourseData() {
  console.log('\n=== VERIFYING COURSE DATA ===\n');

  const courseId = 'c5fee76b-b0d5-4d44-874b-b7788ade4258';

  // Check the course details
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  console.log('📚 Course Details:');
  console.log(JSON.stringify(course, null, 2));

  if (courseError) {
    console.error('Error:', courseError);
    return;
  }

  // Check if course has modules (structured course)
  const { data: modules } = await supabase
    .from('course_modules')
    .select('id, title, sequence_number')
    .eq('course_id', courseId)
    .order('sequence_number');

  console.log(`\n📦 Modules: ${modules?.length || 0}`);
  if (modules && modules.length > 0) {
    modules.forEach(m => {
      console.log(`  - ${m.title} (seq: ${m.sequence_number})`);
    });

    // Check lessons in modules
    for (const module of modules) {
      const { data: moduleLessons } = await supabase
        .from('lessons')
        .select('id, title, sequence_number')
        .eq('module_id', module.id)
        .order('sequence_number');

      console.log(`\n  📝 Lessons in "${module.title}": ${moduleLessons?.length || 0}`);
      if (moduleLessons && moduleLessons.length > 0) {
        moduleLessons.forEach(l => {
          console.log(`    ${l.sequence_number}. ${l.title}`);
        });
      }
    }
  }

  // Check direct lessons (simple course structure)
  const { data: directLessons } = await supabase
    .from('lessons')
    .select('id, title, sequence_number, course_id, module_id')
    .eq('course_id', courseId)
    .is('module_id', null)
    .order('sequence_number');

  console.log(`\n📝 Direct Lessons (no module): ${directLessons?.length || 0}`);
  if (directLessons && directLessons.length > 0) {
    directLessons.forEach(l => {
      console.log(`  ${l.sequence_number}. ${l.title}`);
    });
  }

  // Check ALL lessons for this course (regardless of module)
  const { data: allLessons } = await supabase
    .from('lessons')
    .select('id, title, sequence_number, module_id')
    .eq('course_id', courseId)
    .order('sequence_number');

  console.log(`\n📚 ALL Lessons for course: ${allLessons?.length || 0}`);
  if (allLessons && allLessons.length > 0) {
    allLessons.forEach(l => {
      console.log(`  ${l.sequence_number}. ${l.title} ${l.module_id ? `(module: ${l.module_id})` : '(direct)'}`);
    });
  } else {
    console.log('  ❌ NO LESSONS FOUND!');
  }

  // Final diagnosis
  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSIS:');
  console.log('='.repeat(70));

  if (!allLessons || allLessons.length === 0) {
    console.log('❌ ROOT CAUSE #2: The course has NO LESSONS!');
    console.log('');
    console.log('This explains why:');
    console.log('  1. total_lessons = 0 in course_enrollments');
    console.log('  2. Progress cannot be tracked (no lessons to complete)');
    console.log('  3. The mi-aprendizaje page shows 0% progress');
    console.log('');
    console.log('The course exists but has no content. This is a DATA ISSUE,');
    console.log('not a code bug. The course needs to have lessons added.');
  } else {
    console.log('✅ Course has lessons, investigating why they are not counted...');
  }

  console.log('='.repeat(70));
}

verifyCourseData().catch(console.error);
