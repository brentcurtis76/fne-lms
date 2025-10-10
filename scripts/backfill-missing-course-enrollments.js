#!/usr/bin/env node

/**
 * Backfill course_enrollments for every course assignment missing one.
 * Usage: node scripts/backfill-missing-course-enrollments.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are present.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function enrollmentKey(courseId, userId) {
  return `${courseId}:${userId}`;
}

async function loadAssignments() {
  const { data, error } = await supabase
    .from('course_assignments')
    .select('id, course_id, teacher_id, assigned_at, assigned_by, status')
    .not('teacher_id', 'is', null);

  if (error) {
    throw new Error(`Error fetching course assignments: ${error.message}`);
  }

  return data || [];
}

async function loadExistingEnrollments() {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('course_id, user_id');

  if (error) {
    throw new Error(`Error fetching course enrollments: ${error.message}`);
  }

  return data || [];
}

async function loadLessonCounts(courseIds) {
  const counts = new Map();

  for (const courseId of courseIds) {
    const { count, error } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', courseId);

    if (error) {
      console.error(`⚠️  Could not fetch lesson count for course ${courseId}: ${error.message}`);
      counts.set(courseId, 0);
    } else {
      counts.set(courseId, count || 0);
    }
  }

  return counts;
}

async function chunkedUpsert(records, chunkSize = 500) {
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('course_enrollments')
      .upsert(chunk, { onConflict: 'course_id,user_id' });

    if (error) {
      throw new Error(`Error inserting enrollments: ${error.message}`);
    }
  }
}

async function backfillAll() {
  console.log('🔄 Loading course assignments...');
  const assignments = await loadAssignments();
  console.log(`   Found ${assignments.length} assignments.`);

  console.log('🔄 Loading existing enrollments...');
  const existing = await loadExistingEnrollments();
  const enrollmentSet = new Set(existing.map(e => enrollmentKey(e.course_id, e.user_id)));
  console.log(`   Found ${existing.length} enrollment rows.`);

  const missingAssignments = assignments.filter(a => !enrollmentSet.has(enrollmentKey(a.course_id, a.teacher_id)));
  if (missingAssignments.length === 0) {
    console.log('✅ No missing enrollments detected.');
    return;
  }

  console.log(`⚠️  Missing enrollments detected for ${missingAssignments.length} assignments.`);

  // Fetch profile data to report summary (optional)
  const uniqueUserIds = [...new Set(missingAssignments.map(a => a.teacher_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, school_id')
    .in('id', uniqueUserIds);

  if (profilesError) {
    console.error('⚠️  Could not load profile data for summary:', profilesError.message);
  }

  if (profiles) {
    const sample = missingAssignments.slice(0, 10).map(a => {
      const profile = profiles.find(p => p.id === a.teacher_id);
      const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '';
      return {
        assignment_id: a.id,
        course_id: a.course_id,
        teacher_id: a.teacher_id,
        email: profile?.email,
        name,
        status: a.status,
        assigned_at: a.assigned_at
      };
    });

    console.log('   Sample missing assignments:', sample);
  }

  const uniqueCourseIds = [...new Set(missingAssignments.map(a => a.course_id))];
  console.log(`   Fetching lesson counts for ${uniqueCourseIds.length} course(s)...`);
  const lessonCounts = await loadLessonCounts(uniqueCourseIds);

  const nowIso = new Date().toISOString();
  const enrollmentRecords = missingAssignments.map(assignment => {
    const totalLessons = lessonCounts.get(assignment.course_id) ?? 0;
    const completed = assignment.status === 'completed';

    return {
      course_id: assignment.course_id,
      user_id: assignment.teacher_id,
      enrollment_type: 'assigned',
      enrolled_by: assignment.assigned_by || null,
      enrolled_at: assignment.assigned_at || nowIso,
      status: completed ? 'completed' : 'active',
      total_lessons: totalLessons,
      lessons_completed: completed ? totalLessons : 0,
      progress_percentage: completed ? 100 : 0,
      is_completed: completed,
      completed_at: completed ? (assignment.assigned_at || nowIso) : null
    };
  });

  console.log('⬆️  Inserting missing enrollments...');
  await chunkedUpsert(enrollmentRecords, 200);
  console.log(`✅ Inserted/updated ${enrollmentRecords.length} enrollment row(s).`);
}

backfillAll().catch(error => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
