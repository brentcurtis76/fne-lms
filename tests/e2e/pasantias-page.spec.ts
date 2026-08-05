import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

import {
  COHORT_EXPERTS,
  COHORT_HEADLINE,
  COHORT_OBJECTIVES,
  COHORT_SCHOOLS,
  COHORT_VISIT_DAY_COUNT,
} from '../../lib/pasantias/cohort-public';

/**
 * A6a — the public `/pasantias` landing page.
 *
 * Two kinds of assertion live here, and the difference is the point:
 *
 *  - **Wiring assertions** read their expected values from `cohort-public.ts`,
 *    the module the page renders. They prove the page is wired to the module —
 *    a hardcoded date fails them. That is all they can prove.
 *  - **Literal pins** (`PINNED`, below) are transcribed by hand from Appendix A
 *    and never derived from the module. Sol's round-2 B2 is why they exist: with
 *    only the first kind, corrupting the module corrupts the expectation with
 *    it, and the suite goes green on a page full of wrong content. The module's
 *    own full oracle lives in `__tests__/lib/pasantias-cohort.test.ts`; these are
 *    the page-level backstop, at least one per section.
 *
 * The price assertions are the D-02 boundary at the surface a visitor actually
 * sees. `scripts/check-price-leak.mjs` covers the client bundle; this covers the
 * rendered HTML, including hand-written page copy the bundle guard would not
 * flag as commercial data.
 */

/**
 * Hand-transcribed from Appendix A. Never import these from the module: the
 * moment they are derived they stop being an independent check.
 */
const PINNED = {
  headline: 'Octubre, 5 al 16 · 2026',
  heroStats: '9 días de visitas · 7 escuelas',
  weekLabels: ['Semana 1 — inmersión', 'Semana 2 — visitas'],
  dayBlock: 'Mañana 1',
  fiestaNacional: 'Fiesta Nacional de España',
  schoolNames: [
    'Escola Virolai',
    'Escola Sadako',
    'Institut Escola El Puig',
    'Escola La Maquinista',
    'Escola Octavio Paz',
    'Institut Angeleta Ferrer',
    'Institut Escola Les Vinyes',
  ],
  schoolLevels: 'Infantil, primaria, ESO y Bachillerato',
  schoolHighlight: 'Metaprendizaje',
  expertRoles: [
    'Directora del programa INSPIRA',
    'Coordinadora INSPIRA',
    'Consultor en transformación pedagógica',
  ],
  objectiveCount: 13,
  objectiveOpening: 'Conocer los proyectos educativos de las principales escuelas de vanguardia',
} as const;

/**
 * D-02 at the rendered surface. Regexes rather than substrings because two of
 * these have to distinguish a price from ordinary copy and ordinary markup.
 *
 * The bare forms (`2500`, `1560`, `560`, the `70`–`120` lodging band) are not
 * listed: none of them is a price without a currency marker beside it, and every
 * currency marker is banned outright here — so there is no leak shape they would
 * catch that the currency patterns do not catch first. `check-price-leak.mjs`
 * carries the amount-near-currency windows for the bundle, where a bare figure
 * genuinely can arrive on its own through a tree-shaken `.min`/`.max` read.
 */
const FORBIDDEN_PRICE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['the euro glyph', /€/],
  // Sol r2 B1: `2500 euros por persona` shipped past a guard that knew only `€`
  // and `EUR`. The trailing boundary is what keeps "conocer Europa" — live copy
  // in the free-weekend FAQ — from matching.
  ['a euro word form (eur/euro/euros)', /(?<![A-Za-z])[Ee][Uu][Rr](?:[Oo][Ss]?)?(?![A-Za-z])/],
  ['the live programme fee', /(?<![\d.,])2[.,\s]?500(?![\d])/],
  ['the retired €1.000 programme fee', /(?<![\d.,])1[.,\s]?000(?![\d])/],
  ['the retired €1.560 total', /(?<![\d.,])1[.,\s]?560(?![\d])/],
];

