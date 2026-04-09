import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateActivityScore } from '../../../lib/utils/activityScore';

describe('calculateActivityScore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('User A (6/12 assignments) scores higher on assignment component than User B (2/3)', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const userA = calculateActivityScore(6, 12, 5, now.toISOString());
    const userB = calculateActivityScore(2, 3, 5, now.toISOString());

    expect(userA.breakdown.assignments).toBeGreaterThan(userB.breakdown.assignments);
  });

  it('User at 100% lessons but 0/4 assignments scores lower than user at 60% lessons with 4/4 assignments', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const lessonsOnly = calculateActivityScore(0, 4, 10, now.toISOString());
    const balanced = calculateActivityScore(4, 4, 6, now.toISOString());

    expect(lessonsOnly.total).toBeLessThan(balanced.total);
  });

  it('User with 0 required assignments uses lesson-heavy fallback with no division by zero', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const result = calculateActivityScore(0, 0, 5, now.toISOString());

    expect(result.breakdown.assignments).toBe(0);
    // Lesson-heavy fallback: 5 * 85 = 425
    expect(result.breakdown.lessons).toBe(425);
    expect(Number.isFinite(result.total)).toBe(true);
  });

  it('Recency: user active today scores higher than user active 8 weeks ago', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const activeToday = calculateActivityScore(3, 6, 5, now.toISOString());
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
    const inactive = calculateActivityScore(3, 6, 5, eightWeeksAgo.toISOString());

    expect(activeToday.breakdown.recency).toBeGreaterThan(inactive.breakdown.recency);
    expect(activeToday.total).toBeGreaterThan(inactive.total);
  });

  it('Score is always non-negative', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    // Worst case: 0 submissions, 0 lessons, very old activity
    const longAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const result = calculateActivityScore(0, 5, 0, longAgo.toISOString());

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.assignments).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.lessons).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.recency).toBeGreaterThanOrEqual(0);
  });

  it('Exact score outputs for known inputs are deterministic', () => {
    const now = new Date('2026-04-09T12:00:00Z');
    vi.useFakeTimers({ now });

    const twoWeeksAgo = new Date(now.getTime() - 2 * 7 * 24 * 60 * 60 * 1000);
    const result = calculateActivityScore(3, 6, 4, twoWeeksAgo.toISOString());

    // Assignments: (3/6) * log2(7) * 450 = 0.5 * 2.807354922.. * 450
    const expectedAssignments = (3 / 6) * Math.log2(7) * 450;
    // Lessons: min(4 * 40, 400) = 160
    const expectedLessons = 160;
    // Recency: max(150 - 2*10, 0) = 130
    const expectedRecency = 130;

    expect(result.breakdown.assignments).toBeCloseTo(expectedAssignments, 5);
    expect(result.breakdown.lessons).toBe(expectedLessons);
    expect(result.breakdown.recency).toBe(expectedRecency);
    expect(result.total).toBeCloseTo(expectedAssignments + expectedLessons + expectedRecency, 5);

    // Run again — same output
    const result2 = calculateActivityScore(3, 6, 4, twoWeeksAgo.toISOString());
    expect(result2.total).toBe(result.total);
  });
});
