const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findRealCourses() {
  console.log('\n=== FINDING DUPLICATE COURSES ===\n');

  // Search for courses with similar names
  const searches = [
    'prekinder y kinder',
    'básica y media',
    'proyecto de vida'
  ];

  for (const searchTerm of searches) {
    console.log(`\n🔍 Searching for: "${searchTerm}"`);
    console.log('─'.repeat(70));

    const { data: courses } = await supabase
      .from('courses')
      .select('id, title, status, created_at')
      .ilike('title', `%${searchTerm}%`)
      .order('created_at');

    if (courses && courses.length > 0) {
      for (const course of courses) {
        // Count lessons
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('course_id', course.id);

        // Count modules
        const { data: modules } = await supabase
          .from('course_modules')
          .select('id')
          .eq('course_id', course.id);

        console.log(`\n  ${course.title}`);
        console.log(`  ID: ${course.id}`);
        console.log(`  Status: ${course.status}`);
        console.log(`  Created: ${course.created_at}`);
        console.log(`  Lessons: ${lessons?.length || 0}`);
        console.log(`  Modules: ${modules?.length || 0}`);

        if (lessons && lessons.length > 0) {
          console.log(`  ✅ HAS CONTENT`);
        } else {
          console.log(`  ❌ EMPTY (no lessons)`);
        }
      }
    } else {
      console.log('  No courses found');
    }
  }

  // Now check what's in the learning path
  console.log('\n\n' + '='.repeat(70));
  console.log('LEARNING PATH ANALYSIS:');
  console.log('='.repeat(70));

  const pathId = 'fd37f95b-4a5b-4eae-8df8-56fe954e16b7';

  const { data: pathCourses } = await supabase
    .from('learning_path_courses')
    .select(`
      course_id,
      sequence_order,
      course:courses(id, title, status)
    `)
    .eq('learning_path_id', pathId)
    .order('sequence_order');

  console.log('\nCourses in "Ejemplos de plan personal..." learning path:');

  for (const pc of pathCourses) {
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id')
      .eq('course_id', pc.course_id);

    console.log(`\n  ${pc.sequence_order}. ${pc.course.title}`);
    console.log(`     ID: ${pc.course_id}`);
    console.log(`     Status: ${pc.course.status}`);
    console.log(`     Lessons: ${lessons?.length || 0}`);

    if (!lessons || lessons.length === 0) {
      console.log('     ⚠️  THIS COURSE IS EMPTY!');
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('ROOT CAUSE IDENTIFIED:');
  console.log('='.repeat(70));
  console.log('\nThe learning path contains duplicate/empty courses with "(2)" in their');
  console.log('titles. These are likely test courses or accidentally duplicated courses');
  console.log('that have no lessons.');
  console.log('\nThe REAL courses with actual content exist but are NOT in this');
  console.log('learning path. The learning path needs to be updated to reference');
  console.log('the correct course IDs (the ones with actual lessons).');
  console.log('='.repeat(70));
}

findRealCourses().catch(console.error);
