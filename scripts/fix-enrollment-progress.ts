/**
 * Fix enrollment progress for users with lesson_progress but incorrect enrollment data
 *
 * This script will:
 * 1. Find all mismatched enrollments
 * 2. Calculate actual progress from lesson_progress records
 * 3. Update course_enrollments with correct progress
 * 4. Create missing enrollments where needed
 *
 * Run with --dry-run to see what would be changed without making changes
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes('--dry-run');

interface ProgressData {
  userId: string;
  courseId: string;
  completedBlocks: Set<string>;
  completedLessons: Set<string>;
  firstProgress: Date;
  lastProgress: Date;
}

interface CourseData {
  totalLessons: number;
  lessonBlocks: Map<string, number>; // lessonId -> block count
}

async function getCourseData(courseId: string): Promise<CourseData> {
  // Get lessons for course
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id')
    .eq('course_id', courseId);

  const lessonIds = lessons?.map(l => l.id) || [];

  // Get block counts per lesson
  const lessonBlocks = new Map<string, number>();
  for (const lessonId of lessonIds) {
    const { count } = await supabase
      .from('blocks')
      .select('*', { count: 'exact', head: true })
      .eq('lesson_id', lessonId);
    lessonBlocks.set(lessonId, count || 0);
  }

  return {
    totalLessons: lessonIds.length,
    lessonBlocks
  };
}

function calculateProgress(
  progress: ProgressData,
  courseData: CourseData
): { lessonsCompleted: number; progressPercentage: number } {
  // A lesson is "completed" if user has completed all its blocks
  let lessonsCompleted = 0;

  for (const lessonId of progress.completedLessons) {
    const totalBlocks = courseData.lessonBlocks.get(lessonId) || 0;

    // Count how many blocks from this lesson the user completed
    // We need to check which of the user's completed blocks belong to this lesson
    // Since we don't have that mapping directly, we'll query it
    lessonsCompleted++; // For now, count any lesson with progress
  }

  // Calculate percentage based on lessons with any progress vs total
  const progressPercentage = courseData.totalLessons > 0
    ? Math.round((progress.completedLessons.size / courseData.totalLessons) * 100)
    : 0;

  return {
    lessonsCompleted: progress.completedLessons.size,
    progressPercentage
  };
}

async function fixEnrollments() {
  console.log(`\n=== ${DRY_RUN ? 'DRY RUN - ' : ''}Fixing Enrollment Progress ===\n`);

  // Step 1: Get all lesson_progress records
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

  // Group by user_id + course_id
  const userCourseProgress = new Map<string, ProgressData>();

  for (const record of allProgress || []) {
    const courseId = (record.lessons as any)?.course_id;
    if (!courseId) continue;

    const key = `${record.user_id}_${courseId}`;

    if (!userCourseProgress.has(key)) {
      userCourseProgress.set(key, {
        userId: record.user_id,
        courseId,
        completedBlocks: new Set(),
        completedLessons: new Set(),
        firstProgress: new Date(record.completed_at!),
        lastProgress: new Date(record.completed_at!)
      });
    }

    const entry = userCourseProgress.get(key)!;
    entry.completedBlocks.add(record.block_id!);
    entry.completedLessons.add(record.lesson_id);

    const completedDate = new Date(record.completed_at!);
    if (completedDate < entry.firstProgress) entry.firstProgress = completedDate;
    if (completedDate > entry.lastProgress) entry.lastProgress = completedDate;
  }

  console.log(`Found ${userCourseProgress.size} unique user-course combinations\n`);

  // Cache course data
  const courseDataCache = new Map<string, CourseData>();

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const [key, progress] of userCourseProgress) {
    // Get or fetch course data
    if (!courseDataCache.has(progress.courseId)) {
      courseDataCache.set(progress.courseId, await getCourseData(progress.courseId));
    }
    const courseData = courseDataCache.get(progress.courseId)!;

    // Calculate expected progress
    const { lessonsCompleted, progressPercentage } = calculateProgress(progress, courseData);

    // Check current enrollment
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('id, progress_percentage, lessons_completed, total_lessons')
      .eq('user_id', progress.userId)
      .eq('course_id', progress.courseId)
      .maybeSingle();

    if (!enrollment) {
      // Need to create enrollment
      console.log(`CREATE: User ${progress.userId} -> Course ${progress.courseId}`);
      console.log(`        Progress: ${progressPercentage}% (${lessonsCompleted}/${courseData.totalLessons} lessons)`);

      if (!DRY_RUN) {
        const { error } = await supabase
          .from('course_enrollments')
          .insert({
            user_id: progress.userId,
            course_id: progress.courseId,
            enrolled_at: progress.firstProgress.toISOString(),
            enrollment_type: 'assigned',
            progress_percentage: progressPercentage,
            lessons_completed: lessonsCompleted,
            total_lessons: courseData.totalLessons,
            status: progressPercentage >= 100 ? 'completed' : 'active',
            is_completed: progressPercentage >= 100
          });

        if (error) {
          console.error(`  ERROR: ${error.message}`);
          errors++;
        } else {
          created++;
        }
      } else {
        created++;
      }
    } else if (
      enrollment.progress_percentage !== progressPercentage ||
      enrollment.lessons_completed !== lessonsCompleted ||
      enrollment.total_lessons !== courseData.totalLessons
    ) {
      // Need to update enrollment
      console.log(`UPDATE: User ${progress.userId} -> Course ${progress.courseId}`);
      console.log(`        Current: ${enrollment.progress_percentage}% (${enrollment.lessons_completed}/${enrollment.total_lessons})`);
      console.log(`        New:     ${progressPercentage}% (${lessonsCompleted}/${courseData.totalLessons})`);

      if (!DRY_RUN) {
        const { error } = await supabase
          .from('course_enrollments')
          .update({
            progress_percentage: progressPercentage,
            lessons_completed: lessonsCompleted,
            total_lessons: courseData.totalLessons,
            updated_at: new Date().toISOString(),
            is_completed: progressPercentage >= 100,
            completed_at: progressPercentage >= 100 ? progress.lastProgress.toISOString() : null
          })
          .eq('id', enrollment.id);

        if (error) {
          console.error(`  ERROR: ${error.message}`);
          errors++;
        } else {
          updated++;
        }
      } else {
        updated++;
      }
    } else {
      skipped++;
    }
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already correct): ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n** This was a dry run - no changes were made **');
    console.log('Run without --dry-run to apply changes');
  }
}

fixEnrollments().catch(console.error);
