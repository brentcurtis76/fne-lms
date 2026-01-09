/**
 * Utilities for handling lesson_progress block-level deduplication
 *
 * CONTEXT:
 * lesson_progress table is block-level, not lesson-level
 * Each lesson has multiple blocks (typically 8 blocks per lesson)
 * Each block completion creates one lesson_progress record
 *
 * PROBLEM:
 * Counting all records as "lessons" inflates metrics by ~8x
 * Must deduplicate by (user_id, lesson_id) to get actual lesson count
 *
 * USAGE:
 * Use these utilities in all reporting/analytics endpoints that query lesson_progress
 */

export interface LessonProgressBlock {
  id?: string;
  user_id: string;
  lesson_id: string;
  block_id?: string;
  completed_at?: string | null;
  time_spent?: number;
  [key: string]: any; // Allow additional fields from Supabase queries
}

/**
 * Deduplicate lesson_progress blocks by (user_id, lesson_id)
 * Keeps the earliest completion for each unique (user, lesson) pair
 *
 * @param blocks - Array of lesson_progress records
 * @returns Deduplicated array with one record per unique (user_id, lesson_id)
 */
export function deduplicateProgressBlocks(blocks: LessonProgressBlock[]): LessonProgressBlock[] {
  const seen = new Map<string, LessonProgressBlock>();

  blocks.forEach(block => {
    const key = `${block.user_id}_${block.lesson_id}`;

    if (!seen.has(key)) {
      seen.set(key, block);
    } else {
      // Keep the earliest completion
      const existing = seen.get(key)!;
      if (block.completed_at && existing.completed_at) {
        if (new Date(block.completed_at) < new Date(existing.completed_at)) {
          seen.set(key, block);
        }
      }
    }
  });

  return Array.from(seen.values());
}

/**
 * Count unique lessons (deduplicates by lesson_id only)
 * Use when you want total unique lessons across all users
 *
 * @param blocks - Array of lesson_progress records
 * @returns Count of unique lesson_ids
 */
export function countUniqueLessons(blocks: LessonProgressBlock[]): number {
  return new Set(blocks.map(b => b.lesson_id)).size;
}

/**
 * Count unique lesson completions per user
 * Returns a map of user_id → count of unique lessons
 *
 * @param blocks - Array of lesson_progress records
 * @returns Map of user_id to their unique lesson count
 */
export function countUniqueLessonsByUser(blocks: LessonProgressBlock[]): Map<string, number> {
  const userLessons = new Map<string, Set<string>>();

  blocks.forEach(block => {
    if (!userLessons.has(block.user_id)) {
      userLessons.set(block.user_id, new Set());
    }
    userLessons.get(block.user_id)!.add(block.lesson_id);
  });

  const counts = new Map<string, number>();
  userLessons.forEach((lessons, userId) => {
    counts.set(userId, lessons.size);
  });

  return counts;
}

/**
 * Group progress blocks by user and deduplicate lessons
 * Returns detailed stats per user including unique lessons, total time, etc.
 *
 * @param blocks - Array of lesson_progress records
 * @returns Map of user_id to their aggregated stats
 */
export interface UserProgressStats {
  userId: string;
  uniqueLessons: Set<string>;
  uniqueLessonCount: number;
  totalTime: number;
  records: LessonProgressBlock[];
}

export function groupByUserAndDeduplicateLessons(
  blocks: LessonProgressBlock[]
): Map<string, UserProgressStats> {
  const userStats = new Map<string, UserProgressStats>();

  blocks.forEach(block => {
    if (!userStats.has(block.user_id)) {
      userStats.set(block.user_id, {
        userId: block.user_id,
        uniqueLessons: new Set(),
        uniqueLessonCount: 0,
        totalTime: 0,
        records: []
      });
    }

    const stats = userStats.get(block.user_id)!;
    stats.uniqueLessons.add(block.lesson_id);
    stats.totalTime += block.time_spent || 0;
    stats.records.push(block);
  });

  // Update uniqueLessonCount from Set size
  userStats.forEach(stats => {
    stats.uniqueLessonCount = stats.uniqueLessons.size;
  });

  return userStats;
}

/**
 * Sum time_spent across deduplicated lessons
 * Use when calculating total time but want to avoid counting block duplicates
 *
 * Note: This sums time from ONE representative block per (user_id, lesson_id)
 * If blocks store partial time per block, use sumTimeAcrossAllBlocks instead
 *
 * @param blocks - Array of lesson_progress records
 * @returns Total time in seconds
 */
export function sumTimeByUniqueLesson(blocks: LessonProgressBlock[]): number {
  const deduplicated = deduplicateProgressBlocks(blocks);
  return deduplicated.reduce((sum, block) => sum + (block.time_spent || 0), 0);
}

/**
 * Sum time_spent across ALL blocks (no deduplication)
 * Use when each block stores its own time and you want cumulative time
 *
 * @param blocks - Array of lesson_progress records
 * @returns Total time in seconds
 */
export function sumTimeAcrossAllBlocks(blocks: LessonProgressBlock[]): number {
  return blocks.reduce((sum, block) => sum + (block.time_spent || 0), 0);
}

/**
 * Count unique (user_id, lesson_id) pairs
 * Useful for "sessions" or "completions" metrics where you want unique combinations
 *
 * @param blocks - Array of lesson_progress records
 * @returns Count of unique (user, lesson) pairs
 */
export function countUserLessonPairs(blocks: LessonProgressBlock[]): number {
  const pairs = new Set<string>();
  blocks.forEach(block => {
    pairs.add(`${block.user_id}_${block.lesson_id}`);
  });
  return pairs.size;
}

/**
 * Get average time per unique lesson (across all users)
 *
 * @param blocks - Array of lesson_progress records
 * @returns Average time per unique lesson in seconds
 */
export function getAverageTimePerLesson(blocks: LessonProgressBlock[]): number {
  const deduplicated = deduplicateProgressBlocks(blocks);
  if (deduplicated.length === 0) return 0;

  const totalTime = deduplicated.reduce((sum, block) => sum + (block.time_spent || 0), 0);
  return totalTime / deduplicated.length;
}

/**
 * Filter blocks to only include completed ones
 * Helper to avoid null checks everywhere
 *
 * @param blocks - Array of lesson_progress records
 * @returns Only blocks with non-null completed_at
 */
export function filterCompletedBlocks(blocks: LessonProgressBlock[]): LessonProgressBlock[] {
  return blocks.filter(block => block.completed_at !== null && block.completed_at !== undefined);
}
