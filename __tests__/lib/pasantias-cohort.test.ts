// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import * as cohortPublicModule from '../../lib/pasantias/cohort-public';
import {
  buildCohortDateLabel,
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
  COHORT_MIN_PARTICIPANTS,
  COHORT_PAYMENT_TERMS,
  COHORT_PRICE_ITEMS,
  COHORT_PRICE_VALIDITY,
  COMMERCIAL_SENTINEL,
} from '../../lib/pasantias/cohort-commercial';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Appendix A-7 is the normative source for the programme's includes/excludes
 * copy, and `cohort-public.ts` is meant to be a transcription of it — not an
 * improved edit. Pinning the module against hand-written expectations proved too
 * weak in round a1-repricing r1 (Sol B1: two paraphrases survived a green
 * suite), so the Appendix is re-parsed out of the plan here and compared. Drift
 * on either side now fails instead of passing.
 */
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

/**
 * A-7 writes each list as one semicolon-separated sentence behind a bold
 * lead-in. Turning it into array entries is mechanical and lossless: drop the
 * lead-in, the Appendix's own trailing italic note, its bold markers and the
 * sentence's final full stop, then split on `;`. The only character this adds is
 * the entry's initial capital — everything else must be what A-7 says.
 */
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
    // Appendix A-1 amended 2026-08-02: one continuous span, never two ranges.
    expect(COHORT_DATE_LABEL).toBe('Octubre, 5 al 16');
    expect(COHORT_HEADLINE).toBe('Octubre, 5 al 16 · 2026');
    // The span's ends are the calendar's ends, not a string someone typed.
    expect(COHORT_DATE_LABEL).toContain(String(Number(COHORT_VISIT_DAYS[0].slice(8))));
    expect(COHORT_DATE_LABEL).toContain(
      String(Number(COHORT_VISIT_DAYS[COHORT_VISIT_DAYS.length - 1].slice(8)))
    );
  });

  it('never splits the headline into two ranges (Appendix A-1, 2026-08-02)', () => {
    // The retired shape read as two different pasantías, so its markers are
    // pinned as prohibitions rather than left to nobody re-adding them.
    expect(COHORT_DATE_LABEL).not.toContain('–');
    expect(COHORT_DATE_LABEL).not.toMatch(/\sy\s/);
    expect(COHORT_HEADLINE).not.toContain('–');
    // The year belongs to the headline once, and to the span not at all.
    expect(COHORT_DATE_LABEL).not.toContain('2026');
    expect(COHORT_HEADLINE.match(/2026/g)).toHaveLength(1);
    expect(COHORT_HEADLINE.match(/Octubre/g)).toHaveLength(1);
  });

  it('rebuilds the span from whatever weeks it is handed', () => {
    // Derivation, not a constant: a different calendar has to produce a
    // different label, ends taken from the visit days rather than the blocks.
    expect(
      buildCohortDateLabel([
        {
          ...COHORT_WEEKS[0],
          startDate: '2026-11-02',
          endDate: '2026-11-06',
          visitDays: ['2026-11-03', '2026-11-04'],
        },
        {
          ...COHORT_WEEKS[1],
          startDate: '2026-11-09',
          endDate: '2026-11-13',
          visitDays: ['2026-11-10', '2026-11-11'],
        },
      ])
    ).toBe('Noviembre, 3 al 11');
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

  /**
   * Content pack §5b, owner-approved 2026-08-02. A school with no highlights is
   * a card that cannot say why the school is worth the trip, which is the whole
   * point of the section — so this fails rather than degrading quietly, the way
   * the A-6 expert titles degraded for two days.
   */
  it('gives every school its levels and at least one aspecto destacado (pack §5b)', () => {
    expect(COHORT_SCHOOLS).toHaveLength(7);
    for (const school of COHORT_SCHOOLS) {
      expect(school.levels.trim(), `${school.name} has no levels`).not.toBe('');
      expect(school.highlights.length, `${school.name} has no highlights`).toBeGreaterThan(0);
      for (const highlight of school.highlights) {
        expect(highlight.trim(), `${school.name} has an empty highlight`).not.toBe('');
      }
      // Repeated copy inside one card reads as a rendering bug, not as emphasis.
      expect(new Set(school.highlights).size).toBe(school.highlights.length);
    }
  });

  it('carries the levels the owner confirmed for El Puig and Les Vinyes', () => {
    // These two were the pack's open question until the 2026-08-02 brochure; the
    // answer is pinned so a future edit has to argue with the owner, not with a
    // silent default.
    for (const name of ['Institut Escola El Puig', 'Institut Escola Les Vinyes']) {
      const school = COHORT_SCHOOLS.find((candidate) => candidate.name === name);
      expect(school?.levels).toBe('Infantil, primaria y ESO');
    }
    const virolai = COHORT_SCHOOLS.find((school) => school.name === 'Escola Virolai');
    expect(virolai?.levels).toBe('Infantil, primaria, ESO y Bachillerato');
    const angeleta = COHORT_SCHOOLS.find(
      (school) => school.name === 'Institut Angeleta Ferrer'
    );
    expect(angeleta?.levels).toBe('ESO');
  });

  it('keeps the pack §5b highlights verbatim for one school of each tier', () => {
    const sadako = COHORT_SCHOOLS.find((school) => school.name === 'Escola Sadako');
    expect(sadako?.highlights).toEqual([
      'Organización y espacios',
      'Evaluación formativa, portfolios',
      'Secuenciación y co-docencia',
      'Organización y participación estudiantil',
    ]);
    const vinyes = COHORT_SCHOOLS.find(
      (school) => school.name === 'Institut Escola Les Vinyes'
    );
    expect(vinyes?.highlights).toEqual([
      'Trabajo interdisciplinario',
      'Aprendizaje Basado en Proyectos',
      'Autonomía del estudiante',
      'Coherencia escolar',
      'Codocencia',
    ]);
  });
});

