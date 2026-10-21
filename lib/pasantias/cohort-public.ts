/**
 * Pasantías INSPIRA Barcelona — PUBLIC cohort data (D-01).
 *
 * This is the ONLY cohort module a public page, component or client bundle may
 * import. It carries zero monetary information: no prices, no payment terms, no
 * currency of any kind. Prices live in `cohort-commercial.ts`, which only the
 * server-side brochure generator may import, and `scripts/check-price-leak.mjs`
 * fails the build if anything from there reaches `.next/static/**`.
 *
 * Since PASANT-B003 this module carries the January 2027 cohort. Every fact
 * below is transcribed from the `facts` and `decided` entries of the ratified
 * contract, `docs/plan/pasantias-january-contract.md` — the single normative
 * source for January facts (PASANT-C003). If this file and the contract ever
 * disagree, the contract wins. The contract itself is never imported: it is a
 * document, and the values are copied here so they can be reviewed as code.
 *
 * Spanish copy is the contract's verbatim `anchor` wherever a sentence is
 * shown; a contract `value` written in English (a summary of the anchor) is
 * never shown to a reader. The only ratified correction is P-01 (BD-01): the
 * Escola Sadako host is "Jordi Musons", not the brochure's "Mussons".
 *
 * October 2026 facts (Appendix A) are historical and are not carried forward:
 * no expert list, no objectives, no school levels or highlights — the January
 * contract ratifies none of them. Appendix A stays the record of what shipped.
 *
 * Program identities `inspira` and `mirada-profunda` are the contract §2
 * implementation freeze (DEC-06) and the CHECK on
 * `pasantias_lead_program_interests`. Immersion and visits are parts of a
 * program, never program identities.
 *
 * Dates are ISO `YYYY-MM-DD` and are treated as calendar dates, never as
 * instants: helpers parse them into UTC midnight so the values do not shift
 * with the runtime's timezone.
 */

/** Contract §2 / `ids.cohort`. */
export const COHORT_ID = 'enero-2027';

/** `cohort.label`, page 1: "COHORTE ENERO 2027". */
export const COHORT_LABEL = 'Cohorte Enero 2027';

export interface CohortSpan {
  /** First day of the cohort (ISO date). */
  startDate: string;
  /** Last day of the cohort (ISO date). */
  endDate: string;
}

/**
 * `cohort.span`, page 1: "Enero, 18 al 29 · 2027". The shared span of both
 * programs; each program has its own dates below.
 */
export const COHORT_SPAN: CohortSpan = {
  startDate: '2027-01-18',
  endDate: '2027-01-29',
};

/** `cohort.city`, page 2. */
export const COHORT_CITY = 'Barcelona';

/** `cohort.together`, page 3: both programs travel together. */
export const COHORT_TOGETHER = 'Todos viajan juntos a Barcelona';

export interface CohortRoute {
  /** The question the brochure asks. */
  question: string;
  /** The program it routes to, as the brochure names it there. */
  program: string;
}

/**
 * `cohort.routing`, page 17: "¿Primera vez? Pasantía INSPIRA. ¿Ya viajaste?
 * Mirada Profunda." Same order as {@link COHORT_PROGRAMS}.
 */
export const COHORT_ROUTING: readonly CohortRoute[] = [
  { question: '¿Primera vez?', program: 'Pasantía INSPIRA' },
  { question: '¿Ya viajaste?', program: 'Mirada Profunda' },
] as const;

/** `cohort.places`, page 17, verbatim. */
export const COHORT_PLACES =
  'Los cupos de la cohorte de enero se confirman por orden de reserva.';

export interface CohortContact {
  /** Display form, as the brochure prints it. */
  whatsapp: string;
  email: string;
}

/** `cohort.contact`, page 17. */
export const COHORT_CONTACT: CohortContact = {
  whatsapp: '+56 9 4162 3577',
  email: 'info@nuevaeducacion.org',
};

/** P-02 (DEC-02, BD-04, interpreted and ratified), page 2, verbatim. */
export const COHORT_ACCREDITATION =
  'Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.';

/**
 * P-03 (DEC-08, BD-02), page 2: the track record, each entry "<figure> <what it
 * counts>" exactly as the brochure prints it.
 */
export const COHORT_CLAIMS: readonly string[] = [
  '400+ Pasantes han viajado con FNE',
  '40+ Colegios participantes',
  '12 Escuelas catalanas en la red',
] as const;

export interface CohortFreeWeekend {
  startDate: string;
  endDate: string;
  /** es-CL label, page 7 verbatim. */
  label: string;
}

