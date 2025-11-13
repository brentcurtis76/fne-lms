/**
 * Investigate lesson completion count for specific user
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigateUser() {
  const email = 'maite.costa@cmwt.cl';

  console.log(`🔍 Investigating lesson completions for: ${email}\n`);

  try {
    // 1. Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, school_id, generation_id')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.error('❌ User not found:', profileError);
      return;
    }

    console.log('👤 User Profile:');
    console.log(`   ID: ${profile.id}`);
    console.log(`   Name: ${profile.first_name} ${profile.last_name}`);
    console.log(`   School ID: ${profile.school_id || 'N/A'}`);
    console.log(`   Generation ID: ${profile.generation_id || 'N/A'}\n`);

    // 2. Get course assignments
    const { data: assignments, error: assignError } = await supabase
      .from('course_assignments')
      .select(`
        id,
        course_id,
        assigned_at,
        courses (
          id,
          title,
          is_structured
        )
      `)
      .eq('user_id', profile.id);

    console.log('📚 Course Assignments:');
    if (assignments && assignments.length > 0) {
      assignments.forEach(a => {
        console.log(`   - ${a.courses.title} (${a.courses.is_structured ? 'structured' : 'simple'})`);
      });
    } else {
      console.log('   None');
    }
    console.log();

    // 3. Get lesson progress/completions
    const { data: lessonProgress, error: progressError } = await supabase
      .from('lesson_progress')
      .select(`
        id,
        lesson_id,
        completed_at,
        time_spent,
        lessons (
          id,
          title,
          order_index,
          module_id,
          modules (
            id,
            title,
            course_id,
            courses (
              id,
              title
            )
          )
        )
      `)
      .eq('user_id', profile.id)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false });

    console.log('✅ Completed Lessons:');
    console.log(`   Total Count: ${lessonProgress?.length || 0}\n`);

    if (lessonProgress && lessonProgress.length > 0) {
      // Group by course
      const byCourse = {};
      lessonProgress.forEach(lp => {
        const courseTitle = lp.lessons?.modules?.courses?.title || 'Unknown Course';
        const moduleTitle = lp.lessons?.modules?.title || 'Unknown Module';
        const lessonTitle = lp.lessons?.title || 'Unknown Lesson';
        const completedDate = new Date(lp.completed_at).toLocaleDateString('es-ES');

        if (!byCourse[courseTitle]) {
          byCourse[courseTitle] = [];
        }

        byCourse[courseTitle].push({
          module: moduleTitle,
          lesson: lessonTitle,
          completed: completedDate,
          time: Math.round((lp.time_spent || 0) / 60) // seconds to minutes
        });
      });

      // Display by course
      Object.keys(byCourse).forEach(courseTitle => {
        console.log(`   📖 ${courseTitle} (${byCourse[courseTitle].length} lessons)`);
        byCourse[courseTitle].forEach((lesson, idx) => {
          console.log(`      ${idx + 1}. ${lesson.lesson}`);
          console.log(`         Module: ${lesson.module}`);
          console.log(`         Completed: ${lesson.completed} | Time: ${lesson.time}min`);
        });
        console.log();
      });
    }

    // 4. Check for any duplicate completions
    const { data: allProgress, error: allProgressError } = await supabase
      .from('lesson_progress')
      .select(`
        id,
        lesson_id,
        completed_at,
        lessons (
          title
        )
      `)
      .eq('user_id', profile.id)
      .not('completed_at', 'is', null);

    if (allProgress) {
      const lessonIds = allProgress.map(p => p.lesson_id);
      const uniqueLessons = new Set(lessonIds);

      if (lessonIds.length !== uniqueLessons.size) {
        console.log('⚠️  DUPLICATES DETECTED:');
        console.log(`   Total completions: ${lessonIds.length}`);
        console.log(`   Unique lessons: ${uniqueLessons.size}`);
        console.log(`   Duplicate count: ${lessonIds.length - uniqueLessons.size}\n`);

        // Find which lessons have duplicates
        const counts = {};
        lessonIds.forEach(id => {
          counts[id] = (counts[id] || 0) + 1;
        });

        const duplicates = Object.entries(counts)
          .filter(([id, count]) => count > 1);

        if (duplicates.length > 0) {
          console.log('   Lessons with multiple completions:');
          for (const [lessonId, count] of duplicates) {
            const lesson = allProgress.find(lp => lp.lesson_id === lessonId);
            const lessonTitle = lesson?.lessons?.title || 'Unknown Lesson';
            console.log(`   - ${lessonTitle} (ID: ${lessonId}): ${count} times`);

            // Show all completion dates for this lesson
            const completions = allProgress
              .filter(lp => lp.lesson_id === lessonId)
              .map(lp => new Date(lp.completed_at).toLocaleString('es-ES'))
              .join(', ');
            console.log(`     Dates: ${completions}`);
          }
          console.log();
        }
      } else {
        console.log('✅ No duplicates found - all lessons are unique\n');
      }
    }

    // 5. Summary
    console.log('📊 SUMMARY:');
    console.log(`   User: ${profile.first_name} ${profile.last_name}`);
    console.log(`   Completed lessons: ${lessonProgress?.length || 0}`);
    console.log(`   Courses assigned: ${assignments?.length || 0}`);
    console.log(`   Courses with completions: ${Object.keys(byCourse || {}).length}`);

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

investigateUser();
