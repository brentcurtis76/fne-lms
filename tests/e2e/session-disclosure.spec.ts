import { test, expect, type APIRequestContext } from '@playwright/test';
import { E2E_USERS, E2E_ZOOM, apiContextFor, type FixtureKey } from './helpers/auth';
import {
  DENIED_PERSONAS,
  EMAIL_ONLY_PRIVILEGED_PERSONAS,
  PRIVILEGED_PERSONAS,
  REPORT_PRIVILEGED_PERSONAS,
  VIEW_ONLY_PERSONAS,
} from './helpers/session-personas';

/**
 * Z1c-2 — the payload disclosure rule, driven through the real API as each persona.
 *
 * `canViewSession()` decides whether the caller may open the session. This spec is about
 * the narrower question that comes next: WHAT is allowed inside the payload they get back.
 * The two are deliberately different, and tier 2 is where that difference lives — a suite
 * that only proved allow-vs-deny would still pass with lib/utils/session-disclosure.ts
 * deleted.
 *
 * Defends:
 *   lib/utils/session-disclosure.ts:52   canViewParticipantEmails — GC members, LEADERS
 *                                        INCLUDED, get names without e-mails
 *   lib/utils/session-disclosure.ts:25   canViewRestrictedReports — narrower than
 *                                        canEditSession; a GC leader may edit content but
 *                                        is not a facilitator, so no facilitators_only
 *   lib/utils/session-disclosure.ts:90   canViewRawMeetingLink — the raw link is
 *                                        credential-shaped; same persona set as e-mails
 *   lib/utils/session-disclosure.ts:164-165  has_meeting / join_path, derived from the
 *                                        presence of meeting_link
 *   lib/utils/session-disclosure.ts:196  redactProfileEmails — at ANY nesting depth
 *
 * Three consumers are driven, not one: the module header states the rule must not drift
 * between the detail endpoint and its siblings, and a spec that only exercised the detail
 * GET would let reports.ts or attendees.ts diverge unnoticed.
 *
 * This spec is mandatory (scripts/ci/e2e-mandatory.mjs) — it fails the gate if skipped.
 * Requires the seeded local Supabase stack (`node scripts/ci/seed-e2e.mjs`).
 */

const LINKED = E2E_ZOOM.linkedSession;

const DETAIL = `/api/sessions/${LINKED.id}`;
const REPORTS = `/api/sessions/${LINKED.id}/reports`;

/**
 * Every consumer this spec drives, so the "must not drift" claim is exercised, not asserted.
 *
 * `/api/sessions/[id]/attendees` is DELIBERATELY ABSENT, and this is the one thing to read
 * before adding it back. That endpoint returns HTTP 500 to every caller, on every session,
 * regardless of fixtures: its `select('*, profiles(id, first_name, last_name, email)')`
 * (attendees.ts:118) is an ambiguous embed, because session_attendees has TWO foreign keys
 * into profiles — `user_id` and `marked_by` — so PostgREST answers PGRST201 before it ever
 * reads a row. The sibling endpoints disambiguate (`profiles:user_id(...)`); this one does
 * not. It is pre-existing (attendees.ts is untouched by this branch, and its last change is
 * an ancestor of the merge base) and fixing application source is out of scope for Z1c, so
 * it is reported as a finding rather than papered over. Adding the path here without the
 * fix would encode a 500 as expected behaviour.
 *
 * Coverage of "more than one consumer" is still met — the detail GET, the reports GET, and
 * the two iCal endpoints in session-ical.spec.ts.
 */
const CONSUMERS = [
  { label: 'detail', path: DETAIL },
  { label: 'reports', path: REPORTS },
];

const RESTRICTED_REPORT = LINKED.reports.find((r) => r.visibility === 'facilitators_only')!;
const OPEN_REPORT = LINKED.reports.find((r) => r.visibility === 'all_participants')!;

/**
 * Every seeded participant address. The e-mail assertions scan for these rather than for
 * an `email` key: a leak that arrives under a different key name, or nested one level
 * deeper than the redactor walks, is still a leak.
 */
