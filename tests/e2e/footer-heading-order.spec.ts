import { test, expect, type Page } from '@playwright/test';
import { ensureStorageState } from './helpers/auth';

/**
 * `components/Footer.tsx` was shared by every public marketing page. A6a r3
 * changed its two section headings from `h4` to `h2`: on `/pasantias` the
 * document read `… h2 (last section) → h4 (footer)` and axe reported
 * `heading-order`, which the r2 spec had hidden by scoping its own check to
 * `<main>`. Changing a shared component to fix one page is only safe if it
 * leaves the others at least as correct, so this spec checks the Footer's
 * headings on every page that renders it.
 *
 * Redesign phase 4c retired `/brand-preview`, which until then was the only
 * page in this list that drew `components/Footer.tsx` itself: since the public
 * site moved to `components/site/SiteLayout.tsx` (12 Nov 2026) the five public
 * pages below draw that layout's own footer, with the same two `h2` headings.
 * `components/Footer.tsx` is now drawn by `components/layout/MainLayout.tsx`,
 * that is on every signed-in platform screen, so the signed-in `/dashboard` of
 * the seeded docente fixture takes the place of `/brand-preview` here.
 *
 * WHAT IS ASSERTED, and why it is narrow: only the transition **into** the
 * footer and the transitions **inside** it. Two of these pages carry
 * pre-existing `heading-order` violations in their own bodies, all of them an
 * `h1 → h3` or `h2 → h4` jump far above the footer and none of them this
 * phase's to fix (raised as a finding in the A6a r3 ledger entry):
 *
 *   /nosotros      h1 "SOMOS UNA RED…"  → h3 "Transformar"
 *   /programas     h1 "PROGRAMAS…"      → h3 "AULA GENERATIVA"
 *
 * Asserting the whole document here would mean either adopting that debt or
 * weakening the assertion until it proves nothing. `/pasantias` — the page this
 * phase owns — is held to the whole-document rule *and* to a full axe pass in
 * `pasantias-page.spec.ts`; here the claim is precisely "the shared Footer does
 * not create a jump on any page that renders it".
 *
 * Not in the list: `/noticias` and `/noticias/[slug]`, whose article headings
 * come from a client-side Supabase read and a realtime subscription — and CI
 * starts its stack with `realtime` excluded. Both were checked by hand on this
 * round's build (axe `heading-order`, zero violations) and both render the same
 * Footer under the same structure; pinning a heading guard to seeded content is
 * how a guard ends up red for a reason that has nothing to do with headings.
 */
const PAGES_RENDERING_FOOTER = [
  '/',
  '/nosotros',
  '/equipo',
  '/programas',
  '/pasantias',
] as const;

async function expectFooterHeadingOrder(page: Page, path: string, settled?: (page: Page) => Promise<void>) {
    await page.goto(path);
    await expect(page.locator('footer')).toBeVisible();
    // A page that draws its frame before its content: wait for the content, or the heading
    // before the footer would be read before it exists.
    if (settled) await settled(page);

    const headings = await page
      .locator(':is(h1, h2, h3, h4, h5, h6)')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          level: Number(node.tagName.slice(1)),
          inFooter: Boolean(node.closest('footer')),
          text: (node.textContent || '').trim().slice(0, 40),
        }))
      );

    const firstFooterHeading = headings.findIndex((heading) => heading.inFooter);
    expect(firstFooterHeading, `${path} renders no heading inside its footer`).toBeGreaterThan(-1);

    for (let i = Math.max(firstFooterHeading, 1); i < headings.length; i += 1) {
      expect(
        headings[i].level - headings[i - 1].level,
        `${path}: footer heading "${headings[i].text}" (h${headings[i].level}) jumps past h${
          headings[i - 1].level + 1
        } after "${headings[i - 1].text}"`
      ).toBeLessThanOrEqual(1);
    }
}

for (const path of PAGES_RENDERING_FOOTER) {
  test(`the shared Footer does not break heading order on ${path}`, async ({ page }) => {
    await expectFooterHeadingOrder(page, path);
  });
}

test('the shared Footer does not break heading order on /dashboard (signed in, MainLayout)', async ({ browser }) => {
  // Signing in through the login form can take most of the default 30 s on its own.
  test.setTimeout(120_000);
  const context = await browser.newContext({ storageState: await ensureStorageState(browser, 'docente') });
  try {
    await expectFooterHeadingOrder(await context.newPage(), '/dashboard', async (page) => {
      // The panel itself, not a page it bounced to; its greeting is drawn once the profile has loaded.
      await expect(page.getByRole('heading', { name: /^¡Hola, / })).toBeVisible({ timeout: 60_000 });
      await expect(page).toHaveURL(/\/dashboard$/);
    });
  } finally {
    await context.close();
  }
});
