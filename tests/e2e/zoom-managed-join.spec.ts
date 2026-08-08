import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  E2E_ZOOM,
  apiContextFor,
  ensureStorageState,
  storageStatePath,
  type FixtureKey,
} from './helpers/auth';
import { DENIED_PERSONAS, VIEWER_PERSONAS } from './helpers/session-personas';

/**
 * Z2-S8 (r28) — the meeting interstitial and the join opening against a **platform-managed**
 * session.
 *
 * ## Why this file exists
 *
 * `consultor_sessions.is_zoom_managed` is `NOT NULL DEFAULT false` and the e2e seeder never
 * wrote it, so **every seeded session was unmanaged** and no e2e had ever reached a managed
 * one. Four consecutive rounds changed managed behaviour — the managed join affordance, the
 * §14 kill switch, r26's five platform-link surfaces, r27's disclosure predicate — and the
 * mandatory specs passed unchanged through all four, because none of them could observe any
 * of it. Those rounds are unit- and integration-tested; until this file, none had ever been
 * exercised end to end.
 *
 * The fixture is **added, never flipped**: `zoom.session` and `zoom.linkedSession` keep
 * `is_zoom_managed = false`, so every pre-existing assertion in `zoom-join-authz.spec.ts`,
 * `session-disclosure.spec.ts` and `session-ical.spec.ts` holds untouched. This spec only
 * ever addresses `zoom.managedSession`.
 *
 * ## The two decisions, on the managed branch
 *
 * Same shape as `zoom-join-authz.spec.ts`, and deliberately the same personas — page
 * visibility is `canViewSession()`, the join capability is `authorizeMeetingJoin()`, and the
 * second is strictly narrower. What differs is what "a way in" LOOKS like: an unmanaged
 * session renders an `<a>` at the raw `meeting_link`, a managed one renders
 * `JoinMeetingButton`, whose URL is fetched per click from the §5 opening and never enters
 * the props. `meet-no-link` is the state that must NOT appear — a managed session's
 * `meeting_link` is NULL by design (plan §8), and deciding from that column alone is exactly
 * the class of defect r26 and r27 fixed on six other surfaces.
 *
 * ## §14 — what this run can and cannot prove about the kill switch
 *
 * `FEATURE_ZOOM_MEETINGS` is read from `process.env` on every request
 * (`lib/featureFlags.ts:6`), so it has exactly ONE value for the lifetime of the server
 * Playwright starts. The e2e environment sets it **on** (`.github/workflows/ci.yml`, the
 * `.env.local` step), because with it off there is no managed join affordance to assert the
 * existence of at all.
 *
 * So this file proves the **on** side end to end: the flag is consulted on the managed path
 * — `session-meet-access.ts:199` reads it for every managed session — and the affordance
 * appears, with `meet-join-disabled` asserted absent so a silently-off flag fails here rather
 * than passing as "no button, no problem".
 *
 * The **off** side (`meet-join-disabled` rendered, and the join route's 503) is
 * **unreachable from this run**, and no assertion below pretends otherwise. Reaching it
 * would take a second Playwright `webServer` on another port with the flag unset; that was
 * declined for this round as too large a change to the e2e harness on the phase's last code
 * round. It is covered by unit tests (`__tests__/lib/utils/session-meet-access.test.ts`
 * :429-467 and `__tests__/api/meet/session-join.test.ts`:341-356) and by nothing else.
 *
 * ## What the tenant does NOT contain
 *
 * No `zoom_internal.zoom_meetings` row and no `session_meetings_public` projection are
 * seeded, so the join opening answers `mode: 'pending'` (§8's provisioning window) and never
 * `mode: 'link'`. That is asserted rather than worked around: the `link` outcome, and with it
 * the dial-in block, have no end-to-end coverage. See the review file.
 *
 * Defends:
 *   lib/utils/session-meet-access.ts    the join capability governs the MANAGED affordance
 *   lib/utils/session-meet-access.ts    §14 is checked after authorization, managed path only
 *   pages/meet/session/[id].tsx         is_zoom_managed picks JoinMeetingButton, not meet-no-link
 *   pages/api/meet/session/[id]/join.ts gates 3-7, driven through the running server
 *
 * This spec is mandatory (scripts/ci/e2e-mandatory.mjs) — it fails the gate if skipped.
 * Requires the seeded local Supabase stack (`node scripts/ci/seed-e2e.mjs`).
 */

const MANAGED = E2E_ZOOM.managedSession;
const LINKED = E2E_ZOOM.linkedSession;

const MANAGED_URL = `/meet/session/${MANAGED.id}`;
const MANAGED_JOIN_API = `/api/meet/session/${MANAGED.id}/join`;

