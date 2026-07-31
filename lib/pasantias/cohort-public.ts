/**
 * Pasantías INSPIRA Barcelona — PUBLIC cohort data (D-01).
 *
 * This is the ONLY cohort module a public page, component or client bundle may
 * import. It carries zero monetary information: no prices, no payment terms, no
 * currency of any kind. Prices live in `cohort-commercial.ts`, which only the
 * server-side brochure generator may import, and `scripts/check-price-leak.mjs`
 * fails the build if anything from there reaches `.next/static/**`.
 *
 * Every fact below is transcribed from PLAN.md Appendix A, which is the single
 * normative source for cohort dates, day counts, school and expert lists and
 * claims. If this file and Appendix A ever disagree, Appendix A wins.
 *
 * Dates are ISO `YYYY-MM-DD` and are treated as calendar dates, never as
 * instants: helpers parse them into UTC midnight so the values do not shift
 * with the runtime's timezone.
 */

/** Appendix A-1. */
export const COHORT_ID = 'octubre-2026';

/** Appendix A-1 — the label marketing surfaces show. */
export const COHORT_LABEL = 'Octubre 2026';

export interface CohortWeek {
  /** Stable key for rendering; not user-facing. */
  id: string;
  /** es-CL heading for the week. */
  label: string;
  /** First day of the week block (ISO date). */
  startDate: string;
  /** Last day of the week block (ISO date). */
  endDate: string;
  /** Every day of this week on which the group visits a school (ISO dates). */
  visitDays: readonly string[];
  /** es-CL one-liner describing what the week is. */
  summary: string;
}

/**
 * Appendix A-2 / A-3. Week 1 is a full immersion week (5 visit days), week 2
 * runs Tuesday to Friday because Monday the 12th is a public holiday (A-4).
 */
export const COHORT_WEEKS: readonly CohortWeek[] = [
  {
    id: 'semana-1',
    label: 'Semana 1 — inmersión',
    startDate: '2026-10-05',
    endDate: '2026-10-09',
    visitDays: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
    summary:
      'Semana completa de inmersión: cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.',
  },
  {
    id: 'semana-2',
    label: 'Semana 2 — visitas',
    startDate: '2026-10-13',
    endDate: '2026-10-16',
    visitDays: ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'],
    summary:
      'Visitas a una o dos escuelas por día. El orden de las visitas puede variar.',
  },
] as const;

export interface CohortFreeDay {
  /** ISO date with no scheduled activity. */
  date: string;
  /** es-CL label for the day. */
  label: string;
}

/**
 * Appendix A-4 — the long weekend between both weeks. Monday the 12th is
 * Spain's Fiesta Nacional, so schools are closed and no visit can be scheduled.
 */
export const COHORT_FREE_DAYS: readonly CohortFreeDay[] = [
  { date: '2026-10-10', label: 'Sábado libre' },
  { date: '2026-10-11', label: 'Domingo libre' },
  {
    date: '2026-10-12',
    label: 'Lunes libre — Fiesta Nacional de España, colegios cerrados',
  },
] as const;

/** Every visit day of the cohort, in order. Appendix A-4: 5 + 4 = 9. */
export const COHORT_VISIT_DAYS: readonly string[] = COHORT_WEEKS.flatMap(
  (week) => week.visitDays
);

/**
 * Appendix A-4 — the honest day count. The old brochure's "10 días" claim is
 * retired; marketing says "dos semanas" with this calendar behind it.
 */
export const COHORT_VISIT_DAY_COUNT = COHORT_VISIT_DAYS.length;

/**
 * Appendix A-5 — the programme has two tiers of schools. Week 1 is lived inside
 * two host schools; week 2 visits five more.
 */
export type CohortSchoolTier = 'inmersion' | 'visita';

export interface CohortSchool {
  /** School name as it is written on its own materials. */
  name: string;
  tier: CohortSchoolTier;
  /** Days each pasante spends there — immersion tier only. */
  immersionDays?: number;
  /** True when the visit takes a whole day because the school is outside Barcelona. */
  fullDay?: boolean;
}

/** Appendix A-5, week 1: 2,5 días en cada una, por pasante. */
export const COHORT_IMMERSION_SCHOOLS: readonly CohortSchool[] = [
  { name: 'Escola Virolai', tier: 'inmersion', immersionDays: 2.5 },
  { name: 'Escola Sadako', tier: 'inmersion', immersionDays: 2.5 },
] as const;

/**
 * Appendix A-5, week 2: one or two per day, order flexible. El Puig and Les
 * Vinyes are outside Barcelona and take the whole day.
 */
export const COHORT_VISIT_SCHOOLS: readonly CohortSchool[] = [
  { name: 'Institut Escola El Puig', tier: 'visita', fullDay: true },
  { name: 'Escola La Maquinista', tier: 'visita' },
  { name: 'Escola Octavio Paz', tier: 'visita' },
  { name: 'Institut Angeleta Ferrer', tier: 'visita' },
  { name: 'Institut Escola Les Vinyes', tier: 'visita', fullDay: true },
] as const;

/** Appendix A-5 / A-9 — 7 escuelas en total (2 de inmersión + 5 de visita). */
export const COHORT_SCHOOLS: readonly CohortSchool[] = [
  ...COHORT_IMMERSION_SCHOOLS,
  ...COHORT_VISIT_SCHOOLS,
];

export interface CohortExpert {
  name: string;
  /** es-CL role description. */
  role: string;
  /** School the expert is associated with, when the brief names one. */
  school?: string;
}

