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
  /**
   * Levels the school teaches, es-CL — content pack §5b, verbatim. Required, so
   * a school cannot be added to this module without them.
   */
  levels: string;
  /**
   * The owner-approved *aspectos destacados* — what this school is known for and
   * therefore why it is worth the trip (content pack §5b, verbatim, in the
   * pack's order). Required for the same reason as {@link CohortSchool.levels}:
   * the type is the guard against the next school shipping without them.
   */
  highlights: readonly string[];
  /** Days each pasante spends there — immersion tier only. */
  immersionDays?: number;
  /** True when the visit takes a whole day because the school is outside Barcelona. */
  fullDay?: boolean;
}

/**
 * Appendix A-5, week 1: 2,5 días en cada una, por pasante. Levels and highlights
 * are content pack §5b, owner-approved 2026-08-02.
 */
export const COHORT_IMMERSION_SCHOOLS: readonly CohortSchool[] = [
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
] as const;

/**
 * Appendix A-5, week 2: one or two per day, order flexible. El Puig and Les
 * Vinyes are outside Barcelona and take the whole day. Levels and highlights are
 * content pack §5b — El Puig's and Les Vinyes' came from the canonical brochure
 * the owner approved on 2026-08-02, which is also where their levels (infantil,
 * primaria y ESO) were confirmed.
 */
export const COHORT_VISIT_SCHOOLS: readonly CohortSchool[] = [
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
  /** Extra standing the Appendix names, e.g. hosting one of the two weeks. */
  note?: string;
}

/**
 * Appendix A-6, whose canonical source is the brochure the owner reviewed on
 * 2026-08-02. Jordi Musons and Sandra Entrena host the week-1 immersion and run
 * many of its sessions inside their own schools.
 *
 * The four roles below `Sandra Entrena` were the placeholder `Experto invitado`
 * until 2026-08-04: the 2026-08-02 amendment reached the Appendix and never
 * reached this module, so the page rendered four people with no title. They now
 * carry the Appendix's own wording, transcribed under the same rule as
 * {@link COHORT_INCLUDES} — the Appendix writes the roles mid-sentence inside a
 * table cell, so the **only** edit is the initial capital a standalone line
 * needs. `__tests__/lib/pasantias-cohort.test.ts` fails on any placeholder or
 * empty role, so the next amendment cannot silently not-land the same way.
 *
 * The first two roles dropped A-6's `INSPIRA` suffix until 2026-08-04 — the r2
 * prompt declared them correct and they were left alone rather than quietly
 * edited. They now read exactly as A-6 writes them, and the whole eight-row
 * table is deep-equalled against a test-owned transcription of A-6, so no row
 * is unpinned any more. Where the content pack's §6 disagrees (it still calls
 * Menéndez and Quintana "Conferencista INSPIRA"), **Appendix A-6 wins**: it is
 * the normative table and its canonical source is the owner-reviewed brochure.
 */
export const COHORT_EXPERTS: readonly CohortExpert[] = [
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
 * Appendix A-7 "el programa incluye", transcribed item by item from the
 * Appendix's own sentence. The **only** edit is mechanical: the Appendix writes
 * the six items as one semicolon-separated sentence, so each item inherits an
 * initial capital when it becomes a list entry. Wording, order and punctuation
 * are the Appendix's — including phrasing a copywriter would want to smooth —
 * because the owner declared the designed brochure canonical and this module is
 * a transcription of it, not an edit of it. `__tests__/lib/pasantias-cohort.test.ts`
 * re-parses A-7 out of `docs/plan/PLAN.md` and compares both arrays against it,
 * so drift on either side fails rather than passes.
 *
 * Lodging is deliberately absent: the owner's 2026-07-31 amendment to A-8 made
 * Barcelona lodging a separately quoted per-night range rather than part of the
 * programme, so it is neither an inclusion nor public data — the band lives in
 * the commercial module only (D-01/D-02).
 *
 * A-16 was superseded on 2026-08-02: the owner's canonical brochure states the
 * meals terms exactly, so the generic phrasing is gone. Meals are now an
 * inclusion only for the first week's lunches, and the retired "comidas en los
 * días de visita y cena de cierre" line has become two exclusions. Transport to
 * El Puig and Les Vinyes moved the same way — from included to excluded — so
 * neither string may survive on this side.
 */
export const COHORT_INCLUDES: readonly string[] = [
  'El pago de las visitas a las escuelas',
  'Los talleres de la tarde con especialistas',
  'Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes',
  'Bibliografía básica recomendada, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje',
  'Desayuno a media mañana en las escuelas',
  'Almuerzos de la primera semana, en Escola Virolai y Escola Sadako',
] as const;

/**
 * Appendix A-7 "NO incluye", as replaced by the owner on 2026-08-02 —
 * transcribed under the same rule as {@link COHORT_INCLUDES}: initial capitals
 * only, everything else exactly as the Appendix writes it.
 */
export const COHORT_EXCLUDES: readonly string[] = [
  'Desayunos de hotel',
  'Comidas en los días de visita de la segunda semana',
  'Cenas',
  'Pasajes aéreos y transporte terrestre de llegada y salida',
  'Transporte a El Puig y Les Vinyes',
  'Seguros',
] as const;

/**
 * Appendix A-7 names the lodging city and nothing finer — no neighbourhood, no
 * night count (A-16 closed: participants compute their own stay) and, since the
 * A-8 amendment, no price: the per-night band is commercial data.
 */
export const COHORT_LODGING_AREA = 'Barcelona';

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

/** The month name leads the label, so it carries the sentence's initial. */
function capitalizeFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The short date line every surface shows, derived from {@link COHORT_WEEKS} so
 * it can never drift from the calendar above. All weeks fall in one month, which
 * is what lets the month be named once, at the front.
 *
 * Appendix A-1, amended 2026-08-02: **one continuous span**, from the first
 * visit day of the first week to the last visit day of the last week. The two
 * ranges this used to print read as two different pasantías; the two-week
 * structure belongs to itinerary detail, never to a headline or a chip.
 *
 * The year is deliberately absent — it renders beside the span (see
 * {@link COHORT_HEADLINE}), and repeating it here would print it twice.
 */
export function buildCohortDateLabel(weeks: readonly CohortWeek[] = COHORT_WEEKS): string {
  const visitDays = weeks.flatMap((week) => week.visitDays);
  const firstDay = visitDays[0];
  const lastDay = visitDays[visitDays.length - 1];
  const month = MONTH_NAMES_ES[toUtcDate(firstDay).getUTCMonth()];
  return `${capitalizeFirst(month)}, ${dayOfMonth(firstDay)} al ${dayOfMonth(lastDay)}`;
}

/** e.g. `Octubre, 5 al 16`. */
export const COHORT_DATE_LABEL = buildCohortDateLabel();

/** Read off the calendar above rather than written down a second time. */
const COHORT_YEAR = toUtcDate(COHORT_WEEKS[0].startDate).getUTCFullYear();

/**
 * The full headline used on the homepage card: the single span plus the year.
 * The span already names the month, so {@link COHORT_LABEL} ("Octubre 2026")
 * cannot lead it without printing "Octubre" twice — the year alone follows.
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
} as const;
