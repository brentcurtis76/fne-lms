// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as cohortPublicModule from '../../lib/pasantias/cohort-public';
import {
  buildCohortDateLabel,
  COHORT_ACCREDITATION,
  COHORT_CITY,
  COHORT_CLAIMS,
  COHORT_CONTACT,
  COHORT_DATE_LABEL,
  COHORT_DAY_STRUCTURE,
  COHORT_EXCLUDES,
  COHORT_FREE_WEEKEND,
  COHORT_HEADLINE,
  COHORT_HOSTS,
  COHORT_ID,
  COHORT_INCLUDES,
  COHORT_LABEL,
  COHORT_PLACES,
  COHORT_PROGRAMS,
  COHORT_PUBLIC,
  COHORT_ROUTING,
  COHORT_SPAN,
  COHORT_TOGETHER,
  PROGRAM_IDS,
  isProgramId,
  programById,
} from '../../lib/pasantias/cohort-public';
import * as cohortCommercialModule from '../../lib/pasantias/cohort-commercial';
import {
  ARRIVAL_DATE,
  BROCHURE_FILENAME,
  BROCHURE_VERSION,
  COMMERCIAL_CURRENCY,
  COMMERCIAL_SENTINEL,
  DISCOUNT_CONDITION,
  EUR_CLP,
  FLIGHT_CLP_APPROX,
  LODGING_EUR,
  LODGING_NOTE,
  PAYMENT_TERMS,
  PLACES_TERMS,
  PRICE_VALIDITY,
  PROGRAM_PRICING,
  TEAM_NOTE,
  TEAM_SIZES,
  TOTALS_NOTE,
  TOTALS_ROUNDED_TO_CLP,
  teamRows,
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

const SUNDAY = 0;
const MONDAY = 1;
const THURSDAY = 4;
const FRIDAY = 5;
const SATURDAY = 6;

/** Monday-to-Friday days in an inclusive ISO range, counted on the calendar. */
function weekdaysBetween(start: string, end: string): number {
  let count = 0;
  for (let day = utcDate(start); day <= utcDate(end); day = new Date(day.getTime() + 86_400_000)) {
    if (day.getUTCDay() >= MONDAY && day.getUTCDay() <= FRIDAY) count += 1;
  }
  return count;
}

const [INSPIRA, MIRADA] = COHORT_PROGRAMS;

/* ============================================================================
 * January 2027 — the hand-transcribed oracle
 *
 * Typed in this file from the ratified contract's page anchors
 * (`docs/plan/pasantias-january-contract.md`, brochure 2027-01-V1), NOT imported
 * from the module and NOT read from the same fixture the module reads. It is a
 * second, independent copy, so a wrong value in `cohort-public.ts` disagrees
 * with something instead of agreeing with itself — the lesson of Sol's A-series
 * r2 B2. `toEqual` over whole objects fails in both directions: an added field,
 * a dropped list item, a reordering or one changed character.
 *
 * The contract-parsed comparison at the end of this file is the THIRD copy:
 * there, every contract fact is compared with the module mechanically.
 * ========================================================================== */

const ORACLE_INSPIRA = {
  id: 'inspira',
  name: 'Pasantía INSPIRA',
  // Display label for the page CTA, not a contract fact: polish addendum
  // (docs/plan/pasantias-polish-addendum-20261022.md, P6).
  shortName: 'INSPIRA',
  audience: 'Equipos que viajan por primera vez',
  startDate: '2027-01-18',
  endDate: '2027-01-28',
  schoolDays: 9,
  schoolCount: 6,
  overview:
    '6 escuelas: una semana de inmersión en dos escuelas y una semana de visitas a cuatro',
  takeaway: 'Inspiración y un mapa de lo posible',
  weeks: [
    {
      id: 'semana-1',
      label: 'Semana 1 — inmersión',
      startDate: '2027-01-18',
      endDate: '2027-01-22',
      summary: 'Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.',
    },
    {
      id: 'semana-2',
      label: 'Semana 2 — visitas',
      startDate: '2027-01-25',
      endDate: '2027-01-28',
      summary: 'Una escuela por día.',
    },
  ],
  lunches:
    'Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako).',
  immersionSchools: [
    { name: 'Escola Virolai', days: 2.5 },
    { name: 'Escola Sadako', days: 2.5 },
  ],
  visits: {
    count: 4,
    candidates: [
      'Institut Escola El Puig',
      'Escola La Maquinista',
      'Escola Octavio Paz',
      'Institut Angeleta Ferrer',
      'Institut Escola Les Vinyes',
    ],
    fullDayOutside: ['Institut Escola El Puig', 'Institut Escola Les Vinyes'],
    selection:
      'La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.',
  },
};

const ORACLE_MIRADA = {
  id: 'mirada-profunda',
  name: 'INSPIRA Mirada Profunda',
  // Display label for the page CTA, not a contract fact: polish addendum, P6.
  shortName: 'Mirada Profunda',
  audience: 'Quienes ya viajaron con INSPIRA',
  startDate: '2027-01-18',
  endDate: '2027-01-29',
  schoolDays: 10,
  schoolCount: 5,
  overview: 'Son diez días, cinco escuelas y dos días completos en cada una.',
  takeaway: 'Cómo se hace por dentro, y una hoja de ruta para marzo',
  weeks: [
    {
      id: 'semana-1',
      label: 'Semana 1',
      startDate: '2027-01-18',
      endDate: '2027-01-22',
      summary: 'Cinco jornadas en escuelas.',
    },
    {
      id: 'semana-2',
      label: 'Semana 2',
      startDate: '2027-01-25',
      endDate: '2027-01-29',
      summary: 'Cinco jornadas en escuelas.',
    },
  ],
  lunches: 'En Mirada Profunda, todos los días del programa.',
  schools: [
    'Escola Virolai',
    'Escola Sadako',
    'Institut Angeleta Ferrer',
    'Institut Escola El Puig',
    'Institut Escola Les Vinyes',
  ],
  daysPerSchool: 2,
  orderCaveat:
    'El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.',
  preparation: 'Cada participante define, con el equipo FNE, un desafío real de su colegio.',
  closing: {
    date: '2027-01-29',
    text: 'El viernes 29 cada participante presenta qué va a mover en marzo y cómo.',
  },
  followUp: 'En abril, una sesión online para revisar qué se implementó y ajustar el rumbo.',
  extraIncludes: [
    'acompañamiento para definir tu pregunta antes del viaje',
    'sesión online de seguimiento en abril',
  ],
};

const ORACLE_INCLUDES = [
  'El pago de las visitas a las escuelas.',
  'Los talleres de la tarde con especialistas.',
  'Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes.',
  'Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje.',
  'Desayuno a media mañana en las escuelas.',
];

const ORACLE_EXCLUDES = [
  'Traslados colegio – aeropuerto de Santiago – colegio',
  'Traslados en Barcelona, incluido el transporte a El Puig y Les Vinyes',
  'Cenas',
  'Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)',
  'Seguros',
  'Pasajes y alojamiento, salvo que los coordines a través de FNE',
];

const ORACLE_DAY_STRUCTURE = [
  'Presentación del proyecto educativo y entrevista con la dirección',
  'Visita guiada, entrevistas con estudiantes y educadores',
  'Talleres con expertos del movimiento de Nueva Educación',
];

describe('public cohort module — January 2027 identity (contract §2, C004)', () => {
  it('is the January 2027 cohort with the two stable program IDs', () => {
    expect(COHORT_ID).toBe('enero-2027');
    expect(COHORT_LABEL).toBe('Cohorte Enero 2027');
    expect([...PROGRAM_IDS]).toEqual(['inspira', 'mirada-profunda']);
    expect(COHORT_PROGRAMS.map((program) => program.id)).toEqual(['inspira', 'mirada-profunda']);
  });

  it('never treats immersion or visits as a program identity', () => {
    for (const notAProgram of ['inmersion', 'immersion', 'visitas', 'visits', 'visita', 'octubre-2026']) {
      expect(isProgramId(notAProgram)).toBe(false);
    }
    expect(isProgramId('inspira')).toBe(true);
    expect(isProgramId('mirada-profunda')).toBe(true);
    expect(isProgramId(['inspira'])).toBe(false);
    expect(programById('mirada-profunda').name).toBe('INSPIRA Mirada Profunda');
    expect(() => programById('visitas' as never)).toThrow(/Unknown program/);
  });

  it('spans 18 to 29 January 2027 and says so on page 1’s terms', () => {
    expect(COHORT_SPAN).toEqual({ startDate: '2027-01-18', endDate: '2027-01-29' });
    expect(COHORT_DATE_LABEL).toBe('Enero, 18 al 29');
    expect(COHORT_HEADLINE).toBe('Enero, 18 al 29 · 2027');
    expect(COHORT_HEADLINE.match(/2027/g)).toHaveLength(1);
    expect(COHORT_DATE_LABEL).not.toContain('–');
  });

  it('rebuilds the span label from whatever span it is handed', () => {
    expect(buildCohortDateLabel({ startDate: '2027-03-02', endDate: '2027-03-13' })).toBe(
      'Marzo, 2 al 13'
    );
  });

  it('carries the cohort facts verbatim: city, together, routing, places, contact', () => {
    expect(COHORT_CITY).toBe('Barcelona');
    expect(COHORT_TOGETHER).toBe('Todos viajan juntos a Barcelona');
    expect(COHORT_ROUTING.map((route) => ({ ...route }))).toEqual([
      { question: '¿Primera vez?', program: 'Pasantía INSPIRA' },
      { question: '¿Ya viajaste?', program: 'Mirada Profunda' },
    ]);
    expect(COHORT_PLACES).toBe('Los cupos de la cohorte de enero se confirman por orden de reserva.');
    expect({ ...COHORT_CONTACT }).toEqual({
      whatsapp: '+56 9 4162 3577',
      email: 'info@nuevaeducacion.org',
    });
  });

  it('carries the ratified claims P-02 and P-03 verbatim, and only those', () => {
    expect(COHORT_ACCREDITATION).toBe(
      'Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.'
    );
    expect([...COHORT_CLAIMS]).toEqual([
      '400+ Pasantes han viajado con FNE',
      '40+ Colegios participantes',
      '12 Escuelas catalanas en la red',
    ]);
    // The October claim "7 escuelas en esta cohorte" is not a January claim.
    expect(COHORT_CLAIMS.join(' ')).not.toMatch(/esta cohorte|10 días/);
  });
});

describe('public cohort module — the two programs (C005), against the hand oracle', () => {
  it('matches the INSPIRA oracle exactly, field for field', () => {
    expect(JSON.parse(JSON.stringify(INSPIRA))).toEqual(ORACLE_INSPIRA);
  });

  it('matches the Mirada Profunda oracle exactly, field for field', () => {
    expect(JSON.parse(JSON.stringify(MIRADA))).toEqual(ORACLE_MIRADA);
  });

  it('matches the shared lists exactly: day structure, includes, excludes', () => {
    expect([...COHORT_DAY_STRUCTURE]).toEqual(ORACLE_DAY_STRUCTURE);
    expect([...COHORT_INCLUDES]).toEqual(ORACLE_INCLUDES);
    expect([...COHORT_EXCLUDES]).toEqual(ORACLE_EXCLUDES);
  });

  it('shares one free weekend, Saturday 23 and Sunday 24', () => {
    expect({ ...COHORT_FREE_WEEKEND }).toEqual({
      startDate: '2027-01-23',
      endDate: '2027-01-24',
      label: 'Sábado 23 y domingo 24 de enero',
    });
    expect([weekday(COHORT_FREE_WEEKEND.startDate), weekday(COHORT_FREE_WEEKEND.endDate)]).toEqual([
      SATURDAY,
      SUNDAY,
    ]);
    for (const program of COHORT_PROGRAMS) {
      // The weekend sits between the two weeks of every program.
      expect(program.weeks[0].endDate < COHORT_FREE_WEEKEND.startDate).toBe(true);
      expect(program.weeks[1].startDate > COHORT_FREE_WEEKEND.endDate).toBe(true);
    }
  });
});

describe('public cohort module — calendars are real calendars', () => {
  it('states every date as a valid ISO calendar date', () => {
    const dates = [
      COHORT_SPAN.startDate,
      COHORT_SPAN.endDate,
      COHORT_FREE_WEEKEND.startDate,
      COHORT_FREE_WEEKEND.endDate,
      MIRADA.closing.date,
      ...COHORT_PROGRAMS.flatMap((program) => [
        program.startDate,
        program.endDate,
        ...program.weeks.flatMap((week) => [week.startDate, week.endDate]),
      ]),
    ];
    for (const date of dates) {
      expect(date).toMatch(ISO_DATE);
      // A round trip catches impossible dates like 2027-01-32 rolling over.
      expect(utcDate(date).toISOString().slice(0, 10)).toBe(date);
    }
  });

  it('gives each program exactly as many school days as its weeks have weekdays', () => {
    for (const program of COHORT_PROGRAMS) {
      const weekdays = program.weeks.reduce(
        (total, week) => total + weekdaysBetween(week.startDate, week.endDate),
        0
      );
      expect([program.id, weekdays]).toEqual([program.id, program.schoolDays]);
    }
    expect([INSPIRA.schoolDays, MIRADA.schoolDays]).toEqual([9, 10]);
  });

  it('runs INSPIRA Mon 18–Fri 22 and Mon 25–Thu 28; Mirada Profunda to Fri 29', () => {
    expect(INSPIRA.weeks.map((week) => [weekday(week.startDate), weekday(week.endDate)])).toEqual([
      [MONDAY, FRIDAY],
      [MONDAY, THURSDAY],
    ]);
    expect(MIRADA.weeks.map((week) => [weekday(week.startDate), weekday(week.endDate)])).toEqual([
      [MONDAY, FRIDAY],
      [MONDAY, FRIDAY],
    ]);
    for (const program of COHORT_PROGRAMS) {
      expect(program.startDate).toBe(program.weeks[0].startDate);
      expect(program.endDate).toBe(program.weeks[program.weeks.length - 1].endDate);
      expect(program.startDate >= COHORT_SPAN.startDate).toBe(true);
      expect(program.endDate <= COHORT_SPAN.endDate).toBe(true);
    }
    // The cohort span is the union of both programs.
    expect(COHORT_SPAN.endDate).toBe(MIRADA.endDate);
  });

  it('closes Mirada Profunda on Friday 29 January with the roadmap presentation', () => {
    expect(MIRADA.closing.date).toBe('2027-01-29');
    expect(weekday(MIRADA.closing.date)).toBe(FRIDAY);
    expect(MIRADA.closing.date).toBe(MIRADA.endDate);
    expect(MIRADA.closing.text).toContain('marzo');
    expect(MIRADA.followUp).toMatch(/^En abril, una sesión online/);
  });
});

describe('public cohort module — schools per program (C005)', () => {
  it('gives INSPIRA two immersion schools at 2,5 days each — five days, week 1', () => {
    expect(INSPIRA.immersionSchools.map((school) => school.days)).toEqual([2.5, 2.5]);
    const immersionDays = INSPIRA.immersionSchools.reduce((total, school) => total + school.days, 0);
    expect(immersionDays).toBe(weekdaysBetween(INSPIRA.weeks[0].startDate, INSPIRA.weeks[0].endDate));
  });

  it('presents INSPIRA visits as four of five candidates, never a fixed list of four (P-04)', () => {
    expect(INSPIRA.visits.count).toBe(4);
    expect(INSPIRA.visits.candidates).toHaveLength(5);
    expect(INSPIRA.visits.count).toBeLessThan(INSPIRA.visits.candidates.length);
    // One school per visit day of week 2.
    expect(INSPIRA.visits.count).toBe(
      weekdaysBetween(INSPIRA.weeks[1].startDate, INSPIRA.weeks[1].endDate)
    );
    // The selection is conditional: with the group, by interest and availability.
    expect(INSPIRA.visits.selection).toMatch(/se definen con el grupo/);
    expect(INSPIRA.visits.selection).toMatch(/disponibilidad de cada escuela/);
    expect(INSPIRA.schoolCount).toBe(INSPIRA.immersionSchools.length + INSPIRA.visits.count);
  });

  it('marks El Puig and Les Vinyes, both candidates, as the full days outside Barcelona', () => {
    expect([...INSPIRA.visits.fullDayOutside]).toEqual([
      'Institut Escola El Puig',
      'Institut Escola Les Vinyes',
    ]);
    for (const name of INSPIRA.visits.fullDayOutside) {
      expect(INSPIRA.visits.candidates).toContain(name);
    }
  });

  it('gives Mirada Profunda five schools, two full days each — its ten days', () => {
    expect(MIRADA.schools).toHaveLength(5);
    expect(new Set(MIRADA.schools).size).toBe(5);
    expect(MIRADA.schoolCount).toBe(MIRADA.schools.length);
    expect(MIRADA.daysPerSchool * MIRADA.schools.length).toBe(MIRADA.schoolDays);
    expect(MIRADA.orderCaveat).toMatch(/puede cambiar/);
    expect(MIRADA.orderCaveat).toMatch(/viernes 22 y el lunes 25/);
    expect(MIRADA.preparation).toMatch(/desafío real de su colegio/);
  });

  it('serves distinct lunches per program', () => {
    expect(INSPIRA.lunches).not.toBe(MIRADA.lunches);
    expect(INSPIRA.lunches).toMatch(/primera semana/);
    expect(MIRADA.lunches).toMatch(/todos los días del programa/);
    // The week-2 INSPIRA lunches are an explicit exclusion, not silence.
    expect(COHORT_EXCLUDES).toContain('Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)');
  });

  it('names Jordi Musons first, with the ratified spelling (P-01), then Sandra Entrena (polish addendum)', () => {
    // Two hosts since docs/plan/pasantias-polish-addendum-20261022.md: Brent's
    // 2026-10-22 correction adds Sandra Entrena, verified on brochure pages 4
    // and 12. Jordi stays first and stays the contract's P-01 host; nobody else
    // is added.
    expect(COHORT_HOSTS.map((host) => ({ ...host }))).toEqual([
      { name: 'Jordi Musons', role: 'Director', school: 'Escola Sadako', note: 'Anfitrión' },
      {
        name: 'Sandra Entrena',
        role: 'Encargada de Innovación',
        school: 'Escola Virolai',
        note: 'Anfitriona',
      },
    ]);
    expect(JSON.stringify(COHORT_PUBLIC)).not.toContain('Mussons');
  });
});

/* ============================================================================
 * October 2026 — history stays recorded, and is not carried forward
 *
 * Appendix A (docs/plan/PLAN.md) remains the record of the shipped October
 * cohort; the January contract ratifies none of its experts, objectives, school
 * levels or highlights, and C005 requires those assumptions removed rather than
 * carried. These tests used to pin the October module; they now pin the two
 * halves of that decision: the history is intact where it lives, and none of it
 * leaks back into the active module. The October oracle tables are kept as the
 * independent transcription they always were.
 * ========================================================================== */

const PLAN_PATH = path.join(process.cwd(), 'docs/plan/PLAN.md');
const A7_HEADING = '### Appendix A-7';

/** The Appendix A-7 section only — a match elsewhere in the plan proves nothing. */
function readAppendixA7(): string {
  const plan = readFileSync(PLAN_PATH, 'utf8');
  const start = plan.indexOf(A7_HEADING);
  if (start === -1) throw new Error(`${A7_HEADING} not found in ${PLAN_PATH}`);
  const body = plan.slice(start + A7_HEADING.length);
  const nextHeading = body.search(/\n#{1,3} /);
  return nextHeading === -1 ? body : body.slice(0, nextHeading);
}

const APPENDIX_A7 = readAppendixA7();

/** The one line of A-7 whose bold lead-in matches, or a loud failure. */
function a7Sentence(leadIn: RegExp): string {
  const matches = APPENDIX_A7.match(leadIn);
  if (!matches || matches.length !== 1) {
    throw new Error(`expected exactly one A-7 line matching ${leadIn}, got ${matches?.length ?? 0}`);
  }
  return matches[0];
}

/** A-7 list sentence → entries, mechanically (lead-in, note, markers, final stop, `;`). */
function parseA7Items(sentence: string): string[] {
  return sentence
    .slice(sentence.indexOf(':**') + ':**'.length)
    .replace(/\s*\*\([\s\S]*\)\*\s*$/, '')
    .replace(/\*\*/g, '')
    .trim()
    .replace(/\.$/, '')
    .split(';')
    .map((item) => item.trim())
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1));
}

