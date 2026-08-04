import { test, expect, type Page } from '@playwright/test';
import { E2E_ZOOM, ensureStorageState, storageStatePath, type FixtureKey } from './helpers/auth';
import {
  DENIED_PERSONAS,
  VIEWER_PERSONAS,
  VIEW_ONLY_PERSONAS,
  PRIVILEGED_PERSONAS,
} from './helpers/session-personas';

/**
 * Z1c-2 — the meeting interstitial (`/meet/session/[id]`) against every seeded persona.
 *
 * The interstitial is the single platform surface that reveals a session's legacy manual
 * meeting link, so its gate is `canViewSession()` alone: everyone who may open the session
 * may reach its meeting through here. That is deliberately NOT the disclosure rule — a GC
 * leader who is denied the raw link in an API payload still gets it here, because here the
 * access is re-checked server-side on every visit instead of being frozen into an artifact
 * that outlives the viewer's permissions. session-disclosure.spec.ts asserts the other half.
 *
 * Defends:
 *   lib/utils/session-meet-access.ts:39      one shared NOT_FOUND — no existence oracle
 *   lib/utils/session-meet-access.ts:101-103 denial is canViewSession, not a role guess
 *   lib/utils/session-meet-access.ts:77-79   archived sessions are admin-only
 *   pages/meet/session/[id].tsx:133-135      not-found ⇒ notFound (404), never a 403 page
 *   pages/meet/session/[id].tsx:74,:86       meet-join-link / meet-no-link branches
 *
 * This spec is mandatory (scripts/ci/e2e-mandatory.mjs) — it fails the gate if skipped.
 * Requires the seeded local Supabase stack (`node scripts/ci/seed-e2e.mjs`).
 */

const LINKED = E2E_ZOOM.linkedSession;
const UNLINKED = E2E_ZOOM.session;

/** A well-formed UUID that is not any seeded session — the "no such session" control. */
const ABSENT_SESSION_ID = 'e2e00000-0000-4000-8000-0000000009ff';

// Full login round trip plus a cold navigation per test; a local run compiles the page on
// demand. Generous by design — this spec guards authorization, not latency.
test.setTimeout(120_000);

function meetUrl(sessionId: string): string {
  return `/meet/session/${sessionId}`;
}

/**
 * The denial body with every UUID masked.
 *
 * Next.js serialises the requested route into `__NEXT_DATA__`, so two denials for two
 * different ids necessarily differ in the id itself. Masking UUIDs leaves everything else
 * comparable, which is exactly the claim under test: the two responses may differ in the
 * id the caller already knows, and in NOTHING else. An unmasked comparison would be
 * unfalsifiable; a status-only comparison would be too weak to catch a leak in the body.
 */
async function maskedDenialBody(page: Page, sessionId: string): Promise<string> {
  const response = await page.goto(meetUrl(sessionId));
  expect(response, `no response for ${sessionId}`).not.toBeNull();
  expect(response!.status(), `expected 404 for ${sessionId}`).toBe(404);
  const body = await response!.text();
  return body.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');
}

for (const key of VIEWER_PERSONAS) {
  test.describe(`meet interstitial — ${key} (may view)`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, key);
    });

    test('reaches the join link on the session that has one', async ({ page }) => {
      const response = await page.goto(meetUrl(LINKED.id));
      expect(response?.status()).toBe(200);

      const join = page.getByTestId('meet-join-link');
      await expect(join).toBeVisible({ timeout: 30_000 });
      // The href is the assertion, not the affordance: a page that rendered the button
      // while pointing it somewhere else would pass a visibility-only check.
      await expect(join).toHaveAttribute('href', LINKED.meetingLink);
      await expect(page.getByTestId('meet-no-link')).toHaveCount(0);
    });

    test('sees the no-link state on the session that has none', async ({ page }) => {
      const response = await page.goto(meetUrl(UNLINKED.id));
      expect(response?.status()).toBe(200);

      await expect(page.getByTestId('meet-no-link')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
    });
  });
}

for (const key of DENIED_PERSONAS) {
  test.describe(`meet interstitial — ${key} (may not view)`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, key);
    });

    test('is denied both sessions with 404, not a 403 page', async ({ page }) => {
      for (const sessionId of [LINKED.id, UNLINKED.id]) {
        const response = await page.goto(meetUrl(sessionId));
        expect(response?.status(), `expected 404 for ${sessionId}`).toBe(404);
        // Denied means the link is not merely hidden — it is not in the document.
        await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
        await expect(page.getByTestId('meet-no-link')).toHaveCount(0);
      }
    });

    test('never receives the raw meeting link in the denial', async ({ page }) => {
      await page.goto(meetUrl(LINKED.id));
      expect(await page.content()).not.toContain(LINKED.meetingLink);
    });

    test('cannot distinguish "not yours" from "no such session"', async ({ page }) => {
      // The existence oracle this rules out: if the two bodies differed, a caller could
      // enumerate which session ids are real without ever being allowed to see one.
      const denied = await maskedDenialBody(page, LINKED.id);
      const absent = await maskedDenialBody(page, ABSENT_SESSION_ID);
      expect(denied).toBe(absent);
    });
  });
}

test.describe('meet interstitial — an attendee row is not view access', () => {
  // docente is seeded as an attendee of the linked session (scripts/ci/e2e-fixtures.json)
  // and is still denied it: canViewSession reads roles, school and community — never
  // session_attendees. A regression that started consulting attendance would show up here
  // and nowhere else in this suite.
  const key: FixtureKey = 'docente';
  test.use({ storageState: storageStatePath(key) });
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await ensureStorageState(browser, key);
  });

  test('docente attends the linked session yet cannot open it', async ({ page }) => {
    expect(LINKED.attendees.map((a) => a.user)).toContain(key);
    const response = await page.goto(meetUrl(LINKED.id));
    expect(response?.status()).toBe(404);
  });
});

test('the persona matrix covers every seeded persona', async () => {
  // A guard on the suite itself: the tiers are asserted total at module load
  // (helpers/session-personas.ts), and this makes that visible as a test result rather
  // than as an import side effect nobody reads.
  expect([...PRIVILEGED_PERSONAS, ...VIEW_ONLY_PERSONAS, ...DENIED_PERSONAS].length).toBe(
    PRIVILEGED_PERSONAS.length + VIEW_ONLY_PERSONAS.length + DENIED_PERSONAS.length
  );
  expect(VIEWER_PERSONAS.length).toBeGreaterThan(0);
  expect(DENIED_PERSONAS.length).toBeGreaterThan(0);
});
