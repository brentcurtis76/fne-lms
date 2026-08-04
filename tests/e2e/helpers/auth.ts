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

export type FixtureKey =
  | 'admin'
  | 'docente'
  | 'consultorGlobal'
  | 'consultorAssigned'
  | 'consultorOtherSchool'
  | 'gcLeader'
  | 'inactiveConsultor';

export interface E2eFixtureUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  /** Which fixture school this persona belongs to. Absent means `primary`. */
  school?: string;
  /** `global` puts NULL in the role row's school_id — GLOBAL consultor access. */
  roleScope?: string;
  /** Which fixture growth community the role row points at. Absent means none. */
  community?: string;
  /** Extra role rows seeded with is_active=false. */
  inactiveRoles?: { role: string; school?: string; roleScope?: string; community?: string }[];
}

/**
 * This assignment is the anti-drift mechanism, not decoration — but it only guards ONE
 * direction, and the two directions differ in a way worth being exact about:
 *
 *   FixtureKey -> JSON   TYPE ERROR. A `FixtureKey` member with no entry in
 *                        e2e-fixtures.json fails `npm run type-check` (TS2741, "property
 *                        is missing … but required in type Record<FixtureKey, …>").
 *
 *   JSON -> FixtureKey   NOT type-checked. `fixtures.users` is a property access, not a
 *                        fresh object literal, so TypeScript applies no excess-property
 *                        check: a persona in the JSON with no `FixtureKey` member
 *                        type-checks clean (verified — tsc exits 0 with one present).
 *
 * Do not read the second case as "unreachable, therefore harmless". It is the opposite:
 * such a persona is UNTYPED YET AUTOMATICALLY COVERED. `FIXTURE_KEYS` below is
 * `Object.keys(E2E_USERS)` with an `as FixtureKey[]` cast, and a cast asserts a type the
 * runtime value need not actually have — so the array carries the JSON's keys, all of
 * them, and the login block in ci-fixture.spec.ts iterates that runtime value. A persona
 * added to the JSON alone therefore generates a live test inside a MANDATORY spec
 * (`npx playwright test tests/e2e/ci-fixture.spec.ts --list` shows it) without ever being
 * declared here. The cast is what makes that possible; nothing else checks it.
 *
 * (The spec files themselves are excluded from tsc by tsconfig's spec-file exclude — this
 * file is not.)
 */
export const E2E_USERS: Record<FixtureKey, E2eFixtureUser> = fixtures.users;
export const E2E_SCHOOL: { id: number; name: string } = fixtures.school;
export const E2E_SCHOOL_SECONDARY: { id: number; name: string } = fixtures.schoolSecondary;

/**
 * Every seeded persona, derived from the fixture file rather than listed again — so a
 * persona added to the JSON is covered by the login proof without anyone remembering to
 * extend a second list.
 */
export const FIXTURE_KEYS = Object.keys(E2E_USERS) as FixtureKey[];

/** The Zoom domain graph seeded by scripts/ci/seed-e2e-zoom.mjs. */
export const E2E_ZOOM: {
  community: { id: string; name: string };
  session: { id: string; title: string; sessionDate: string; startTime: string; endTime: string };
} = fixtures.zoom;

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
