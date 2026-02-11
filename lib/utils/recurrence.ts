/**
 * Recurrence utility functions for Consultor Sessions
 * Pure functions for date generation and RRULE building
 */

import {
  addWeeks,
  addMonths,
  format,
  parseISO,
  lastDayOfMonth,
  setDate,
  min,
  isAfter,
  isBefore,
  startOfDay,
} from 'date-fns';
import { RecurrencePattern, RecurrenceFrequency } from '../types/consultor-sessions.types';

/**
 * Generate all session dates for a recurrence pattern
 * Always includes the start date as the first element
 * Monthly: clamps to last day of month when needed, computing from ORIGINAL start date day
 */
export function generateRecurrenceDates(
  startDate: string,
  pattern: RecurrencePattern
): string[] {
  const dates: string[] = [];
  const startDateParsed = parseISO(startDate);
  const originalDay = startDateParsed.getDate();

  // Start date is always included
  dates.push(startDate);

  if (pattern.frequency === 'custom') {
    // For custom, validate and return the provided dates
    if (!pattern.dates || pattern.dates.length === 0) {
      throw new Error('Custom recurrence requires at least one date');
    }

    // Validate all dates are valid and future
    const today = startOfDay(new Date());
    const validatedDates = pattern.dates
      .map((d) => d.trim())
      .filter((d) => {
        try {
          const parsedDate = parseISO(d);
          return !isNaN(parsedDate.getTime());
        } catch {
          return false;
        }
      });

    if (validatedDates.length === 0) {
      throw new Error('No valid dates provided for custom recurrence');
    }

    // Remove duplicates and sort
    const uniqueDates = Array.from(new Set([startDate, ...validatedDates])).sort();
    return uniqueDates;
  }

  // For non-custom frequencies, count is required
  if (!pattern.count || pattern.count < 2 || pattern.count > 52) {
    throw new Error('Count must be between 2 and 52 for non-custom recurrence');
  }

  // Generate N-1 additional dates (start date already added)
  for (let i = 1; i < pattern.count; i++) {
    let nextDate: Date;

    switch (pattern.frequency) {
      case 'weekly':
        nextDate = addWeeks(startDateParsed, i);
        break;

      case 'biweekly':
        nextDate = addWeeks(startDateParsed, i * 2);
        break;

      case 'monthly':
        // Add i months to the original start date
        let monthAdded = addMonths(startDateParsed, i);
        // Get the last day of the target month
        const lastDay = lastDayOfMonth(monthAdded);
        // Clamp to the original day or last day of month, whichever is smaller
        const clampedDay = Math.min(originalDay, lastDay.getDate());
        nextDate = setDate(monthAdded, clampedDay);
        break;

      default:
        throw new Error(`Unsupported frequency: ${pattern.frequency}`);
    }

    dates.push(format(nextDate, 'yyyy-MM-dd'));
  }

  return dates;
}

/**
 * Build an RRULE string from a recurrence pattern
 * Returns null for custom frequencies (dates are materialized, no RRULE)
 */
export function buildRRule(pattern: RecurrencePattern): string | null {
  if (pattern.frequency === 'custom') {
    return null;
  }

  if (!pattern.count) {
    throw new Error('Count is required for non-custom recurrence');
  }

  let rule = '';

  switch (pattern.frequency) {
    case 'weekly':
      rule = `FREQ=WEEKLY;INTERVAL=1;COUNT=${pattern.count}`;
      break;

    case 'biweekly':
      rule = `FREQ=WEEKLY;INTERVAL=2;COUNT=${pattern.count}`;
      break;

    case 'monthly':
      rule = `FREQ=MONTHLY;COUNT=${pattern.count}`;
      break;

    default:
      throw new Error(`Unsupported frequency: ${pattern.frequency}`);
  }

  return rule;
}