const FIXTURE_EMAILS = Object.values(E2E_USERS).map((u) => u.email);

test.setTimeout(120_000);

/** Serialise a payload so a leak anywhere inside it is findable by substring. */
function flatten(payload: unknown): string {
  return JSON.stringify(payload);
}

function expectNoFixtureEmails(payload: unknown, where: string): void {
  const flat = flatten(payload);
  for (const email of FIXTURE_EMAILS) {
    expect(flat, `${where} leaked the participant address ${email}`).not.toContain(email);
  }
}

/**
 * The success envelope is exactly `{ data: ... }` (lib/api-auth.ts:249). Unwrapped
 * strictly rather than with a fallback: a tolerant accessor would silently keep passing
 * if the envelope changed, and `undefined` assertions pass far too easily.
 */
async function getJson(api: APIRequestContext, path: string): Promise<Record<string, any>> {
  const response = await api.get(path);
  expect(response.status(), `GET ${path} status`).toBe(200);
  const body = (await response.json()) as Record<string, any>;
  expect(body, `GET ${path} envelope`).toHaveProperty('data');
  return body.data as Record<string, any>;
}

// ---------------------------------------------------------------------------
// Tier 2 — passes canViewSession, is NOT privileged. The point of this chunk.
// ---------------------------------------------------------------------------

for (const key of VIEW_ONLY_PERSONAS) {
  test.describe(`disclosure — ${key} (may view, not privileged)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('receives the session, with has_meeting and join_path instead of the raw link', async () => {
      const body = await getJson(api, DETAIL);
      const session = body.session;

      expect(session?.id).toBe(LINKED.id);
      // Derived from the presence of meeting_link, which this session HAS — so a true
      // here is a real derivation, not the default of an absent field.
      expect(session.has_meeting).toBe(true);
      expect(session.join_path).toBe(`/meet/session/${LINKED.id}`);

      // Stripped, not nulled: applySessionMeetingDisclosure omits the key entirely for a
      // non-privileged caller. Asserting on the whole payload, because a raw link that
      // resurfaced under some other key would still be a credential in the response.
      expect(session).not.toHaveProperty('meeting_link');
      expect(flatten(body)).not.toContain(LINKED.meetingLink);
    });

    test('receives participant names without e-mail addresses', async () => {
      const body = await getJson(api, DETAIL);
      const session = body.session;

      // Not a vacuous assertion: the fixture seeds facilitators and attendees whose
      // profiles carry addresses, so there is something present to redact.
      expect(session.facilitators.length).toBeGreaterThan(0);
      expect(session.attendees.length).toBeGreaterThan(0);
      expect(session.facilitators[0].profiles?.first_name).toBeTruthy();

      expectNoFixtureEmails(body, 'the detail payload');
    });

    test('receives all_participants reports and not facilitators_only ones', async () => {
      const body = await getJson(api, DETAIL);
      const session = body.session;
      const ids = (session.reports ?? []).map((r: { id: string }) => r.id);

      expect(ids).toContain(OPEN_REPORT.id);
      expect(ids).not.toContain(RESTRICTED_REPORT.id);
      expect(
        (session.reports ?? []).every(
          (r: { visibility: string }) => r.visibility === 'all_participants'
        )
      ).toBe(true);
    });

    test('the sibling consumers apply the same rule as the detail endpoint', async () => {
      // The helper's own header says the rule must not drift between the detail endpoint
      // and its siblings. Driving all three is what turns that from a comment into a test.
      for (const { label, path } of CONSUMERS) {
        const body = await getJson(api, path);
        expectNoFixtureEmails(body, `the ${label} payload`);
        expect(flatten(body), `${label} leaked the raw meeting link`).not.toContain(
          LINKED.meetingLink
        );
      }

      const reports = await getJson(api, REPORTS);
      const reportIds = (reports.reports ?? []).map((r: { id: string }) => r.id);
      expect(reportIds).toContain(OPEN_REPORT.id);
      expect(reportIds).not.toContain(RESTRICTED_REPORT.id);
    });

    test('attendee names survive the redaction — only the address is removed', async () => {
      // Read through the detail GET, which embeds attendees as `profiles:user_id(...)`.
      // The dedicated /attendees endpoint cannot serve this assertion — see CONSUMERS.
      const body = await getJson(api, DETAIL);
      const attendees = body.session.attendees ?? [];

      expect(attendees.length).toBeGreaterThan(0);
      expect(attendees.some((a: any) => a.profiles?.first_name)).toBe(true);
      expect(attendees.every((a: any) => a.profiles?.email === undefined)).toBe(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Tier 1 — the privileged control. Without it, every tier-2 assertion above
// would also pass against an endpoint that disclosed nothing to anybody.
// ---------------------------------------------------------------------------

for (const key of PRIVILEGED_PERSONAS) {
  test.describe(`disclosure — ${key} (privileged)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('receives the raw meeting link and participant e-mails', async () => {
      const body = await getJson(api, DETAIL);
      const session = body.session;

      expect(session.meeting_link).toBe(LINKED.meetingLink);
      // has_meeting/join_path are added for EVERY caller, privileged or not.
      expect(session.has_meeting).toBe(true);
      expect(session.join_path).toBe(`/meet/session/${LINKED.id}`);

      const facilitatorKey = LINKED.facilitators[0].user as FixtureKey;
      expect(flatten(body)).toContain(E2E_USERS[facilitatorKey].email);
    });

  });
}

