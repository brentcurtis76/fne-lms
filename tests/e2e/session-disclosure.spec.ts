import { test, expect, type APIRequestContext } from '@playwright/test';
import fixtures from '../../scripts/ci/e2e-fixtures.json';
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
 * Z1c-4 adds the question that comes BEFORE disclosure: what a denied caller learns from the
 * denial itself. All six session GETs now answer a byte-identical `sendSessionNotFound()`
 * (lib/utils/session-denials.ts) whether the row is absent or merely not the caller's, and
 * the tier-3 block compares status and raw body across both cases on every one of them. The
 * comparison is paired with a positive control — an authorised caller must still be served —
 * because "every denial matches" is trivially satisfiable by refusing everybody.
 *
 * The sixth consumer, `/api/sessions/[id]/reports/[rid]`, resolves a SECOND id and so carried
 * the oracle twice: report absent vs report-not-yours. `sendReportNotFound()` collapses that
 * pair too, and the report-level block below is what distinguishes the two leaks — a fix that
 * closed only the session half would still let a GC leader enumerate a session's
 * facilitators_only reports by id.
 *
 * This spec is mandatory (scripts/ci/e2e-mandatory.mjs) — it fails the gate if skipped.
 * Requires the seeded local Supabase stack (`node scripts/ci/seed-e2e.mjs`).
 */

const LINKED = E2E_ZOOM.linkedSession;

const DETAIL = `/api/sessions/${LINKED.id}`;
const REPORTS = `/api/sessions/${LINKED.id}/reports`;
const ATTENDEES = `/api/sessions/${LINKED.id}/attendees`;

/**
 * Every consumer this spec drives, so the "must not drift" claim is exercised, not asserted.
 *
 * `/api/sessions/[id]/attendees` was absent through Z1c-2, because the endpoint returned
 * HTTP 500 to every caller on every session: `select('*, profiles(...)')` was an ambiguous
 * embed — `session_attendees` has TWO foreign keys into `profiles`, `user_id` and
 * `marked_by` — so PostgREST answered PGRST201 before it read a row. Z1c-3 fixed that
 * (attendees.ts now names the `user_id` relationship) and the path is back in the set.
 *
 * It earns its place rather than merely occupying it: this endpoint's disclosure branch had
 * never executed in production, so the assertions below are the first thing that has ever
 * confirmed a non-privileged caller does not get attendee addresses out of it. A fix that
 * turned the 500 into a leak would be worse than the 500, and only an e2e assertion can
 * tell the two apart — the unit suite passed throughout (see attendees.test.ts).
 */
const CONSUMERS = [
  { label: 'detail', path: DETAIL },
  { label: 'reports', path: REPORTS },
  { label: 'attendees', path: ATTENDEES },
];

/**
 * Every GET that resolves a session id, including the three the disclosure loop above cannot
 * use: `materials` (nothing seeded, so it proves no disclosure rule), `ical` (answers
 * text/calendar, not the `{ data }` envelope) and `report-detail` (needs a second id, and the
 * one used here is deliberately the RESTRICTED report so the entry doubles as the
 * report-privileged positive control). All still resolve a session id, so all still had the
 * oracle, and the denial comparison below must cover them.
 *
 * `report-detail` was missing from this set through the first Z1c-4 round, which is exactly
 * how a sixth consumer keeps an oracle the other five have closed: it is a member of the
 * consumer set, not a special case bolted on beside it, so every loop over this list now
 * covers it for free — and a seventh will have to be added here or fail visibly.
 */
function consumersFor(sessionId: string, reportId: string = RESTRICTED_REPORT.id) {
  return [
    { label: 'detail', path: `/api/sessions/${sessionId}` },
    { label: 'reports', path: `/api/sessions/${sessionId}/reports` },
    { label: 'materials', path: `/api/sessions/${sessionId}/materials` },
    { label: 'attendees', path: `/api/sessions/${sessionId}/attendees` },
    { label: 'ical', path: `/api/sessions/${sessionId}/ical` },
    { label: 'report-detail', path: `/api/sessions/${sessionId}/reports/${reportId}` },
  ];
}

/** The report-detail path, spelled out where a test needs a specific report id. */
function reportDetailPath(sessionId: string, reportId: string): string {
  return `/api/sessions/${sessionId}/reports/${reportId}`;
}

