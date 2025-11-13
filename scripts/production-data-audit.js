/**
 * Production Data Audit
 * Comprehensive check of production database to find assignment data
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

async function auditProduction() {
  console.log('='.repeat(80));
  console.log('PRODUCTION DATABASE AUDIT');
  console.log('='.repeat(80));
  console.log('Supabase Instance:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('Target User:', userId);
  console.log();

  // ============================================================================
  // SECTION 1: ASSIGNMENT TABLES INVENTORY
  // ============================================================================
  console.log('SECTION 1: Assignment Tables Inventory');
  console.log('-'.repeat(80));

  const tables = [
    'lesson_assignments',
    'course_assignments',
    'assignments',
    'lesson_assignment_submissions'
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    console.log(`\n${table}:`);
    console.log(`  Total Rows: ${count ?? 'ERROR'}`);
    if (error) console.log(`  Error: ${error.message}`);

    if (count > 0) {
      const { data: sample } = await supabase
        .from(table)
        .select('*')
        .limit(3);

      if (sample && sample.length > 0) {
        console.log(`  Sample Columns:`, Object.keys(sample[0]).join(', '));
        console.log(`  First Record:`, JSON.stringify(sample[0], null, 2));
      }
    }
  }

  // ============================================================================
  // SECTION 2: LESSON_ASSIGNMENTS DEEP DIVE
  // ============================================================================
  console.log('\n\n');
  console.log('SECTION 2: lesson_assignments Deep Dive');
  console.log('-'.repeat(80));

  // Check for ANY assignments (published or not)
  const { data: anyAssignments, count: totalAssignments } = await supabase
    .from('lesson_assignments')
    .select('*', { count: 'exact' })
    .limit(10);

  console.log(`\nTotal lesson_assignments: ${totalAssignments}`);

  if (anyAssignments && anyAssignments.length > 0) {
    console.log('\nSample Assignments:');
    anyAssignments.forEach((a, i) => {
      console.log(`\n  [${i + 1}] ${a.title || 'Untitled'}`);
      console.log(`      ID: ${a.id}`);
      console.log(`      Course: ${a.course_id}`);
      console.log(`      Published: ${a.is_published}`);
      console.log(`      Community: ${a.assigned_to_community_id || 'NULL'}`);
      console.log(`      Type: ${a.assignment_type}`);
      console.log(`      Due: ${a.due_date || 'No due date'}`);
    });

    // Check published vs unpublished
    const { count: publishedCount } = await supabase
      .from('lesson_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', true);

    const { count: unpublishedCount } = await supabase
      .from('lesson_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('is_published', false);

    console.log(`\nPublished: ${publishedCount}`);
    console.log(`Unpublished: ${unpublishedCount}`);

    // Check for community-specific
    const { count: communitySpecific } = await supabase
      .from('lesson_assignments')
      .select('*', { count: 'exact', head: true })
      .not('assigned_to_community_id', 'is', null);

    console.log(`Community-specific: ${communitySpecific}`);
  } else {
    console.log('\n⚠️  lesson_assignments table is EMPTY');
  }

  // ============================================================================
  // SECTION 3: USER ENROLLMENT DATA
  // ============================================================================
  console.log('\n\n');
  console.log('SECTION 3: User Enrollment Data');
  console.log('-'.repeat(80));

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, first_name, last_name, community_id')
    .eq('id', userId)
    .single();

  console.log('\nUser Profile:');
  console.log(JSON.stringify(profile, null, 2));

  const { data: enrollments } = await supabase
    .from('course_enrollments')
    .select(`
      id,
      course_id,
      status,
      enrolled_at,
      courses (id, title, status)
    `)
    .eq('user_id', userId);

  console.log(`\nEnrollments: ${enrollments?.length || 0}`);
  enrollments?.forEach((e, i) => {
    console.log(`\n  [${i + 1}] ${e.courses?.title || 'Unknown Course'}`);
    console.log(`      Course ID: ${e.course_id}`);
    console.log(`      Enrollment Status: ${e.status}`);
    console.log(`      Course Status: ${e.courses?.status || 'N/A'}`);
    console.log(`      Enrolled: ${e.enrolled_at}`);
  });

  // ============================================================================
  // SECTION 4: SUBMISSIONS DATA
  // ============================================================================
  console.log('\n\n');
  console.log('SECTION 4: Submissions Data');
  console.log('-'.repeat(80));

  const { data: submissions, count: submissionCount } = await supabase
    .from('lesson_assignment_submissions')
    .select('*', { count: 'exact' })
    .eq('student_id', userId);

  console.log(`\nUser's Submissions: ${submissionCount}`);

  if (submissions && submissions.length > 0) {
    submissions.forEach((s, i) => {
      console.log(`\n  [${i + 1}] Assignment: ${s.assignment_id}`);
      console.log(`      Status: ${s.status}`);
      console.log(`      Submitted: ${s.submitted_at}`);
      console.log(`      Is Original: ${s.is_original}`);
    });
  }

  // Check total submissions in system
  const { count: totalSubmissions } = await supabase
    .from('lesson_assignment_submissions')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTotal submissions in database: ${totalSubmissions}`);

  // ============================================================================
  // SECTION 5: COURSE DATA
  // ============================================================================
  console.log('\n\n');
  console.log('SECTION 5: Course Data');
  console.log('-'.repeat(80));

  if (enrollments && enrollments.length > 0) {
    const courseIds = enrollments.map(e => e.course_id);

    const { data: courses } = await supabase
      .from('courses')
      .select('id, title, status, created_at')
      .in('id', courseIds);

    console.log(`\nUser's Courses (${courses?.length}):`);
    courses?.forEach((c, i) => {
      console.log(`\n  [${i + 1}] ${c.title}`);
      console.log(`      ID: ${c.id}`);
      console.log(`      Status: ${c.status}`);
      console.log(`      Created: ${c.created_at}`);
    });

    // Check for lessons in these courses
    const { data: lessons, count: lessonCount } = await supabase
      .from('lessons')
      .select('id, title, course_id', { count: 'exact' })
      .in('course_id', courseIds);

    console.log(`\nLessons in user's courses: ${lessonCount}`);

    if (lessons && lessons.length > 0) {
      console.log('\nSample lessons:');
      lessons.slice(0, 5).forEach((l, i) => {
        console.log(`  [${i + 1}] ${l.title} (Course: ${l.course_id})`);
      });
    }
  }

  // ============================================================================
  // SECTION 6: ALTERNATIVE DATA SOURCES
  // ============================================================================
  console.log('\n\n');
  console.log('SECTION 6: Check for Alternative Data Sources');
  console.log('-'.repeat(80));

  // Check if there's data in old schema tables
  const alternativeTables = [
    'student_assignments',
    'homework',
    'tasks',
    'activities'
  ];

  console.log('\nChecking for alternative assignment tables...');
  for (const table of alternativeTables) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (count !== null) {
        console.log(`  ${table}: ${count} rows`);
      }
    } catch (e) {
      // Table doesn't exist - that's ok
    }
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n\n');
  console.log('='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));

  console.log('\nKEY FINDINGS:');
  console.log(`1. lesson_assignments: ${totalAssignments} rows`);
  console.log(`2. lesson_assignment_submissions: ${totalSubmissions} rows`);
  console.log(`3. User enrollments: ${enrollments?.length || 0}`);
  console.log(`4. User submissions: ${submissionCount}`);

  if (totalAssignments === 0) {
    console.log('\n⚠️  CRITICAL: lesson_assignments table is EMPTY in production!');
    console.log('This explains why no assignments are visible to users.');
    console.log('\nPossible reasons:');
    console.log('  - Data migration incomplete');
    console.log('  - Assignments stored in different table');
    console.log('  - Fresh installation with no data');
    console.log('  - Data deletion/cleanup occurred');
  }

  console.log('\n' + '='.repeat(80));
}

auditProduction().catch(console.error);