/**
 * THE INDEPENDENT ORACLE — Sol's round-2 B2.
 *
 * Everything above pins *parts*: four of seven school levels, two complete
 * highlight lists, a subset of expert titles. Sol changed La Maquinista's level
 * to `ESO`, its first highlight to `Innovación educativa` and Jordi Musons's
 * title to `Coordinador`, and all 83 targeted tests passed — because nothing
 * unpinned was ever looked at.
 *
 * The two tables below are a **hand transcription of Appendix A-5/A-6 and
 * content pack §5b**, owned by this test file. They are deliberately not
 * imported, not derived and not read from a fixture the module also reads: the
 * whole point is that they are a second, independent copy, so a wrong value in
 * `cohort-public.ts` disagrees with something instead of agreeing with itself.
 * That self-reference is exactly what let the r2 bug through one level down
 * (`tests/e2e/pasantias-page.spec.ts` read its expectations from the module it
 * was checking), and it is what these two `toEqual`s remove.
 *
 * `toEqual` is symmetric deep equality over ordered arrays, so it fails in both
 * directions at once: an added row, a removed row, a renamed school, a reordered
 * highlight list or a single changed character all break it.
 *
 * Where §6 of the content pack and Appendix A-6 disagree — the pack still calls
 * Pepe Menéndez and Joan Quintana "Conferencista INSPIRA" and gives Boris Mir no
 * role at all — **the Appendix wins**, per its own supremacy rule and because its
 * canonical source is the brochure the owner reviewed on 2026-08-02. That
 * disagreement is a live PM-owned finding, raised in r2 and unresolved.
 */