/**
 * A syntactically valid session id in the fixture namespace that is deliberately never
 * seeded — the "no such session" side of the comparison.
 *
 * It must pass `Validators.isUUID` (api-auth.types.ts:163) or the handlers answer 400 at the
 * door and the comparison would prove nothing about the authorization paths. And it must not
 * collide with anything the seeder writes, or the "absent" case would quietly become a second
 * "exists" case and the whole comparison would pass vacuously — hence the module-load guard.
 */
const ABSENT_SESSION_ID = 'e2e00000-0000-4000-8000-0000000009ff';

if (JSON.stringify(fixtures).includes(ABSENT_SESSION_ID)) {
  throw new Error(
    `[session-disclosure] ABSENT_SESSION_ID ${ABSENT_SESSION_ID} appears in e2e-fixtures.json. ` +
      'It must name a session that is never seeded, or the absent-vs-forbidden comparison ' +
      'compares two existing sessions and proves nothing.'
  );
}

/**
 * The same thing one level down: a valid-but-never-seeded REPORT id, for the report-level
 * half of the oracle. Same two constraints and the same guard — it must satisfy
 * `Validators.isUUID` (the handler rejects the request at :33 otherwise, before any
 * authorization runs) and it must never be seeded, or "absent report" quietly becomes a
 * second "existing report".
 */
const ABSENT_REPORT_ID = 'e2e00000-0000-4000-8000-0000000008ff';

if (JSON.stringify(fixtures).includes(ABSENT_REPORT_ID)) {
  throw new Error(
    `[session-disclosure] ABSENT_REPORT_ID ${ABSENT_REPORT_ID} appears in e2e-fixtures.json. ` +
      'It must name a report that is never seeded, or the absent-vs-forbidden comparison ' +
      'compares two existing reports and proves nothing.'
  );
}

