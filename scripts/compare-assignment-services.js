/**
 * Comparison Script: Legacy vs New Assignment Services
 * Compares what assignments each service returns for Brent's user
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
const userEmail = 'brent@perrotuertocm.cl';

async function compareServices() {
  console.log('='.repeat(80));
  console.log('COMPARISON: Legacy vs New Assignment Services');
  console.log('='.repeat(80));
  console.log('User:', userEmail);
  console.log('User ID:', userId);
  console.log();

  // Get user's community_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, community_id')
    .eq('id', userId)
    .single();

  console.log('User Profile:', {
    id: profile?.id,
    email: profile?.email,
    community_id: profile?.community_id
  });
  console.log();

  // ============================================================================
  // PART 1: LEGACY SERVICE (lib/services/assignments.js)
  // ============================================================================
  console.log('PART 1: LEGACY SERVICE (lib/services/assignments.js)');
  console.log('='.repeat(80));

  // Step 1: Get enrollments (legacy)
  console.log('\n[LEGACY] Step 1: Get student enrollments...');
  const { data: legacyEnrollments, error: legacyEnrollError } = await supabase
    .from('course_enrollments')
    .select('course_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log('Query:', 'SELECT course_id FROM course_enrollments WHERE user_id = ? AND status = active');
  console.log('Result:', {
    count: legacyEnrollments?.length,
    courseIds: legacyEnrollments?.map(e => e.course_id),
    error: legacyEnrollError?.message
  });

  if (!legacyEnrollments || legacyEnrollments.length === 0) {
    console.log('❌ No enrollments found by legacy service');
    return;
  }

  const legacyCourseIds = legacyEnrollments.map(e => e.course_id);

  // Step 2: Get assignments (legacy approach)
  console.log('\n[LEGACY] Step 2: Get lesson_assignments...');
  const { data: legacyAssignments, error: legacyAssignError } = await supabase
    .from('lesson_assignments')
    .select(`
      id,
      title,
      description,
      course_id,
      lesson_id,
      assignment_type,
      is_published,
      points,
      due_date,
      assigned_to_community_id,
      created_at
    `)
    .in('course_id', legacyCourseIds)
    .eq('is_published', true)
    .order('due_date', { ascending: true });

  console.log('Query:', 'SELECT * FROM lesson_assignments WHERE course_id IN (?) AND is_published = true');
  console.log('Result:', {
    count: legacyAssignments?.length,
    error: legacyAssignError?.message
  });

  if (legacyAssignments && legacyAssignments.length > 0) {
    console.log('\n✅ LEGACY FOUND ASSIGNMENTS:');
    legacyAssignments.forEach((a, i) => {
      console.log(`\n  [${i + 1}] ${a.title}`);
      console.log(`      ID: ${a.id}`);
      console.log(`      Course ID: ${a.course_id}`);
      console.log(`      Assigned to Community: ${a.assigned_to_community_id || 'NULL'}`);
      console.log(`      Type: ${a.assignment_type}`);
      console.log(`      Published: ${a.is_published}`);
      console.log(`      Due Date: ${a.due_date || 'No due date'}`);
      console.log(`      Points: ${a.points || 0}`);
    });
  } else {
    console.log('\n❌ Legacy service found 0 assignments');
  }

  // ============================================================================
  // PART 2: NEW SERVICE (lib/services/userAssignments.ts)
  // ============================================================================
  console.log('\n\n');
  console.log('PART 2: NEW SERVICE (lib/services/userAssignments.ts)');
  console.log('='.repeat(80));

  // Step 1: Get enrollments (new)
  console.log('\n[NEW] Step 1: Get student enrollments...');
  const { data: newEnrollments, error: newEnrollError } = await supabase
    .from('course_enrollments')
    .select('course_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log('Query:', 'SELECT course_id FROM course_enrollments WHERE user_id = ? AND status = active');
  console.log('Result:', {
    count: newEnrollments?.length,
    courseIds: newEnrollments?.map(e => e.course_id),
    error: newEnrollError?.message
  });

  if (!newEnrollments || newEnrollments.length === 0) {
    console.log('❌ No enrollments found by new service');
    return;
  }

  const newCourseIds = newEnrollments.map(e => e.course_id);

  // Step 2: Get assignments (new approach with inner join)
  console.log('\n[NEW] Step 2: Get lesson_assignments...');
  const { data: newAssignments, error: newAssignError } = await supabase
    .from('lesson_assignments')
    .select(`
      *,
      courses!inner (
        id,
        title
      ),
      lessons (
        id,
        title
      )
    `)
    .in('course_id', newCourseIds)
    .eq('is_published', true)
    .order('due_date', { ascending: true });

  console.log('Query:', 'SELECT * FROM lesson_assignments INNER JOIN courses WHERE course_id IN (?) AND is_published = true');
  console.log('Result:', {
    count: newAssignments?.length,
    error: newAssignError?.message
  });

  if (newAssignments && newAssignments.length > 0) {
    console.log('\n✅ NEW SERVICE FOUND ASSIGNMENTS:');
    newAssignments.forEach((a, i) => {
      console.log(`\n  [${i + 1}] ${a.title}`);
      console.log(`      ID: ${a.id}`);
      console.log(`      Course ID: ${a.course_id}`);
      console.log(`      Course Title: ${a.courses?.title}`);
      console.log(`      Assigned to Community: ${a.assigned_to_community_id || 'NULL'}`);
      console.log(`      Type: ${a.assignment_type}`);
      console.log(`      Published: ${a.is_published}`);
    });
  } else {
    console.log('\n❌ New service found 0 assignments');
  }

  // ============================================================================
  // PART 3: CHECK FOR COMMUNITY-SPECIFIC ASSIGNMENTS
  // ============================================================================
  console.log('\n\n');
  console.log('PART 3: COMMUNITY-SPECIFIC ASSIGNMENT CHECK');
  console.log('='.repeat(80));

  // Check if there are assignments with assigned_to_community_id set
  console.log('\n[CHECK] Looking for assignments with assigned_to_community_id...');
  const { data: communityAssignments } = await supabase
    .from('lesson_assignments')
    .select('id, title, course_id, assigned_to_community_id, is_published')
    .not('assigned_to_community_id', 'is', null)
    .limit(10);

  console.log(`Found ${communityAssignments?.length || 0} assignments with assigned_to_community_id set`);

  if (communityAssignments && communityAssignments.length > 0) {
    console.log('\nSample community-specific assignments:');
    communityAssignments.forEach((a, i) => {
      console.log(`  [${i + 1}] ${a.title}`);
      console.log(`      Community ID: ${a.assigned_to_community_id}`);
      console.log(`      Course ID: ${a.course_id}`);
      console.log(`      Published: ${a.is_published}`);
    });

    // Check if any match user's courses
    const matchingCommunityAssignments = communityAssignments.filter(a =>
      legacyCourseIds.includes(a.course_id)
    );

    if (matchingCommunityAssignments.length > 0) {
      console.log(`\n⚠️  Found ${matchingCommunityAssignments.length} community-specific assignments in user's courses!`);
      console.log('These might be filtered out if user community_id doesn\'t match.');
    }
  }

  // ============================================================================
  // PART 4: RAW ASSIGNMENT COUNT
  // ============================================================================
  console.log('\n\n');
  console.log('PART 4: RAW ASSIGNMENT DATA');
  console.log('='.repeat(80));

  console.log('\n[RAW] Checking total lesson_assignments in database...');
  const { count: totalCount } = await supabase
    .from('lesson_assignments')
    .select('*', { count: 'exact', head: true });

  console.log(`Total lesson_assignments in database: ${totalCount}`);

  if (totalCount > 0) {
    const { data: sampleAssignments } = await supabase
      .from('lesson_assignments')
      .select('id, title, course_id, is_published, assigned_to_community_id')
      .limit(5);

    console.log('\nSample assignments:');
    sampleAssignments?.forEach((a, i) => {
      console.log(`  [${i + 1}] ${a.title}`);
      console.log(`      Course: ${a.course_id}`);
      console.log(`      Published: ${a.is_published}`);
      console.log(`      Community: ${a.assigned_to_community_id || 'NULL'}`);
    });
  }

  // ============================================================================
  // PART 5: ANALYSIS
  // ============================================================================
  console.log('\n\n');
  console.log('PART 5: ANALYSIS');
  console.log('='.repeat(80));

  const legacyCount = legacyAssignments?.length || 0;
  const newCount = newAssignments?.length || 0;

  console.log(`\nLegacy Service: ${legacyCount} assignments`);
  console.log(`New Service: ${newCount} assignments`);
  console.log(`Difference: ${legacyCount - newCount}`);

  if (legacyCount > newCount) {
    console.log('\n⚠️  DISCREPANCY DETECTED!');
    console.log('Legacy service returns MORE assignments than new service.');
    console.log('\nPossible reasons:');
    console.log('  1. The !inner join on courses filters out some assignments');
    console.log('  2. Community-specific filtering difference');
    console.log('  3. Different published status interpretation');

    if (legacyAssignments && newAssignments) {
      const legacyIds = new Set(legacyAssignments.map(a => a.id));
      const newIds = new Set(newAssignments.map(a => a.id));

      const missing = legacyAssignments.filter(a => !newIds.has(a.id));

      if (missing.length > 0) {
        console.log(`\n❌ ${missing.length} assignments found by legacy but NOT by new service:`);
        missing.forEach(a => {
          console.log(`    - ${a.title} (ID: ${a.id})`);
          console.log(`      Course: ${a.course_id}`);
          console.log(`      Community: ${a.assigned_to_community_id || 'NULL'}`);
        });
      }
    }
  } else if (newCount > legacyCount) {
    console.log('\n✅ New service returns same or more assignments');
  } else if (legacyCount === 0 && newCount === 0) {
    console.log('\n⚠️  BOTH services return 0 assignments');
    console.log('This suggests the lesson_assignments table is empty OR');
    console.log('all assignments are unpublished OR assigned to specific communities.');
  } else {
    console.log('\n✅ Both services return the same number of assignments');
  }

  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON COMPLETE');
  console.log('='.repeat(80));
}

compareServices().catch(console.error);
