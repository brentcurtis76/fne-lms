// @vitest-environment node

import { describe, it, expect } from 'vitest';
import {
  isWeekend,
  isHoliday,
  addBusinessDays,
  calculateLicitacionTimeline
} from '../businessDays';

// Fixed test holidays (public holidays in Chile 2026 used as test data)
const TEST_HOLIDAYS: Date[] = [
  new Date('2026-05-01T00:00:00'), // Dia del Trabajo
  new Date('2026-05-21T00:00:00'), // Dia de las Glorias Navales
  new Date('2026-06-29T00:00:00'), // San Pedro y San Pablo
];

// Helper to create a date from YYYY-MM-DD at midnight (UTC-like comparison via toISOString)
function d(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

// Helper to get YYYY-MM-DD from a Date (matches how isHoliday compares)
function fmt(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ──────────────────────────────────────────────
// isWeekend
// ──────────────────────────────────────────────

describe('isWeekend', () => {
  it('returns true for Saturday (day 6)', () => {
    // 2026-05-02 is a Saturday
    expect(isWeekend(d('2026-05-02'))).toBe(true);
  });

  it('returns true for Sunday (day 0)', () => {
    // 2026-05-03 is a Sunday
    expect(isWeekend(d('2026-05-03'))).toBe(true);
  });

  it('returns false for Monday', () => {
    expect(isWeekend(d('2026-05-04'))).toBe(false);
  });

  it('returns false for Tuesday', () => {
    expect(isWeekend(d('2026-05-05'))).toBe(false);
  });

  it('returns false for Wednesday', () => {
    expect(isWeekend(d('2026-05-06'))).toBe(false);
  });

  it('returns false for Thursday', () => {
    expect(isWeekend(d('2026-05-07'))).toBe(false);
  });

  it('returns false for Friday', () => {
    expect(isWeekend(d('2026-05-08'))).toBe(false);
  });
});

// ──────────────────────────────────────────────
// isHoliday
// ──────────────────────────────────────────────

describe('isHoliday', () => {
  it('returns true when date matches a holiday', () => {
    expect(isHoliday(d('2026-05-01'), TEST_HOLIDAYS)).toBe(true);
  });

  it('returns true for another holiday in the list', () => {
    expect(isHoliday(d('2026-05-21'), TEST_HOLIDAYS)).toBe(true);
  });

  it('returns false when date is not a holiday', () => {
    expect(isHoliday(d('2026-05-04'), TEST_HOLIDAYS)).toBe(false);
  });

  it('returns false with an empty holiday list', () => {
    expect(isHoliday(d('2026-05-01'), [])).toBe(false);
  });

  it('returns false for a day close to a holiday but not the same', () => {
    expect(isHoliday(d('2026-05-02'), TEST_HOLIDAYS)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// addBusinessDays
// ──────────────────────────────────────────────

describe('addBusinessDays', () => {
  it('adds 0 days — returns the start date unchanged', () => {
    const start = d('2026-04-20'); // Monday
    expect(fmt(addBusinessDays(start, 0, []))).toBe('2026-04-20');
  });

  it('adds 1 business day from Friday — result is Monday', () => {
    // 2026-04-10 is a Friday
    const start = d('2026-04-10');
    expect(fmt(addBusinessDays(start, 1, []))).toBe('2026-04-13'); // Monday
  });

  it('adds 5 business days from a Monday — result is next Monday', () => {
    // 2026-04-13 is Monday; +5 = Tue,Wed,Thu,Fri,Mon = 2026-04-20
    const start = d('2026-04-13');
    expect(fmt(addBusinessDays(start, 5, []))).toBe('2026-04-20');
  });

  it('skips a mid-week holiday (Dia del Trabajo on Friday 2026-05-01)', () => {
    // 2026-04-28 is a Tuesday. Add 3 business days.
    // Without holiday: Wed 29, Thu 30, Fri 1 = May 1
    // With holiday (May 1 is Dia del Trabajo): Wed 29, Thu 30, Mon 4 = May 4
    const start = d('2026-04-28');
    expect(fmt(addBusinessDays(start, 3, TEST_HOLIDAYS))).toBe('2026-05-04');
  });

  it('skips a holiday that falls mid-count (Glorias Navales on Thu 2026-05-21)', () => {
    // 2026-05-19 is a Tuesday. Add 3 business days.
    // Wed 20 (day 1), Thu 21 = skipped (holiday), Fri 22 (day 2), Mon 25 (day 3)
    const start = d('2026-05-19');
    expect(fmt(addBusinessDays(start, 3, TEST_HOLIDAYS))).toBe('2026-05-25');
  });

  it('counts only weekdays when there are no holidays', () => {
    // 2026-04-06 is a Monday. Add 2 business days = Wed 2026-04-08
    const start = d('2026-04-06');
    expect(fmt(addBusinessDays(start, 2, []))).toBe('2026-04-08');
  });
});

// ──────────────────────────────────────────────
// calculateLicitacionTimeline
// ──────────────────────────────────────────────

describe('calculateLicitacionTimeline', () => {
  it('calculates correct deadlines with no holidays (clean Monday start)', () => {
    // 2026-04-06 is a Monday
    const pub = d('2026-04-06');
    const timeline = calculateLicitacionTimeline(pub, []);

    // +5 business days: Tue, Wed, Thu, Fri, Mon = 2026-04-13
    expect(fmt(timeline.fecha_limite_solicitud_bases)).toBe('2026-04-13');

    // +3 from solicitud_bases (Apr 13): Tue, Wed, Thu = 2026-04-16
    expect(fmt(timeline.fecha_limite_consultas)).toBe('2026-04-16');

    // +1 from consultas (Apr 16): Fri = 2026-04-17
    expect(fmt(timeline.fecha_inicio_propuestas)).toBe('2026-04-17');

    // +5 from consultas (Apr 16): Mon, Tue, Wed, Thu, Fri = 2026-04-23
    expect(fmt(timeline.fecha_limite_propuestas)).toBe('2026-04-23');

    // +3 from propuestas (Apr 23=Thu): Fri 24, Mon 27, Tue 28 = 2026-04-28
    expect(fmt(timeline.fecha_limite_evaluacion)).toBe('2026-04-28');
  });

  it('shifts dates correctly when a holiday falls in the window', () => {
    // Publish on 2026-04-27 (Monday)
    // +5 biz days (no holidays): Tue 28, Wed 29, Thu 30, Fri 01-May(holiday!), Mon 04-May = May 5
    const pub = d('2026-04-27');
    const timeline = calculateLicitacionTimeline(pub, TEST_HOLIDAYS);

    // Without the holiday May 1, solicitud_bases would be May 4 (Mon)
    // With holiday May 1: Tue 28, Wed 29, Thu 30, skip Fri May 1, Mon 4, Tue 5 = May 5
    // Wait: +5 from Apr 27: 28(1), 29(2), 30(3), skip May 1, 4(4), 5(5) = May 5
    expect(fmt(timeline.fecha_limite_solicitud_bases)).toBe('2026-05-05');
  });

  it('returns dates in correct chronological order', () => {
    const pub = d('2026-04-06');
    const timeline = calculateLicitacionTimeline(pub, TEST_HOLIDAYS);

    expect(timeline.fecha_limite_solicitud_bases.getTime()).toBeGreaterThan(pub.getTime());
    expect(timeline.fecha_limite_consultas.getTime()).toBeGreaterThan(timeline.fecha_limite_solicitud_bases.getTime());
    expect(timeline.fecha_inicio_propuestas.getTime()).toBeGreaterThan(timeline.fecha_limite_consultas.getTime());
    expect(timeline.fecha_limite_propuestas.getTime()).toBeGreaterThan(timeline.fecha_inicio_propuestas.getTime());
    expect(timeline.fecha_limite_evaluacion.getTime()).toBeGreaterThan(timeline.fecha_limite_propuestas.getTime());
  });

  it('inicio_propuestas is always after fecha_limite_consultas', () => {
    const pub = d('2026-05-11'); // Monday, near Dia de las Glorias Navales (May 21)
    const timeline = calculateLicitacionTimeline(pub, TEST_HOLIDAYS);
    expect(timeline.fecha_inicio_propuestas.getTime()).toBeGreaterThan(
      timeline.fecha_limite_consultas.getTime()
    );
  });

  it('fecha_limite_propuestas > fecha_inicio_propuestas (propuestas window has duration)', () => {
    const pub = d('2026-04-06');
    const timeline = calculateLicitacionTimeline(pub, []);
    expect(timeline.fecha_limite_propuestas.getTime()).toBeGreaterThan(
      timeline.fecha_inicio_propuestas.getTime()
    );
  });
});
