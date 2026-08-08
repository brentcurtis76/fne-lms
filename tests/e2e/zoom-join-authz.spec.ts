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
 * TWO decisions are under test here, and keeping them apart is the whole spec:
 *
 *   PAGE VISIBILITY is `canViewSession()`. Who may OPEN the page has not moved and must
 *   not: the denied tier still gets 404, the viewing tier still gets 200.
 *
 *   THE JOIN CAPABILITY is `authorizeMeetingJoin()` — the §5 join list, which is strictly
 *   narrower (*viewing ≠ sitting in*) and is resolved per SESSION, not per persona.
 *
 * ## Why the view-only assertions in this file were inverted (2026-08-06)
 *
 * This spec used to assert that every persona who may view the linked session also reached
 * `meet-join-link` with the raw `meeting_link` as its href. That documented an
 * inconsistency rather than a rule: for a Zoom-managed session "view-only" meant NO
 * credentials, while for a pasted-link session it meant "here is the link" — and whoever
 * holds that URL is in the meeting. Two ways in, two rules, chosen by whichever provider
 * the scheduler happened to pick.
 *
 * **The owner ruled (2026-08-06, recorded in PLAN.md §5 and in the Z2 review file): make
 * it consistent.** View-only now means the same thing for every provider — a persona who
 * may view but may not join gets no join affordance and no raw link, and the link is
 * withheld from the PROPS, so it is absent from the document rather than merely hidden.
 * These assertions therefore encode a product decision, not a weakened check.
 *
 * `consultorGlobal` is the persona that makes the change visible: privileged for
 * DISCLOSURE (they receive the raw link in API payloads — session-disclosure.spec.ts
 * asserts that, and it is unchanged) and refused by the §5 join list, which has no branch
 * for an unassigned consultor. `gcLeader` goes the other way: they are an EXPECTED
 * ATTENDEE of both fixture sessions and may join both. View-only for disclosure and
 * allowed to join is not a contradiction — they are different questions.
 *
 * Defends:
 *   lib/utils/session-meet-access.ts   one shared NOT_FOUND — no existence oracle
 *   lib/utils/session-meet-access.ts   page visibility is canViewSession, not a role guess
 *   lib/utils/session-meet-access.ts   archived sessions are admin-only
 *   lib/utils/session-meet-access.ts   the join capability gates BOTH providers, and the
 *                                      link never enters the props of a refused viewer
 *   pages/meet/session/[id].tsx        not-found ⇒ notFound (404), never a 403 page
 *   pages/meet/session/[id].tsx        meet-join-link / meet-no-link / meet-join-denied
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

/**
 * Who the §5 join list authorizes, per SESSION — derived from the seeded fixtures
 * (scripts/ci/e2e-fixtures.json), not from the view tiers:
 *
 *   admin              the policy's admin branch, every session.
 *   consultorAssigned  lead facilitator of BOTH fixture sessions.
 *   gcLeader           expected attendee of BOTH. The fixture file lists them on the
 *                      linked session only; the row on the other one is written by the
 *                      `trg_sync_session_attendees_on_gc_change` trigger, which enrols an
 *                      active GC member into every FUTURE `programada` session of their
 *                      community — and both fixture sessions are future and programada.
 *                      Reading the fixture JSON alone would get this persona wrong.
 *   consultorGlobal    global consultor, facilitator of neither, attendee of neither →
 *                      403 on both. They still SEE both pages.
 *
 * Only personas who pass canViewSession appear here — an attendee row is not view access
 * (docente is seeded as an attendee of the linked session and is still denied the page,
 * asserted at the bottom of this file).
 */
const JOIN_AUTHORIZED: Record<'linked' | 'unlinked', FixtureKey[]> = {
  linked: ['admin', 'consultorAssigned', 'gcLeader'],
  unlinked: ['admin', 'consultorAssigned', 'gcLeader'],
};

for (const key of VIEWER_PERSONAS) {
  const mayJoinLinked = JOIN_AUTHORIZED.linked.includes(key);
  const mayJoinUnlinked = JOIN_AUTHORIZED.unlinked.includes(key);

  test.describe(`meet interstitial — ${key} (may view)`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, key);
    });

    test(`opens the linked session and ${mayJoinLinked ? 'reaches' : 'is refused'} its join link`, async ({
      page,
    }) => {
      // Page visibility first, and it is the same 200 either way — the refusal below
      // removes the way IN, never the page (PLAN.md §5, amended 2026-08-06).
      const response = await page.goto(meetUrl(LINKED.id));
      expect(response?.status()).toBe(200);

      if (mayJoinLinked) {
        const join = page.getByTestId('meet-join-link');
        await expect(join).toBeVisible({ timeout: 30_000 });
        // The href is the assertion, not the affordance: a page that rendered the button
        // while pointing it somewhere else would pass a visibility-only check.
        await expect(join).toHaveAttribute('href', LINKED.meetingLink);
        await expect(page.getByTestId('meet-join-denied')).toHaveCount(0);
        return;
      }

      await expect(page.getByTestId('meet-join-denied')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
      // Absent from the document, not merely hidden — the same bar the denied tier is
      // held to. The fixture link is a distinctive synthetic value, so a substring
      // check over the whole page is exact.
      expect(await page.content()).not.toContain(LINKED.meetingLink);
    });

    test(`${mayJoinUnlinked ? 'sees the no-link state' : 'is refused'} on the session that has no link`, async ({
      page,
    }) => {
      const response = await page.goto(meetUrl(UNLINKED.id));
      expect(response?.status()).toBe(200);

      if (mayJoinUnlinked) {
        await expect(page.getByTestId('meet-no-link')).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
        return;
      }

      // Whether the session HAS a link is part of the capability: a refused viewer gets
      // the refusal, not the no-link state.
      await expect(page.getByTestId('meet-join-denied')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('meet-no-link')).toHaveCount(0);
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
        // Not even the refusal panel: they get the 404 page, not the session's.
        await expect(page.getByTestId('meet-join-denied')).toHaveCount(0);
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

test('the join list is a subset of the viewing tier, and is narrower than it', async () => {
  // Coherence guard on the table above: nobody may join a session they cannot open, and
  // the join list must actually be narrower than the view tier — a JOIN_AUTHORIZED that
  // drifted into "everyone who may view" would make every refusal assertion above
  // unreachable while the suite still went green.
  for (const [session, keys] of Object.entries(JOIN_AUTHORIZED)) {
    for (const key of keys) {
      expect(VIEWER_PERSONAS, `${key} may join ${session} without being able to view it`).toContain(
        key
      );
    }
    expect(keys.length, `${session}: the join list is not narrower than the view tier`).toBeLessThan(
      VIEWER_PERSONAS.length
    );
  }
});
