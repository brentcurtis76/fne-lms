// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  COHORT_CLAIMS,
  COHORT_DATE_LABEL,
  COHORT_FREE_DAYS,
  COHORT_HEADLINE,
  COHORT_ID,
  COHORT_IMMERSION_SCHOOLS,
  COHORT_LABEL,
  COHORT_PUBLIC,
  COHORT_SCHOOLS,
  COHORT_VISIT_DAYS,
  COHORT_VISIT_DAY_COUNT,
  COHORT_VISIT_SCHOOLS,
  COHORT_WEEKS,
  COHORT_EXPERTS,
} from '../../lib/pasantias/cohort-public';
import {
  BROCHURE_FILENAME,
  BROCHURE_VERSION,
  COHORT_MADRID_EXTENSION,
  COHORT_MIN_PARTICIPANTS,
  COHORT_PAYMENT_TERMS,
  COHORT_PRICE_ITEMS,
  COHORT_PRICE_TOTAL,
  COHORT_PRICE_VALIDITY,
  COMMERCIAL_SENTINEL,
} from '../../lib/pasantias/cohort-commercial';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Calendar dates only — UTC midnight, so no timezone can move a day. */
function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** 0 = Sunday … 6 = Saturday, read in UTC to match {@link utcDate}. */
function weekday(iso: string): number {
  return utcDate(iso).getUTCDay();
}

const MONDAY = 1;
const TUESDAY = 2;
const FRIDAY = 5;

describe('public cohort module — identity (Appendix A-1)', () => {
  it('is the October 2026 cohort', () => {
    expect(COHORT_ID).toBe('octubre-2026');
    expect(COHORT_LABEL).toBe('Octubre 2026');
  });
});

describe('public cohort module — calendar (Appendix A-2/A-3/A-4)', () => {
  it('states every date as a valid ISO calendar date', () => {
    const dates = [
      ...COHORT_WEEKS.flatMap((week) => [week.startDate, week.endDate, ...week.visitDays]),
      ...COHORT_FREE_DAYS.map((day) => day.date),
    ];
    for (const date of dates) {
      expect(date).toMatch(ISO_DATE);
      expect(Number.isNaN(utcDate(date).getTime())).toBe(false);
      // A round trip catches impossible dates like 2026-10-32 rolling over.
      expect(utcDate(date).toISOString().slice(0, 10)).toBe(date);
    }
  });

  it('runs week 1 as five consecutive days, Monday 5 to Friday 9', () => {
    const week = COHORT_WEEKS[0];
    expect(week.startDate).toBe('2026-10-05');
    expect(week.endDate).toBe('2026-10-09');
    expect(weekday(week.startDate)).toBe(MONDAY);
    expect(weekday(week.endDate)).toBe(FRIDAY);
    expect(week.visitDays).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
    for (let i = 1; i < week.visitDays.length; i += 1) {
      const gapDays =
        (utcDate(week.visitDays[i]).getTime() - utcDate(week.visitDays[i - 1]).getTime()) /
        86_400_000;
      expect(gapDays).toBe(1);
    }
  });

  it('runs week 2 as four days, Tuesday 13 to Friday 16', () => {
    const week = COHORT_WEEKS[1];
    expect(week.startDate).toBe('2026-10-13');
    expect(week.endDate).toBe('2026-10-16');
    expect(weekday(week.startDate)).toBe(TUESDAY);
    expect(weekday(week.endDate)).toBe(FRIDAY);
    expect(week.visitDays).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
  });

  it('has nine visit days in total (5 + 4)', () => {
    expect(COHORT_VISIT_DAYS).toHaveLength(9);
    expect(COHORT_VISIT_DAY_COUNT).toBe(9);
  });

  it('schedules nothing on the free long weekend, including the Fiesta Nacional', () => {
    const freeDates = COHORT_FREE_DAYS.map((day) => day.date);
    expect(freeDates).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    for (const date of freeDates) {
      expect(COHORT_VISIT_DAYS).not.toContain(date);
    }
    // The 12th is the one that is not simply a weekend: schools are closed.
    expect(COHORT_VISIT_DAYS).not.toContain('2026-10-12');
    expect(weekday('2026-10-12')).toBe(MONDAY);
    const fiestaNacional = COHORT_FREE_DAYS.find((day) => day.date === '2026-10-12');
    expect(fiestaNacional?.label).toContain('Fiesta Nacional');
  });

  it('derives the date label and headline from the calendar above', () => {
    expect(COHORT_DATE_LABEL).toBe('5–9 y 13–16 de octubre');
    expect(COHORT_HEADLINE).toBe('Octubre 2026 · 5–9 y 13–16 de octubre');
  });
});

