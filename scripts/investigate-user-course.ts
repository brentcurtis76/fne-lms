/**
 * Script to investigate a user's course enrollment and progress history
 * Usage: npx tsx scripts/investigate-user-course.ts <user_email_or_id> [course_id]
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigateUser(userIdentifier: string, courseId?: string) {
  console.log('\n=== USER COURSE INVESTIGATION ===\n');

  // Find the user
  let userId: string;
  let userEmail: string;

  // Check if it's a UUID or email
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userIdentifier);

  if (isUUID) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('id', userIdentifier)
      .single();

    if (!profile) {
      console.error('User not found with ID:', userIdentifier);
      process.exit(1);
    }
    userId = profile.id;
    userEmail = profile.email;
    console.log(`User: ${profile.first_name} ${profile.last_name} (${profile.email})`);
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', userIdentifier)
      .single();

    if (!profile) {
      console.error('User not found with email:', userIdentifier);
      process.exit(1);
    }
    userId = profile.id;
    userEmail = profile.email;
    console.log(`User: ${profile.first_name} ${profile.last_name} (${profile.email})`);
  }

  console.log(`User ID: ${userId}\n`);

  // 1. Check course_enrollments
  console.log('--- COURSE ENROLLMENTS ---');
  let enrollmentQuery = supabase
    .from('course_enrollments')
    .select(`
      id,
      course_id,
      enrolled_at,
      enrollment_type,
      status,
      progress_percentage,
      lessons_completed,
      total_lessons,
      is_completed,
      completed_at,
      updated_at,
      courses(id, title)
    `)
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false });

  if (courseId) {
    enrollmentQuery = enrollmentQuery.eq('course_id', courseId);
  }

  const { data: enrollments, error: enrollError } = await enrollmentQuery;

  if (enrollError) {
    console.error('Error fetching enrollments:', enrollError);
  } else if (!enrollments || enrollments.length === 0) {
    console.log('No enrollments found');
  } else {
    console.log(`Found ${enrollments.length} enrollment(s):\n`);
    for (const enrollment of enrollments) {
      const course = enrollment.courses as any;
      console.log(`  Course: ${course?.title || 'Unknown'} (${enrollment.course_id})`);
      console.log(`    Enrollment ID: ${enrollment.id}`);
      console.log(`    Status: ${enrollment.status}`);
      console.log(`    Type: ${enrollment.enrollment_type}`);
      console.log(`    Progress: ${enrollment.progress_percentage}% (${enrollment.lessons_completed}/${enrollment.total_lessons} lessons)`);
      console.log(`    Completed: ${enrollment.is_completed ? `Yes (${enrollment.completed_at})` : 'No'}`);
      console.log(`    Enrolled at: ${enrollment.enrolled_at}`);
      console.log(`    Last updated: ${enrollment.updated_at}`);
      console.log('');
    }
  }

  // 2. Check learning_path_assignments
  console.log('\n--- LEARNING PATH ASSIGNMENTS ---');
  const { data: lpAssignments, error: lpError } = await supabase
    .from('learning_path_assignments')
    .select(`
      id,
      path_id,
      assigned_at,
      started_at,
      completed_at,
      progress_percentage,
      learning_paths(id, name)
    `)
    .eq('user_id', userId)
    .order('assigned_at', { ascending: false });

  if (lpError) {
    console.error('Error fetching learning path assignments:', lpError);
  } else if (!lpAssignments || lpAssignments.length === 0) {
    console.log('No learning path assignments found');
  } else {
    console.log(`Found ${lpAssignments.length} learning path assignment(s):\n`);
    for (const lpa of lpAssignments) {
      const lp = lpa.learning_paths as any;
      console.log(`  Path: ${lp?.name || 'Unknown'} (${lpa.path_id})`);
      console.log(`    Assigned at: ${lpa.assigned_at}`);
      console.log(`    Started at: ${lpa.started_at || 'Not started'}`);
      console.log(`    Progress: ${lpa.progress_percentage || 0}%`);
      console.log(`    Completed at: ${lpa.completed_at || 'Not completed'}`);
      console.log('');
    }
  }

  // 3. Check lesson_completion_summary (progress details)
  console.log('\n--- LESSON COMPLETION SUMMARY ---');
  let lessonQuery = supabase
    .from('lesson_completion_summary')
    .select(`
      id,
      lesson_id,
      course_id,
      is_completed,
      completion_date,
      blocks_completed,
      total_blocks,
      progress_percentage,
      first_accessed_at,
      last_accessed_at,
      lessons(id, title),
      courses(id, title)
    `)
    .eq('user_id', userId)
    .order('last_accessed_at', { ascending: false })
    .limit(20);

  if (courseId) {
    lessonQuery = lessonQuery.eq('course_id', courseId);
  }

  const { data: lessonSummaries, error: lessonError } = await lessonQuery;

  if (lessonError) {
    console.error('Error fetching lesson summaries:', lessonError);
  } else if (!lessonSummaries || lessonSummaries.length === 0) {
    console.log('No lesson progress found');
  } else {
    console.log(`Found ${lessonSummaries.length} lesson progress record(s):\n`);
    for (const ls of lessonSummaries) {
      const lesson = ls.lessons as any;
      const course = ls.courses as any;
      console.log(`  Lesson: ${lesson?.title || 'Unknown'}`);
      console.log(`    Course: ${course?.title || 'Unknown'}`);
      console.log(`    Progress: ${ls.progress_percentage}% (${ls.blocks_completed}/${ls.total_blocks} blocks)`);
      console.log(`    Completed: ${ls.is_completed ? `Yes (${ls.completion_date})` : 'No'}`);
      console.log(`    First accessed: ${ls.first_accessed_at}`);
      console.log(`    Last accessed: ${ls.last_accessed_at}`);
      console.log('');
    }
  }

  // 4. Check quiz_submissions
  console.log('\n--- QUIZ SUBMISSIONS ---');
  let quizQuery = supabase
    .from('quiz_submissions')
    .select(`
      id,
      lesson_id,
      course_id,
      submitted_at,
      auto_graded_score,
      total_possible_points,
      grading_status,
      attempt_number,
      lessons(id, title),
      courses(id, title)
    `)
    .eq('student_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(20);

  if (courseId) {
    quizQuery = quizQuery.eq('course_id', courseId);
  }

  const { data: quizzes, error: quizError } = await quizQuery;

  if (quizError) {
    console.error('Error fetching quiz submissions:', quizError);
  } else if (!quizzes || quizzes.length === 0) {
    console.log('No quiz submissions found');
  } else {
    console.log(`Found ${quizzes.length} quiz submission(s):\n`);
    for (const quiz of quizzes) {
      const lesson = quiz.lessons as any;
      const course = quiz.courses as any;
      console.log(`  Quiz in: ${lesson?.title || 'Unknown'} (${course?.title || 'Unknown'})`);
      console.log(`    Score: ${quiz.auto_graded_score}/${quiz.total_possible_points}`);
      console.log(`    Attempt: ${quiz.attempt_number}`);
      console.log(`    Status: ${quiz.grading_status}`);
      console.log(`    Submitted: ${quiz.submitted_at}`);
      console.log('');
    }
  }

  // 5. Check activity_feed for this user
  console.log('\n--- RECENT ACTIVITY (last 30 days) ---');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: activities, error: activityError } = await supabase
    .from('activity_feed')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);

  if (activityError) {
    console.error('Error fetching activity feed:', activityError);
  } else if (!activities || activities.length === 0) {
    console.log('No recent activity found');
  } else {
    console.log(`Found ${activities.length} activity record(s):\n`);
    for (const activity of activities) {
      console.log(`  ${activity.activity_type}: ${activity.title}`);
      console.log(`    Entity: ${activity.entity_type} (${activity.entity_id})`);
      console.log(`    Created: ${activity.created_at}`);
      if (activity.metadata) {
        console.log(`    Metadata: ${JSON.stringify(activity.metadata)}`);
      }
      console.log('');
    }
  }

  // 6. Check if course exists and is visible
  if (courseId) {
    console.log('\n--- COURSE STATUS ---');
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, status, visibility, created_at, updated_at')
      .eq('id', courseId)
      .single();

    if (courseError) {
      console.error('Error fetching course:', courseError);
    } else if (!course) {
      console.log('Course not found - may have been deleted');

      // Check deleted_courses table
      const { data: deletedCourse } = await supabase
        .from('deleted_courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (deletedCourse) {
        console.log(`\nFOUND IN DELETED_COURSES:`);
        console.log(`  Title: ${deletedCourse.title}`);
        console.log(`  Deleted at: ${deletedCourse.deleted_at}`);
        console.log(`  Deleted by: ${deletedCourse.deleted_by}`);
      }
    } else {
      console.log(`Course: ${course.title}`);
      console.log(`  Status: ${course.status}`);
      console.log(`  Visibility: ${course.visibility}`);
      console.log(`  Created: ${course.created_at}`);
      console.log(`  Updated: ${course.updated_at}`);
    }
  }

  console.log('\n=== INVESTIGATION COMPLETE ===\n');
}

// Main execution
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx tsx scripts/investigate-user-course.ts <user_email_or_id> [course_id]');
  console.log('Example: npx tsx scripts/investigate-user-course.ts user@example.com');
  console.log('Example: npx tsx scripts/investigate-user-course.ts user@example.com abc123-course-id');
  process.exit(1);
}

investigateUser(args[0], args[1]).catch(console.error);
