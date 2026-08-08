import { test, expect } from '@playwright/test';
import { ensureStorageState, storageStatePath } from './helpers/auth';
import fixtures from '../../scripts/ci/e2e-fixtures.json';

/**
 * A8 [A3] — `/admin/pasantia-leads` is admin-only and actually shows the leads.
 *
 * Two gates have to pass for the page to render: `middleware.ts` on `/admin/*`
 * (which A8 does not touch) and the page's own `getServerSideProps`
 * `isGlobalAdmin` check. The denial cases prove both directions of the
 * middleware's rule — a signed-in non-admin lands on `/dashboard`, an anonymous
 * visitor on `/login`.
 *
 * READ-ONLY on the seeded lead, deliberately. The fixture is not reset between
 * local runs, so a spec that moved it to `contacted` would pass once and fail
 * forever after; the transition graph is proven at the API in
 * `__tests__/api/admin/pasantia-leads.test.ts`, which is where it belongs.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4
 * and `node scripts/ci/seed-e2e.mjs`.
 */
const LEADS_PAGE = '/admin/pasantia-leads';
const LEADS_HEADING = 'Leads de Pasantías';
const SEEDED_LEAD = fixtures.pasantiasLead;

// A full cold navigation on a locally compiled page runs well past the 30s
// default; CI serves a production build. Generous by design.
test.setTimeout(120_000);

test.describe('Pasantías leads — admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('opens the triage page and shows the seeded lead', async ({ page }) => {
    await page.goto(LEADS_PAGE);

    // The responsive header renders the title twice (desktop + mobile); only
    // one of the two is visible at any viewport.
    await expect(page.getByRole('heading', { name: LEADS_HEADING }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(new RegExp(`${LEADS_PAGE}(\\?|$)`));

    await expect(page.getByText(SEEDED_LEAD.institution).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('pasantia-leads-tab-new')).toBeVisible();
  });
});

test.describe('Pasantías leads — docente', () => {
  test.use({ storageState: storageStatePath('docente') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'docente');
  });

  test('is denied the triage page', async ({ page }) => {
    await page.goto(LEADS_PAGE);

    // Denied, not merely unauthenticated: a signed-in non-admin is bounced to
    // /dashboard rather than to /login.
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: LEADS_HEADING })).toHaveCount(0);
  });
});

test.describe('Pasantías leads — anonymous', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('is sent to the login page', async ({ page }) => {
    await page.goto(LEADS_PAGE);

    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: LEADS_HEADING })).toHaveCount(0);
  });
});
