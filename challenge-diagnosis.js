const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function challengeDiagnosis() {
  console.log('=== CHALLENGING THE DIAGNOSIS ===\n');

  const tomUserId = 'ca5efb9a-fac7-4741-b9b9-699694308ae8';
  const courseId = 'c5fee76b-b0d5-4d44-874b-b7788ade4258';

  // QUESTION 1: Is RLS really the blocker, or is it something else?
  console.log('1. TESTING: Is RLS actually blocking access?\n');

  // Try to fetch as service role (bypasses RLS)
  const { data: courseWithServiceRole, error: serviceError } = await supabase
    .from('courses')
    .select('id, title, structure_type')
    .eq('id', courseId)
    .single();

  console.log('   Service role access:', serviceError ? '❌ BLOCKED' : '✅ WORKS');
  if (courseWithServiceRole) {
    console.log('   Course:', courseWithServiceRole.title);
  }

  // QUESTION 2: What if there ARE other ways users can access courses?
  console.log('\n2. CHECKING: Are there OTHER RLS policies that allow access?\n');

  const { data: allPolicies } = await supabase
    .rpc('pg_policies')
    .eq('tablename', 'courses');

  console.log('   Need to manually check policies in schema...');
  console.log('   Policies we know:');
  console.log('   - courses_admin_all (for admins)');
  console.log('   - courses_student_view (requires enrollment)');
  console.log('   - courses_teacher_view (requires teacher assignment)');

  // QUESTION 3: Do learning paths work for OTHER users?
  console.log('\n3. TESTING: Do ANY users successfully access learning path courses?\n');

  const { data: allAssignments } = await supabase
    .from('learning_path_assignments')
    .select('user_id, path_id')
    .not('user_id', 'is', null)
    .limit(5);

  console.log(`   Found ${allAssignments.length} user assignments\n`);

  for (const assignment of allAssignments) {
    // Get courses for this path
    const { data: pathCourses } = await supabase
      .from('learning_path_courses')
      .select('course_id')
      .eq('learning_path_id', assignment.path_id);

    if (!pathCourses || pathCourses.length === 0) continue;

    // Check if user is enrolled
    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('user_id', assignment.user_id)
      .in('course_id', pathCourses.map(pc => pc.course_id));

    const enrollmentRate = enrollments.length / pathCourses.length;

    console.log(`   User ${assignment.user_id.substring(0, 8)}...`);
    console.log(`     Courses in path: ${pathCourses.length}`);
    console.log(`     Enrollments: ${enrollments.length} (${Math.round(enrollmentRate * 100)}%)`);

    if (enrollmentRate === 0) {
      console.log('     ⚠️  NO ENROLLMENTS - Same issue as Tom');
    } else if (enrollmentRate < 1) {
      console.log('     ⚠️  PARTIAL ENROLLMENTS - Inconsistent state');
    } else {
      console.log('     ✅ FULLY ENROLLED - Working correctly?');
    }
  }

  // QUESTION 4: Is auto-enrollment the RIGHT solution, or just A solution?
  console.log('\n4. PHILOSOPHY: Should assignment == enrollment?\n');
  console.log('   Current model: Assignment ≠ Enrollment');
  console.log('   - Assignment = "user should see this path"');
  console.log('   - Enrollment = "user can access this course"');
  console.log('');
  console.log('   Proposed model: Assignment → Auto-Enrollment');
  console.log('   - Assignment automatically enrolls in all courses');
  console.log('');
  console.log('   Alternative models:');
  console.log('   A) Just-in-time enrollment (enroll when user clicks course)');
  console.log('   B) Separate "activate path" step');
  console.log('   C) Change RLS to check learning_path_assignments instead');

  // QUESTION 5: What about the 406 error specifically?
  console.log('\n5. INVESTIGATING: What exactly causes a 406 error?\n');
  console.log('   406 = "Not Acceptable" - typically means:');
  console.log('   - Client Accept header doesn\'t match server content-type');
  console.log('   - OR in Supabase context: Query failed authorization');
  console.log('');
  console.log('   From logs: /rest/v1/courses?select=*&id=eq.[id]');
  console.log('   This is a PostgREST query, not direct Supabase client');
  console.log('   406 could mean: RLS blocked + PostgREST returned 406');

  // QUESTION 6: Check if there's ALREADY enrollment logic somewhere
  console.log('\n6. CHECKING: Is there existing enrollment logic we\'re missing?\n');

  // Check if there's an enrollment API we should be calling
  const { data: allEnrollments } = await supabase
    .from('course_enrollments')
    .select('enrollment_type')
    .limit(1000);

  const typeCounts = {};
  if (allEnrollments) {
    allEnrollments.forEach(e => {
      typeCounts[e.enrollment_type || 'null'] = (typeCounts[e.enrollment_type || 'null'] || 0) + 1;
    });
  }

  console.log('   Enrollment types in database:');
  Object.entries(typeCounts).forEach(([type, count]) => {
    console.log(`     - ${type}: ${count}`);
  });

  // QUESTION 7: What happens with group assignments?
  console.log('\n7. EDGE CASE: How do group assignments work?\n');

  const { data: groupAssignments } = await supabase
    .from('learning_path_assignments')
    .select('group_id, path_id')
    .not('group_id', 'is', null)
    .limit(3);

  console.log(`   Found ${groupAssignments.length} group assignments`);

  if (groupAssignments.length > 0) {
    const groupId = groupAssignments[0].group_id;

    // Get group members
    const { data: members } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('community_id', groupId)
      .eq('is_active', true);

    console.log(`   Group ${groupId.substring(0, 8)}... has ${members.length} members`);

    // Check if ANY member is enrolled
    const { data: pathCourses } = await supabase
      .from('learning_path_courses')
      .select('course_id')
      .eq('learning_path_id', groupAssignments[0].path_id);

    if (members.length > 0 && pathCourses.length > 0) {
      const { data: groupEnrollments } = await supabase
        .from('course_enrollments')
        .select('user_id')
        .in('user_id', members.map(m => m.user_id))
        .in('course_id', pathCourses.map(pc => pc.course_id));

      console.log(`   Group member enrollments: ${groupEnrollments.length} out of ${members.length * pathCourses.length} possible`);
      console.log('   ⚠️  Group assignments likely have same issue');
    }
  }

  // FINAL QUESTION: Is there a simpler fix?
  console.log('\n8. ALTERNATIVES: Could we fix this without triggers?\n');
  console.log('   Option A: Fix RLS policy to check learning_path_assignments');
  console.log('   Option B: Add enrollment step to UI (explicit user action)');
  console.log('   Option C: Auto-enroll at assignment time (in function)');
  console.log('   Option D: Auto-enroll on first access (lazy enrollment)');
  console.log('   Option E: Database trigger (proposed solution)');

  console.log('\n=== END OF CHALLENGE ===');
}

challengeDiagnosis().catch(console.error);
