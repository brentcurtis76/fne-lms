/**
 * Unit tests for recurrence utility
 *
 * Coverage: Pure date generation functions for session recurrence
 * Testing strategy: Weekly, biweekly, monthly with clamping, edge cases
 */

import { describe, it, expect } from 'vitest';
import { generateRecurrenceDates, buildRRule } from '../../../lib/utils/recurrence';
import type { RecurrencePattern } from '../../../lib/types/consultor-sessions.types';

describe('recurrence utility', () => {
  describe('generateRecurrenceDates - weekly', () => {
    it('should generate correct dates 7 days apart', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        count: 4,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(4);
      expect(dates[0]).toBe('2026-03-01'); // Start date
      expect(dates[1]).toBe('2026-03-08'); // +7 days
      expect(dates[2]).toBe('2026-03-15'); // +14 days
      expect(dates[3]).toBe('2026-03-22'); // +21 days
    });
  });

  describe('generateRecurrenceDates - biweekly', () => {
    it('should generate correct dates 14 days apart', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'biweekly',
        count: 4,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(4);
      expect(dates[0]).toBe('2026-03-01'); // Start date
      expect(dates[1]).toBe('2026-03-15'); // +14 days
      expect(dates[2]).toBe('2026-03-29'); // +28 days
      expect(dates[3]).toBe('2026-04-12'); // +42 days
    });
  });

  describe('generateRecurrenceDates - monthly (no clamping)', () => {
    it('should generate correct dates on same day each month', () => {
      const startDate = '2026-01-15';
      const pattern: RecurrencePattern = {
        frequency: 'monthly',
        count: 4,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(4);
      expect(dates[0]).toBe('2026-01-15');
      expect(dates[1]).toBe('2026-02-15'); // Same day, Feb 15
      expect(dates[2]).toBe('2026-03-15'); // Same day, Mar 15
      expect(dates[3]).toBe('2026-04-15'); // Same day, Apr 15
    });
  });

  describe('generateRecurrenceDates - monthly (with clamping)', () => {
    it('should clamp Jan 31 → Feb 28 → Mar 31 → Apr 30', () => {
      const startDate = '2026-01-31';
      const pattern: RecurrencePattern = {
        frequency: 'monthly',
        count: 4,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(4);
      expect(dates[0]).toBe('2026-01-31'); // Start date
      expect(dates[1]).toBe('2026-02-28'); // Feb has 28 days in 2026 (not leap year)
      expect(dates[2]).toBe('2026-03-31'); // March has 31 days
      expect(dates[3]).toBe('2026-04-30'); // April has 30 days
    });
  });

  describe('generateRecurrenceDates - monthly (leap year)', () => {
    it('should handle Feb 29 in leap year (2024)', () => {
      const startDate = '2024-01-31';
      const pattern: RecurrencePattern = {
        frequency: 'monthly',
        count: 3,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(3);
      expect(dates[0]).toBe('2024-01-31'); // Start date
      expect(dates[1]).toBe('2024-02-29'); // Feb 29 in leap year
      expect(dates[2]).toBe('2024-03-31'); // March 31
    });
  });

  describe('generateRecurrenceDates - custom dates', () => {
    it('should return only the custom dates without auto-including startDate', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'custom',
        dates: ['2026-03-15', '2026-04-10', '2026-05-20'],
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(3); // Only the custom dates
      expect(dates).not.toContain('2026-03-01'); // startDate NOT auto-included
      expect(dates).toContain('2026-03-15');
      expect(dates).toContain('2026-04-10');
      expect(dates).toContain('2026-05-20');
    });

    it('should remove duplicates and sort custom dates', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'custom',
        dates: ['2026-05-01', '2026-04-01', '2026-05-01', '2026-03-01'], // Duplicates
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(3); // Deduplicated
      expect(dates).toEqual(['2026-03-01', '2026-04-01', '2026-05-01']); // Sorted
    });
  });

  describe('generateRecurrenceDates - edge cases', () => {
    it('should handle count=2 (minimum)', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        count: 2,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(2);
      expect(dates[0]).toBe('2026-03-01');
      expect(dates[1]).toBe('2026-03-08');
    });

    it('should handle count=52 (maximum)', () => {
      const startDate = '2026-01-01';
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        count: 52,
      };

      const dates = generateRecurrenceDates(startDate, pattern);

      expect(dates).toHaveLength(52);
      expect(dates[0]).toBe('2026-01-01');
      expect(dates[51]).toBe('2026-12-24'); // 51 weeks after start
    });

    it('should throw error if count < 2', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        count: 1,
      };

      expect(() => generateRecurrenceDates(startDate, pattern)).toThrow(
        'Count must be between 2 and 52 for non-custom recurrence'
      );
    });

    it('should throw error if count > 52', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        count: 53,
      };

      expect(() => generateRecurrenceDates(startDate, pattern)).toThrow(
        'Count must be between 2 and 52 for non-custom recurrence'
      );
    });

    it('should throw error if custom frequency has no dates', () => {
      const startDate = '2026-03-01';
      const pattern: RecurrencePattern = {
        frequency: 'custom',
        dates: [],
      };

      expect(() => generateRecurrenceDates(startDate, pattern)).toThrow(
        'Custom recurrence requires at least one date'
      );
    });
  });

  describe('buildRRule', () => {
    it('should produce correct RRULE for weekly', () => {
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        count: 10,
      };

      const rrule = buildRRule(pattern);

      expect(rrule).toBe('FREQ=WEEKLY;INTERVAL=1;COUNT=10');
    });

    it('should produce correct RRULE for biweekly', () => {
      const pattern: RecurrencePattern = {
        frequency: 'biweekly',
        count: 8,
      };

      const rrule = buildRRule(pattern);

      expect(rrule).toBe('FREQ=WEEKLY;INTERVAL=2;COUNT=8');
    });

    it('should produce correct RRULE for monthly', () => {
      const pattern: RecurrencePattern = {
        frequency: 'monthly',
        count: 12,
      };

      const rrule = buildRRule(pattern);

      expect(rrule).toBe('FREQ=MONTHLY;COUNT=12');
    });

    it('should return null for custom frequency', () => {
      const pattern: RecurrencePattern = {
        frequency: 'custom',
        dates: ['2026-03-15', '2026-04-10'],
      };

      const rrule = buildRRule(pattern);

      expect(rrule).toBeNull();
    });

    it('should throw error if non-custom pattern has no count', () => {
      const pattern: RecurrencePattern = {
        frequency: 'weekly',
        // count is missing
      };

      expect(() => buildRRule(pattern)).toThrow(
        'Count is required for non-custom recurrence'
      );
    });
  });
});
