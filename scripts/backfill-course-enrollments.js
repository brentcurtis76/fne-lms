#!/usr/bin/env node

/**
 * Backfill missing course_enrollments rows for a specific user.
 * Usage: node scripts/backfill-course-enrollments.js --email=user@example.com
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in .env.local');
  process.exit(1);
}

function getArgValue(flag) {
  const arg = process.argv.find(value => value.startsWith(`${flag}=`));
  return arg ? arg.split('=')[1] : null;
}

const email = getArgValue('--email');

if (!email) {
  console.error('Usage: node scripts/backfill-course-enrollments.js --email=user@example.com');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function backfillForUser(userEmail) {
  console.log('🔄 Backfilling course enrollments for', userEmail);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('email', userEmail)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('❌ Unable to find profile for email:', userEmail, profileError?.message || 'Not found');
    process.exit(1);
  }

  const userId = profile.id;
  console.log(`✅ User found: ${profile.first_name || ''} ${profile.last_name || ''} (${userId})`);

  const { data: assignments, error: assignmentsError } = await supabase
    .from('course_assignments')
    .select('course_id, assigned_at, status, assigned_by')
    .eq('teacher_id', userId);

  if (assignmentsError) {
    console.error('❌ Error fetching course assignments:', assignmentsError.message);
    process.exit(1);
  }

  if (!assignments || assignments.length === 0) {
    console.log('ℹ️  No course assignments found for this user. Nothing to backfill.');
    return;
  }

  console.log(`📚 Found ${assignments.length} course assignment(s). Checking enrollments...`);

  let created = 0;

  for (const assignment of assignments) {
    const key = `${assignment.course_id}`;

    const { data: existingEnrollment, error: existingError } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', assignment.course_id)
      .maybeSingle();

    if (existingError) {
      console.error(`❌ Error checking enrollment for course ${key}:`, existingError.message);
      continue;
    }

    if (existingEnrollment) {
      console.log(`✅ Enrollment already exists for course ${assignment.course_id}`);
      continue;
    }

    const { count: lessonCount } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', assignment.course_id);

    const status = assignment.status === 'completed' ? 'completed' : 'active';
    const isCompleted = status === 'completed';

    const enrollmentRecord = {
      course_id: assignment.course_id,
      user_id: userId,
      enrollment_type: 'assigned',
      enrolled_by: assignment.assigned_by || null,
      enrolled_at: assignment.assigned_at || new Date().toISOString(),
      status,
      total_lessons: lessonCount || 0,
      progress_percentage: isCompleted ? 100 : 0,
      is_completed: isCompleted,
      completed_at: isCompleted ? assignment.assigned_at || new Date().toISOString() : null
    };

    const { error: insertError } = await supabase
      .from('course_enrollments')
      .insert(enrollmentRecord);

    if (insertError) {
      console.error(`❌ Failed to create enrollment for course ${assignment.course_id}:`, insertError.message);
      continue;
    }

    created += 1;
    console.log(`➕ Created enrollment for course ${assignment.course_id}`);
  }

  if (created === 0) {
    console.log('ℹ️  No missing enrollments were found.');
  } else {
    console.log(`🎉 Backfill complete. Created ${created} enrollment(s).`);
  }
}

backfillForUser(email).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
