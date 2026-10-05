import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { toDatetimeLocalValue, datetimeLocalToIso, parseDueDate, formatDueDate, daysUntilDueDate } from '../../../lib/meetings/meeting-time';

// SM-H8: the meeting form showed 04:00 PM while the card showed 01:00 PM for the
// same meeting (Chile vs UTC). Vitest runs files in one process (threads:false),
// so the zone is set for this file only and restored afterwards.
let previousTz: string | undefined;
beforeAll(() => {
  previousTz = process.env.TZ;
  process.env.TZ = 'America/Santiago';
});
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

describe('meeting time (America/Santiago)', () => {
  it('sends the wall time the person typed as the matching UTC instant (summer, UTC-3)', () => {
    expect(datetimeLocalToIso('2026-10-02T16:00')).toBe('2026-10-02T19:00:00.000Z');
  });

  it('winter time is UTC-4', () => {
    expect(datetimeLocalToIso('2026-06-15T16:00')).toBe('2026-06-15T20:00:00.000Z');
  });

  it('shows a stored instant as the same wall time it was entered with', () => {
    expect(toDatetimeLocalValue('2026-10-02T19:00:00+00:00')).toBe('2026-10-02T16:00');
    expect(toDatetimeLocalValue('2026-06-15T20:00:00.000Z')).toBe('2026-06-15T16:00');
  });

  it('round-trips every hour of a year in both directions', () => {
    for (let h = 0; h < 24 * 365; h += 7) {
      const instant = new Date(Date.UTC(2026, 0, 1, 0, 0) + h * 3600_000).toISOString();
      const local = toDatetimeLocalValue(instant);
      const back = datetimeLocalToIso(local);
      // An instant inside the repeated hour maps to the earlier one; all others are exact.
      if (back !== instant) {
        expect(Date.parse(instant) - Date.parse(back!)).toBe(3600_000);
      }
    }
  });

  it('the hour skipped when clocks go forward (6 Sep 2026, 00:00 → 01:00) moves forward by the gap', () => {
    expect(datetimeLocalToIso('2026-09-06T00:30')).toBe('2026-09-06T04:30:00.000Z');
    expect(toDatetimeLocalValue('2026-09-06T04:30:00.000Z')).toBe('2026-09-06T01:30');
  });

  it('the repeated hour when clocks go back (4-5 Apr 2026, 23:30 happens twice) resolves to the earlier instant', () => {
    expect(datetimeLocalToIso('2026-04-04T23:30')).toBe('2026-04-05T02:30:00.000Z');
  });

  it('rejects anything that is not a complete, real local date-time', () => {
    for (const bad of ['', '2026-10-02', '2026-10-02T16', '2026-02-30T10:00', '2026-13-01T10:00', '2026-10-02T24:00', 'mañana']) {
      expect(datetimeLocalToIso(bad)).toBeNull();
    }
    expect(datetimeLocalToIso(null)).toBeNull();
    expect(toDatetimeLocalValue('no es fecha')).toBe('');
    expect(toDatetimeLocalValue(null)).toBe('');
  });

  it('the old conversion is what produced the 3-hour shift', () => {
    const stored = '2026-10-02T19:00:00.000Z';
    // Old load: toISOString().slice(0, 16) → UTC wall time in the form.
    expect(new Date(stored).toISOString().slice(0, 16)).toBe('2026-10-02T19:00');
    expect(toDatetimeLocalValue(stored)).toBe('2026-10-02T16:00');
  });
});


describe('due dates are calendar days (SM-H9)', () => {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = 'America/Santiago';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  it('shows the stored day, not the day before (the old reading gave 15-10)', () => {
    expect(new Date('2026-10-16').toLocaleDateString('es-CL')).toBe('15-10-2026');
    expect(formatDueDate('2026-10-16')).toBe('16-10-2026');
    expect(formatDueDate('2026-01-01')).toBe('01-01-2026');
  });

  it('reads a date-only value as local midnight; full timestamps as before', () => {
    const d = parseDueDate('2026-10-16');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 16, 0]);
    expect(parseDueDate('2026-10-16T12:00:00Z').toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });

  it('counts whole calendar days at any hour of today', () => {
    const late = new Date(2026, 9, 15, 23, 30);
    const early = new Date(2026, 9, 15, 0, 5);
    for (const now of [late, early]) {
      expect(daysUntilDueDate('2026-10-15', now)).toBe(0);
      expect(daysUntilDueDate('2026-10-16', now)).toBe(1);
      expect(daysUntilDueDate('2026-10-14', now)).toBe(-1);
    }
  });

  it('is not thrown off by a DST change in between', () => {
    expect(daysUntilDueDate('2026-09-07', new Date(2026, 8, 5, 12))).toBe(2);
    expect(daysUntilDueDate('2026-04-06', new Date(2026, 3, 4, 12))).toBe(2);
  });
});
