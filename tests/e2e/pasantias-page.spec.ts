import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * A6a — the public `/pasantias` landing page, on the ratified January 2027 cohort.
 *
 * ## What PASANT-B003 changed here
 *
 * Until B003 this spec pinned the October 2026 cohort from Appendix A — a
 * `PINNED` block with "Octubre, 5 al 16 · 2026", seven schools, the Fiesta
 * Nacional weekend, thirteen objectives and an expert list — and read a second
 * set of "wiring" expectations out of `cohort-public.ts`. The page now renders
 * January 2027 (`docs/plan/pasantias-january-contract.md`, RATIFIED — ACTIVE, the
 * single normative source for January facts), so every October fact assertion
 * is **superseded** by the January assertions below. October stays the record of
 * what shipped: Appendix A in `docs/plan/PLAN.md` and this file's previous
 * version in git history (HEAD `85838af02`). Nothing October shipped is denied
 * here; it is only no longer the running cohort, which the "October is not the
 * running cohort" test states as an assertion.
 *
 * What replaced what, so a reader can check nothing was dropped silently:
 *  - hero headline/stats pins → the January headline and "Todos viajan juntos a
 *    Barcelona" (page 1, page 3);
 *  - the two October week cards → each program's own two weeks, with the
 *    immersion week, the visit week and Mirada Profunda's ten school days;
 *  - the Fiesta Nacional weekend → the common free weekend (pages 4 and 7);
 *  - seven schools with levels/highlights → INSPIRA's two immersion schools and
 *    five conditional visit candidates, Mirada Profunda's five schools;
 *  - thirteen objectives → the three-part day structure (page 8) and the full
 *    includes/excludes lists (page 16), which are what January ratifies;
 *  - the eight experts and the "Experto invitado" prohibition → the host the
 *    contract ratifies (P-01, "Jordi Musons"), first, and — since the
 *    2026-10-22 polish addendum (`docs/plan/pasantias-polish-addendum-20261022.md`,
 *    brochure pages 4 and 12) — Sandra Entrena beside him, with the
 *    prohibitions kept;
 *  - "Día completo — fuera de Barcelona" → the contract's own sentence about El
 *    Puig and Les Vinyes, and no duration for any other visit.
 *
 * ## Why every expectation is a literal
 *
 * Every January fact below is typed by hand from the contract — its `anchor` or
 * `value`, cited by page — and never imported from `cohort-public.ts`. Sol's
 * round-2 B2 is why: an expectation read from the module the page renders is
 * corrupted together with it, and the suite goes green on a page full of wrong
 * content. That the page is *wired* to the module (no fact typed into the page)
 * is `__tests__/pages/pasantias-hardcoded-cohort.test.ts`'s job; the module's own
 * oracle is `__tests__/lib/pasantias-cohort.test.ts`. Dates are pinned in the form
 * the page prints them, "18 de enero" (es-CL, day and long month).
 *
 * The test IDs used to find sections are page structure, not facts.
 *
 * The price assertions are the D-02 boundary at the surface a visitor actually
 * sees. `scripts/check-price-leak.mjs` covers the client bundle; this covers the
 * rendered HTML, including hand-written page copy the bundle guard would not
 * flag as commercial data.
 */

/** Contract §3–5 `facts`/`decided`, typed by hand. Page numbers are the brochure's. */
const JANUARY = {
  /** cohort.span, page 1: "Enero, 18 al 29 · 2027". */
  headline: 'Enero, 18 al 29 · 2027',
  /** cohort.label, page 1. */
  label: 'Cohorte Enero 2027',
  /** cohort.together, page 3. */
  together: 'Todos viajan juntos a Barcelona',
  /** cohort.span in the page's es-CL form. */
  spanRange: '18 de enero al 29 de enero',
  /** cohort.routing, page 17, verbatim. */
  routing: '¿Primera vez? Pasantía INSPIRA. ¿Ya viajaste? Mirada Profunda.',
  /** cohort.places, page 17, verbatim. */
  places: 'Los cupos de la cohorte de enero se confirman por orden de reserva.',
  /** cohort.contact, page 17. */
  whatsappDisplay: '+56 9 4162 3577',
  email: 'info@nuevaeducacion.org',
  /** P-02, page 2, verbatim. */
  accreditation:
    'Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.',
  /** P-03, page 2: figure and caption as the brochure prints them. */
  claims: [
    ['400+', 'Pasantes han viajado con FNE'],
    ['40+', 'Colegios participantes'],
    ['12', 'Escuelas catalanas en la red'],
  ],
  /** inspira.freeDays / mirada-profunda.freeDays, page 7 anchor. */
  freeWeekend: 'Sábado 23 y domingo 24 de enero',
  /** both.dayStructure, page 8, in order. */
  dayStructure: [
    'Presentación del proyecto educativo y entrevista con la dirección',
    'Visita guiada, entrevistas con estudiantes y educadores',
    'Talleres con expertos del movimiento de Nueva Educación',
  ],
  /** both.includes, page 16, verbatim. */
  includes: [
    'El pago de las visitas a las escuelas.',
    'Los talleres de la tarde con especialistas.',
    'Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes.',
    'Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje.',
    'Desayuno a media mañana en las escuelas.',
  ],
  /** both.excludes, page 16, verbatim. */
  excludes: [
    'Traslados colegio – aeropuerto de Santiago – colegio',
    'Traslados en Barcelona, incluido el transporte a El Puig y Les Vinyes',
    'Cenas',
    'Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)',
    'Seguros',
    'Pasajes y alojamiento, salvo que los coordines a través de FNE',
  ],
  /** P-01 (BD-01), page 12: the ratified spelling, and the brochure's. */
  host: 'Jordi Musons',
  hostBrochureSpelling: 'Jordi Mussons',
  hostSchool: 'Escola Sadako',
  /**
   * Polish addendum (2026-10-22, Brent's correction), brochure pages 4 and 12:
   * the second host, after Jordi Musons.
   */
  secondHost: 'Sandra Entrena',
  secondHostLine: 'Encargada de Innovación, Escola Virolai — Anfitriona',
} as const;

