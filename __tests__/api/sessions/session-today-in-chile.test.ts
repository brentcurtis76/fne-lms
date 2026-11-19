// @vitest-environment node
/**
 * Release SX: today's date in Chile (America/Santiago), the first day the session forms offer and
 * the day the server checks a series' custom dates against. Read from the time zone's own rules,
 * so the days summer time starts and ends need no special case. Pure: the instant is given.
 */
import { describe, expect, it } from 'vitest';
import { todayInChile } from '../../../lib/utils/session-timezone';

describe('todayInChile', () => {
  it.each([
    // Summer (UTC-3): 22:30, 23:59, midnight; 20:59 and 21:00 (the UTC date turns at 21:00).
    ['2026-11-20T01:30:00Z', '2026-11-19'],
    ['2026-11-20T02:59:00Z', '2026-11-19'],
    ['2026-11-20T03:00:00Z', '2026-11-20'],
    ['2026-11-19T23:59:00Z', '2026-11-19'],
    ['2026-11-20T00:00:00Z', '2026-11-19'],
    ['2026-11-19T15:00:00Z', '2026-11-19'],
    // Winter (UTC-4).
    ['2027-07-15T00:30:00Z', '2027-07-14'],
    ['2027-07-15T03:59:00Z', '2027-07-14'],
    ['2027-07-15T04:00:00Z', '2027-07-15'],
    // Summer time starts: 00:00 becomes 01:00 on Sunday 6 Sep 2026.
    ['2026-09-06T03:59:00Z', '2026-09-05'],
    ['2026-09-06T04:00:00Z', '2026-09-06'],
    // Summer time ends: 00:00 becomes 23:00 on the night of Saturday 3 Apr 2027.
    ['2027-04-04T02:59:00Z', '2027-04-03'],
    ['2027-04-04T03:30:00Z', '2027-04-03'],
    ['2027-04-04T04:00:00Z', '2027-04-04'],
  ])('at %s it is %s in Chile', (instant, expected) => {
    expect(todayInChile(new Date(instant))).toBe(expected);
  });

  it('pads month and day to two digits (YYYY-MM-DD)', () => {
    expect(todayInChile(new Date('2027-01-05T15:00:00Z'))).toBe('2027-01-05');
  });
});