test.describe('pasantías landing page', () => {
  test('renders every section from the public cohort module', async ({ page }) => {
    await page.goto('/pasantias');

    // Hero: the headline string comes from the module, never composed in the page.
    await expect(page.getByTestId('pasantias-date-chip')).toHaveText(COHORT_HEADLINE);
    await expect(page.getByTestId('pasantias-hero-stats')).toHaveText(
      `${COHORT_VISIT_DAY_COUNT} días de visitas · ${COHORT_SCHOOLS.length} escuelas`
    );
    // …and the same two strings, pinned. A module corrupted in both directions
    // passes the two assertions above and fails these.
    await expect(page.getByTestId('pasantias-date-chip')).toHaveText(PINNED.headline);
    await expect(page.getByTestId('pasantias-hero-stats')).toHaveText(PINNED.heroStats);

    // Every section of the story is present.
    for (const section of [
      'pasantias-hero',
      'pasantias-barcelona',
      'pasantias-modos',
      'pasantias-finde',
      'pasantias-dia-tipo',
      'pasantias-escuelas',
      'pasantias-equipo',
      'pasantias-objetivos',
      'pasantias-faq',
      'pasantias-programa',
    ]) {
      await expect(page.getByTestId(section)).toBeVisible();
    }

    // Both weeks, both tiers of schools, all seven named.
    await expect(page.getByTestId('pasantias-week-semana-1')).toBeVisible();
    await expect(page.getByTestId('pasantias-week-semana-2')).toBeVisible();
    for (const school of COHORT_SCHOOLS) {
      await expect(
        page.getByTestId('pasantias-escuelas').getByText(school.name, { exact: true })
      ).toBeVisible();
    }
    // Pinned: the seven names, the two week labels, one day block, the holiday.
    for (const name of PINNED.schoolNames) {
      await expect(
        page.getByTestId('pasantias-escuelas').getByText(name, { exact: true })
      ).toBeVisible();
    }
    await expect(page.getByTestId('pasantias-modos')).toContainText(PINNED.weekLabels[0]);
    await expect(page.getByTestId('pasantias-modos')).toContainText(PINNED.weekLabels[1]);
    await expect(page.getByTestId('pasantias-dia-tipo')).toContainText(PINNED.dayBlock);
    await expect(page.getByTestId('pasantias-finde')).toContainText(PINNED.fiestaNacional);

    // Experts render with the module's exact titles — a paraphrase fails here.
    for (const [index, expert] of COHORT_EXPERTS.entries()) {
      const card = page.getByTestId(`pasantias-expert-${index}`);
      await expect(card).toContainText(expert.name);
      await expect(card).toContainText(expert.role);
    }

    // A6a r1 shipped four experts titled "Experto invitado" because the module
    // had never absorbed the 2026-08-02 A-6 amendment. Reading the roles from
    // the module (above) cannot catch that — the page and the expectation are
    // wrong together. So the placeholder is named here as a prohibition, and
    // three real titles are pinned as literals, including the two that kept
    // rendering without their `INSPIRA` suffix until r3.
    const equipo = page.getByTestId('pasantias-equipo');
    await expect(equipo).not.toContainText('Experto invitado');
    for (const role of PINNED.expertRoles) {
      await expect(equipo).toContainText(role);
    }

    // Every school card says what the school is known for (pack §5b) and which
    // levels it teaches — the reason the section is more than a list of names.
    for (const school of COHORT_SCHOOLS) {
      const card = page
        .getByTestId('pasantias-escuelas')
        .locator('li', { has: page.getByText(school.name, { exact: true }) })
        .first();
      await expect(card).toContainText(school.levels);
      await expect(card).toContainText(school.highlights[0]);
    }
    await expect(page.getByTestId('pasantias-escuelas')).toContainText(PINNED.schoolHighlight);
    await expect(page.getByTestId('pasantias-escuelas')).toContainText(PINNED.schoolLevels);

    // All thirteen objectives, verbatim.
    await expect(page.getByTestId('pasantias-objetivos').locator('li')).toHaveCount(
      COHORT_OBJECTIVES.length
    );
    await expect(page.getByTestId(`pasantias-objective-0`)).toContainText(COHORT_OBJECTIVES[0]);
    await expect(
      page.getByTestId(`pasantias-objective-${COHORT_OBJECTIVES.length - 1}`)
    ).toContainText(COHORT_OBJECTIVES[COHORT_OBJECTIVES.length - 1]);
    await expect(page.getByTestId('pasantias-objetivos').locator('li')).toHaveCount(
      PINNED.objectiveCount
    );
    await expect(page.getByTestId('pasantias-objective-0')).toContainText(
      PINNED.objectiveOpening
    );

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
  });

  test('states no visit duration Appendix A does not state', async ({ page }) => {
    await page.goto('/pasantias');

    // Sol r2 S1: the card for every school without `fullDay` printed "Visita de
    // media jornada". A-5 says "1–2 escuelas por día" and nothing about half
    // days — it was an inference rendered to buyers as programme detail.
    const escuelas = page.getByTestId('pasantias-escuelas');
    await expect(escuelas).not.toContainText(/media jornada/i);
    await expect(escuelas).not.toContainText(/medio día/i);
    // What A-5 does state about the two schools outside the city.
    await expect(escuelas).toContainText('Día completo — fuera de Barcelona');
  });

  test('ficha, WhatsApp and #programa CTAs point where they should', async ({ page }) => {
    await page.goto('/pasantias');

    await expect(page.getByTestId('pasantias-cta-ficha')).toHaveAttribute(
      'href',
      '/api/pasantias/ficha'
    );

    // Appendix A-11's number, in the punctuation-free form wa.me requires.
    const whatsappHref = await page.getByTestId('pasantias-cta-whatsapp').getAttribute('href');
    expect(whatsappHref).toContain('https://wa.me/56941623577');

    // The interim panel A6b replaces: a mailto to the FNE inbox, at #programa.
    await expect(page.getByTestId('pasantias-cta-programa')).toHaveAttribute('href', '#programa');
    const mailtoHref = await page.getByTestId('pasantias-cta-mailto').getAttribute('href');
    expect(mailtoHref).toContain('mailto:info@nuevaeducacion.org');
  });

  test('no price token appears anywhere in the rendered page (D-02)', async ({ page }) => {
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

    // The one euro-adjacent word that is allowed, asserted present so the
    // boundary above is proven to be a boundary and not an accident.
    expect(html).toContain('Europa');
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