/**
 * The program CTAs' labels (polish addendum, P6). Display copy, not contract
 * facts; typed here for the same reason the facts are.
 */
const PROGRAM_CTA_LABELS = {
  inspira: 'Me interesa INSPIRA',
  'mirada-profunda': 'Me interesa Mirada Profunda',
} as const;

/** The same-page shortcuts (P7): link test ID, target hash, and the heading it must land. */
const SHORTCUTS = [
  { testId: 'pasantias-shortcut-programas', label: 'Programas', hash: '#programas', heading: '#programas-title' },
  { testId: 'pasantias-shortcut-calendario', label: 'Calendario', hash: '#calendario', heading: '#calendario-title' },
  { testId: 'pasantias-shortcut-incluye', label: 'Qué incluye', hash: '#incluye', heading: '#incluye h2' },
  { testId: 'pasantias-shortcut-inscripcion', label: 'Inscripción', hash: '#programa', heading: '#programa-title' },
] as const;

const INSPIRA = {
  /** inspira.name / audience / takeaway, page 3. */
  name: 'Pasantía INSPIRA',
  audience: 'Equipos que viajan por primera vez',
  takeaway: 'Inspiración y un mapa de lo posible',
  /** inspira.dates 2027-01-18/2027-01-28, page 3. */
  range: '18 de enero al 28 de enero',
  /** inspira.schoolDays 9 (page 5), inspira.schoolCount 6 (page 3). */
  schoolDays: /(?<!\d)9 días en escuelas/,
  schoolCount: /(?<!\d)6 escuelas/,
  /** inspira.week1 2027-01-18/2027-01-22 immersion, page 4. */
  week1Range: '18 de enero al 22 de enero',
  /** inspira.immersionSchools, page 5 anchor. */
  immersion: 'Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.',
  immersionSchools: ['Escola Virolai', 'Escola Sadako'],
  /** inspira.week2 2027-01-25/2027-01-28 visits, one school per day, page 4. */
  week2Range: '25 de enero al 28 de enero',
  week2Summary: 'Una escuela por día.',
  /** inspira.visitCount 4 of inspira.visitCandidates (five), page 4; P-04. */
  visitCount: /Cada cohorte visita (?:4|cuatro) de estas (?:5|cinco) escuelas\./,
  visitCandidates: [
    'Institut Escola El Puig',
    'Escola La Maquinista',
    'Escola Octavio Paz',
    'Institut Angeleta Ferrer',
    'Institut Escola Les Vinyes',
  ],
  /** inspira.visitSelection, page 4, verbatim. */
  visitSelection:
    'La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.',
  /** inspira.fullDayOutside, page 5. */
  fullDayOutside: ['Institut Escola El Puig', 'Institut Escola Les Vinyes'],
  fullDayAnchor: 'están fuera de Barcelona y toman el día completo',
  /** inspira.lunches, page 16, verbatim. */
  lunches:
    'Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako).',
} as const;

const MIRADA = {
  /** mirada-profunda.name / audience / takeaway, page 3. */
  name: 'INSPIRA Mirada Profunda',
  audience: 'Quienes ya viajaron con INSPIRA',
  takeaway: 'Cómo se hace por dentro, y una hoja de ruta para marzo',
  /** mirada-profunda.dates 2027-01-18/2027-01-29, page 3. */
  range: '18 de enero al 29 de enero',
  /** mirada-profunda.schoolDays 10 (page 6), schoolCount 5 (page 3). */
  schoolDays: /(?<!\d)10 días en escuelas/,
  schoolCount: /(?<!\d)5 escuelas/,
  overview: 'Son diez días, cinco escuelas y dos días completos en cada una.',
  /** mirada-profunda.week1 / week2, page 7: five school days each. */
  week1Range: '18 de enero al 22 de enero',
  week2Range: '25 de enero al 29 de enero',
  weekSummary: /cinco jornadas en escuelas/i,
  /** mirada-profunda.schools, page 7, in the brochure's order; two full days each. */
  schools: [
    'Escola Virolai',
    'Escola Sadako',
    'Institut Angeleta Ferrer',
    'Institut Escola El Puig',
    'Institut Escola Les Vinyes',
  ],
  daysPerSchool: '2 días completos',
  /** mirada-profunda.orderCaveat, page 7, verbatim. */
  orderCaveat:
    'El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.',
  /** mirada-profunda.preparation, page 6, verbatim. */
  preparation: 'Cada participante define, con el equipo FNE, un desafío real de su colegio.',
  /** mirada-profunda.closing 2027-01-29, page 6, verbatim. */
  closingDate: '29 de enero',
  closing: 'El viernes 29 cada participante presenta qué va a mover en marzo y cómo.',
  /** mirada-profunda.followUp, page 6, verbatim. */
  followUp: 'En abril, una sesión online para revisar qué se implementó y ajustar el rumbo.',
  /** mirada-profunda.lunches and .includes, page 16, verbatim. */
  lunches: 'En Mirada Profunda, todos los días del programa.',
  includes: [
    'acompañamiento para definir tu pregunta antes del viaje',
    'sesión online de seguimiento en abril',
  ],
} as const;