/** The seeded attendees' addresses — what a privileged caller must receive, and nobody else. */
const ATTENDEE_EMAILS = LINKED.attendees.map((a) => E2E_USERS[a.user].email);

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
      const body = await getJson(api, DETAIL);
      const attendees = body.session.attendees ?? [];

      expect(attendees.length).toBeGreaterThan(0);
      expect(attendees.some((a: any) => a.profiles?.first_name)).toBe(true);
      expect(attendees.every((a: any) => a.profiles?.email === undefined)).toBe(true);
    });

    test('the dedicated attendees endpoint redacts the same way the detail GET does', async () => {
      // The half of F1 that matters. Before Z1c-3 this endpoint 500'd, so its
      // `redactProfileEmails` branch had never run against a real PostgREST response — the
      // fix put a previously-dead disclosure path into service. Asserted here directly
      // rather than only through the CONSUMERS loop, because "no addresses" alone would
      // also pass against an endpoint that returned nothing at all.
      const body = await getJson(api, ATTENDEES);
      const attendees = body.attendees ?? [];

      expect(attendees.length).toBe(ATTENDEE_EMAILS.length);
      expect(attendees.some((a: any) => a.profiles?.first_name)).toBe(true);
      expect(attendees.every((a: any) => a.profiles?.email === undefined)).toBe(true);
      expectNoFixtureEmails(body, 'the attendees payload');
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

    test('the dedicated attendees endpoint discloses attendee e-mails', async () => {
      // The privileged control for the redaction assertion in tier 2. Without it, that one
      // would still pass against an endpoint that stripped every address unconditionally —
      // or against one that had gone back to answering 500.
      const body = await getJson(api, ATTENDEES);
      const attendees = body.attendees ?? [];

      expect(attendees.length).toBe(ATTENDEE_EMAILS.length);
      const flat = flatten(body);
      for (const email of ATTENDEE_EMAILS) {
        expect(flat, `the attendees payload withheld ${email} from a privileged caller`).toContain(
          email
        );
      }
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
      for (const { label, path } of consumersFor(LINKED.id)) {
        const response = await api.get(path);
        // 404, not 403 — see the byte-identical comparison below.
        expect(response.status(), `${label} should refuse ${key}`).toBe(404);

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

    test('cannot tell an inaccessible session from one that does not exist', async () => {
      // The oracle itself. Before commit 1 these five answered 403 for a session that
      // exists-but-is-not-yours and 404 for an absent id, so the status code alone let an
      // unauthorised caller enumerate which sessions exist — across every school and
      // community in the tenant, not just their own.
      //
      // Raw text is compared rather than parsed objects on purpose: two bodies that parse
      // to equal objects but differ in key order or whitespace are still distinguishable
      // by anyone reading the socket, and that is all an oracle needs.
      for (const { label, path } of consumersFor(LINKED.id)) {
        const absentPath = consumersFor(ABSENT_SESSION_ID).find((c) => c.label === label)!.path;

        const [forbidden, absent] = await Promise.all([api.get(path), api.get(absentPath)]);
        const [forbiddenBody, absentBody] = await Promise.all([
          forbidden.text(),
          absent.text(),
        ]);

        expect(
          forbidden.status(),
          `${label}: an inaccessible session answered ${key} with a different status than an absent one`
        ).toBe(absent.status());

        expect(
          forbiddenBody,
          `${label}: an inaccessible session answered ${key} with a different body than an absent one`
        ).toBe(absentBody);

        // Neither response may carry session, participant, report or material data.
        // Whole-payload sweep, not key-presence: a leak under an unexpected key still leaks.
        for (const [which, body] of [
          ['forbidden', forbiddenBody],
          ['absent', absentBody],
        ] as const) {
          expectNoFixtureEmails(body, `the ${label} ${which} denial`);
          expect(body, `${label} ${which} denial leaked the raw meeting link`).not.toContain(
            LINKED.meetingLink
          );
          expect(body, `${label} ${which} denial leaked a report id`).not.toContain(
            RESTRICTED_REPORT.id
          );
          expect(body, `${label} ${which} denial leaked a report id`).not.toContain(
            OPEN_REPORT.id
          );
          expect(body, `${label} ${which} denial leaked the session title`).not.toContain(
            LINKED.title
          );
        }
      }
    });

    test('the report detail endpoint denies exactly as the other five do', async () => {
      // The leak must not reappear as "this endpoint denies differently". The comparison
      // above is per-label — each consumer against its own absent-session counterpart — so
      // it would still pass if report-detail answered a distinct-but-self-consistent
      // denial. This one is cross-label: the sixth consumer's refusal must be the SAME
      // bytes the detail GET returns, or the pair of them is itself the oracle.
      const [detail, reportDetail] = await Promise.all([
        api.get(DETAIL),
        api.get(reportDetailPath(LINKED.id, RESTRICTED_REPORT.id)),
      ]);
      const [detailBody, reportDetailBody] = await Promise.all([
        detail.text(),
        reportDetail.text(),
      ]);

      expect(
        reportDetail.status(),
        `report-detail refused ${key} with a different status than the detail GET`
      ).toBe(detail.status());
      expect(
        reportDetailBody,
        `report-detail refused ${key} with a different body than the detail GET`
      ).toBe(detailBody);
    });

    test('cannot tell a real report from an absent one on an inaccessible session', async () => {
      // The report-level half of the leak, for a caller who fails at SESSION level. Before
      // this commit the endpoint fetched the report BEFORE checking canViewSession, so a
      // real report id answered 403 'Acceso denegado a esta sesión' while an absent one
      // answered 404 'Informe no encontrado' — a caller who may not open the session at all
      // could still enumerate its reports. The ordering fix is what this asserts.
      const [real, absent] = await Promise.all([
        api.get(reportDetailPath(LINKED.id, RESTRICTED_REPORT.id)),
        api.get(reportDetailPath(LINKED.id, ABSENT_REPORT_ID)),
      ]);
      const [realBody, absentBody] = await Promise.all([real.text(), absent.text()]);

      expect(
        real.status(),
        `a real report answered ${key} with a different status than an absent one`
      ).toBe(absent.status());
      expect(
        realBody,
        `a real report answered ${key} with a different body than an absent one`
      ).toBe(absentBody);

      for (const [which, body] of [
        ['real', realBody],
        ['absent', absentBody],
      ] as const) {
        expectNoFixtureEmails(body, `the report-detail ${which} denial`);
        expect(body, `report-detail ${which} denial leaked a report id`).not.toContain(
          RESTRICTED_REPORT.id
        );
      }
    });
  });
}

// ---------------------------------------------------------------------------
// The report-level oracle, on the persona that can actually observe it.
//
// gcLeader passes canViewSession, so the session-level denial never fires for
// them — they reach the visibility check, and before this commit were told
// `403 'Acceso denegado a este informe'` for a facilitators_only report versus
// `404 'Informe no encontrado'` for an id that does not exist. That difference
// let any growth-community member enumerate the restricted reports of every
// session they may open, which is the content the narrow rule exists to
// withhold in the first place.
// ---------------------------------------------------------------------------

for (const key of VIEW_ONLY_PERSONAS) {
  test.describe(`report-detail denial — ${key} (may view the session, not the report)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('cannot tell a restricted report from one that does not exist', async () => {
      const [restricted, absent] = await Promise.all([
        api.get(reportDetailPath(LINKED.id, RESTRICTED_REPORT.id)),
        api.get(reportDetailPath(LINKED.id, ABSENT_REPORT_ID)),
      ]);
      const [restrictedBody, absentBody] = await Promise.all([
        restricted.text(),
        absent.text(),
      ]);

      expect(
        restricted.status(),
        `a restricted report answered ${key} with a different status than an absent one`
      ).toBe(absent.status());
      expect(
        restrictedBody,
        `a restricted report answered ${key} with a different body than an absent one`
      ).toBe(absentBody);

      // And nothing about the report leaks through either denial.
      for (const [which, body] of [
        ['restricted', restrictedBody],
        ['absent', absentBody],
      ] as const) {
        expectNoFixtureEmails(body, `the report-detail ${which} denial`);
        expect(body, `report-detail ${which} denial leaked a report id`).not.toContain(
          RESTRICTED_REPORT.id
        );
        expect(body, `report-detail ${which} denial leaked the session title`).not.toContain(
          LINKED.title
        );
      }
    });

    test('still receives the all_participants report through the same endpoint', async () => {
      // The positive control WITHOUT which the comparison above is satisfied by an endpoint
      // that answers 404 to gcLeader for every report id. This persona must still be served
      // the open report — the narrow rule withholds facilitators_only content, not the
      // endpoint.
      const body = await getJson(api, reportDetailPath(LINKED.id, OPEN_REPORT.id));

      expect(body.report?.id).toBe(OPEN_REPORT.id);
      expect(body.report?.visibility).toBe('all_participants');
      expect(body.report?.content).toBeTruthy();
      // Tier-2 disclosure still applies on the way out: no author address.
      expectNoFixtureEmails(body, 'the report-detail payload');
    });
  });
}

// ---------------------------------------------------------------------------
// The positive control for the comparison above.
//
// Without it every assertion in this file's tier-3 block would pass just as
// happily against five endpoints that had been changed to answer 404 to
// everybody — which is precisely the failure mode of "make the denials match".
// ---------------------------------------------------------------------------

for (const key of REPORT_PRIVILEGED_PERSONAS) {
  test.describe(`disclosure — ${key} (still served after the denials were unified)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('receives a real payload from all six consumers', async () => {
      for (const { label, path } of consumersFor(LINKED.id)) {
        const response = await api.get(path);
        expect(response.status(), `${label} refused an authorised caller`).toBe(200);
      }

      // Not merely 200 — the real thing. Each consumer is checked against content only an
      // authorised caller can obtain, so a stubbed-out 200 would not satisfy this.
      const detail = await getJson(api, DETAIL);
      expect(detail.session.id).toBe(LINKED.id);
      expect(detail.session.meeting_link).toBe(LINKED.meetingLink);

      const reports = await getJson(api, REPORTS);
      const reportIds = (reports.reports ?? []).map((r: { id: string }) => r.id);
      expect(reportIds).toContain(RESTRICTED_REPORT.id);

      const attendees = await getJson(api, ATTENDEES);
      expect((attendees.attendees ?? []).length).toBe(ATTENDEE_EMAILS.length);

      // The report-detail control. Not merely 200: the RESTRICTED report, by id, with its
      // content — the exact thing withheld from gcLeader two blocks up. Without this, the
      // report-level comparisons there would pass just as happily against an endpoint that
      // had been "fixed" by 404ing every facilitators_only report for everybody.
      const restricted = await getJson(
        api,
        reportDetailPath(LINKED.id, RESTRICTED_REPORT.id)
      );
      expect(restricted.report?.id).toBe(RESTRICTED_REPORT.id);
      expect(restricted.report?.visibility).toBe('facilitators_only');
      expect(restricted.report?.content).toBeTruthy();

      // And an absent REPORT id still answers not-found for this same authorised caller, so
      // the report 404s above are a property of the report, not of the persona.
      const absentReport = await api.get(reportDetailPath(LINKED.id, ABSENT_REPORT_ID));
      expect(absentReport.status()).toBe(404);

      // iCal answers text/calendar, so it is asserted on its own terms.
      const ical = await api.get(`/api/sessions/${LINKED.id}/ical`);
      const icalBody = await ical.text();
      expect(icalBody).toContain('BEGIN:VCALENDAR');
      expect(icalBody).toContain(LINKED.title);

      // And the absent id still answers not-found for this same authorised caller — so the
      // 404s above are a property of the session, not of the persona.
      const absent = await api.get(`/api/sessions/${ABSENT_SESSION_ID}`);
      expect(absent.status()).toBe(404);
    });
  });
}