/**
 * Hand transcription of Appendix A-5 / content pack §5b (October), kept as history.
 * `short` is the A-5 and §5b wording; `name` is the full name of content pack §3.
 */
const OCTOBER_ORACLE_SCHOOLS = [
  { short: 'Virolai', name: 'Escola Virolai', levels: 'Infantil, primaria, ESO y Bachillerato', highlight: 'Personalización y plan personal' },
  { short: 'Sadako', name: 'Escola Sadako', levels: 'Infantil, primaria y ESO', highlight: 'Secuenciación y co-docencia' },
  { short: 'El Puig', name: 'Institut Escola El Puig', levels: 'Infantil, primaria y ESO', highlight: 'Incorporación de la naturaleza y el arte' },
  { short: 'La Maquinista', name: 'Escola La Maquinista', levels: 'Infantil y primaria', highlight: 'Cajas de aprendizaje' },
  { short: 'Octavio Paz', name: 'Escola Octavio Paz', levels: 'Infantil y primaria', highlight: 'Proyecto anual temático y cajas de aprendizaje' },
  { short: 'Angeleta Ferrer', name: 'Institut Angeleta Ferrer', levels: 'ESO', highlight: 'Vinculación de la escuela con la comunidad' },
  { short: 'Les Vinyes', name: 'Institut Escola Les Vinyes', levels: 'Infantil, primaria y ESO', highlight: 'Aprendizaje Basado en Proyectos' },
];