/**
 * Appendix A-6. Jordi Musons and Sandra Entrena host the week-1 immersion and
 * run many of its sessions inside their own schools.
 */
export const COHORT_EXPERTS: readonly CohortExpert[] = [
  { name: 'Coral Regí', role: 'Directora del programa' },
  { name: 'Mora del Fresno', role: 'Coordinadora' },
  { name: 'Jordi Musons', role: 'Director', school: 'Escola Sadako' },
  {
    name: 'Sandra Entrena',
    role: 'Encargada de Innovación',
    school: 'Escola Virolai',
  },
  { name: 'Boris Mir', role: 'Experto invitado', school: 'Institut Angeleta Ferrer' },
  {
    name: 'Sergi del Moral',
    role: 'Experto invitado',
    school: 'Institut Escola Les Vinyes',
  },
  { name: 'Pepe Menéndez', role: 'Experto invitado' },
  { name: 'Joan Quintana', role: 'Experto invitado' },
] as const;

/** Appendix A-9 — the claims the owner confirmed as correct. */
export const COHORT_CLAIMS: readonly string[] = [
  '400+ pasantes',
  '40+ colegios',
  '12 escuelas de Barcelona en la red',
  '7 escuelas en esta cohorte',
] as const;

/**
 * Appendix A-7 content — objectives, día tipo and includes/excludes — comes from
 * the PPTX "BROCHURE INSPIRA 2026 - oct2026 2.0", which is not in the repo and
 * was not reachable from this session. Inventing the copy would put unapproved
 * marketing claims in front of prospects, so these stay empty until the owner
 * supplies the source; see the A1 round-1 LEDGER entry.
 *
 * `COHORT_CONTENT_PENDING` is what downstream phases (A3 brochure, A6a landing
 * page) should check before rendering a section, so a missing block is visible
 * instead of silently blank.
 */
export const COHORT_OBJECTIVES: readonly string[] = [];

export interface CohortDayBlock {
  /** es-CL label for the block, e.g. a time band. */
  label: string;
  /** es-CL description of what happens in it. */
  description: string;
}

/** Appendix A-7 "día tipo" — pending, see {@link COHORT_CONTENT_PENDING}. */
export const COHORT_DAY_STRUCTURE: readonly CohortDayBlock[] = [];

/** Appendix A-7 includes — pending, see {@link COHORT_CONTENT_PENDING}. */
export const COHORT_INCLUDES: readonly string[] = [];

/** Appendix A-7 excludes — pending, see {@link COHORT_CONTENT_PENDING}. */
export const COHORT_EXCLUDES: readonly string[] = [];

/** Neighbourhood the group stays in — pending, see {@link COHORT_CONTENT_PENDING}. */
export const COHORT_LODGING_AREA: string | null = null;

/**
 * Schools of the optional Madrid extension — pending. Appendix A-8 confirms the
 * extension exists but names no schools.
 */
export const COHORT_MADRID_SCHOOLS: readonly string[] = [];

/** Public fields still waiting on the Appendix A-7 brochure source. */
export const COHORT_CONTENT_PENDING: readonly string[] = [
  'COHORT_OBJECTIVES',
  'COHORT_DAY_STRUCTURE',
  'COHORT_INCLUDES',
  'COHORT_EXCLUDES',
  'COHORT_LODGING_AREA',
  'COHORT_MADRID_SCHOOLS',
] as const;

/** Parse an ISO calendar date into UTC midnight, so no timezone can shift it. */
function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Day of month, read in UTC to match {@link toUtcDate}. */
function dayOfMonth(isoDate: string): number {
  return toUtcDate(isoDate).getUTCDate();
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

/**
 * The short date line every surface shows, derived from {@link COHORT_WEEKS} so
 * it can never drift from the calendar above. All weeks fall in one month, which
 * is what lets the month be named once at the end.
 */
export function buildCohortDateLabel(weeks: readonly CohortWeek[] = COHORT_WEEKS): string {
  const ranges = weeks.map(
    (week) => `${dayOfMonth(week.startDate)}–${dayOfMonth(week.endDate)}`
  );
  const month = MONTH_NAMES_ES[toUtcDate(weeks[0].startDate).getUTCMonth()];
  return `${ranges.join(' y ')} de ${month}`;
}

/** e.g. `5–9 y 13–16 de octubre`. */
export const COHORT_DATE_LABEL = buildCohortDateLabel();

/** The full headline used on the homepage card: label + dates. */
export const COHORT_HEADLINE = `${COHORT_LABEL} · ${COHORT_DATE_LABEL}`;

/** Everything public, in one object — what the leak guard test serializes. */
export const COHORT_PUBLIC = {
  id: COHORT_ID,
  label: COHORT_LABEL,
  headline: COHORT_HEADLINE,
  dateLabel: COHORT_DATE_LABEL,
  weeks: COHORT_WEEKS,
  freeDays: COHORT_FREE_DAYS,
  visitDays: COHORT_VISIT_DAYS,
  visitDayCount: COHORT_VISIT_DAY_COUNT,
  immersionSchools: COHORT_IMMERSION_SCHOOLS,
  visitSchools: COHORT_VISIT_SCHOOLS,
  schools: COHORT_SCHOOLS,
  experts: COHORT_EXPERTS,
  claims: COHORT_CLAIMS,
  objectives: COHORT_OBJECTIVES,
  dayStructure: COHORT_DAY_STRUCTURE,
  includes: COHORT_INCLUDES,
  excludes: COHORT_EXCLUDES,
  lodgingArea: COHORT_LODGING_AREA,
  madridSchools: COHORT_MADRID_SCHOOLS,
} as const;
