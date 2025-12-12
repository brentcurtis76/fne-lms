/**
 * Find users with lesson_progress records but mismatched enrollment progress
 *
 * Cases to find:
 * 1. User has lesson_progress but NO enrollment for that course
 * 2. User has lesson_progress but enrollment shows 0% despite completed blocks
 * 3. User has lesson_progress but enrollment created AFTER the progress was made
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MismatchCase {
  userId: string;
  userEmail: string;
  userName: string;
  courseId: string;
  courseTitle: string;
  progressBlocks: number;
  uniqueLessonsWithProgress: number;
  totalLessonsInCourse: number;
  enrollmentExists: boolean;
  enrollmentProgress: number;
  enrollmentLessonsCompleted: number;
  enrollmentCreatedAt: string | null;
  firstProgressAt: string;
  lastProgressAt: string;
  issue: 'no_enrollment' | 'zero_progress' | 'stale_enrollment';
}

async function findMismatches() {
  console.log('=== Finding Progress/Enrollment Mismatches ===\n');

  // Step 1: Get all lesson_progress records grouped by user and course
  console.log('Fetching all lesson_progress records...');
  const { data: allProgress, error: progressError } = await supabase
    .from('lesson_progress')
    .select(`
      user_id,
      lesson_id,
      block_id,
      completed_at,
      lessons!inner(id, course_id)
    `)
    .not('completed_at', 'is', null);

  if (progressError) {
    console.error('Error fetching progress:', progressError);
    return;
  }

  console.log(`Found ${allProgress?.length || 0} progress records`);

  // Group by user_id + course_id
  const userCourseProgress = new Map<string, {
    userId: string;
    courseId: string;
    blocks: Set<string>;
    lessons: Set<string>;
    firstProgress: Date;
    lastProgress: Date;
  }>();

  for (const record of allProgress || []) {
    const courseId = (record.lessons as any)?.course_id;
    if (!courseId) continue;

    const key = `${record.user_id}_${courseId}`;

    if (!userCourseProgress.has(key)) {
      userCourseProgress.set(key, {
        userId: record.user_id,
        courseId,
        blocks: new Set(),
        lessons: new Set(),
        firstProgress: new Date(record.completed_at!),
        lastProgress: new Date(record.completed_at!)
      });
    }

    const entry = userCourseProgress.get(key)!;
    entry.blocks.add(record.block_id!);
    entry.lessons.add(record.lesson_id);

    const completedDate = new Date(record.completed_at!);
    if (completedDate < entry.firstProgress) entry.firstProgress = completedDate;
    if (completedDate > entry.lastProgress) entry.lastProgress = completedDate;
  }

  console.log(`Found ${userCourseProgress.size} unique user-course combinations with progress\n`);

  // Step 2: Check enrollments for each
  const mismatches: MismatchCase[] = [];
  let processed = 0;

  for (const [key, progress] of userCourseProgress) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`Processing ${processed}/${userCourseProgress.size}...`);
    }

    // Get enrollment
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('progress_percentage, lessons_completed, total_lessons, created_at')
      .eq('user_id', progress.userId)
      .eq('course_id', progress.courseId)
      .maybeSingle();

    // Get course info
    const { data: course } = await supabase
      .from('courses')
      .select('title')
      .eq('id', progress.courseId)
      .single();

    // Get total lessons in course
    const { count: totalLessons } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', progress.courseId);

    // Determine if there's a mismatch
    let issue: MismatchCase['issue'] | null = null;

    if (!enrollment) {
      issue = 'no_enrollment';
    } else if (enrollment.progress_percentage === 0 && progress.blocks.size > 0) {
      issue = 'zero_progress';
    } else if (enrollment.created_at && new Date(enrollment.created_at) > progress.lastProgress) {
      // Enrollment was created after progress was made - might have lost progress
      if (enrollment.progress_percentage === 0) {
        issue = 'stale_enrollment';
      }
    }

    if (issue) {
      // Get user info
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', progress.userId)
        .single();

      mismatches.push({
        userId: progress.userId,
        userEmail: profile?.email || 'unknown',
        userName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Unknown',
        courseId: progress.courseId,
        courseTitle: course?.title || 'Unknown',
        progressBlocks: progress.blocks.size,
        uniqueLessonsWithProgress: progress.lessons.size,
        totalLessonsInCourse: totalLessons || 0,
        enrollmentExists: !!enrollment,
        enrollmentProgress: enrollment?.progress_percentage || 0,
        enrollmentLessonsCompleted: enrollment?.lessons_completed || 0,
        enrollmentCreatedAt: enrollment?.created_at || null,
        firstProgressAt: progress.firstProgress.toISOString(),
        lastProgressAt: progress.lastProgress.toISOString(),
        issue
      });
    }
  }

  // Step 3: Report findings
  console.log('\n=== RESULTS ===\n');

  const noEnrollment = mismatches.filter(m => m.issue === 'no_enrollment');
  const zeroProgress = mismatches.filter(m => m.issue === 'zero_progress');
  const staleEnrollment = mismatches.filter(m => m.issue === 'stale_enrollment');

  console.log(`Total mismatches found: ${mismatches.length}`);
  console.log(`  - No enrollment: ${noEnrollment.length}`);
  console.log(`  - Zero progress despite blocks: ${zeroProgress.length}`);
  console.log(`  - Stale enrollment (created after progress): ${staleEnrollment.length}`);

  // Group by course
  const byCourse = new Map<string, MismatchCase[]>();
  for (const m of mismatches) {
    if (!byCourse.has(m.courseId)) {
      byCourse.set(m.courseId, []);
    }
    byCourse.get(m.courseId)!.push(m);
  }

  console.log('\n=== BY COURSE ===\n');
  for (const [courseId, cases] of byCourse) {
    console.log(`${cases[0].courseTitle} (${courseId})`);
    console.log(`  Affected users: ${cases.length}`);
    console.log(`  Issues: ${cases.filter(c => c.issue === 'no_enrollment').length} no enrollment, ${cases.filter(c => c.issue === 'zero_progress').length} zero progress, ${cases.filter(c => c.issue === 'stale_enrollment').length} stale`);
  }

  console.log('\n=== AFFECTED USERS (first 20) ===\n');
  for (const m of mismatches.slice(0, 20)) {
    console.log(`${m.userName} (${m.userEmail})`);
    console.log(`  Course: ${m.courseTitle}`);
    console.log(`  Issue: ${m.issue}`);
    console.log(`  Progress: ${m.progressBlocks} blocks, ${m.uniqueLessonsWithProgress}/${m.totalLessonsInCourse} lessons`);
    console.log(`  Enrollment: ${m.enrollmentExists ? `exists (${m.enrollmentProgress}%)` : 'MISSING'}`);
    if (m.enrollmentCreatedAt) {
      console.log(`  Enrollment created: ${m.enrollmentCreatedAt}`);
    }
    console.log(`  Progress dates: ${m.firstProgressAt.split('T')[0]} to ${m.lastProgressAt.split('T')[0]}`);
    console.log('');
  }

  // Export full list
  console.log('\n=== FULL MISMATCH DATA ===\n');
  console.log(JSON.stringify(mismatches, null, 2));

  return mismatches;
}

findMismatches().catch(console.error);
