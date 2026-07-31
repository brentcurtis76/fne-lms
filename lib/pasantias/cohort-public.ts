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
 * Appendix A-7, the thirteen objectives, verbatim es-CL. The only edits are
 * mechanical: the list numbering is the array index, not part of the copy.
 */
export const COHORT_OBJECTIVES: readonly string[] = [
  'Conocer los proyectos educativos de las principales escuelas de vanguardia en Cataluña y compartir la mirada pedagógica de sus directores.',
  'Tomar contacto con las prácticas pedagógicas en terreno y profundizar en su comprensión por medio de entrevistas con estudiantes y docentes.',
  'Valorar el profundo peso que ha tenido la evolución del propósito del educar en las escuelas de vanguardia y en las prioridades estratégicas que surgen desde esa nueva jerarquía.',
  'Conocer cómo ha tomado forma la evolución del proceso de aprendizaje, con foco en las metodologías activas, colaborativas y centradas en la autonomía y el propósito de los estudiantes.',
  'Conectar con la globalización y el uso de herramientas como: cajas de aprendizaje, nubes de preguntas, integración de niveles, diversos tipos de proyectos, momentos públicos, entre muchas otras.',
  'Visualizar cómo se organizan los procesos de evaluación, con énfasis en la evaluación formativa y formadora, por medio del uso de herramientas como: portafolios, rúbricas participativas, diarios de aprendizaje, entre otras.',
  'Profundizar en la comprensión de los procesos de personalización y su aplicación en terreno. Tanto el uso de planes personales, proyectos de autoconocimiento, inventarios personales de aprendizaje, brújulas y otras herramientas.',
  'Apreciar nuevos estilos de liderazgo y de organización para conducir los procesos de cambio y evolución cultural hacia el nuevo paradigma educativo.',
  'Conocer y comprender la evolución del trabajo colaborativo docente y la constitución de equipos de alto desempeño.',
  'Visualizar el uso del tiempo, los espacios, los materiales y el equipamiento en los diversos proyectos educativos visitados.',
  'Comprender el nuevo rol de las familias en las escuelas de Nueva Educación y las dinámicas de crecimiento que de ello surgen.',
  'Valorar la apertura y conexión de la escuela con su entorno, el funcionamiento en red y el poder del pensamiento sistémico para diseñar las experiencias de aprendizaje.',
  'Comprender y apreciar el giro relacional que implica migrar hacia la Nueva Educación y los beneficios personales y societales que conlleva.',
] as const;

export interface CohortDayBlock {
  /** es-CL label for the block, e.g. a time band. */
  label: string;
  /** es-CL description of what happens in it. */
  description: string;
}

/**
 * Appendix A-7 "día tipo", verbatim. The afternoon block is where the workshops
 * venue lives — the visited schools and/or the Instituto Relacional offices in
 * Eixample — so it is copy, not a separate structured field.
 */
export const COHORT_DAY_STRUCTURE: readonly CohortDayBlock[] = [
  {
    label: 'Mañana 1',
    description: 'Presentación del proyecto educativo y entrevista con la dirección.',
  },
  {
    label: 'Mañana 2',
    description: 'Visita guiada, entrevistas con estudiantes y educadores.',
  },
  {
    label: 'Tarde',
    description:
      'Talleres con expertos en las temáticas centrales del movimiento de Nueva Educación, en las dependencias de las escuelas visitadas y/o en las oficinas del Instituto Relacional, barrio de Eixample, Barcelona.',
  },
] as const;

/**
 * Appendix A-7 "el programa incluye", verbatim apart from sentence casing.
 *
 * Lodging is deliberately absent: the owner's 2026-07-31 amendment to A-8 made
 * Barcelona lodging a separately quoted per-night range rather than part of the
 * programme, so it is neither an inclusion nor public data — the band lives in
 * the commercial module only (D-01/D-02).
 *
 * A-16 is closed: the meals line is the source's own generic phrasing, which
 * makes no per-day claim, and no surface states a night count.
 */
export const COHORT_INCLUDES: readonly string[] = [
  'El pago de las visitas a las escuelas',
  'Los talleres de la tarde con especialistas',
  'Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes',
  'Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes presentado al menos un mes antes del viaje',
  'Desayuno a media mañana en las escuelas',
  'Transporte para las visitas a El Puig y Les Vinyes',
  'Comidas incluidas en los días de visita y cena de cierre',
] as const;

/** Appendix A-7 "el programa NO incluye", verbatim. */
export const COHORT_EXCLUDES: readonly string[] = [
  'Desayunos de hotel',
  'Cenas (salvo la de cierre)',
  'Pasajes aéreos ni transporte terrestre de llegada/salida',
  'Seguros',
] as const;

/**
 * Appendix A-7 names the lodging city and nothing finer — no neighbourhood, no
 * night count (A-16 closed: participants compute their own stay) and, since the
 * A-8 amendment, no price: the per-night band is commercial data.
 */
export const COHORT_LODGING_AREA = 'Barcelona';

/** Appendix A-7 — the three schools of the optional Madrid extension. */
export const COHORT_MADRID_SCHOOLS: readonly string[] = [
  'Colegio IDEO',
  'Colegio Santa Gema',
  'Colegio Virgen de Europa',
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