/**
 * `inspira.freeDays` and `mirada-profunda.freeDays`: the same weekend for both
 * programs (pages 4 and 7). Common to the cohort, so it lives here once.
 */
export const COHORT_FREE_WEEKEND: CohortFreeWeekend = {
  startDate: '2027-01-23',
  endDate: '2027-01-24',
  label: 'Sábado 23 y domingo 24 de enero',
};

export type ProgramId = 'inspira' | 'mirada-profunda';

/** Contract `ids.programs`, in contract order. */
export const PROGRAM_IDS: readonly ProgramId[] = ['inspira', 'mirada-profunda'] as const;

export function isProgramId(value: unknown): value is ProgramId {
  return typeof value === 'string' && (PROGRAM_IDS as readonly string[]).includes(value);
}

export interface ProgramWeek {
  /** Stable key for rendering; not user-facing. */
  id: string;
  /** es-CL heading for the week. */
  label: string;
  /** First school day of the week (ISO date). */
  startDate: string;
  /** Last school day of the week (ISO date). */
  endDate: string;
  /** es-CL one-liner, a verbatim contract anchor. */
  summary: string;
}

interface ProgramBase {
  id: ProgramId;
  /** `<program>.name`, page 3. */
  name: string;
  /** Who the program is for — `<program>.audience`, page 3, verbatim. */
  audience: string;
  /** `<program>.dates` (ISO start). */
  startDate: string;
  /** `<program>.dates` (ISO end). */
  endDate: string;
  /** `<program>.schoolDays`. */
  schoolDays: number;
  /** `<program>.schoolCount`. */
  schoolCount: number;
  /** The brochure's own one-sentence shape of the program, verbatim. */
  overview: string;
  /** `<program>.takeaway`, page 3, verbatim. */
  takeaway: string;
  /** Exactly two school weeks around the common free weekend. */
  weeks: readonly ProgramWeek[];
  /** `<program>.lunches`, page 16, verbatim. */
  lunches: string;
}

export interface ImmersionSchool {
  name: string;
  /** Days each pasante spends there. */
  days: number;
}

export interface InspiraProgram extends ProgramBase {
  id: 'inspira';
  /** `inspira.immersionSchools`, page 5: 2,5 days in each, per pasante. */
  immersionSchools: readonly ImmersionSchool[];
  visits: {
    /** `inspira.visitCount`, page 4: four of the five candidates. */
    count: number;
    /**
     * `inspira.visitCandidates`, page 4. P-04 (BD-03): the visits are chosen
     * with the group from these five — never presented as a fixed list of four.
     */
    candidates: readonly string[];
    /** `inspira.fullDayOutside`, page 5: outside Barcelona, a full day each. */
    fullDayOutside: readonly string[];
    /** `inspira.visitSelection`, page 4, verbatim. */
    selection: string;
  };
}

export interface MiradaProfundaProgram extends ProgramBase {
  id: 'mirada-profunda';
  /** `mirada-profunda.schools`, page 7. */
  schools: readonly string[];
  /** Two full days in each school (page 3: "dos días completos en cada una"). */
  daysPerSchool: number;
  /** `mirada-profunda.orderCaveat`, page 7, verbatim. */
  orderCaveat: string;
  /** `mirada-profunda.preparation`, page 6, verbatim. */
  preparation: string;
  /** `mirada-profunda.closing`, page 6: the Jan 29 roadmap presentation. */
  closing: { date: string; text: string };
  /** `mirada-profunda.followUp`, page 6, verbatim. */
  followUp: string;
  /** `mirada-profunda.includes`, page 16, verbatim items. */
  extraIncludes: readonly string[];
}

export type CohortProgram = InspiraProgram | MiradaProfundaProgram;

