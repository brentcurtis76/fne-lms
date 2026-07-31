import { test, expect } from '@playwright/test';
import { E2E_USERS, ensureStorageState, loginViaUi, storageStatePath } from './helpers/auth';

/**
 * T2 — proves the CI e2e topology itself: the seeded synthetic fixtures exist,
 * both can authenticate through the real login form, and role gating actually
 * differs between them. This spec is mandatory (scripts/ci/e2e-mandatory.mjs);
 * it fails the gate if it is skipped.
 *
 * Requires the seeded local Supabase stack — see .github/workflows/ci.yml gate 4
 * and `node scripts/ci/seed-e2e.mjs`.
 */
const ADMIN_ONLY_PAGE = '/admin/schools';
const ADMIN_PAGE_HEADING = 'Gestión de Escuelas';

// Every test here does a full login round trip plus a cold navigation. CI serves a
// production build, but a local run compiles these pages on demand — well past the
// 30s default. Generous by design: this spec guards infrastructure, not latency.
test.setTimeout(120_000);

test.describe('CI fixtures — login', () => {
  // Anonymous on purpose: this block exercises the login form itself.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const key of ['admin', 'docente'] as const) {
    test(`${key} fixture logs in through the login form`, async ({ page }) => {
      await loginViaUi(page, E2E_USERS[key]);
      await expect(page).toHaveURL(/\/dashboard(\?|$)/);
    });
  }
});

test.describe('CI fixtures — admin storage state', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeAll(async ({ browser }) => {
    // A file-level test.setTimeout does not reach hooks — set it here too.
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'admin');
  });

  test('carries an authenticated session', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('reaches an admin-only page', async ({ page }) => {
    await page.goto(ADMIN_ONLY_PAGE);
    // Two gates have to pass for this heading to render: the middleware role
    // check on /admin/* and the page's own getUserPrimaryRole() check.
    // Scoped to the main landmark: the layout renders the same title twice
    // (page heading + layout header), which trips Playwright's strict mode.
    await expect(
      page.getByRole('main').getByRole('heading', { name: ADMIN_PAGE_HEADING })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`${ADMIN_ONLY_PAGE}(\\?|$)`));
  });
});

test.describe('CI fixtures — docente storage state', () => {
  test.use({ storageState: storageStatePath('docente') });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, 'docente');
  });

  test('carries an authenticated session', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('is denied the admin-only page', async ({ page }) => {
    await page.goto(ADMIN_ONLY_PAGE);
    // Denied, not merely unauthenticated: the middleware bounces a signed-in
    // non-admin to /dashboard rather than to /login.
    await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: ADMIN_PAGE_HEADING })).toHaveCount(0);
  });
});
