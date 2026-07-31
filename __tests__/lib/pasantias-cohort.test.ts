// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as cohortPublicModule from '../../lib/pasantias/cohort-public';
import {
  COHORT_CLAIMS,
  COHORT_DATE_LABEL,
  COHORT_DAY_STRUCTURE,
  COHORT_EXCLUDES,
  COHORT_FREE_DAYS,
  COHORT_HEADLINE,
  COHORT_ID,
  COHORT_IMMERSION_SCHOOLS,
  COHORT_INCLUDES,
  COHORT_LABEL,
  COHORT_LODGING_AREA,
  COHORT_MADRID_SCHOOLS,
  COHORT_OBJECTIVES,
  COHORT_PUBLIC,
  COHORT_SCHOOLS,
  COHORT_VISIT_DAYS,
  COHORT_VISIT_DAY_COUNT,
  COHORT_VISIT_SCHOOLS,
  COHORT_WEEKS,
  COHORT_EXPERTS,
} from '../../lib/pasantias/cohort-public';
import * as cohortCommercialModule from '../../lib/pasantias/cohort-commercial';
import {
  BROCHURE_FILENAME,
  BROCHURE_VERSION,
  COHORT_LODGING_NOTE,
  COHORT_LODGING_PER_NIGHT_EUR,
  COHORT_MADRID_EXTENSION,
  COHORT_MIN_PARTICIPANTS,
  COHORT_PAYMENT_TERMS,
  COHORT_PRICE_ITEMS,
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

describe('public cohort module — programme content (Appendix A-7)', () => {
  it('carries all thirteen objectives, each non-empty and distinct', () => {
    expect(COHORT_OBJECTIVES).toHaveLength(13);
    for (const objective of COHORT_OBJECTIVES) {
      expect(objective.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(COHORT_OBJECTIVES).size).toBe(13);
  });

  it('keeps the first and last objective verbatim', () => {
    expect(COHORT_OBJECTIVES[0]).toBe(
      'Conocer los proyectos educativos de las principales escuelas de vanguardia en Cataluña y compartir la mirada pedagógica de sus directores.'
    );
    expect(COHORT_OBJECTIVES[12]).toBe(
      'Comprender y apreciar el giro relacional que implica migrar hacia la Nueva Educación y los beneficios personales y societales que conlleva.'
    );
  });

  it('describes the day as two mornings and an afternoon, every field filled', () => {
    expect(COHORT_DAY_STRUCTURE.map((block) => block.label)).toEqual([
      'Mañana 1',
      'Mañana 2',
      'Tarde',
    ]);
    for (const block of COHORT_DAY_STRUCTURE) {
      expect(block.label.trim().length).toBeGreaterThan(0);
      expect(block.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('names the workshops venue inside the afternoon block', () => {
    const tarde = COHORT_DAY_STRUCTURE.find((block) => block.label === 'Tarde');
    expect(tarde?.description).toContain('escuelas visitadas');
    expect(tarde?.description).toContain('Instituto Relacional');
    expect(tarde?.description).toContain('Eixample');
  });

  it('lists what the programme includes and excludes', () => {
    expect(COHORT_INCLUDES.length).toBeGreaterThanOrEqual(6);
    expect(COHORT_EXCLUDES.length).toBeGreaterThanOrEqual(3);
    for (const item of [...COHORT_INCLUDES, ...COHORT_EXCLUDES]) {
      expect(item.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not present lodging as an inclusion at all (A-8 amended 2026-07-31)', () => {
    // Lodging is quoted separately as a per-night band, so it is neither part of
    // the programme nor public data. The retired "base doble" package must not
    // survive anywhere in the public module.
    expect(COHORT_INCLUDES.filter((item) => /alojamiento/i.test(item))).toEqual([]);
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(/base doble/i);
    // The city itself is not a price, and stays.
    expect(COHORT_LODGING_AREA).toBe('Barcelona');
  });

  it('carries the meals line in the source’s own generic phrasing (A-16 closed)', () => {
    expect(COHORT_INCLUDES).toContain(
      'Comidas incluidas en los días de visita y cena de cierre'
    );
  });

  it('claims no night count and no per-day meal mapping', () => {
    const text = COHORT_INCLUDES.join(' | ');
    expect(text).not.toMatch(/\d+\s*(?:noches?|días?)/i);
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(/por noche/i);
  });

  it('names the three Madrid extension schools', () => {
    expect(COHORT_MADRID_SCHOOLS).toEqual([
      'Colegio IDEO',
      'Colegio Santa Gema',
      'Colegio Virgen de Europa',
    ]);
  });

  it('never leaks the plan’s own pending markers into public copy', () => {
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(/PENDIENTE|A-16/i);
  });

  it('no longer ships the pending-content registry', () => {
    expect(Object.keys(cohortPublicModule)).not.toContain('COHORT_CONTENT_PENDING');
  });
});

describe('public cohort module — no monetary data (D-01)', () => {
  it('serializes without a single monetary key or value', () => {
    const serialized = JSON.stringify(COHORT_PUBLIC);
    // `eur` is matched as a whole token: the Madrid extension visits "Colegio
    // Virgen de Europa", a school name, not a currency. EUR/euro/euros still fail.
    expect(serialized).not.toMatch(/€|price|precio|\beur(?:os?)?\b/i);
  });

  it('carries no numeric field that could be an amount in disguise', () => {
    const serialized = JSON.stringify(COHORT_PUBLIC);
    // Live commercial amounts plus the two the A-8 amendment retired (560 and
    // the 1.560 total), which must never reappear on a public surface. Matched
    // as whole numbers so an unrelated future figure inside a longer number
    // cannot fail this.
    for (const amount of ['1000', '1\\.000', '1560', '1\\.560', '560', '810', '70', '120']) {
      expect(serialized).not.toMatch(new RegExp(`(?<!\\d)${amount}(?!\\d)`));
    }
  });
});

/** Every number reachable from the module's exports, however deeply nested. */
function collectNumbers(value: unknown, found: number[] = []): number[] {
  if (typeof value === 'number') {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, found);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectNumbers(item, found);
  }
  return found;
}

describe('commercial cohort module (Appendix A-8, amended 2026-07-31)', () => {
  it('prices the programme at €1.000 and nothing else as a fixed amount', () => {
    expect(COHORT_PRICE_ITEMS.map((item) => item.amount)).toEqual([1000]);
    expect(COHORT_PRICE_ITEMS.map((item) => item.id)).toEqual(['programa']);
  });

  it('quotes Barcelona lodging as a per-person-per-night band, €70–€120', () => {
    const { min, max } = COHORT_LODGING_PER_NIGHT_EUR;
    expect(min).toBe(70);
    expect(max).toBe(120);
    expect(min).toBeGreaterThanOrEqual(70);
    expect(min).toBeLessThan(max);
    expect(max).toBeLessThanOrEqual(120);
    expect(COHORT_LODGING_NOTE).toBe(
      'Alojamiento en Barcelona: entre €70 y €120 por persona por noche, según el tipo de alojamiento.'
    );
  });

  it('publishes no combined total — the retired €1.560 package is gone', () => {
    // A range times an unstated number of nights has no total, so the module
    // must not export one: neither the old literal nor any programme+lodging sum.
    expect(cohortCommercialModule).not.toHaveProperty('COHORT_PRICE_TOTAL');
    expect(Object.keys(cohortCommercialModule.COHORT_COMMERCIAL)).not.toContain('total');

    const programme = COHORT_PRICE_ITEMS[0].amount;
    const { min, max } = COHORT_LODGING_PER_NIGHT_EUR;
    const forbidden = new Set([1560, programme + min, programme + max]);
    for (const number of collectNumbers(cohortCommercialModule)) {
      expect(forbidden.has(number)).toBe(false);
    }

    // Nor as a string anywhere in the module's copy.
    expect(JSON.stringify(cohortCommercialModule)).not.toMatch(/(?<!\d)1[.,]?560(?!\d)/);
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