/** Pasantía INSPIRA — first-time teams, 9 school days in 6 schools. */
export const INSPIRA_PROGRAM: InspiraProgram = {
  id: 'inspira',
  name: 'Pasantía INSPIRA',
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

/** INSPIRA Mirada Profunda — previous participants, 10 days in 5 schools. */
export const MIRADA_PROFUNDA_PROGRAM: MiradaProfundaProgram = {
  id: 'mirada-profunda',
  name: 'INSPIRA Mirada Profunda',
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

/**
 * Both programs, in contract order — the registry every consumer reads. Typed
 * as a pair so a consumer can destructure INSPIRA and Mirada Profunda by
 * position without guessing.
 */
export const COHORT_PROGRAMS: readonly [InspiraProgram, MiradaProfundaProgram] = [
  INSPIRA_PROGRAM,
  MIRADA_PROFUNDA_PROGRAM,
] as const;

/** One program by its stable ID, read from {@link COHORT_PROGRAMS}. */
export function programById(id: ProgramId): CohortProgram {
  const program = COHORT_PROGRAMS.find((candidate) => candidate.id === id);
  if (!program) throw new Error(`Unknown program: ${id}`);
  return program;
}

/** `both.dayStructure`, page 8: every school day follows the same order. */
export const COHORT_DAY_STRUCTURE: readonly string[] = [
  'Presentación del proyecto educativo y entrevista con la dirección',
  'Visita guiada, entrevistas con estudiantes y educadores',
  'Talleres con expertos del movimiento de Nueva Educación',
] as const;

/** `both.includes`, page 16, item by item and verbatim. */
export const COHORT_INCLUDES: readonly string[] = [
  'El pago de las visitas a las escuelas.',
  'Los talleres de la tarde con especialistas.',
  'Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes.',
  'Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje.',
  'Desayuno a media mañana en las escuelas.',
] as const;

/** `both.excludes`, page 16, item by item and verbatim. */
export const COHORT_EXCLUDES: readonly string[] = [
  'Traslados colegio – aeropuerto de Santiago – colegio',
  'Traslados en Barcelona, incluido el transporte a El Puig y Les Vinyes',
  'Cenas',
  'Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)',
  'Seguros',
  'Pasajes y alojamiento, salvo que los coordines a través de FNE',
] as const;

export interface CohortHost {
  name: string;
  /** es-CL role, page 12. */
  role: string;
  school: string;
  /** What the person does for the cohort. */
  note: string;
}

/**
 * P-01 (DEC-01, BD-01), page 12: "Jordi Mussons DIRECTOR, ESCOLA SADAKO ·
 * ANFITRIÓN", with the ratified spelling correction to "Musons". The only person
 * the January contract ratifies by name.
 */
export const COHORT_HOSTS: readonly CohortHost[] = [
  { name: 'Jordi Musons', role: 'Director', school: 'Escola Sadako', note: 'Anfitrión' },
] as const;

/** Parse an ISO calendar date into UTC midnight, so no timezone can shift it. */
function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** The month name leads the label, so it carries the sentence's initial. */
function capitalizeFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The short date line every surface shows: one continuous span, the month named
 * once at the front — e.g. `Enero, 18 al 29`. The span lies in one month, which
 * is what lets the month be named once. The year renders beside it (see
 * {@link COHORT_HEADLINE}).
 */
export function buildCohortDateLabel(span: CohortSpan = COHORT_SPAN): string {
  const start = toUtcDate(span.startDate);
  const end = toUtcDate(span.endDate);
  const month = MONTH_NAMES_ES[start.getUTCMonth()];
  return `${capitalizeFirst(month)}, ${start.getUTCDate()} al ${end.getUTCDate()}`;
}

/** e.g. `Enero, 18 al 29`. */
export const COHORT_DATE_LABEL = buildCohortDateLabel();

/** Read off the span rather than written down a second time. */
const COHORT_YEAR = toUtcDate(COHORT_SPAN.startDate).getUTCFullYear();

/**
 * The headline used on the homepage card, the page's date chip and the PDFs:
 * the span plus the year — page 1's "Enero, 18 al 29 · 2027".
 */
export const COHORT_HEADLINE = `${COHORT_DATE_LABEL} · ${COHORT_YEAR}`;

/**
 * Everything public, in one object — the convenient shape for consumers. The
 * D-01 guard test serializes every export of this module, not just this
 * aggregate, so adding a monetary constant beside it is no way past it.
 */
export const COHORT_PUBLIC = {
  id: COHORT_ID,
  label: COHORT_LABEL,
  headline: COHORT_HEADLINE,
  dateLabel: COHORT_DATE_LABEL,
  span: COHORT_SPAN,
  city: COHORT_CITY,
  together: COHORT_TOGETHER,
  routing: COHORT_ROUTING,
  places: COHORT_PLACES,
  contact: COHORT_CONTACT,
  accreditation: COHORT_ACCREDITATION,
  claims: COHORT_CLAIMS,
  freeWeekend: COHORT_FREE_WEEKEND,
  programs: COHORT_PROGRAMS,
  dayStructure: COHORT_DAY_STRUCTURE,
  includes: COHORT_INCLUDES,
  excludes: COHORT_EXCLUDES,
  hosts: COHORT_HOSTS,
} as const;