/**
 * D-02 at the rendered surface, over the whole HTML (props and `<head>`
 * included). Regexes rather than substrings because several of these have to
 * distinguish a price from ordinary copy and ordinary markup.
 *
 * **Historical (October), kept unchanged.** The bare October forms (`2500`,
 * `1560`, `560`, the `70`–`120` lodging band) are not listed: none of them is a
 * price without a currency marker beside it, and every euro marker is banned
 * outright here. `check-price-leak.mjs` carries the amount-near-currency windows
 * for the bundle, where a bare figure genuinely can arrive on its own through a
 * tree-shaken `.min`/`.max` read.
 *
 * **January.** The contract's `commercial` block (§5, brochure-only per §6) is
 * priced in CLP, so the peso marker and code are banned too, and every CLP total
 * is banned as an amount with or without separators — a seven-digit figure is
 * never ordinary copy. Typed from the contract, never read from
 * `cohort-commercial.ts`.
 *
 * What is deliberately **not** banned: the commercial block's nights (12, 13),
 * its team sizes (1–10), the return/arrival days and the €50–75/€100 lodging
 * figures as bare numbers. Each collides with benign public copy — "12 Escuelas
 * catalanas en la red", "10 días en escuelas", "29 de enero" — and none of them is
 * a price without a currency marker, which is banned. The control test below
 * proves those benign figures are on the page while this list stays silent.
 */
const FORBIDDEN_PRICE_PATTERNS: ReadonlyArray<readonly [string, RegExp, string]> = [
  // [description, pattern, a leak the pattern must catch]
  ['the euro glyph', /€/, '€2.500'],
  // Sol r2 B1: `2500 euros por persona` shipped past a guard that knew only `€`
  // and `EUR`. The trailing boundary is what keeps "conocer Europa" from matching.
  [
    'a euro word form (eur/euro/euros)',
    /(?<![A-Za-z])[Ee][Uu][Rr](?:[Oo][Ss]?)?(?![A-Za-z])/,
    '2500 euros por persona',
  ],
  ['the October programme fee', /(?<![\d.,])2[.,\s]?500(?![\d])/, '2.500'],
  ['the retired €1.000 programme fee', /(?<![\d.,])1[.,\s]?000(?![\d])/, '1.000'],
  ['the retired €1.560 total', /(?<![\d.,])1[.,\s]?560(?![\d])/, '1.560'],
  // January (contract §5 `commercial`).
  ['the peso sign before an amount', /\$\s?\d{1,3}(?:[.,]\d{3})+/, '$2.000.000'],
  ['the CLP currency code', /(?<![A-Za-z])CLP(?![A-Za-z])/, '2.000.000 CLP'],
  ['a peso word form', /(?<![A-Za-z])[Pp]esos?(?![A-Za-z])/, '4,7 millones de pesos'],
  ['the January programme fee 2.500.000', clpAmount('2.500.000'), '2500000'],
  ['the January discounted fee 2.000.000', clpAmount('2.000.000'), '2.000.000'],
  ['the INSPIRA standard total 4.700.000', clpAmount('4.700.000'), '4.700.000'],
  ['the INSPIRA standard total 5.000.000', clpAmount('5.000.000'), '5.000.000'],
  ['the Mirada Profunda standard total 5.100.000', clpAmount('5.100.000'), '5.100.000'],
  ['the discounted total 4.200.000', clpAmount('4.200.000'), '4.200.000'],
  ['the INSPIRA discounted total 4.500.000', clpAmount('4.500.000'), '4.500.000'],
  ['the Mirada Profunda discounted total 4.600.000', clpAmount('4.600.000'), '4.600.000'],
  ['the flight estimate 1.500.000', clpAmount('1.500.000'), '1.500.000'],
  ['the EUR/CLP rate 1.100', /(?<![\d.,])1[.,]100(?![\d])/, '1.100'],
  ['the 100.000 rounding unit', /(?<![\d.,])100[.,]000(?![\d])/, '100.000'],
];

/**
 * January commercial terms that are words rather than amounts, checked against
 * the page's **copy** (scripts and styles removed) rather than the raw HTML,
 * because `50%` is ordinary CSS.
 */
const FORBIDDEN_COMMERCIAL_COPY: ReadonlyArray<readonly [string, RegExp, string]> = [
  // commercial.discountCondition
  [
    'the discount condition',
    /programa anual de asesor/i,
    'COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE',
  ],
  // commercial.payment
  ['the payment split', /50\s?%/, '50% al reservar'],
  ['the payment schedule', /al reservar/i, '50% al reservar y el 50% restante'],
];

/** Benign copy none of the patterns above may match — each is on the page or is ordinary es-CL. */
const BENIGN_SAMPLES = [
  'conocer Europa',
  '12 Escuelas catalanas en la red',
  '10 días en escuelas',
  '18 de enero al 29 de enero',
  'Sábado 23 y domingo 24 de enero',
  JANUARY.places,
  'Todos los derechos reservados.',
];

/** A CLP amount as typed in the contract, matched with or without its separators. */
function clpAmount(amount: string): RegExp {
  const digits = amount.split('.');
  return new RegExp(`(?<![\\d.,])${digits.join('[.,\\s]?')}(?![\\d])`);
}

/** The page's copy: every text node, with `<script>`, `<style>` and `<noscript>` removed. */
async function visibleCopy(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
    return clone.textContent ?? '';
  });
}

/** The `<li>` whose heading is exactly `name`, inside `scope`. */
function cardNamed(scope: Locator, name: string): Locator {
  return scope
    .locator('li')
    .filter({ has: scope.page().getByRole('heading', { name, exact: true }) });
}