describe('public cohort module — schools (Appendix A-5)', () => {
  it('has two immersion schools, 2,5 days each', () => {
    expect(COHORT_IMMERSION_SCHOOLS).toHaveLength(2);
    expect(COHORT_IMMERSION_SCHOOLS.map((school) => school.name)).toEqual([
      'Escola Virolai',
      'Escola Sadako',
    ]);
    for (const school of COHORT_IMMERSION_SCHOOLS) {
      expect(school.tier).toBe('inmersion');
      expect(school.immersionDays).toBe(2.5);
    }
  });

  it('has five visit schools, with El Puig and Les Vinyes taking a full day', () => {
    expect(COHORT_VISIT_SCHOOLS).toHaveLength(5);
    expect(COHORT_VISIT_SCHOOLS.map((school) => school.name)).toEqual([
      'Institut Escola El Puig',
      'Escola La Maquinista',
      'Escola Octavio Paz',
      'Institut Angeleta Ferrer',
      'Institut Escola Les Vinyes',
    ]);
    for (const school of COHORT_VISIT_SCHOOLS) {
      expect(school.tier).toBe('visita');
    }
    const fullDay = COHORT_VISIT_SCHOOLS.filter((school) => school.fullDay).map(
      (school) => school.name
    );
    expect(fullDay).toEqual(['Institut Escola El Puig', 'Institut Escola Les Vinyes']);
  });

  it('adds up to the seven schools the claims rely on', () => {
    expect(COHORT_SCHOOLS).toHaveLength(7);
    expect(new Set(COHORT_SCHOOLS.map((school) => school.name)).size).toBe(7);
  });

  it('does not carry Learnlife, which is out of this cohort', () => {
    const names = COHORT_SCHOOLS.map((school) => school.name).join(' ');
    expect(names).not.toMatch(/learnlife/i);
  });
});

describe('public cohort module — people and claims (Appendix A-6/A-9)', () => {
  it('lists the eight named experts', () => {
    expect(COHORT_EXPERTS).toHaveLength(8);
    expect(COHORT_EXPERTS.map((expert) => expert.name)).toEqual([
      'Coral Regí',
      'Mora del Fresno',
      'Jordi Musons',
      'Sandra Entrena',
      'Boris Mir',
      'Sergi del Moral',
      'Pepe Menéndez',
      'Joan Quintana',
    ]);
  });

  it('gives Sandra Entrena her real title', () => {
    const sandra = COHORT_EXPERTS.find((expert) => expert.name === 'Sandra Entrena');
    expect(sandra?.role).toBe('Encargada de Innovación');
    expect(sandra?.role).not.toMatch(/directora/i);
    expect(sandra?.school).toBe('Escola Virolai');
  });

  it('drops the retired "10 días" claim', () => {
    expect(COHORT_CLAIMS.join(' ')).not.toContain('10 días');
  });
});

describe('public cohort module — no monetary data (D-01)', () => {
  it('serializes without a single monetary key or value', () => {
    const serialized = JSON.stringify(COHORT_PUBLIC);
    expect(serialized).not.toMatch(/€|price|precio|eur/i);
  });

  it('carries no numeric field that could be an amount in disguise', () => {
    const serialized = JSON.stringify(COHORT_PUBLIC);
    for (const amount of ['1000', '1.000', '1560', '1.560', '560', '810']) {
      expect(serialized).not.toContain(amount);
    }
  });
});

describe('commercial cohort module (Appendix A-8)', () => {
  it('adds the programme and lodging into the published total', () => {
    expect(COHORT_PRICE_ITEMS.map((item) => item.amount)).toEqual([1000, 560]);
    expect(COHORT_PRICE_TOTAL).toBe(1560);
  });

  it('quotes the Madrid extension separately from the total', () => {
    expect(COHORT_MADRID_EXTENSION.amount).toBe(810);
    expect(COHORT_MADRID_EXTENSION.optional).toBe(true);
    expect(COHORT_PRICE_ITEMS.map((item) => item.id)).not.toContain(
      COHORT_MADRID_EXTENSION.id
    );
  });

  it('keeps the minimum group size and the payment split', () => {
    expect(COHORT_MIN_PARTICIPANTS).toBe(5);
    expect(COHORT_PAYMENT_TERMS).toContain('50%');
    expect(COHORT_PAYMENT_TERMS).toContain('30 días');
  });

  it('ties price validity to the cohort instead of a calendar date', () => {
    expect(COHORT_PRICE_VALIDITY).toContain(COHORT_LABEL);
    expect(COHORT_PRICE_VALIDITY).not.toMatch(/\d{2}[/-]\d{2}[/-]\d{2,4}/);
  });

  it('exposes the marker and brochure constants the later phases need', () => {
    expect(COMMERCIAL_SENTINEL).toBe('__INSPIRA_COMMERCIAL__');
    expect(BROCHURE_VERSION).not.toBe('');
    expect(BROCHURE_FILENAME).toMatch(/\.pdf$/);
    // A4 puts this in a Content-Disposition header; keep it ASCII.
    expect(BROCHURE_FILENAME).toMatch(/^[\x20-\x7E]+$/);
  });
});
