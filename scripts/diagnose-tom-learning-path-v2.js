const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnoseTomLearningPath() {
  console.log('\n=== DIAGNOSTIC: Tom Learning Path Issue ===\n');

  // 1. Find Tom
  const { data: tom, error: tomError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'tom@nuevaeducacion.org')
    .single();

  if (tomError || !tom) {
    console.error('❌ Tom not found:', tomError);
    return;
  }

  console.log('✅ Found Tom:', tom);
  const tomId = tom.id;

  // 2. Find ALL learning paths with this name
  const { data: learningPaths, error: pathError } = await supabase
    .from('learning_paths')
    .select('id, name, created_at')
    .ilike('name', '%Ejemplos de plan personal%');

  if (pathError) {
    console.error('❌ Error finding learning paths:', pathError);
    return;
  }

  console.log('\n📚 Found Learning Paths:');
  learningPaths.forEach((lp, index) => {
    console.log(`  ${index + 1}. [${lp.id}] ${lp.name} (created: ${lp.created_at})`);
  });

  // 3. Check Tom's assignments to ANY learning path
  const { data: allAssignments, error: assignmentError } = await supabase
    .from('learning_path_assignments')
    .select('*, learning_paths(id, name)')
    .eq('user_id', tomId);

  console.log('\n📋 Tom\'s ALL Learning Path Assignments:');
  if (assignmentError) {
    console.error('❌ Error checking assignments:', assignmentError);
  } else if (!allAssignments || allAssignments.length === 0) {
    console.log('❌ NO ASSIGNMENTS FOUND FOR TOM AT ALL!');
  } else {
    allAssignments.forEach(assignment => {
      console.log(`  ✅ [${assignment.path_id}] ${assignment.learning_paths?.name || 'Unknown'}`);
      console.log(`     Assigned at: ${assignment.assigned_at}, by: ${assignment.assigned_by}`);
    });
  }

  // 4. For each learning path Tom might have, check enrollments
  if (allAssignments && allAssignments.length > 0) {
    for (const assignment of allAssignments) {
      console.log(`\n🔍 Checking courses for path: ${assignment.learning_paths?.name}`);

      // Get courses in this path
      const { data: pathCourses, error: coursesError } = await supabase
        .from('learning_path_courses')
        .select('course_id, sequence_order, course:courses(id, title)')
        .eq('learning_path_id', assignment.path_id)
        .order('sequence_order');

      if (coursesError) {
        console.error('   ❌ Error fetching courses:', coursesError);
        continue;
      }

      console.log(`   Found ${pathCourses?.length || 0} courses in path`);

      if (pathCourses && pathCourses.length > 0) {
        const courseIds = pathCourses.map(pc => pc.course_id);

        // Check Tom's enrollments
        const { data: enrollments, error: enrollmentError } = await supabase
          .from('course_enrollments')
          .select('course_id, status, progress_percentage, enrollment_type')
          .eq('user_id', tomId)
          .in('course_id', courseIds);

        console.log(`   Tom is enrolled in ${enrollments?.length || 0} of ${courseIds.length} courses`);

        if (!enrollments || enrollments.length === 0) {
          console.log('   ❌ NOT ENROLLED IN ANY COURSES!');
        } else {
          enrollments.forEach(e => {
            const course = pathCourses.find(pc => pc.course_id === e.course_id);
            console.log(`     ✅ ${course?.course?.title || e.course_id}: ${e.progress_percentage}% (${e.status})`);
          });
        }
      }
    }
  }

  // 5. Check if the assignLearningPath function exists in the service
  console.log('\n🔍 Checking Service Code:');
  const fs = require('fs');
  const serviceFile = fs.readFileSync('./lib/services/learningPathsService.ts', 'utf8');

  const hasAssignMethod = serviceFile.includes('assignLearningPath(');
  const hasBatchAssignMethod = serviceFile.includes('batchAssignLearningPath(');

  console.log(`   assignLearningPath method exists: ${hasAssignMethod ? '✅' : '❌'}`);
  console.log(`   batchAssignLearningPath method exists: ${hasBatchAssignMethod ? '✅' : '❌'}`);

  // 6. Check which API endpoint was likely used
  console.log('\n🔧 API Endpoint Analysis:');
  const assignFile = fs.readFileSync('./pages/api/learning-paths/assign.ts', 'utf8');
  const batchFile = fs.readFileSync('./pages/api/learning-paths/batch-assign.ts', 'utf8');

  const assignUsesService = assignFile.includes('LearningPathsService.assignLearningPath');
  const batchUsesService = batchFile.includes('LearningPathsService.batchAssignLearningPath');

  console.log(`   /api/learning-paths/assign uses: LearningPathsService.assignLearningPath - ${assignUsesService ? 'YES' : 'NO'}`);
  console.log(`   /api/learning-paths/batch-assign uses: LearningPathsService.batchAssignLearningPath - ${batchUsesService ? 'YES' : 'NO'}`);

  // 7. Final diagnosis
  console.log('\n' + '='.repeat(70));
  console.log('ROOT CAUSE ANALYSIS:');
  console.log('='.repeat(70));

  if (!hasAssignMethod && assignUsesService) {
    console.log('🎯 FOUND THE BUG!');
    console.log('');
    console.log('The /api/learning-paths/assign.ts endpoint calls:');
    console.log('   LearningPathsService.assignLearningPath()');
    console.log('');
    console.log('But this method DOES NOT EXIST in learningPathsService.ts!');
    console.log('');
    console.log('This means when you assigned the learning path to Tom through');
    console.log('the UI, the API call either:');
    console.log('  1. Failed completely (throwing an error), OR');
    console.log('  2. Never actually created the assignment');
    console.log('');
    console.log('Meanwhile, the batch-assign endpoint uses batchAssignLearningPath()');
    console.log('which DOES exist and calls the database function that was created');
    console.log('in migration 016 to auto-enroll users in courses.');
    console.log('');
    console.log('SOLUTION:');
    console.log('  The assign.ts endpoint should either:');
    console.log('    A) Call batchAssignLearningPath with single user/group arrays, OR');
    console.log('    B) Implement the missing assignLearningPath() method that also');
    console.log('       auto-enrolls users in courses');
  }

  console.log('='.repeat(70));
}

diagnoseTomLearningPath().catch(console.error);