test.describe('pasantías landing page', () => {
  test('renders every January section, pinned to the ratified contract', async ({ page }) => {
    await page.goto('/pasantias');

    // Hero: page 1's headline and page 3's "travel together".
    await expect(page.getByTestId('pasantias-date-chip')).toHaveText(JANUARY.headline);
    await expect(page.getByTestId('pasantias-hero-stats')).toHaveText(JANUARY.together);
    expect(await page.title()).toContain(JANUARY.headline);

    // Every section of the January story is present.
    for (const section of [
      'pasantias-hero',
      'pasantias-claims',
      'pasantias-barcelona',
      'pasantias-programas',
      'pasantias-calendario',
      'pasantias-finde',
      'pasantias-dia-tipo',
      'pasantias-escuelas',
      'pasantias-mirada-extra',
      'pasantias-equipo',
      'pasantias-incluye',
      'pasantias-programa',
      'pasantias-faq',
      'pasantias-cierre',
    ]) {
      await expect(page.getByTestId(section)).toBeVisible();
    }

    // Claims (P-02, P-03): each figure with its caption, and the RPA sentence.
    for (const [index, [figure, caption]] of JANUARY.claims.entries()) {
      const claim = page.getByTestId(`pasantias-claim-${index}`);
      await expect(claim).toContainText(figure);
      await expect(claim).toContainText(caption);
    }
    await expect(page.getByTestId('pasantias-accreditation')).toHaveText(JANUARY.accreditation);

    // Both programs, side by side, with the routing question that tells them apart.
    const programas = page.getByTestId('pasantias-programas');
    await expect(programas.locator('h2')).toHaveText(JANUARY.routing);

    const inspira = page.getByTestId('pasantias-program-inspira');
    await expect(inspira.locator('h3')).toHaveText(INSPIRA.name);
    for (const fact of [INSPIRA.audience, INSPIRA.range, INSPIRA.takeaway]) {
      await expect(inspira).toContainText(fact);
    }
    await expect(inspira).toContainText(INSPIRA.schoolDays);
    await expect(inspira).toContainText(INSPIRA.schoolCount);

    const mirada = page.getByTestId('pasantias-program-mirada-profunda');
    await expect(mirada.locator('h3')).toHaveText(MIRADA.name);
    for (const fact of [MIRADA.audience, MIRADA.range, MIRADA.overview, MIRADA.takeaway]) {
      await expect(mirada).toContainText(fact);
    }
    await expect(mirada).toContainText(MIRADA.schoolDays);
    await expect(mirada).toContainText(MIRADA.schoolCount);

    // The calendar: the shared span, then each program's two weeks around the
    // common free weekend.
    const calendario = page.getByTestId('pasantias-calendario');
    await expect(calendario).toContainText(JANUARY.label);
    await expect(calendario).toContainText(JANUARY.spanRange);
    await expect(calendario).toContainText(JANUARY.together);

    await expect(page.getByTestId('pasantias-calendar-inspira').locator('article')).toHaveCount(2);
    const inspiraWeek1 = page.getByTestId('pasantias-week-inspira-semana-1');
    await expect(inspiraWeek1).toContainText(/inmersión/i);
    await expect(inspiraWeek1).toContainText(INSPIRA.week1Range);
    await expect(inspiraWeek1).toContainText(INSPIRA.immersion);
    const inspiraWeek2 = page.getByTestId('pasantias-week-inspira-semana-2');
    await expect(inspiraWeek2).toContainText(/visitas/i);
    await expect(inspiraWeek2).toContainText(INSPIRA.week2Range);
    await expect(inspiraWeek2).toContainText(INSPIRA.week2Summary);

    await expect(
      page.getByTestId('pasantias-calendar-mirada-profunda').locator('article')
    ).toHaveCount(2);
    const miradaWeek1 = page.getByTestId('pasantias-week-mirada-profunda-semana-1');
    await expect(miradaWeek1).toContainText(MIRADA.week1Range);
    await expect(miradaWeek1).toContainText(MIRADA.weekSummary);
    const miradaWeek2 = page.getByTestId('pasantias-week-mirada-profunda-semana-2');
    await expect(miradaWeek2).toContainText(MIRADA.week2Range);
    await expect(miradaWeek2).toContainText(MIRADA.weekSummary);

    // The free weekend, common to both programs (pages 4 and 7). Replaces the
    // October long weekend and its Fiesta Nacional. Since the polish unit the
    // card sits below both calendars and prints the dates once, as a range; the
    // brochure's own wording of the weekend is the FAQ answer's.
    const finde = page.getByTestId('pasantias-finde');
    await expect(page.getByTestId('pasantias-free-weekend-dates')).toHaveText(
      '23 de enero al 24 de enero'
    );
    await expect(finde).toContainText('23 de enero');
    await expect(finde).toContainText('24 de enero');
    await expect(page.getByTestId('pasantias-faq')).toContainText(JANUARY.freeWeekend);

    // How a school day runs: all three blocks, in order (page 8).
    const blocks = page.getByTestId('pasantias-dia-tipo').locator('li');
    await expect(blocks).toHaveCount(JANUARY.dayStructure.length);
    for (const [index, block] of JANUARY.dayStructure.entries()) {
      await expect(blocks.nth(index)).toHaveText(block);
    }

    // INSPIRA's schools: two immersion schools at 2,5 days each, then four visits
    // that are chosen from five — never a fixed list of four (P-04).
    const inspiraSchools = page.getByTestId('pasantias-escuelas-inspira');
    for (const name of INSPIRA.immersionSchools) {
      await expect(cardNamed(inspiraSchools, name)).toContainText('2,5 días');
    }
    await expect(page.getByTestId('pasantias-visit-count')).toHaveText(INSPIRA.visitCount);
    await expect(inspiraSchools.locator('[data-testid^="pasantias-school-visita-"]')).toHaveCount(
      INSPIRA.visitCandidates.length
    );
    for (const name of INSPIRA.visitCandidates) {
      await expect(inspiraSchools.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(inspiraSchools).toContainText(INSPIRA.visitSelection);

    // Mirada Profunda's five schools, in the brochure's order, two full days each,
    // with the caveat that the order can still change.
    const miradaSchools = page.getByTestId('pasantias-escuelas-mirada-profunda');
    const miradaCards = miradaSchools.locator('li');
    await expect(miradaCards).toHaveCount(MIRADA.schools.length);
    for (const [index, name] of MIRADA.schools.entries()) {
      await expect(miradaCards.nth(index).getByRole('heading')).toHaveText(name);
      await expect(miradaCards.nth(index)).toContainText(MIRADA.daysPerSchool);
    }
    await expect(miradaSchools).toContainText(MIRADA.orderCaveat);

    // Mirada Profunda before, during and after: the challenge, the 29 January
    // roadmap and the April follow-up (page 6).
    const extra = page.getByTestId('pasantias-mirada-extra');
    await expect(extra).toContainText(MIRADA.preparation);
    await expect(extra).toContainText(MIRADA.closingDate);
    await expect(extra).toContainText(MIRADA.closing);
    await expect(extra).toContainText(MIRADA.followUp);

    // Who receives the group. The October expert list is not carried: the
    // person January ratifies is the Sadako host, with BD-01's spelling, first;
    // Sandra Entrena follows him by the 2026-10-22 polish addendum (brochure
    // pages 4 and 12), and nobody else is listed. A6a r1 shipped four experts
    // titled "Experto invitado" — the placeholder stays a prohibition.
    const equipo = page.getByTestId('pasantias-equipo');
    await expect(equipo.getByTestId(/^pasantias-host-\d+$/)).toHaveCount(2);
    await expect(page.getByTestId('pasantias-host-0')).toContainText(JANUARY.host);
    await expect(page.getByTestId('pasantias-host-0')).toContainText(JANUARY.hostSchool);
    await expect(page.getByTestId('pasantias-host-1')).toContainText(JANUARY.secondHost);
    await expect(page.getByTestId('pasantias-host-1')).toContainText(JANUARY.secondHostLine);
    await expect(equipo).not.toContainText(JANUARY.hostBrochureSpelling);
    await expect(equipo).not.toContainText('Experto invitado');

    // What is and is not included, item by item (page 16), with the two lunch
    // rules kept apart and Mirada Profunda's extras named as its own.
    const incluye = page.getByTestId('pasantias-incluye');
    for (const item of [...JANUARY.includes, INSPIRA.lunches, MIRADA.lunches]) {
      await expect(incluye).toContainText(item);
    }
    for (const item of MIRADA.includes) {
      await expect(incluye).toContainText(`${MIRADA.name}: ${item}`);
    }
    for (const item of JANUARY.excludes) {
      await expect(incluye).toContainText(item);
    }

    // Places are confirmed in booking order (page 17), beside the form.
    await expect(page.getByTestId('pasantias-places')).toHaveText(JANUARY.places);

    // FAQ: at least five, per the plan.
    const faqCount = await page.getByTestId(/^pasantias-faq-\d+$/).count();
    expect(faqCount).toBeGreaterThanOrEqual(5);

    // A6r r2 swapped one question for another, and both directions are pinned so
    // that either half can fail on its own. "¿Qué incluye el programa?" restated
    // the `#incluye` section a screen above it — a FAQ that repeats the page
    // teaches readers not to open it — and the language question is one a Chilean
    // buyer genuinely asks about Barcelona that nothing else here answers. The
    // answer is owner-approved copy: "una mezcla de catalán y español" is the
    // accurate expectation and must not be softened into "todo en español".
    const faq = page.getByTestId('pasantias-faq');
    await expect(faq).not.toContainText('¿Qué incluye el programa?');
    await expect(faq).toContainText('¿Necesito hablar catalán?');
    await expect(faq).toContainText(
      'En las escuelas vas a escuchar una mezcla de catalán y español'
    );
    await expect(faq).toContainText(JANUARY.email);
  });

  test('October is not the running cohort', async ({ page }) => {
    await page.goto('/pasantias');

    // History is protected where it lives (Appendix A, git history); what this
    // asserts is that none of it is presented as the running cohort. Read off
    // the page's copy so `<title>` counts too. Not a bare `2026`: the shared
    // Footer prints the current year.
    const copy = await visibleCopy(page);
    for (const october of [/octubre/i, /Fiesta Nacional/i, /Experto invitado/, /Metaprendizaje/]) {
      expect(copy, `the page still states October content (${october})`).not.toMatch(october);
    }
    // The control: the same read does see January.
    expect(copy).toContain(JANUARY.headline);
  });

  test('states only the visit timing the January contract states', async ({ page }) => {
    await page.goto('/pasantias');

    // Sol r2 S1: the October card for every school without `fullDay` printed
    // "Visita de media jornada", an inference rendered to buyers as programme
    // detail. January states three timings and no others: 2,5 days in each
    // immersion school, a full day for the two visits outside Barcelona, and two
    // full days in each Mirada Profunda school.
    const escuelas = page.getByTestId('pasantias-escuelas');
    await expect(escuelas).not.toContainText(/media jornada/i);
    await expect(escuelas).not.toContainText(/medio día/i);
    await expect(escuelas).not.toContainText(/\bhoras?\b/i);

    // The full day belongs to El Puig and Les Vinyes, in the contract's words,
    // and to no other visit candidate.
    const fullDay = page.getByTestId('pasantias-full-day');
    await expect(fullDay).toContainText(INSPIRA.fullDayAnchor);
    for (const name of INSPIRA.visitCandidates) {
      if ((INSPIRA.fullDayOutside as readonly string[]).includes(name)) {
        await expect(fullDay).toContainText(name);
      } else {
        await expect(fullDay).not.toContainText(name);
      }
    }

    // No visit card carries a duration of its own: each holds its name and
    // nothing else, so an invented per-visit timing has nowhere to hide.
    const inspiraSchools = page.getByTestId('pasantias-escuelas-inspira');
    for (const name of INSPIRA.visitCandidates) {
      await expect(cardNamed(inspiraSchools, name)).toHaveText(name);
    }
  });

  test('ficha, WhatsApp, #programa and both program CTAs point where they should', async ({
    page,
  }) => {
    await page.goto('/pasantias');

    await expect(page.getByTestId('pasantias-cta-ficha')).toHaveAttribute(
      'href',
      '/api/pasantias/ficha'
    );

    // Page 17's number, in the punctuation-free form wa.me requires.
    const whatsappHref = await page.getByTestId('pasantias-cta-whatsapp').getAttribute('href');
    expect(whatsappHref).toContain('https://wa.me/56941623577');
    await expect(page.getByTestId('pasantias-cta-whatsapp')).toContainText(
      JANUARY.whatsappDisplay
    );

    // A6b replaced the interim mailto panel with the real form. The hero CTA
    // still points at the section, and the section now holds the form; the
    // ficha CTA that shared the panel survived the swap into the left column.
    await expect(page.getByTestId('pasantias-cta-programa')).toHaveAttribute('href', '#programa');
    await expect(page.getByTestId('pasantias-lead-form')).toBeVisible();
    await expect(page.getByTestId('pasantias-cta-mailto')).toHaveCount(0);
    await expect(page.getByTestId('pasantias-cta-ficha-programa')).toHaveAttribute(
      'href',
      '/api/pasantias/ficha'
    );

    // January: each program card's CTA leads to the same form (which program it
    // preselects, by mouse and by keyboard, is `pasantias-form.spec.ts`'s to
    // prove), under the short label of the polish addendum (P6).
    for (const program of ['inspira', 'mirada-profunda'] as const) {
      const cta = page.getByTestId(`pasantias-cta-program-${program}`);
      await expect(cta).toHaveAttribute('href', '#programa');
      await expect(cta).toHaveText(PROGRAM_CTA_LABELS[program]);
    }

    // P3: the hero names both routes and offers the way down to the choice,
    // while the registration and ficha CTAs stay where they were.
    const routes = page.getByTestId('pasantias-hero-routes');
    await expect(routes).toContainText('¿Primera vez? Pasantía INSPIRA');
    await expect(routes).toContainText('¿Ya viajaste? Mirada Profunda');
    await expect(page.getByTestId('pasantias-cta-programas')).toHaveText('Ver los programas');
    await expect(page.getByTestId('pasantias-cta-programas')).toHaveAttribute('href', '#programas');

    // P7: the shortcuts, in order, each to its section.
    for (const shortcut of SHORTCUTS) {
      const link = page.getByTestId(shortcut.testId);
      await expect(link).toHaveText(shortcut.label);
      await expect(link).toHaveAttribute('href', shortcut.hash);
    }
    await expect(page.getByRole('navigation', { name: 'En esta página' })).toBeVisible();

    // P8: beside the form, the registration is said not to reserve a place, and
    // no e-mail is promised.
    const note = page.getByTestId('pasantias-registration-note');
    await expect(note).toContainText('no reserva un cupo');
    await expect(note).not.toContainText(/correo|te enviamos|te enviaremos|recibirás/i);
  });

  /**
   * PASANT-DESIGN-POLISH-01: the layout claims a phone, a tablet and a wide
   * desktop each have to hold. Measured on the real page, not on class names.
   */
  for (const { label, width, height } of [
    { label: 'phone 375', width: 375, height: 812 },
    { label: 'phone 390', width: 390, height: 844 },
    { label: 'tablet 768', width: 768, height: 1024 },
    { label: 'desktop 1866', width: 1866, height: 986 },
  ]) {
    test(`polish layout holds at ${label}: no overflow, photos, hosts, CTAs`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/pasantias');

      // No horizontal overflow anywhere on the page.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `the page is ${overflow}px wider than the ${label} viewport`).toBeLessThanOrEqual(0);

      // P1: below lg each photograph keeps its own 16:9 shape, so nobody at the
      // edge of a group is cropped; at desktop the library photo gets a tall
      // frame and the Virolai photo keeps its approved band.
      for (const id of ['escuela-interior', 'equipo-foto']) {
        const photo = page.locator(`#${id}`);
        await photo.scrollIntoViewIfNeeded();
        const box = (await photo.boundingBox())!;
        if (width < 1024) {
          expect([id, Math.abs(box.height - (box.width * 9) / 16) <= 2]).toEqual([id, true]);
        } else if (id === 'equipo-foto') {
          expect([id, box.height / box.width >= 0.4]).toEqual([id, true]);
        } else {
          expect([id, box.height <= 461]).toEqual([id, true]);
        }
      }

      // P2: two equally sized portraits, side by side from 640 px, stacked below.
      const first = (await page.getByTestId('pasantias-host-0').boundingBox())!;
      const second = (await page.getByTestId('pasantias-host-1').boundingBox())!;
      const portraitA = (await page.getByTestId('pasantias-host-portrait-0').boundingBox())!;
      const portraitB = (await page.getByTestId('pasantias-host-portrait-1').boundingBox())!;
      expect(Math.abs(portraitA.width - portraitB.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(portraitA.height - portraitB.height)).toBeLessThanOrEqual(1);
      if (width < 640) {
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      } else {
        expect(Math.abs(second.y - first.y)).toBeLessThanOrEqual(1);
      }

      // P6: each CTA's label fits its button and is centred.
      for (const program of ['inspira', 'mirada-profunda']) {
        const cta = page.getByTestId(`pasantias-cta-program-${program}`);
        const fits = await cta.evaluate(
          (node) =>
            node.scrollWidth <= node.clientWidth &&
            getComputedStyle(node).textAlign === 'center' &&
            node.getBoundingClientRect().right <=
              (node.closest('article') as HTMLElement).getBoundingClientRect().right
        );
        expect([program, fits]).toEqual([program, true]);
      }

      // P7: one non-sticky shortcut bar, no wider than the page.
      const shortcuts = page.getByTestId('pasantias-shortcuts');
      expect(await shortcuts.evaluate((node) => getComputedStyle(node).position)).toBe('static');
    });
  }

  test('each shortcut, and "Ver los programas", lands its heading below the sticky header', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const header = page.getByTestId('pasantias-header');

    const targets = [
      ...SHORTCUTS.map(({ testId, hash, heading }) => ({ testId, hash, heading })),
      { testId: 'pasantias-cta-programas', hash: '#programas', heading: '#programas-title' },
    ];

    for (const target of targets) {
      await page.goto('/pasantias');
      await page.getByTestId(target.testId).click();
      await expect(page).toHaveURL(new RegExp(`${target.hash}$`));

      const heading = page.locator(target.heading).first();
      await expect(heading).toBeInViewport();
      // Polled: a smooth scroll is still moving when the URL changes.
      await expect
        .poll(async () => {
          const headerBox = (await header.boundingBox())!;
          const headingBox = (await heading.boundingBox())!;
          return headingBox.y >= headerBox.y + headerBox.height - 1;
        }, { message: `${target.testId}: heading hidden under the sticky header` })
        .toBe(true);
    }
  });

  test('no price token appears anywhere in the rendered page (D-02)', async ({ page }) => {
    // The patterns themselves first: each catches the leak it is named for and
    // none of them catches benign copy. Without this, a pattern that can match
    // nothing would pass the page check below for the wrong reason. It replaces
    // the October control "the page contains Europa", which the January page no
    // longer says anywhere.
    for (const [description, pattern, leak] of [
      ...FORBIDDEN_PRICE_PATTERNS,
      ...FORBIDDEN_COMMERCIAL_COPY,
    ]) {
      expect(pattern.test(leak), `${description} does not catch "${leak}"`).toBe(true);
      for (const benign of BENIGN_SAMPLES) {
        expect(pattern.test(benign), `${description} matches benign "${benign}"`).toBe(false);
      }
    }

    await page.goto('/pasantias');

    const html = await page.content();
    for (const [description, pattern] of FORBIDDEN_PRICE_PATTERNS) {
      expect(
        pattern.test(html),
        `${description} must not reach the public page — matched ${JSON.stringify(
          html.match(pattern)?.[0]
        )}`
      ).toBe(false);
    }

    const copy = await visibleCopy(page);
    for (const [description, pattern] of FORBIDDEN_COMMERCIAL_COPY) {
      expect(
        pattern.test(copy),
        `${description} must not reach the public page — matched ${JSON.stringify(
          copy.match(pattern)?.[0]
        )}`
      ).toBe(false);
    }

    // The benign figures the January lists leave alone are really on the page, so
    // the silence above is a boundary and not an accident.
    await expect(page.getByTestId('pasantias-claim-2')).toContainText('12');
    expect(copy).toContain('Escuelas catalanas en la red');
    expect(copy).toMatch(/(?<!\d)10 días en escuelas/);
    expect(copy).toContain(JANUARY.spanRange);
  });

  test('has one h1, ordered headings across the whole document and a Tab-reachable CTA', async ({
    page,
  }) => {
    await page.goto('/pasantias');

    await expect(page.locator('h1')).toHaveCount(1);

    // No heading level is skipped (h1 → h2 → h3, never h1 → h3), across the
    // WHOLE document. Scoping this to <main> is what let the Footer's h4s sit
    // two levels below the last h2 and still report green (Sol r2 B3); the
    // Footer's own headings are now h2, so the document reads in order.
    const headings = await page
      .locator(':is(h1, h2, h3, h4, h5, h6)')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          level: Number(node.tagName.slice(1)),
          text: (node.textContent || '').trim().slice(0, 40),
        }))
      );
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBe(1);
    for (let i = 1; i < headings.length; i += 1) {
      expect(
        headings[i].level - headings[i - 1].level,
        `heading "${headings[i].text}" (h${headings[i].level}) jumps past h${
          headings[i - 1].level + 1
        } after "${headings[i - 1].text}"`
      ).toBeLessThanOrEqual(1);
    }

    // Landmarks a screen reader navigates by.
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);

    // The primary CTA is reachable with the keyboard ALONE. Sol r2 S3: this used
    // to call `.focus()`, which proves the element is focusable and nothing at
    // all about whether a keyboard user can get to it. Tab from the document
    // start until it lands, then activate with Enter.
    const primaryCta = page.getByTestId('pasantias-cta-programa');
    const MAX_TABS = 20;
    let tabsUsed = 0;
    let reached = false;
    while (tabsUsed < MAX_TABS && !reached) {
      await page.keyboard.press('Tab');
      tabsUsed += 1;
      reached = await primaryCta.evaluate((node) => node === document.activeElement);
    }
    expect(reached, `the primary CTA was not reachable within ${MAX_TABS} Tab presses`).toBe(true);
    await expect(primaryCta).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#programa$/);
    await expect(page.getByTestId('pasantias-programa')).toBeInViewport();
  });

  /**
   * Sol r2 B4: axe 4.11 found 15 serious contrast violations — the host markers
   * and the thirteen objective numbers rendered #f59e0b on white at 2.14:1. The
   * colour fix is one line; this is the part that keeps it fixed. Wired at the
   * page level rather than per-section, so a serious or critical regression
   * anywhere on the page — including inside the shared Footer — fails here.
   *
   * It does NOT subsume the heading assertion above: axe rates `heading-order`
   * *moderate*, so B3's defect would slip straight through this filter. The two
   * checks cover different halves of Sol's report on purpose.
   */
  /**
   * Sol r3 B3: the hero eyebrow is 11 px `#FBBF24` over a photograph, and it
   * measured 2.98:1 at 390 px and 2.88:1 at 1440 px against the 4.5:1 that
   * normal-size text needs. The axe test above cannot catch it — axe classifies
   * text over a photograph as `incomplete`, never as a violation — so that gate
   * passing is not evidence about this element.
   *
   * This samples the real thing instead of modelling it: the glyphs are made
   * transparent, the eyebrow's box is screenshotted so the capture is the
   * composited photograph *and* veil exactly as the browser painted them, and
   * that PNG is handed back to the page for decoding — the browser is the only
   * image decoder involved, so no dependency is added for it.
   *
   * The ratio is taken against the **lightest** pixel behind the text, not the
   * mean: a mean passes while a bright patch of sky makes a word illegible.
   */
  const WCAG_AA_NORMAL_TEXT = 4.5;

  for (const { label, width, height } of [
    { label: '390 px', width: 390, height: 844 },
    { label: '1440 px', width: 1440, height: 900 },
  ]) {
    test(`hero eyebrow clears WCAG AA against the photograph at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/pasantias');

      const eyebrow = page.getByTestId('pasantias-hero').locator('span').first();
      await expect(eyebrow).toBeVisible();

      const box = await eyebrow.boundingBox();
      expect(box, 'the hero eyebrow has no box to sample').not.toBeNull();

      const color = await eyebrow.evaluate((node) => getComputedStyle(node).color);
      const fontSize = await eyebrow.evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).fontSize)
      );
      // Below 18.66 px bold / 24 px regular, WCAG's large-text exemption does
      // not apply. Asserted so the threshold below cannot silently become wrong.
      expect(fontSize).toBeLessThan(18.66);

      await page.addStyleTag({
        content:
          '[data-testid="pasantias-hero"] span:first-of-type { color: transparent !important; }',
      });

      const shot = await page.screenshot({
        clip: {
          x: Math.floor(box!.x),
          y: Math.floor(box!.y),
          width: Math.max(1, Math.ceil(box!.width)),
          height: Math.max(1, Math.ceil(box!.height)),
        },
      });

      const lightestBackground = await page.evaluate(async (encoded) => {
        const image = new Image();
        image.src = `data:image/png;base64,${encoded}`;
        await image.decode();

        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);

        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const channel = (value: number) => {
          const srgb = value / 255;
          return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        };

        let lightest = 0;
        for (let index = 0; index < data.length; index += 4) {
          const luminance =
            0.2126 * channel(data[index]) +
            0.7152 * channel(data[index + 1]) +
            0.0722 * channel(data[index + 2]);
          if (luminance > lightest) lightest = luminance;
        }
        return lightest;
      }, shot.toString('base64'));

      const [red, green, blue] = color.match(/[\d.]+/g)!.map(Number);
      const channel = (value: number) => {
        const srgb = value / 255;
        return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      };
      const textLuminance =
        0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);

      const [lighter, darker] =
        textLuminance > lightestBackground
          ? [textLuminance, lightestBackground]
          : [lightestBackground, textLuminance];
      const ratio = (lighter + 0.05) / (darker + 0.05);

      expect(
        ratio,
        `hero eyebrow ${color} measured ${ratio.toFixed(2)}:1 against its lightest backing pixel at ${label}`
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });
  }

  test('has no serious or critical accessibility violations (axe)', async ({ page }) => {
    await page.goto('/pasantias');

    const { violations } = await new AxeBuilder({ page }).analyze();
    const blocking = violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );

    expect(
      blocking.map(
        (violation) =>
          `${violation.impact} · ${violation.id} · ${violation.nodes.length} node(s) · ${violation.nodes
            .map((node) => node.target.join(' '))
            .slice(0, 5)
            .join(' | ')}`
      )
    ).toEqual([]);
  });
});

/**
 * A7a — the site's own links reach this page.
 *
 * `/pasantias` shipped finished and orphaned: every "PASANTÍAS" nav entry and the
 * footer link still pointed at `#pasantias`, the homepage teaser, and the INSPIRA
 * programme was still "explained" by a Heyzine flipbook of the retired Abril 2026
 * brochure. A7a made this page the destination and took the flipbook off the site.
 *
 * These live in this spec rather than a new one because `scripts/ci/e2e-mandatory.mjs`
 * runs a fixed list, and a spec that is not on the list is a spec CI never runs.
 *
 * Every assertion lands on `/pasantias` itself — the URL *and* the page's `h1` —
 * rather than on the anchor's `href`. An href is what
 * `__tests__/pages/pasantias-site-links.test.ts` proves statically; what a browser
 * proves is that following it arrives somewhere real.
 */
test.describe('the marketing site links to /pasantias', () => {
  const PASANTIAS_URL = /\/pasantias(?:[?#].*)?$/;

  /** The homepage's INSPIRA flipbook modal, by the class its iframe carried. */
  const FLIPBOOK_IFRAME = 'iframe.fp-iframe';

  async function expectLanded(page: import('@playwright/test').Page) {
    await expect(page).toHaveURL(PASANTIAS_URL);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();
  }

  test('the homepage nav "PASANTÍAS" lands on the page', async ({ page }) => {
    await page.goto('/');

    // Scoped to the header: the mobile menu holds a second link with this name.
    await page.locator('header').getByRole('link', { name: 'PASANTÍAS' }).click();
    await expectLanded(page);
  });

  test('the footer "Pasantías" link lands on the page', async ({ page }) => {
    await page.goto('/');

    const footerLink = page.locator('footer').getByRole('link', { name: 'Pasantías' });
    await expect(footerLink).toBeVisible();
    await footerLink.click();
    await expectLanded(page);
  });

  test('the /programas nav "PASANTÍAS" lands on the page', async ({ page }) => {
    await page.goto('/programas');

    await page.locator('header').getByRole('link', { name: 'PASANTÍAS' }).click();
    await expectLanded(page);
  });

  test('the homepage INSPIRA CTA lands on the page instead of opening a flipbook', async ({
    page,
  }) => {
    await page.goto('/');

    const cta = page.getByTestId('inspira-pasantias-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText('Conoce las Pasantías en Barcelona');

    // The retired brochure is gone from the page, not merely unlinked: neither
    // the modal nor its iframe exists before the click or after the landing.
    await expect(page.locator(FLIPBOOK_IFRAME)).toHaveCount(0);
    await cta.click();
    await expectLanded(page);
    await expect(page.locator(FLIPBOOK_IFRAME)).toHaveCount(0);
  });

  /**
   * The control for the assertion above. "No flipbook iframe appeared" is also
   * what a page with no flipbook mechanism at all would report, so the Directivos
   * CTA — which A7a deliberately left alone — is required to still open one. If
   * this goes red, the count-0 assertion above has stopped meaning anything.
   */
  test('the Directivos CTA still opens its flipbook', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Programa Estratégico para Directivos' }).click();
    await expect(page.locator(FLIPBOOK_IFRAME)).toHaveCount(1);
  });
});
