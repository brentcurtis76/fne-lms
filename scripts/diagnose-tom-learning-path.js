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

  // 2. Find the learning path
  const { data: learningPath, error: pathError } = await supabase
    .from('learning_paths')
    .select('id, name')
    .eq('name', 'Ejemplos de plan personal en diferentes etapas educativas')
    .single();

  if (pathError || !learningPath) {
    console.error('❌ Learning path not found:', pathError);
    return;
  }

  console.log('\n✅ Found Learning Path:', learningPath);
  const pathId = learningPath.id;

  // 3. Check if Tom is assigned to this learning path
  const { data: assignment, error: assignmentError } = await supabase
    .from('learning_path_assignments')
    .select('*')
    .eq('path_id', pathId)
    .eq('user_id', tomId);

  console.log('\n📋 Learning Path Assignment:');
  if (assignmentError) {
    console.error('❌ Error checking assignment:', assignmentError);
  } else if (!assignment || assignment.length === 0) {
    console.log('❌ NO ASSIGNMENT FOUND - This is the problem!');
  } else {
    console.log('✅ Assignment exists:', assignment);
  }

  // 4. Get courses in the learning path
  const { data: pathCourses, error: coursesError } = await supabase
    .from('learning_path_courses')
    .select(`
      course_id,
      sequence_order,
      course:courses(id, title)
    `)
    .eq('learning_path_id', pathId)
    .order('sequence_order');

  console.log('\n📚 Courses in Learning Path:');
  if (coursesError) {
    console.error('❌ Error fetching courses:', coursesError);
    return;
  }

  if (!pathCourses || pathCourses.length === 0) {
    console.log('❌ No courses in learning path!');
    return;
  }

  pathCourses.forEach((pc, index) => {
    console.log(`  ${index + 1}. [${pc.course_id}] ${pc.course?.title || 'Unknown'}`);
  });

  const courseIds = pathCourses.map(pc => pc.course_id);

  // 5. Check Tom's enrollments in these courses
  const { data: enrollments, error: enrollmentError } = await supabase
    .from('course_enrollments')
    .select('course_id, status, progress_percentage, enrollment_type, enrolled_at, completed_at')
    .eq('user_id', tomId)
    .in('course_id', courseIds);

  console.log('\n🎓 Tom\'s Course Enrollments:');
  if (enrollmentError) {
    console.error('❌ Error checking enrollments:', enrollmentError);
  } else if (!enrollments || enrollments.length === 0) {
    console.log('❌ NO ENROLLMENTS FOUND - Tom is not enrolled in ANY courses!');
    console.log('\n🔍 ROOT CAUSE IDENTIFIED:');
    console.log('   When the learning path was assigned, the courses were NOT auto-enrolled.');
  } else {
    enrollments.forEach(enrollment => {
      const course = pathCourses.find(pc => pc.course_id === enrollment.course_id);
      console.log(`  ✅ [${enrollment.course_id}] ${course?.course?.title || 'Unknown'}`);
      console.log(`     Status: ${enrollment.status}, Progress: ${enrollment.progress_percentage}%`);
      console.log(`     Type: ${enrollment.enrollment_type}, Enrolled: ${enrollment.enrolled_at}`);
    });
  }

  // 6. Check if migration 016 was applied
  console.log('\n🔧 Checking Database Function:');
  const { data: functionExists, error: functionError } = await supabase
    .rpc('batch_assign_learning_path', {
      p_path_id: '00000000-0000-0000-0000-000000000000', // Dummy ID to test existence
      p_user_ids: [],
      p_group_ids: [],
      p_assigned_by: '00000000-0000-0000-0000-000000000000'
    });

  if (functionError) {
    if (functionError.message.includes('does not exist')) {
      console.log('❌ Migration 016 NOT APPLIED - batch_assign_learning_path function missing!');
    } else if (functionError.message.includes('not found')) {
      console.log('✅ Function exists (failed validation as expected with dummy IDs)');
    } else {
      console.log('⚠️  Function check inconclusive:', functionError.message);
    }
  } else {
    console.log('✅ Function exists and returned:', functionExists);
  }

  // 7. Final diagnosis
  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSIS SUMMARY:');
  console.log('='.repeat(60));

  if (!assignment || assignment.length === 0) {
    console.log('❌ ISSUE #1: Learning path assignment record missing');
  }

  if (!enrollments || enrollments.length === 0) {
    console.log('❌ ISSUE #2: User not enrolled in learning path courses');
    console.log('\n💡 ROOT CAUSE:');
    console.log('   The /api/learning-paths/assign endpoint calls a missing');
    console.log('   LearningPathsService.assignLearningPath() method that does');
    console.log('   not exist in the service file. This means:');
    console.log('   1. Assignment creation fails silently OR');
    console.log('   2. Assignment is created but courses are NOT enrolled');
    console.log('\n   Migration 016 created batch_assign_learning_path() but the');
    console.log('   single assignment endpoint uses assignLearningPath() which');
    console.log('   is NOT IMPLEMENTED.');
  }

  console.log('='.repeat(60));
}

diagnoseTomLearningPath().catch(console.error);