const CONTENT_PACK_PATH = path.join(process.cwd(), 'docs/plan/design/brochure-content-pack.md');

/** The single `| A-5 |` table row of the plan — the A-16 or decision-log rows prove nothing. */
function readAppendixA5Row(): string {
  const rows = readFileSync(PLAN_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('| A-5 |'));
  if (rows.length !== 1) throw new Error(`expected exactly one '| A-5 |' row in ${PLAN_PATH}, got ${rows.length}`);
  return rows[0];
}

/** One `## ` section of the content pack, up to the next `## ` heading, or a loud failure. */
function contentPackSection(heading: string): string {
  const pack = readFileSync(CONTENT_PACK_PATH, 'utf8');
  const start = pack.indexOf(`\n${heading}`);
  if (start === -1) throw new Error(`${heading} not found in ${CONTENT_PACK_PATH}`);
  const body = pack.slice(start + 1 + heading.length);
  const nextHeading = body.search(/\n## /);
  return nextHeading === -1 ? body : body.slice(0, nextHeading);
}

/** Content pack §5b table → short name → its exact levels cell and its ` · `-separated highlights. */
function contentPack5bRows(): Map<string, { levels: string; highlights: string[] }> {
  const rows = new Map<string, { levels: string; highlights: string[] }>();
  for (const line of contentPackSection('## 5b. Aspectos destacados por escuela').split('\n')) {
    const match = /^\| \*\*([^*|]+)\*\* \|([^|]+)\|([^|]+)\|\s*$/.exec(line);
    if (!match) continue;
    const [, short, levels, highlights] = match;
    if (rows.has(short)) throw new Error(`content pack §5b names ${short} twice`);
    rows.set(short, { levels: levels.trim(), highlights: highlights.trim().split(' · ') });
  }
  return rows;
}

/** Hand transcription of Appendix A-6 (October), kept as history. */
const OCTOBER_ORACLE_EXPERTS = [
  { name: 'Coral Regí', role: 'Directora del programa INSPIRA' },
  { name: 'Mora del Fresno', role: 'Coordinadora INSPIRA' },
  { name: 'Jordi Musons', role: 'Director', note: 'Anfitrión semana 1' },
  { name: 'Sandra Entrena', role: 'Encargada de Innovación', note: 'Anfitriona semana 1' },
  { name: 'Boris Mir', role: 'Ex-director adjunto, Institut Angeleta Ferrer y Escola Nova 21; fundador del Institut Angeleta Ferrer' },
  { name: 'Sergi del Moral', role: 'Director' },
  { name: 'Pepe Menéndez', role: 'Consultor en transformación pedagógica' },
  { name: 'Joan Quintana', role: 'Consultor en procesos de cambio, co-autor de «Educación Relacional»' },
];

describe('October 2026 — the record stays intact in Appendix A', () => {
  it('still documents October’s six includes and six excludes', () => {
    const includes = parseA7Items(a7Sentence(/^\*\*El programa[^\n]*?incluye[^\n]*?:\*\*[^\n]*$/m));
    const excludes = parseA7Items(a7Sentence(/^\*\*NO incluye:\*\*[^\n]*$/m));
    expect(includes).toHaveLength(6);
    expect(excludes).toHaveLength(6);
    expect(includes).toContain('Almuerzos de la primera semana, en Escola Virolai y Escola Sadako');
    expect(excludes).toContain('Transporte a El Puig y Les Vinyes');
  });

  it('still names October’s experts in the plan, its schools in Appendix A-5 and their levels in the October content pack', () => {
    const plan = readFileSync(PLAN_PATH, 'utf8');
    for (const expert of OCTOBER_ORACLE_EXPERTS) expect(plan).toContain(expert.name);
    const a5 = readAppendixA5Row();
    const structure = contentPackSection('## 3. Estructura');
    const rows = contentPack5bRows();
    expect([...rows.keys()].sort()).toEqual(OCTOBER_ORACLE_SCHOOLS.map((s) => s.short).sort());
    for (const school of OCTOBER_ORACLE_SCHOOLS) {
      expect([school.name, school.name.endsWith(school.short)]).toEqual([school.name, true]);
      expect(a5).toContain(school.short);
      expect(structure).toContain(school.name);
      expect([school.short, rows.get(school.short)?.levels]).toEqual([school.short, school.levels]);
      expect(rows.get(school.short)?.highlights).toContain(school.highlight);
    }
  });
});

describe('October 2026 — none of it is carried into the January module (C005)', () => {
  const serialized = JSON.stringify(COHORT_PUBLIC);

  it('no longer exports the October-only shapes', () => {
    const exported = Object.keys(cohortPublicModule);
    for (const retired of [
      'COHORT_WEEKS',
      'COHORT_FREE_DAYS',
      'COHORT_VISIT_DAYS',
      'COHORT_VISIT_DAY_COUNT',
      'COHORT_IMMERSION_SCHOOLS',
      'COHORT_VISIT_SCHOOLS',
      'COHORT_SCHOOLS',
      'COHORT_EXPERTS',
      'COHORT_OBJECTIVES',
      'COHORT_LODGING_AREA',
      'COHORT_CONTENT_PENDING',
    ]) {
      expect(exported).not.toContain(retired);
    }
  });

  it('carries no unratified October expert; Jordi Musons and Sandra Entrena only as January’s hosts', () => {
    // Jordi Musons is the contract's P-01 host. Sandra Entrena is January's
    // second host by the 2026-10-22 polish addendum
    // (docs/plan/pasantias-polish-addendum-20261022.md, brochure pages 4 and 12)
    // — excluded here by that citation and nothing else. Every other October
    // expert stays prohibited, and October's "semana 1" host notes stay out.
    const januaryHosts = ['Jordi Musons', 'Sandra Entrena'];
    for (const expert of OCTOBER_ORACLE_EXPERTS.filter((e) => !januaryHosts.includes(e.name))) {
      expect([expert.name, serialized.includes(expert.name)]).toEqual([expert.name, false]);
    }
    expect(OCTOBER_ORACLE_EXPERTS.filter((e) => !januaryHosts.includes(e.name))).toHaveLength(
      OCTOBER_ORACLE_EXPERTS.length - januaryHosts.length
    );
    expect(serialized).not.toContain('Anfitrión semana 1');
    expect(serialized).not.toContain('Anfitriona semana 1');
  });

  it('carries no October school level or highlight, and no objective', () => {
    for (const school of OCTOBER_ORACLE_SCHOOLS) {
      expect([school.highlight, serialized.includes(school.highlight)]).toEqual([school.highlight, false]);
    }
    expect(serialized).not.toMatch(/Bachillerato|aspectos destacados/);
    expect(serialized).not.toMatch(/Conocer los proyectos educativos de las principales escuelas/);
  });

  it('carries no October date, holiday, meal term or venue', () => {
    expect(serialized).not.toMatch(/2026-10-|octubre|Fiesta Nacional/i);
    expect(serialized).not.toMatch(/Desayunos de hotel|cena de cierre|Instituto Relacional|Eixample/);
    expect(serialized).not.toMatch(/PENDIENTE|A-16/);
  });
});

/* ============================================================================
 * D-01 — the public module carries no monetary data
 * ========================================================================== */

/**
 * Every runtime export of the public module, serialized — functions as their
 * source — so a standalone monetary export left out of the aggregate cannot
 * hide from the guard.
 */
function serializeEveryExport(moduleNamespace: Record<string, unknown>): string {
  const exported = Object.keys(moduleNamespace).map(
    (name) => [name, moduleNamespace[name]] as const
  );
  return JSON.stringify(Object.fromEntries(exported), (_name, value) =>
    typeof value === 'function' ? value.toString() : value
  );
}

/**
 * Every commercial figure, live or retired, that must never appear in public
 * data. October's euro figures stay (retired is not harmless); January's peso
 * and euro figures are pinned here as literals, independently of the commercial
 * module.
 */
const PROTECTED_AMOUNTS = [
  // October 2026 (retired)
  '2500',
  '2\\.500',
  '1000',
  '1\\.000',
  '1560',
  '1\\.560',
  '560',
  '810',
  '70',
  '120',
  // January 2027 (live)
  '2500000',
  '2\\.500\\.000',
  '2000000',
  '2\\.000\\.000',
  '1500000',
  '1\\.500\\.000',
  '4200000',
  '4500000',
  '4600000',
  '4700000',
  '5000000',
  '5100000',
  '4\\.700\\.000',
  '5\\.100\\.000',
  '1100',
  '1\\.100',
  '100000',
  '100\\.000',
  '50',
  '75',
];

describe('public cohort module — no monetary data (D-01)', () => {
  const wholeModule = serializeEveryExport(
    cohortPublicModule as unknown as Record<string, unknown>
  );

  it('guards the whole module namespace, not one aggregate object', () => {
    const exported = Object.keys(cohortPublicModule);
    expect(exported).toContain('COHORT_PUBLIC');
    expect(exported).toContain('COHORT_PROGRAMS');
    expect(wholeModule).toContain('enero-2027');
    expect(wholeModule).toContain('buildCohortDateLabel');
  });

  it('serializes without a single monetary key or value, euro or peso', () => {
    const monetary = /€|price|precio|\beur(?:os?)?\b|\bclp\b|\bpesos?\b|descuento|valor/i;
    expect(wholeModule).not.toMatch(monetary);
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(monetary);
  });

  it('carries no figure that could be an amount in disguise', () => {
    for (const amount of PROTECTED_AMOUNTS) {
      const bounded = new RegExp(`(?<![\\d.])${amount}(?![\\d.]?\\d)`);
      expect([amount, bounded.test(wholeModule)]).toEqual([amount, false]);
      expect([amount, bounded.test(JSON.stringify(COHORT_PUBLIC))]).toEqual([amount, false]);
    }
  });

  it('carries none of the brochure-only commercial facts', () => {
    expect(wholeModule).not.toContain('COLEGIOS CON PROGRAMA ANUAL');
    expect(wholeModule).not.toMatch(/al reservar|restante la semana/);
    expect(wholeModule).not.toMatch(/2027-01-17|2027-01-30/);
    expect(wholeModule).not.toMatch(/noches?/i);
  });
});

/* ============================================================================
 * The commercial module — January 2027, brochure-only
 * ========================================================================== */

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

/** The contract's commercial block, transcribed here independently of the module. */
const ORACLE_PRICING = {
  inspira: {
    feeClp: 2500000,
    discountedFeeClp: 2000000,
    nights: 12,
    returnDate: '2027-01-29',
    perPersonClp: { standard: [4700000, 5000000], discounted: [4200000, 4500000] },
  },
  'mirada-profunda': {
    feeClp: 2500000,
    discountedFeeClp: 2000000,
    nights: 13,
    returnDate: '2027-01-30',
    perPersonClp: { standard: [4700000, 5100000], discounted: [4200000, 4600000] },
  },
};

describe('commercial cohort module — January 2027 (contract `commercial`)', () => {
  it('prices both programs exactly as the oracle transcribes the contract', () => {
    expect(JSON.parse(JSON.stringify(PROGRAM_PRICING))).toEqual(ORACLE_PRICING);
    expect(COMMERCIAL_CURRENCY).toBe('CLP');
  });

  it('carries every other commercial fact verbatim', () => {
    expect(DISCOUNT_CONDITION).toBe('COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE');
    expect(ARRIVAL_DATE).toBe('2027-01-17');
    expect(JSON.parse(JSON.stringify(LODGING_EUR))).toEqual({
      doublePerPersonPerNight: { min: 50, max: 75 },
      singlePerNightApprox: 100,
    });
    expect(FLIGHT_CLP_APPROX).toBe(1500000);
    expect(EUR_CLP).toBe(1100);
    expect(TOTALS_ROUNDED_TO_CLP).toBe(100000);
    expect({ ...TEAM_SIZES }).toEqual({ min: 1, max: 10 });
    expect(PAYMENT_TERMS).toBe(
      '50% al reservar y el 50% restante la semana antes del inicio de la pasantía'
    );
    expect(PLACES_TERMS).toBe('Se confirman por orden de reserva.');
  });

  it('counts the nights from the 17 January arrival to each return (12 vs 13; 29 vs 30)', () => {
    for (const [program, pricing] of Object.entries(PROGRAM_PRICING)) {
      const nights =
        (utcDate(pricing.returnDate).getTime() - utcDate(ARRIVAL_DATE).getTime()) / 86_400_000;
      expect([program, nights]).toEqual([program, pricing.nights]);
    }
    // Each program returns the day after its last school day.
    for (const program of COHORT_PROGRAMS) {
      const returnDate = PROGRAM_PRICING[program.id].returnDate;
      expect((utcDate(returnDate).getTime() - utcDate(program.endDate).getTime()) / 86_400_000).toBe(1);
    }
  });

  it('recomputes every per-person total by its own arithmetic (fee + flight + nights × lodging × €1 = $1.100, rounded)', () => {
    // Independent arithmetic with the literals the contract states, not the
    // module's constants.
    const round = (value: number) => Math.round(value / 100000) * 100000;
    const expected = (fee: number, nights: number, perNight: number) =>
      round(fee + 1500000 + nights * perNight * 1100);
    for (const [program, pricing] of Object.entries(PROGRAM_PRICING)) {
      expect([program, [...pricing.perPersonClp.standard]]).toEqual([
        program,
        [expected(2500000, pricing.nights, 50), expected(2500000, pricing.nights, 75)],
      ]);
      expect([program, [...pricing.perPersonClp.discounted]]).toEqual([
        program,
        [expected(2000000, pricing.nights, 50), expected(2000000, pricing.nights, 75)],
      ]);
    }
  });

  it('builds the page-15 team table: twenty rows, per-person times 1 to 10', () => {
    const inspira = teamRows('inspira');
    const mirada = teamRows('mirada-profunda');
    expect(inspira.length + mirada.length).toBe(20);
    expect(inspira.map((row) => row.size)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Literal pins at both ends, typed here rather than derived.
    expect(inspira[0]).toEqual({ size: 1, standard: [4700000, 5000000], discounted: [4200000, 4500000] });
    expect(inspira[9]).toEqual({ size: 10, standard: [47000000, 50000000], discounted: [42000000, 45000000] });
    expect(mirada[0]).toEqual({ size: 1, standard: [4700000, 5100000], discounted: [4200000, 4600000] });
    expect(mirada[9]).toEqual({ size: 10, standard: [47000000, 51000000], discounted: [42000000, 46000000] });
    expect(mirada[2]).toEqual({ size: 3, standard: [14100000, 15300000], discounted: [12600000, 13800000] });
  });

  it('writes the lodging, totals and team notes with the module’s own figures', () => {
    expect(LODGING_NOTE).toBe(
      'Alojamiento en Barcelona: entre €50 y €75 por persona por noche, en base a habitación doble — el monto es por persona, no por habitación. Habitación individual: aproximadamente €100 por noche.'
    );
    expect(LODGING_NOTE).toContain(`€${LODGING_EUR.doublePerPersonPerNight.min} `);
    expect(LODGING_NOTE).toContain(`€${LODGING_EUR.doublePerPersonPerNight.max} `);
    expect(LODGING_NOTE).toContain(`€${LODGING_EUR.singlePerNightApprox} `);
    expect(TOTALS_NOTE).toContain('€1 = $1.100');
    expect(TOTALS_NOTE).toContain('$100.000');
    expect(TEAM_NOTE).toMatch(/valor por persona multiplicado/);
  });

  it('ties price validity to the January cohort instead of a calendar date', () => {
    expect(PRICE_VALIDITY).toBe('Precios vigentes para la cohorte de enero 2027.');
    expect(PRICE_VALIDITY).not.toMatch(/\d{2}[/-]\d{2}[/-]\d{2,4}/);
  });

  it('versions the brochure for January, so no October object can be served', () => {
    expect(COMMERCIAL_SENTINEL).toBe('__INSPIRA_COMMERCIAL__');
    expect(BROCHURE_VERSION).toBe('2027-01-v1');
    expect(BROCHURE_FILENAME).toBe('Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf');
    expect(BROCHURE_VERSION).not.toMatch(/^2026-10-/);
    expect(BROCHURE_FILENAME).toMatch(/^[A-Za-z0-9.-]+$/);
  });

  it('has fully retired the October euro prices from the commercial module', () => {
    for (const number of collectNumbers(cohortCommercialModule)) {
      expect([1000, 1560, 2500, 560, 810, 70, 120]).not.toContain(number);
    }
    expect(cohortCommercialModule).not.toHaveProperty('COHORT_PRICE_ITEMS');
    expect(cohortCommercialModule).not.toHaveProperty('COHORT_LODGING_PER_NIGHT_EUR');
    expect(JSON.stringify(cohortCommercialModule)).not.toMatch(/€2\.500|€1\.000|€1\.560|€70|€120/);
  });
});

/**
 * Owner decision 2026-08-02: the optional extension was an accidental carry from
 * a stale source deck. Its absence stays pinned, in both modules, as a
 * prohibition.
 */
describe('both cohort modules — the removed extension cannot return silently', () => {
  const removedExtension = /madrid/i;

  const modules = [
    ['public', cohortPublicModule],
    ['commercial', cohortCommercialModule],
  ] as const;

  for (const [name, moduleNamespace] of modules) {
    it(`has no matching export name or value in the ${name} module`, () => {
      const names = Object.keys(moduleNamespace);
      expect(names.filter((key) => removedExtension.test(key))).toEqual([]);
      expect(
        serializeEveryExport(moduleNamespace as unknown as Record<string, unknown>)
      ).not.toMatch(removedExtension);
    });
  }
});

/* ============================================================================
 * The January 2027 oracle (C003) — parsed from the ratified contract
 *
 * The contract's machine-readable block is read here and every fact is compared
 * with the module mechanically. Facts whose `value` is an English summary are
 * compared through their verbatim Spanish `anchor` (what a reader sees) and,
 * where they start with an ISO range, through the range.
 * ========================================================================== */

const CONTRACT_PATH = path.join(process.cwd(), 'docs/plan/pasantias-january-contract.md');
const RATIFIED = 'RATIFIED — ACTIVE';

type JanuaryFact = { program: string; field: string; value: unknown; page: number; anchor: string };
type JanuaryDecided = { id: string; field: string; value: unknown };
type JanuaryContract = {
  status: string;
  ids: { cohort: string; programs: string[] };
  facts: JanuaryFact[];
  decided: JanuaryDecided[];
};

function readJanuaryContract(): JanuaryContract {
  const block = readFileSync(CONTRACT_PATH, 'utf8').match(/```json\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`${CONTRACT_PATH}: no fenced json block`);
  return JSON.parse(block[1]) as JanuaryContract;
}

const JANUARY = readJanuaryContract();

/** One contract fact, or a loud failure. */
function januaryFact(contract: JanuaryContract, key: string): JanuaryFact {
  if (contract.status !== RATIFIED) throw new Error(`January contract is ${contract.status}, not ${RATIFIED}`);
  const fact = contract.facts.find((f) => `${f.program}.${f.field}` === key);
  if (!fact) throw new Error(`January contract has no fact ${key}`);
  return fact;
}

/** The ISO range a contract value starts with: "2027-01-18/2027-01-22 immersion" → both ends. */
function isoRange(value: unknown): [string, string] {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error(`not an ISO range: ${String(value)}`);
  return [match[1], match[2]];
}

/**
 * For every contract fact: what the module holds, and what it must equal, both
 * computed from the contract fact. One entry per fact, asserted in both
 * directions below.
 */
const FACT_CHECKS: Record<string, (fact: JanuaryFact) => [unknown, unknown]> = {
  'cohort.label': (f) => [COHORT_LABEL, f.value],
  'cohort.span': (f) => [[COHORT_SPAN.startDate, COHORT_SPAN.endDate], isoRange(f.value)],
  'cohort.city': (f) => [COHORT_CITY, f.value],
  'cohort.together': (f) => [COHORT_TOGETHER, f.anchor],
  'cohort.routing': (f) => [COHORT_ROUTING.map((route) => route.program), f.value],
  'cohort.places': (f) => [COHORT_PLACES, f.anchor],
  'cohort.contact': (f) => [[COHORT_CONTACT.whatsapp, COHORT_CONTACT.email], f.value],
  'inspira.name': (f) => [INSPIRA.name, f.value],
  'inspira.audience': (f) => [INSPIRA.audience, f.value],
  'inspira.dates': (f) => [[INSPIRA.startDate, INSPIRA.endDate], isoRange(f.value)],
  'inspira.schoolDays': (f) => [INSPIRA.schoolDays, f.value],
  'inspira.schoolCount': (f) => [INSPIRA.schoolCount, f.value],
  'inspira.week1': (f) => [[INSPIRA.weeks[0].startDate, INSPIRA.weeks[0].endDate], isoRange(f.value)],
  'inspira.immersionSchools': (f) => [INSPIRA.immersionSchools.map((school) => school.name), f.value],
  'inspira.freeDays': (f) => [[COHORT_FREE_WEEKEND.startDate, COHORT_FREE_WEEKEND.endDate], isoRange(f.value)],
  'inspira.week2': (f) => [[INSPIRA.weeks[1].startDate, INSPIRA.weeks[1].endDate], isoRange(f.value)],
  'inspira.visitCount': (f) => [INSPIRA.visits.count, f.value],
  'inspira.visitCandidates': (f) => [[...INSPIRA.visits.candidates], f.value],
  'inspira.visitSelection': (f) => [INSPIRA.visits.selection, f.anchor],
  'inspira.fullDayOutside': (f) => [[...INSPIRA.visits.fullDayOutside], f.value],
  'inspira.lunches': (f) => [INSPIRA.lunches, f.anchor],
  'inspira.takeaway': (f) => [INSPIRA.takeaway, f.value],
  'mirada-profunda.name': (f) => [MIRADA.name, f.value],
  'mirada-profunda.audience': (f) => [MIRADA.audience, f.value],
  'mirada-profunda.dates': (f) => [[MIRADA.startDate, MIRADA.endDate], isoRange(f.value)],
  'mirada-profunda.schoolDays': (f) => [MIRADA.schoolDays, f.value],
  'mirada-profunda.schoolCount': (f) => [MIRADA.schoolCount, f.value],
  'mirada-profunda.week1': (f) => [[MIRADA.weeks[0].startDate, MIRADA.weeks[0].endDate], isoRange(f.value)],
  'mirada-profunda.freeDays': (f) => [[COHORT_FREE_WEEKEND.startDate, COHORT_FREE_WEEKEND.endDate], isoRange(f.value)],
  'mirada-profunda.week2': (f) => [[MIRADA.weeks[1].startDate, MIRADA.weeks[1].endDate], isoRange(f.value)],
  'mirada-profunda.schools': (f) => [[...MIRADA.schools], f.value],
  'mirada-profunda.orderCaveat': (f) => [MIRADA.orderCaveat, f.anchor],
  'mirada-profunda.preparation': (f) => [MIRADA.preparation, f.anchor],
  'mirada-profunda.closing': (f) => [[MIRADA.closing.date, MIRADA.closing.text], [String(f.value).slice(0, 10), f.anchor]],
  'mirada-profunda.followUp': (f) => [MIRADA.followUp, f.anchor],
  'mirada-profunda.lunches': (f) => [MIRADA.lunches, f.anchor],
  'mirada-profunda.includes': (f) => [[...MIRADA.extraIncludes], f.value],
  'mirada-profunda.takeaway': (f) => [MIRADA.takeaway, f.value],
  'both.dayStructure': (f) => [[...COHORT_DAY_STRUCTURE], f.value],
  'both.includes': (f) => [[...COHORT_INCLUDES], f.value],
  'both.excludes': (f) => [[...COHORT_EXCLUDES], f.value],
};

describe('January 2027 oracle — the module equals the ratified contract (C003)', () => {
  it('reads the ratified contract: two stable programs in one cohort, the module’s IDs', () => {
    expect(JANUARY.status).toBe(RATIFIED);
    expect(JANUARY.ids).toEqual({ cohort: COHORT_ID, programs: [...PROGRAM_IDS] });
  });

  it('checks every contract fact exactly once, no more and no fewer', () => {
    expect(Object.keys(FACT_CHECKS).sort()).toEqual(
      JANUARY.facts.map((f) => `${f.program}.${f.field}`).sort()
    );
  });

  for (const key of Object.keys(FACT_CHECKS)) {
    it(`holds ${key} exactly as the contract states it`, () => {
      const [held, stated] = FACT_CHECKS[key](januaryFact(JANUARY, key));
      expect(held).toEqual(stated);
    });
  }

  it('applies every decided answer: Musons, the RPA claim, the track record, four of five', () => {
    const decided = Object.fromEntries(JANUARY.decided.map((d) => [d.field, d.value]));
    // Index 0 on purpose: the contract's decided host stays first; the
    // addendum's second host follows it.
    expect(COHORT_HOSTS[0].name).toBe(decided['inspira.host.sadako']);
    expect(COHORT_ACCREDITATION).toBe(decided['cohort.claim.rpa']);
    expect([...COHORT_CLAIMS]).toEqual(decided['cohort.claim.trackRecord']);
    expect(String(decided['inspira.visits.presentation'])).toMatch(/never a fixed list of four/);
    expect([INSPIRA.visits.count, INSPIRA.visits.candidates.length]).toEqual([4, 5]);
  });

  it.each<[string, (c: JanuaryContract) => void, RegExp]>([
    ['an unratified contract', (c) => { c.status = 'CANDIDATE — NOT RATIFIED — NOT ACTIVE'; }, /not RATIFIED — ACTIVE/],
    ['a dropped program fact', (c) => { c.facts = c.facts.filter((f) => !(f.program === 'mirada-profunda' && f.field === 'week2')); }, /no fact mirada-profunda\.week2/],
    ['a range that is not ISO', (c) => { januaryFact(c, 'inspira.dates').value = '18 al 28 de enero'; }, /not an ISO range/],
  ])('refuses %s', (_name, mutate, error) => {
    const mutated = structuredClone(JANUARY);
    mutate(mutated);
    const key = 'mirada-profunda.week2';
    expect(() => {
      FACT_CHECKS['inspira.dates'](januaryFact(mutated, 'inspira.dates'));
      FACT_CHECKS[key](januaryFact(mutated, key));
    }).toThrow(error);
  });

  it.each<[string, string, unknown]>([
    ['an INSPIRA week 2 that adds a school day', 'inspira.week2', '2027-01-25/2027-01-29 visits, one school per day'],
    ['a renamed Mirada Profunda school', 'mirada-profunda.schools', ['Escola Virolai', 'Escola Sadako', 'Institut Angeleta Ferrer', 'Institut Escola El Puig', 'Escola Nova']],
    ['a changed INSPIRA lunch anchor', 'inspira.lunches', 'Almuerzos: todos los días.'],
  ])('disagrees with the module for %s', (_name, key, value) => {
    const mutated = structuredClone(JANUARY);
    const fact = januaryFact(mutated, key);
    if (key === 'inspira.lunches') fact.anchor = String(value);
    else fact.value = value;
    const [held, stated] = FACT_CHECKS[key](fact);
    expect(held).not.toEqual(stated);
  });
});