/**
 * §5's copy for a caller who may see the session and may not join it, verbatim from
 * `lib/utils/meeting-join-policy.ts` (`CONSULTOR_NOT_FACILITATOR_MESSAGE`). Spelled out
 * rather than imported: these specs address the app over HTTP and import no application
 * module, so a wording change has to be noticed here rather than tracked silently.
 */
const NOT_AUTHORIZED_MESSAGE = 'No tienes acceso para unirte a esta reunión.';

// Full login round trip plus a cold navigation per test; a local run compiles the page on
// demand. Generous by design — this spec guards authorization, not latency.
test.setTimeout(120_000);

/**
 * Who the §5 join list authorizes for THIS session, derived from the seeded fixture:
 *
 *   admin              the policy's admin branch, every session.
 *   consultorAssigned  the lead facilitator (scripts/ci/e2e-fixtures.json).
 *   gcLeader           an expected attendee. The fixture seeds the row explicitly, and
 *                      `trg_sync_session_attendees_on_gc_change` would write it anyway when
 *                      the role rows land — belt and braces, so the join list is readable
 *                      off the JSON without knowing the trigger exists.
 *
 * `consultorGlobal` is deliberately absent: global consultor, facilitator of nothing,
 * attendee of nothing, and the §5 matrix has no branch for them. They still SEE the page,
 * which is what makes them the persona that can observe the difference between the two
 * decisions on the managed branch.
 */
const MANAGED_JOIN_AUTHORIZED: FixtureKey[] = ['admin', 'consultorAssigned', 'gcLeader'];

/** Everyone who may open the page and may not join it. Derived, so it cannot drift. */
const MANAGED_VIEW_NOT_JOIN: FixtureKey[] = VIEWER_PERSONAS.filter(
  (key) => !MANAGED_JOIN_AUTHORIZED.includes(key)
);

/**
 * Nothing meeting-shaped may be in the served document, whoever is looking.
 *
 * A managed session has no raw link to leak from its own row — that is the design — so this
 * is not the same assertion the pasted-link session supports. What it CAN prove is that the
 * page invents none: no Zoom host, no other session's link, and no non-null `meeting_link`
 * anywhere in `__NEXT_DATA__`, into which every prop is serialised.
 */
async function expectNoMeetingCredential(page: Page, where: string): Promise<void> {
  const content = await page.content();
  expect(content, `${where} shipped a Zoom host`).not.toContain('zoom.us');
  expect(content, `${where} shipped another session's raw link`).not.toContain(
    LINKED.meetingLink
  );
  // `meeting_link: null` serialises as `"meeting_link":null`; a string value would open
  // with a quote. This catches a link that reappeared under the same key on any persona.
  expect(content, `${where} serialised a raw meeting_link into the props`).not.toContain(
    '"meeting_link":"'
  );
}

// ---------------------------------------------------------------------------
// May view AND may join — the affordance the whole phase exists to produce.
// ---------------------------------------------------------------------------

