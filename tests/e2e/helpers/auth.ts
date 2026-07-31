/**
 * T2 — CI e2e auth helper.
 *
 * Turns the synthetic fixtures seeded by `scripts/ci/seed-e2e.mjs` into
 * Playwright storageState files by driving the real login form: the state is
 * therefore produced by the same auth-helpers cookie chain the middleware reads,
 * not by a hand-rolled token. Credentials come from the shared fixture file so
 * the seeder and the specs can never disagree.
 *
 * The fixtures only exist on the ephemeral local Supabase stack that CI starts
 * and destroys (see .github/workflows/ci.yml, gate 4).
 */
import { expect, type Browser, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import fixtures from '../../../scripts/ci/e2e-fixtures.json';

export type FixtureKey = 'admin' | 'docente';

export interface E2eFixtureUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

export const E2E_USERS: Record<FixtureKey, E2eFixtureUser> = fixtures.users;
export const E2E_SCHOOL: { id: number; name: string } = fixtures.school;

/** Written at run time; git-ignored — a storageState file is a live session. */
const AUTH_DIR = join(__dirname, '..', '.auth');

export function storageStatePath(key: FixtureKey): string {
  return join(AUTH_DIR, `${key}.json`);
}

/**
 * Logs in through the login form and waits for the post-login landing page.
 *
 * Locators: the email field is addressed by its placeholder and the submit
 * button by its role. The password field is addressed by input type because a
 * `<input type="password">` has no implicit ARIA role and this page's labels are
 * not associated with their inputs — adding `data-testid` to it would mean
 * editing application source, which is out of scope for this phase.
 */
export async function loginViaUi(page: Page, user: E2eFixtureUser): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();

  // The login page resolves must_change_password + profile completeness before
  // it routes; a seeded fixture has both settled, so it must land on /dashboard.
  // Anything else (/login with an error, /profile, /change-password) means the
  // fixture is not seeded the way the specs assume.
  await expect(page).toHaveURL(/\/dashboard(\?|$)/, { timeout: 30_000 });
}

/**
 * Logs the fixture in using a throwaway context and writes its storageState.
 * Called from `beforeAll`, so the state file exists before Playwright builds a
 * context from it for the tests in that describe block.
 */
export async function ensureStorageState(browser: Browser, key: FixtureKey): Promise<string> {
  const file = storageStatePath(key);
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });

  // Explicitly anonymous: inside a test hook Playwright applies the enclosing
  // `test.use({ storageState })` to browser.newContext(), which would try to read
  // the very file this function is about to create.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await loginViaUi(page, E2E_USERS[key]);
    await context.storageState({ path: file });
  } finally {
    await context.close();
  }

  return file;
}
