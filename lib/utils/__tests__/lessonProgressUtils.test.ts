/**
 * Unit tests for lessonProgressUtils
 *
 * Coverage target: 100%
 * Testing strategy: Happy path + edge cases + real-world scenarios
 */

import { describe, it, expect } from 'vitest';
import {
  deduplicateProgressBlocks,
  countUniqueLessons,
  countUniqueLessonsByUser,
  groupByUserAndDeduplicateLessons,
  sumTimeByUniqueLesson,
  sumTimeAcrossAllBlocks,
  countUserLessonPairs,
  getAverageTimePerLesson,
  filterCompletedBlocks,
  type LessonProgressBlock,
} from '../lessonProgressUtils';

describe('lessonProgressUtils', () => {
  // Test data: 3 lessons × 8 blocks each = 24 total blocks
  const mockBlocks: LessonProgressBlock[] = [
    // Lesson 1 - 8 blocks
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `block-1-${i}`,
      user_id: 'user-1',
      lesson_id: 'lesson-1',
      block_id: `block-${i}`,
      completed_at: '2025-01-10T10:00:00Z',
      time_spent: 120, // 120 seconds per block
    })),
    // Lesson 2 - 8 blocks
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `block-2-${i}`,
      user_id: 'user-1',
      lesson_id: 'lesson-2',
      block_id: `block-${i}`,
      completed_at: '2025-01-10T11:00:00Z',
      time_spent: 180,
    })),
    // Lesson 3 - 8 blocks
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `block-3-${i}`,
      user_id: 'user-1',
      lesson_id: 'lesson-3',
      block_id: `block-${i}`,
      completed_at: '2025-01-10T12:00:00Z',
      time_spent: 150,
    })),
  ];

  describe('deduplicateProgressBlocks', () => {
    it('should deduplicate 24 blocks to 3 unique lessons', () => {
      const result = deduplicateProgressBlocks(mockBlocks);
      expect(result).toHaveLength(3);
    });

    it('should keep one record per (user_id, lesson_id)', () => {
      const result = deduplicateProgressBlocks(mockBlocks);
      const keys = result.map(b => `${b.user_id}_${b.lesson_id}`);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);
    });

    it('should keep the earliest completion for duplicates', () => {
      const blocks: LessonProgressBlock[] = [
        {
          user_id: 'user-1',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T12:00:00Z',
          time_spent: 100,
        },
        {
          user_id: 'user-1',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T10:00:00Z', // Earlier
          time_spent: 200,
        },
        {
          user_id: 'user-1',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T14:00:00Z',
          time_spent: 150,
        },
      ];

      const result = deduplicateProgressBlocks(blocks);
      expect(result).toHaveLength(1);
      expect(result[0].completed_at).toBe('2025-01-10T10:00:00Z');
    });

    it('should handle empty array', () => {
      const result = deduplicateProgressBlocks([]);
      expect(result).toEqual([]);
    });

    it('should handle single record', () => {
      const blocks: LessonProgressBlock[] = [
        {
          user_id: 'user-1',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T10:00:00Z',
          time_spent: 100,
        },
      ];

      const result = deduplicateProgressBlocks(blocks);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(blocks[0]);
    });

    it('should handle multiple users correctly', () => {
      const blocks: LessonProgressBlock[] = [
        {
          user_id: 'user-1',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T10:00:00Z',
          time_spent: 100,
        },
        {
          user_id: 'user-1',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T11:00:00Z',
          time_spent: 100,
        },
        {
          user_id: 'user-2',
          lesson_id: 'lesson-1',
          completed_at: '2025-01-10T10:00:00Z',
          time_spent: 100,
        },
      ];

      const result = deduplicateProgressBlocks(blocks);
      expect(result).toHaveLength(2); // One per user
    });
  });

  describe('countUniqueLessons', () => {
    it('should count 3 unique lessons from 24 blocks', () => {
      const count = countUniqueLessons(mockBlocks);
      expect(count).toBe(3);
    });

    it('should handle empty array', () => {
      const count = countUniqueLessons([]);
      expect(count).toBe(0);
    });

    it('should count across multiple users', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-2', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: 100 },
      ];

      const count = countUniqueLessons(blocks);
      expect(count).toBe(2); // lesson-1 and lesson-2
    });
  });

  describe('countUniqueLessonsByUser', () => {
    it('should return 3 lessons for user-1', () => {
      const counts = countUniqueLessonsByUser(mockBlocks);
      expect(counts.get('user-1')).toBe(3);
    });

    it('should handle multiple users', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 }, // Duplicate
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: 100 },
        { user_id: 'user-2', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-2', lesson_id: 'lesson-1', time_spent: 100 }, // Duplicate
      ];

      const counts = countUniqueLessonsByUser(blocks);
      expect(counts.get('user-1')).toBe(2);
      expect(counts.get('user-2')).toBe(1);
      expect(counts.size).toBe(2);
    });

    it('should handle empty array', () => {
      const counts = countUniqueLessonsByUser([]);
      expect(counts.size).toBe(0);
    });
  });

  describe('groupByUserAndDeduplicateLessons', () => {
    it('should group blocks by user with correct stats', () => {
      const grouped = groupByUserAndDeduplicateLessons(mockBlocks);

      const user1Stats = grouped.get('user-1')!;
      expect(user1Stats.uniqueLessonCount).toBe(3);
      expect(user1Stats.uniqueLessons.size).toBe(3);
      expect(user1Stats.records).toHaveLength(24);
    });

    it('should calculate total time correctly', () => {
      const grouped = groupByUserAndDeduplicateLessons(mockBlocks);
      const user1Stats = grouped.get('user-1')!;

      // 8 blocks × 120s + 8 blocks × 180s + 8 blocks × 150s
      const expectedTime = 8 * 120 + 8 * 180 + 8 * 150;
      expect(user1Stats.totalTime).toBe(expectedTime);
    });

    it('should handle multiple users', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: 150 },
        { user_id: 'user-2', lesson_id: 'lesson-1', time_spent: 200 },
      ];

      const grouped = groupByUserAndDeduplicateLessons(blocks);

      expect(grouped.size).toBe(2);
      expect(grouped.get('user-1')!.uniqueLessonCount).toBe(2);
      expect(grouped.get('user-1')!.totalTime).toBe(250);
      expect(grouped.get('user-2')!.uniqueLessonCount).toBe(1);
      expect(grouped.get('user-2')!.totalTime).toBe(200);
    });

    it('should handle empty array', () => {
      const grouped = groupByUserAndDeduplicateLessons([]);
      expect(grouped.size).toBe(0);
    });

    it('should handle null/undefined time_spent', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: undefined },
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: null as any },
        { user_id: 'user-1', lesson_id: 'lesson-3', time_spent: 100 },
      ];

      const grouped = groupByUserAndDeduplicateLessons(blocks);
      expect(grouped.get('user-1')!.totalTime).toBe(100);
    });
  });

  describe('sumTimeByUniqueLesson', () => {
    it('should sum time from 3 unique lessons, not 24 blocks', () => {
      const totalTime = sumTimeByUniqueLesson(mockBlocks);

      // Should take ONE block per lesson (deduplicated)
      // First block of each lesson: 120 + 180 + 150 = 450
      expect(totalTime).toBe(450);
    });

    it('should handle empty array', () => {
      const totalTime = sumTimeByUniqueLesson([]);
      expect(totalTime).toBe(0);
    });

    it('should handle null/undefined time_spent', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: undefined },
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: null as any },
      ];

      const totalTime = sumTimeByUniqueLesson(blocks);
      expect(totalTime).toBe(0);
    });
  });

  describe('sumTimeAcrossAllBlocks', () => {
    it('should sum time from ALL 24 blocks', () => {
      const totalTime = sumTimeAcrossAllBlocks(mockBlocks);

      // All blocks: 8×120 + 8×180 + 8×150 = 3600
      expect(totalTime).toBe(3600);
    });

    it('should handle empty array', () => {
      const totalTime = sumTimeAcrossAllBlocks([]);
      expect(totalTime).toBe(0);
    });

    it('should handle null/undefined time_spent', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: undefined },
        { user_id: 'user-1', lesson_id: 'lesson-3', time_spent: null as any },
      ];

      const totalTime = sumTimeAcrossAllBlocks(blocks);
      expect(totalTime).toBe(100);
    });
  });

  describe('countUserLessonPairs', () => {
    it('should count 3 unique (user, lesson) pairs from 24 blocks', () => {
      const count = countUserLessonPairs(mockBlocks);
      expect(count).toBe(3);
    });

    it('should handle multiple users', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-1', time_spent: 100 }, // Duplicate pair
        { user_id: 'user-1', lesson_id: 'lesson-2', time_spent: 100 },
        { user_id: 'user-2', lesson_id: 'lesson-1', time_spent: 100 }, // Different user
        { user_id: 'user-2', lesson_id: 'lesson-2', time_spent: 100 },
      ];

      const count = countUserLessonPairs(blocks);
      expect(count).toBe(4); // (user-1, lesson-1), (user-1, lesson-2), (user-2, lesson-1), (user-2, lesson-2)
    });

    it('should handle empty array', () => {
      const count = countUserLessonPairs([]);
      expect(count).toBe(0);
    });
  });

  describe('getAverageTimePerLesson', () => {
    it('should calculate average from deduplicated lessons', () => {
      const avgTime = getAverageTimePerLesson(mockBlocks);

      // Deduplicated: 120 + 180 + 150 = 450 / 3 = 150
      expect(avgTime).toBe(150);
    });

    it('should handle empty array', () => {
      const avgTime = getAverageTimePerLesson([]);
      expect(avgTime).toBe(0);
    });

    it('should handle varying times', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', completed_at: '2025-01-10T10:00:00Z', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', completed_at: '2025-01-10T10:00:00Z', time_spent: 200 },
        { user_id: 'user-1', lesson_id: 'lesson-3', completed_at: '2025-01-10T10:00:00Z', time_spent: 300 },
      ];

      const avgTime = getAverageTimePerLesson(blocks);
      expect(avgTime).toBe(200); // (100 + 200 + 300) / 3
    });
  });

  describe('filterCompletedBlocks', () => {
    it('should filter out blocks with null completed_at', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', completed_at: '2025-01-10T10:00:00Z', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', completed_at: null, time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-3', completed_at: '2025-01-10T11:00:00Z', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-4', completed_at: undefined, time_spent: 100 },
      ];

      const filtered = filterCompletedBlocks(blocks);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].lesson_id).toBe('lesson-1');
      expect(filtered[1].lesson_id).toBe('lesson-3');
    });

    it('should handle empty array', () => {
      const filtered = filterCompletedBlocks([]);
      expect(filtered).toEqual([]);
    });

    it('should handle all completed', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', completed_at: '2025-01-10T10:00:00Z', time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', completed_at: '2025-01-10T11:00:00Z', time_spent: 100 },
      ];

      const filtered = filterCompletedBlocks(blocks);
      expect(filtered).toHaveLength(2);
    });

    it('should handle all incomplete', () => {
      const blocks: LessonProgressBlock[] = [
        { user_id: 'user-1', lesson_id: 'lesson-1', completed_at: null, time_spent: 100 },
        { user_id: 'user-1', lesson_id: 'lesson-2', completed_at: undefined, time_spent: 100 },
      ];

      const filtered = filterCompletedBlocks(blocks);
      expect(filtered).toHaveLength(0);
    });
  });

  // Real-world scenario: Maite Costa case
  describe('Real-world scenario: Maite Costa (24 blocks → 3 lessons)', () => {
    it('should correctly report 3 lessons from 24 block records', () => {
      // Simulate Maite's actual data
      const maitesBlocks = mockBlocks; // 24 blocks across 3 lessons

      const uniqueLessons = countUniqueLessons(maitesBlocks);
      const deduplicated = deduplicateProgressBlocks(maitesBlocks);
      const userCounts = countUniqueLessonsByUser(maitesBlocks);
      const pairs = countUserLessonPairs(maitesBlocks);

      expect(uniqueLessons).toBe(3); // Not 24!
      expect(deduplicated).toHaveLength(3); // Not 24!
      expect(userCounts.get('user-1')).toBe(3); // Not 24!
      expect(pairs).toBe(3); // Not 24!
    });
  });
});
