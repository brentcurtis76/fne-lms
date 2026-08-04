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
 * The assertions read their expected values from `cohort-public.ts`, the module
 * the page itself renders: the point is to prove the page is wired to the module
 * (a hardcoded date would fail), not to re-transcribe Appendix A here.
 *
 * The price assertions are the D-02 boundary at the surface a visitor actually
 * sees. `scripts/check-price-leak.mjs` covers the client bundle; this covers the
 * rendered HTML, including hand-written page copy the bundle guard would not
 * flag as commercial data.
 */

/**
 * The currency itself plus every Appendix A-8 amount, live and retired. Retired
 * amounts stay on the list for the same reason `check-price-leak.mjs` keeps
 * them: the module no longer holds them, so the only way one could appear here
 * is hand-written copy nobody updated.
 */
const FORBIDDEN_PRICE_TOKENS = ['€', '2.500', '1.000', '1.560'];

test.describe('pasantías landing page', () => {
  test('renders every section from the public cohort module', async ({ page }) => {
    await page.goto('/pasantias');

    // Hero: the headline string comes from the module, never composed in the page.
    await expect(page.getByTestId('pasantias-date-chip')).toHaveText(COHORT_HEADLINE);
    await expect(page.getByTestId('pasantias-hero-stats')).toHaveText(
      `${COHORT_VISIT_DAY_COUNT} días de visitas · ${COHORT_SCHOOLS.length} escuelas`
    );

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

    // Experts render with the module's exact titles — a paraphrase fails here.
    for (const [index, expert] of COHORT_EXPERTS.entries()) {
      const card = page.getByTestId(`pasantias-expert-${index}`);
      await expect(card).toContainText(expert.name);
      await expect(card).toContainText(expert.role);
    }

    // All thirteen objectives, verbatim.
    await expect(page.getByTestId('pasantias-objetivos').locator('li')).toHaveCount(
      COHORT_OBJECTIVES.length
    );
    await expect(page.getByTestId(`pasantias-objective-0`)).toContainText(COHORT_OBJECTIVES[0]);
    await expect(
      page.getByTestId(`pasantias-objective-${COHORT_OBJECTIVES.length - 1}`)
    ).toContainText(COHORT_OBJECTIVES[COHORT_OBJECTIVES.length - 1]);

    // FAQ: at least five, per the plan.
    const faqCount = await page.getByTestId(/^pasantias-faq-\d+$/).count();
    expect(faqCount).toBeGreaterThanOrEqual(5);
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
    for (const token of FORBIDDEN_PRICE_TOKENS) {
      expect(html, `price token "${token}" must not reach the public page`).not.toContain(token);
    }
  });

  test('has one h1, ordered headings and a keyboard-reachable primary CTA', async ({ page }) => {
    await page.goto('/pasantias');

    await expect(page.locator('h1')).toHaveCount(1);

    // No heading level is skipped (h1 → h2 → h3, never h1 → h3). Scoped to the
    // page's own content: the shared Footer is not this phase's to restructure.
    const levels = await page.locator('main :is(h1, h2, h3, h4, h5, h6)').evaluateAll((nodes) =>
      nodes.map((node) => Number(node.tagName.slice(1)))
    );
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }

    // Landmarks a screen reader navigates by.
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('footer')).toHaveCount(1);

    // The primary CTA is reachable by keyboard alone and moves focus to #programa.
    const primaryCta = page.getByTestId('pasantias-cta-programa');
    await primaryCta.focus();
    await expect(primaryCta).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#programa$/);
    await expect(page.getByTestId('pasantias-programa')).toBeInViewport();
  });
});