for (const key of MANAGED_JOIN_AUTHORIZED) {
  test.describe(`managed interstitial — ${key} (may join)`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, key);
    });

    test('reaches the managed join affordance, and no other join control', async ({ page }) => {
      const response = await page.goto(MANAGED_URL);
      expect(response?.status()).toBe(200);

      await expect(page.getByTestId('meet-join-button')).toBeVisible({ timeout: 30_000 });

      // The three states that would each mean the managed branch was not taken:
      //   meet-join-link      the page fell through to the legacy raw-link control
      //   meet-no-link        it decided from `meeting_link` alone — NULL by design here.
      //                       This is the defect class r26 fixed on five surfaces and r27
      //                       on a sixth, and this is the first assertion that can see it.
      //   meet-join-disabled  §14's flag is off, so the affordance above would be absent
      //                       and every assertion in this block would pass vacuously.
      await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
      await expect(page.getByTestId('meet-no-link')).toHaveCount(0);
      await expect(page.getByTestId('meet-join-disabled')).toHaveCount(0);
      await expect(page.getByTestId('meet-join-denied')).toHaveCount(0);

      await expectNoMeetingCredential(page, `${key}'s managed interstitial`);
    });
  });

  test.describe(`managed join opening — ${key} (may join)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('the §5 opening authorizes them and answers pending, carrying no credential', async () => {
      const response = await api.post(MANAGED_JOIN_API);

      // 200 is the whole point: it means gate 3 (the kill switch) let the request past,
      // gate 4 authorized this persona, and gate 5 found the session still open. A 503
      // here would mean the flag is off; a 403/404 would mean the join list disagrees
      // with the affordance the page just rendered.
      expect(response.status(), `${key} was refused the managed join opening`).toBe(200);

      const body = await response.json();
      // §8: approve enqueues provisioning and the row lands seconds later. Nothing is
      // provisioned in the synthetic tenant, so this is the honest answer — and it is
      // asserted, not tolerated, because `mode: 'link'` would mean a credential appeared
      // out of a tenant that has none.
      expect(body?.data?.mode).toBe('pending');
      expect(body?.data).not.toHaveProperty('join_url');
      expect(body?.data).not.toHaveProperty('dial_in');
      expect(JSON.stringify(body), 'the pending answer carried a Zoom host').not.toContain(
        'zoom.us'
      );
    });
  });
}

// ---------------------------------------------------------------------------
// May view and may NOT join — the case the ruling of 2026-08-06 made consistent
// across providers, now observable on the managed side too.
// ---------------------------------------------------------------------------

for (const key of MANAGED_VIEW_NOT_JOIN) {
  test.describe(`managed interstitial — ${key} (may view, may not join)`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, key);
    });

    test('opens the page and finds no way into the meeting at all', async ({ page }) => {
      // Page visibility is unchanged and must stay so — the refusal removes the way IN,
      // never the page (PLAN.md §5, amended 2026-08-06).
      const response = await page.goto(MANAGED_URL);
      expect(response?.status()).toBe(200);

      const denied = page.getByTestId('meet-join-denied');
      await expect(denied).toBeVisible({ timeout: 30_000 });
      await expect(denied).toHaveText(NOT_AUTHORIZED_MESSAGE);

      await expect(page.getByTestId('meet-join-button')).toHaveCount(0);
      await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
      await expect(page.getByTestId('meet-no-link')).toHaveCount(0);

      // Absent from the document, not merely hidden — the same bar the denied tier is
      // held to.
      await expectNoMeetingCredential(page, `${key}'s refused managed interstitial`);
    });
  });

  test.describe(`managed join opening — ${key} (may view, may not join)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('the §5 opening refuses them too, so the missing button is not cosmetic', async () => {
      // Without this, "no button on the page" would be satisfied by a page that merely
      // failed to render one while the opening behind it still handed out credentials to
      // anyone who posted at it directly.
      const response = await api.post(MANAGED_JOIN_API);
      expect(response.status(), `${key} was let into the managed join opening`).toBe(403);

      const body = await response.json();
      expect(body?.error).toBe(NOT_AUTHORIZED_MESSAGE);
      expect(JSON.stringify(body)).not.toContain('zoom.us');
      expect(JSON.stringify(body)).not.toContain('join_url');
    });
  });
}

// ---------------------------------------------------------------------------
// May not view — the managed session must be as invisible as the other two.
// ---------------------------------------------------------------------------

for (const key of DENIED_PERSONAS) {
  test.describe(`managed interstitial — ${key} (may not view)`, () => {
    test.use({ storageState: storageStatePath(key) });
    test.beforeAll(async ({ browser }) => {
      test.setTimeout(120_000);
      await ensureStorageState(browser, key);
    });

    test('is denied the managed session with 404, and no control of any kind', async ({
      page,
    }) => {
      const response = await page.goto(MANAGED_URL);
      expect(response?.status(), `expected 404 for ${MANAGED.id}`).toBe(404);

      await expect(page.getByTestId('meet-join-button')).toHaveCount(0);
      await expect(page.getByTestId('meet-join-link')).toHaveCount(0);
      await expect(page.getByTestId('meet-no-link')).toHaveCount(0);
      // Not even the refusal panel: they get the 404 page, not the session's.
      await expect(page.getByTestId('meet-join-denied')).toHaveCount(0);
    });
  });
}

test('the managed fixture is actually managed, and the join list is narrower than the view tier', async () => {
  // A guard on the suite itself. `isZoomManaged` is what makes every assertion above address
  // the managed branch; a fixture edit that dropped it would leave this file green while
  // testing the unmanaged path a second time.
  expect(MANAGED.isZoomManaged, 'the managed fixture is not marked managed').toBe(true);
  expect(MANAGED, 'a managed session must carry no raw meeting link').not.toHaveProperty(
    'meetingLink'
  );

  for (const key of MANAGED_JOIN_AUTHORIZED) {
    expect(VIEWER_PERSONAS, `${key} may join a session they cannot view`).toContain(key);
  }
  // If the join list ever widened to the whole viewing tier, every refusal assertion in
  // the middle block would stop being reached while this file still went green.
  expect(
    MANAGED_VIEW_NOT_JOIN.length,
    'no persona can observe the view-but-not-join case on the managed session'
  ).toBeGreaterThan(0);
});