const ORACLE_SCHOOLS = [
  {
    name: 'Escola Virolai',
    tier: 'inmersion',
    immersionDays: 2.5,
    levels: 'Infantil, primaria, ESO y Bachillerato',
    highlights: [
      'Organización y espacios',
      'Evaluación formativa, portfolios',
      'Personalización y plan personal',
      'Gestión del equipo docente',
    ],
  },
  {
    name: 'Escola Sadako',
    tier: 'inmersion',
    immersionDays: 2.5,
    levels: 'Infantil, primaria y ESO',
    highlights: [
      'Organización y espacios',
      'Evaluación formativa, portfolios',
      'Secuenciación y co-docencia',
      'Organización y participación estudiantil',
    ],
  },
  {
    name: 'Institut Escola El Puig',
    tier: 'visita',
    fullDay: true,
    levels: 'Infantil, primaria y ESO',
    highlights: [
      'Incorporación de la naturaleza y el arte',
      'Gobierno estudiantil',
      'Trabajo de estudiantes internivel',
      'Metaprendizaje',
    ],
  },
  {
    name: 'Escola La Maquinista',
    tier: 'visita',
    levels: 'Infantil y primaria',
    highlights: [
      'Organización y espacios',
      'Evaluación formativa, rúbricas y autoevaluación',
      'Cajas de aprendizaje',
      'Organización participativa de los alumnos',
    ],
  },
  {
    name: 'Escola Octavio Paz',
    tier: 'visita',
    levels: 'Infantil y primaria',
    highlights: [
      'Organización y espacios',
      'Evaluación formativa, diarios de aprendizaje',
      'Proyecto anual temático y cajas de aprendizaje',
      'Trabajo por comunidades de alumnos',
    ],
  },
  {
    name: 'Institut Angeleta Ferrer',
    tier: 'visita',
    levels: 'ESO',
    highlights: [
      'Organización y espacios',
      'Evaluación formativa, portfolios',
      'Autonomía del alumnado',
      'Vinculación de la escuela con la comunidad',
    ],
  },
  {
    name: 'Institut Escola Les Vinyes',
    tier: 'visita',
    fullDay: true,
    levels: 'Infantil, primaria y ESO',
    highlights: [
      'Trabajo interdisciplinario',
      'Aprendizaje Basado en Proyectos',
      'Autonomía del estudiante',
      'Coherencia escolar',
      'Codocencia',
    ],
  },
];

const ORACLE_EXPERTS = [
  { name: 'Coral Regí', role: 'Directora del programa INSPIRA' },
  { name: 'Mora del Fresno', role: 'Coordinadora INSPIRA' },
  {
    name: 'Jordi Musons',
    role: 'Director',
    school: 'Escola Sadako',
    note: 'Anfitrión semana 1',
  },
  {
    name: 'Sandra Entrena',
    role: 'Encargada de Innovación',
    school: 'Escola Virolai',
    note: 'Anfitriona semana 1',
  },
  {
    name: 'Boris Mir',
    role: 'Ex-director adjunto, Institut Angeleta Ferrer y Escola Nova 21; fundador del Institut Angeleta Ferrer',
  },
  {
    name: 'Sergi del Moral',
    role: 'Director',
    school: 'Institut Escola Les Vinyes',
  },
  { name: 'Pepe Menéndez', role: 'Consultor en transformación pedagógica' },
  {
    name: 'Joan Quintana',
    role: 'Consultor en procesos de cambio, co-autor de «Educación Relacional»',
  },
];