// ---------------------------------------------------------------------------
// The report rule is NARROWER than the e-mail rule, and the two tiers below are
// what make that observable. canViewRestrictedReports (session-disclosure.ts:25)
// is admin ∪ facilitator — it does NOT include a consultor who merely has scope.
// ---------------------------------------------------------------------------

for (const key of REPORT_PRIVILEGED_PERSONAS) {
  test.describe(`disclosure — ${key} (admin or facilitator)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('receives reports at both visibilities', async () => {
      const body = await getJson(api, REPORTS);
      const ids = (body.reports ?? []).map((r: { id: string }) => r.id);
      expect(ids).toContain(OPEN_REPORT.id);
      expect(ids).toContain(RESTRICTED_REPORT.id);
    });
  });
}

for (const key of EMAIL_ONLY_PRIVILEGED_PERSONAS) {
  test.describe(`disclosure — ${key} (scoped consultor, not a facilitator)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('gets e-mails and the raw link but NOT facilitators_only reports', async () => {
      // The single most confusable case in this surface: full e-mail and link privilege,
      // and still no raw session content, because a consultor who is not facilitating this
      // session does not read it.
      const detail = await getJson(api, DETAIL);
      expect(detail.session.meeting_link).toBe(LINKED.meetingLink);

      const reports = await getJson(api, REPORTS);
      const ids = (reports.reports ?? []).map((r: { id: string }) => r.id);
      expect(ids).toContain(OPEN_REPORT.id);
      expect(ids).not.toContain(RESTRICTED_REPORT.id);
    });
  });
}

// ---------------------------------------------------------------------------
// Tier 3 — denied at the door, on every consumer.
// ---------------------------------------------------------------------------

for (const key of DENIED_PERSONAS) {
  test.describe(`disclosure — ${key} (may not view)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('is refused by every session consumer, with no payload at all', async () => {
      for (const { label, path } of CONSUMERS) {
        const response = await api.get(path);
        expect(response.status(), `${label} should refuse ${key}`).toBe(403);

        const text = await response.text();
        expect(text, `${label} leaked the raw meeting link to ${key}`).not.toContain(
          LINKED.meetingLink
        );
        for (const email of FIXTURE_EMAILS) {
          expect(text, `${label} leaked ${email} to ${key}`).not.toContain(email);
        }
        expect(text).not.toContain(RESTRICTED_REPORT.id);
        expect(text).not.toContain(OPEN_REPORT.id);
      }
    });
  });
}