describe('public cohort module — the independent oracle (Sol r2 B2)', () => {
  it('matches the hand-transcribed A-5 / §5b school table exactly, row for row', () => {
    // Spread each row so a readonly module object compares as a plain object.
    // Optional keys absent on both sides (`fullDay` on a half-day school) are
    // equal; a key present on only one side is not.
    expect(COHORT_SCHOOLS.map((school) => ({ ...school }))).toEqual(ORACLE_SCHOOLS);
  });

  it('has exactly the seven school names the oracle lists, no more and no fewer', () => {
    // Same fact as above, asserted on names alone so a missing or invented
    // school names itself in the failure output instead of drowning in a diff.
    expect(COHORT_SCHOOLS.map((school) => school.name)).toEqual(
      ORACLE_SCHOOLS.map((school) => school.name)
    );
  });

  it('matches the hand-transcribed A-6 expert table exactly, row for row', () => {
    expect(COHORT_EXPERTS.map((expert) => ({ ...expert }))).toEqual(ORACLE_EXPERTS);
  });

  it('has exactly the eight expert names the oracle lists, in the Appendix’s order', () => {
    expect(COHORT_EXPERTS.map((expert) => expert.name)).toEqual(
      ORACLE_EXPERTS.map((expert) => expert.name)
    );
  });

  it('gives Coral Regí and Mora del Fresno A-6’s INSPIRA suffix', () => {
    // Called out separately because it is the one correction this round made to
    // the data: the r2 prompt declared both rows already correct, and they were
    // not. Pinning them here as well as in the table means a revert fails twice.
    const roleOf = (name: string) =>
      COHORT_EXPERTS.find((expert) => expert.name === name)?.role;
    expect(roleOf('Coral Regí')).toBe('Directora del programa INSPIRA');
    expect(roleOf('Mora del Fresno')).toBe('Coordinadora INSPIRA');
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

  /**
   * THE PROPAGATION GUARD. The 2026-08-02 A-6 amendment reached the Appendix and
   * never reached this module, so Boris Mir, Sergi del Moral, Pepe Menéndez and
   * Joan Quintana rendered as the placeholder "Experto invitado" on the live
   * page — a landing page introducing four people by no title at all. Nothing
   * failed, because nothing was looking. This is what looks.
   */
  it('has no placeholder or empty role left on any expert (Appendix A-6)', () => {
    for (const expert of COHORT_EXPERTS) {
      expect(expert.role.trim(), `${expert.name} has an empty role`).not.toBe('');
      expect(expert.role, `${expert.name} still carries the placeholder role`).not.toMatch(
        /experto invitado/i
      );
    }
  });

  it('carries the 2026-08-02 A-6 titles verbatim for the four that were placeholders', () => {
    const roleOf = (name: string) =>
      COHORT_EXPERTS.find((expert) => expert.name === name);

    expect(roleOf('Boris Mir')?.role).toBe(
      'Ex-director adjunto, Institut Angeleta Ferrer y Escola Nova 21; fundador del Institut Angeleta Ferrer'
    );
    expect(roleOf('Sergi del Moral')?.role).toBe('Director');
    expect(roleOf('Sergi del Moral')?.school).toBe('Institut Escola Les Vinyes');
    expect(roleOf('Pepe Menéndez')?.role).toBe('Consultor en transformación pedagógica');
    expect(roleOf('Joan Quintana')?.role).toBe(
      'Consultor en procesos de cambio, co-autor de «Educación Relacional»'
    );
  });

  it('names the two week-1 hosts as hosts (Appendix A-6)', () => {
    const hosts = COHORT_EXPERTS.filter((expert) => expert.note);
    expect(hosts.map((expert) => expert.name)).toEqual(['Jordi Musons', 'Sandra Entrena']);
    expect(hosts[0].note).toBe('Anfitrión semana 1');
    expect(hosts[1].note).toBe('Anfitriona semana 1');
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
    // Exact counts, not floors: the 2026-08-02 amendment moved two lines from
    // one list to the other, and a `>=` assertion is green whether or not the
    // move happened. Appendix A-7 has six of each.
    expect(COHORT_INCLUDES).toHaveLength(6);
    expect(COHORT_EXCLUDES).toHaveLength(6);
    for (const item of [...COHORT_INCLUDES, ...COHORT_EXCLUDES]) {
      expect(item.trim().length).toBeGreaterThan(0);
    }
  });

  it('transcribes both lists verbatim from Appendix A-7, in the Appendix’s order', () => {
    // The whole ordered arrays, parsed from the plan itself — so an edit to
    // either side (a smoothed phrase here, an owner amendment there) fails.
    expect(COHORT_INCLUDES).toEqual(
      parseA7Items(a7Sentence(/^\*\*El programa[^\n]*?incluye[^\n]*?:\*\*[^\n]*$/m))
    );
    expect(COHORT_EXCLUDES).toEqual(
      parseA7Items(a7Sentence(/^\*\*NO incluye:\*\*[^\n]*$/m))
    );
  });

  it('has every includes/excludes item present verbatim inside the A-7 text', () => {
    for (const item of [...COHORT_INCLUDES, ...COHORT_EXCLUDES]) {
      // A-7 writes the items mid-sentence, so the entry's initial capital is the
      // one character this module owns; the rest is character-for-character A-7.
      const asTheAppendixWritesIt = item.charAt(0).toLowerCase() + item.slice(1);
      expect(APPENDIX_A7).toContain(asTheAppendixWritesIt);
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

  it('includes only the first week’s lunches (owner, 2026-08-02)', () => {
    // A-16's generic meals phrasing was superseded by the canonical brochure:
    // week-1 lunches at Virolai and Sadako are in, and that is the whole of the
    // meals inclusion. Pinned as the last item because A-7 reads that way and
    // the brochure prints the list in order.
    expect(COHORT_INCLUDES).toContain(
      'Almuerzos de la primera semana, en Escola Virolai y Escola Sadako'
    );
    expect(COHORT_INCLUDES[COHORT_INCLUDES.length - 1]).toBe(
      'Almuerzos de la primera semana, en Escola Virolai y Escola Sadako'
    );
  });

  it('excludes week-2 meals, all dinners, and the El Puig / Les Vinyes transport', () => {
    expect(COHORT_EXCLUDES).toContain('Comidas en los días de visita de la segunda semana');
    expect(COHORT_EXCLUDES).toContain('Cenas');
    expect(COHORT_EXCLUDES).toContain('Transporte a El Puig y Les Vinyes');
  });

  it('keeps no trace of the terms the 2026-08-02 amendment retired', () => {
    // Both retired lines were *inclusions*, so asserting only on the excludes
    // list would miss the failure this test exists for; scan both. The closing
    // dinner is the sharpest case — it moved from an inclusion, to an explicit
    // "salvo la de cierre" carve-out in the excludes, to nothing at all.
    const everyTerm = [...COHORT_INCLUDES, ...COHORT_EXCLUDES].join(' | ');
    expect(everyTerm).not.toMatch(/cena de cierre|salvo la de cierre/i);
    expect(everyTerm).not.toMatch(/Comidas incluidas en los días de visita/i);
    expect(everyTerm).not.toMatch(/Transporte para las visitas a El Puig/i);
    // …and the whole public surface, not just the two lists.
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(/cena de cierre|salvo la de cierre/i);
  });

  it('claims no night count and no per-day meal mapping', () => {
    const text = COHORT_INCLUDES.join(' | ');
    expect(text).not.toMatch(/\d+\s*(?:noches?|días?)/i);
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(/por noche/i);
  });

  it('never leaks the plan’s own pending markers into public copy', () => {
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(/PENDIENTE|A-16/i);
  });

  it('no longer ships the pending-content registry', () => {
    expect(Object.keys(cohortPublicModule)).not.toContain('COHORT_CONTENT_PENDING');
  });
});

/**
 * Every runtime export of the public module, serialized. `COHORT_PUBLIC` is a
 * hand-assembled aggregate, so guarding it alone would let a standalone monetary
 * export be added to `cohort-public.ts`, left out of the aggregate, and stay
 * invisible here — the exact drift a module-boundary guard exists to stop.
 * Exported functions are serialized as their source, so a helper cannot carry an
 * amount past this either.
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
 * Live commercial amounts plus every one the plan has retired — 560 and the
 * 1.560 total (A-8 amendment, 2026-07-31), 810 (the optional extension removed
 * on owner authority, 2026-08-02) and now 1.000, the programme price the same
 * owner decision replaced with 2.500. Retired is not the same as harmless: none
 * of them may reappear on a public surface.
 */
const PROTECTED_AMOUNTS = [
  '2500', // live programme fee (owner repricing, 2026-08-02)
  '2\\.500',
  '1000', // retired programme fee — same decision
  '1\\.000',
  '1560',
  '1\\.560',
  '560',
  '810',
  '70', // lodging band minimum
  '120', // lodging band maximum
];

describe('public cohort module — no monetary data (D-01)', () => {
  const wholeModule = serializeEveryExport(
    cohortPublicModule as unknown as Record<string, unknown>
  );

  it('guards the whole module namespace, not one aggregate object', () => {
    // A guard over an empty or partial serialization is vacuously green, so pin
    // that this one really enumerates the module: the aggregate is one export
    // among many, and both data and function bodies are in the string asserted on.
    const exported = Object.keys(cohortPublicModule);
    expect(exported).toContain('COHORT_PUBLIC');
    expect(exported.length).toBeGreaterThan(1);
    expect(wholeModule).toContain('octubre-2026');
    expect(wholeModule).toContain('buildCohortDateLabel');
  });

  it('serializes without a single monetary key or value', () => {
    // `eur` is matched as a whole token so a European place name in school or
    // expert copy is not a currency finding. EUR/euro/euros still fail.
    const monetary = /€|price|precio|\beur(?:os?)?\b/i;
    expect(wholeModule).not.toMatch(monetary);
    expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(monetary);
  });

  it('carries no numeric field that could be an amount in disguise', () => {
    // Matched as whole numbers so an unrelated future figure inside a longer
    // number cannot fail this.
    for (const amount of PROTECTED_AMOUNTS) {
      const bounded = new RegExp(`(?<!\\d)${amount}(?!\\d)`);
      expect(wholeModule).not.toMatch(bounded);
      expect(JSON.stringify(COHORT_PUBLIC)).not.toMatch(bounded);
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
  it('prices the programme at €2.500 and nothing else as a fixed amount', () => {
    expect(COHORT_PRICE_ITEMS.map((item) => item.amount)).toEqual([2500]);
    expect(COHORT_PRICE_ITEMS.map((item) => item.id)).toEqual(['programa']);
  });

  it('has fully retired the €1.000 programme price (owner, 2026-08-02)', () => {
    // The repricing is only done when the old number is gone from the module,
    // not merely outvoted by a new one sitting beside it.
    for (const number of collectNumbers(cohortCommercialModule)) {
      expect(number).not.toBe(1000);
    }
    expect(JSON.stringify(cohortCommercialModule)).not.toMatch(/(?<!\d)1[.,]?000(?!\d)/);
  });

  it('quotes Barcelona lodging as a per-person-per-night band, €70–€120', () => {
    const { min, max } = COHORT_LODGING_PER_NIGHT_EUR;
    expect(min).toBe(70);
    expect(max).toBe(120);
    expect(min).toBeGreaterThanOrEqual(70);
    expect(min).toBeLessThan(max);
    expect(max).toBeLessThanOrEqual(120);
    // Pinned verbatim: the leak guard's `commercial-copy` fragments are cut from
    // this string, so a silent edit here would quietly blunt the tripwire.
    expect(COHORT_LODGING_NOTE).toBe(
      'Alojamiento en Barcelona: entre €70 y €120 por persona por noche, en base a habitación doble — el monto es por persona, no por habitación — según el tipo de alojamiento.'
    );
  });

  it('says the band is per person sharing a double room (owner, 2026-08-02)', () => {
    // The precision exists because "por persona por noche" alone was read as a
    // room rate; both halves of the clause have to survive future copy edits.
    expect(COHORT_LODGING_NOTE).toContain('en base a habitación doble');
    expect(COHORT_LODGING_NOTE).toContain('el monto es por persona, no por habitación');
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

/**
 * Owner decision 2026-08-02: the optional extension was an accidental carry from
 * a stale source deck — no such pasantías exist. It may return in a future
 * cohort, but only through a plan change, so its absence is pinned rather than
 * left to nobody re-adding a constant. This is the one place in the phase's
 * source and tests where the name still appears, and it appears as a prohibition.
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
      // Values and function bodies too, so a re-added school list or price label
      // cannot hide behind a neutral constant name.
      expect(
        serializeEveryExport(moduleNamespace as unknown as Record<string, unknown>)
      ).not.toMatch(removedExtension);
    });
  }
});
