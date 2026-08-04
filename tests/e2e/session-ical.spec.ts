import { test, expect, type APIRequestContext } from '@playwright/test';
import { E2E_USERS, E2E_ZOOM, apiContextFor, type FixtureKey } from './helpers/auth';
import { PRIVILEGED_PERSONAS, VIEW_ONLY_PERSONAS } from './helpers/session-personas';

/**
 * Z1c-2 — .ics content, per persona.
 *
 * An .ics is the worst artifact to get wrong: it is plain text, it leaves the platform in
 * a mail attachment or a calendar sync, and nothing re-checks the reader's permissions when
 * it is opened days later. So two things have to hold in the bytes themselves — not merely
 * in the endpoint's status code.
 *
 *   1. The raw meeting link never ships. Callers get the absolute `/meet/session/{id}`
 *      platform URL instead, so authorization happens when that page is opened.
 *   2. ATTENDEE carries `MAILTO:` addresses, so it follows the participant-e-mail rule:
 *      present for privileged callers, absent entirely for everyone else. A mailto-less
 *      ATTENDEE is not useful iCal, so the entries are omitted rather than stripped down.
 *
 * VTIMEZONE is asserted too. Without the component a strict client has to guess Chile's
 * UTC offset for the event date, and DST transitions land the meeting an hour off — a
 * correctness property of the same generator, cheap to pin while we are reading the bytes.
 *
 * Defends:
 *   pages/api/sessions/[id]/ical.ts:91      canViewSession gates the file at all
 *   pages/api/sessions/[id]/ical.ts:95-97   canViewParticipantEmails gates ATTENDEE
 *   pages/api/sessions/[id]/ical.ts:109-112 platform join_url, never the raw link
 *   pages/api/sessions/ical.ts:182          the batch equivalent, gated PER ROW
 *   lib/utils/session-ical.ts:188-191       VTIMEZONE generator, not a bare TZID
 *   lib/utils/session-ical.ts:222-232       attendees serialized only when allowed
 *
 * This spec is mandatory (scripts/ci/e2e-mandatory.mjs) — it fails the gate if skipped.
 * Requires the seeded local Supabase stack (`node scripts/ci/seed-e2e.mjs`).
 */

const LINKED = E2E_ZOOM.linkedSession;
const DETAIL_ICAL = `/api/sessions/${LINKED.id}/ical`;
/** The batch export, scoped to the fixture community so only seeded rows are in range. */
const BATCH_ICAL = `/api/sessions/ical?growth_community_id=${E2E_ZOOM.community.id}`;

const FACILITATOR_KEY = LINKED.facilitators[0].user as FixtureKey;
const FACILITATOR_EMAIL = E2E_USERS[FACILITATOR_KEY].email;
const FIXTURE_EMAILS = Object.values(E2E_USERS).map((u) => u.email);

const JOIN_PATH = `/meet/session/${LINKED.id}`;

test.setTimeout(120_000);

async function getCalendar(api: APIRequestContext, path: string): Promise<string> {
  const response = await api.get(path);
  expect(response.status(), `GET ${path} status`).toBe(200);
  expect(response.headers()['content-type']).toContain('text/calendar');
  return response.text();
}

/** Assertions that hold for EVERY caller who gets a calendar at all. */
function expectCommonCalendarInvariants(ics: string, where: string): void {
  expect(ics, `${where} is not a calendar`).toContain('BEGIN:VCALENDAR');
  // The VTIMEZONE component itself, not just a TZID parameter.
  expect(ics, `${where} has no VTIMEZONE component`).toContain('BEGIN:VTIMEZONE');
  expect(ics, `${where} names the wrong zone`).toContain('America/Santiago');
  // The credential-shaped value, in a file that outlives the permission check.
  expect(ics, `${where} shipped the raw meeting link`).not.toContain(LINKED.meetingLink);
  expect(ics, `${where} shipped the raw meeting host`).not.toContain('meet.example.net');
}

for (const key of PRIVILEGED_PERSONAS) {
  test.describe(`ical — ${key} (privileged)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('gets a platform link, VTIMEZONE, and ATTENDEE e-mails', async () => {
      const ics = await getCalendar(api, DETAIL_ICAL);
      expectCommonCalendarInvariants(ics, `${key}'s single-session .ics`);

      expect(ics, 'no platform join URL').toContain(JOIN_PATH);
      // The positive control for the redaction assertions in the non-privileged block:
      // without it, "no ATTENDEE" would also pass against a generator that never emits any.
      expect(ics).toContain('ATTENDEE');
      expect(ics).toContain(FACILITATOR_EMAIL);
    });

    test('the batch export carries the same disclosure', async () => {
      const ics = await getCalendar(api, BATCH_ICAL);
      expectCommonCalendarInvariants(ics, `${key}'s batch .ics`);
      expect(ics).toContain(JOIN_PATH);
      expect(ics).toContain(FACILITATOR_EMAIL);
    });
  });
}

for (const key of VIEW_ONLY_PERSONAS) {
  test.describe(`ical — ${key} (may view, not privileged)`, () => {
    let api: APIRequestContext;

    test.beforeAll(async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      api = await apiContextFor(browser, key, baseURL!);
    });
    test.afterAll(async () => {
      await api?.dispose();
    });

    test('gets a usable calendar with no ATTENDEE and no addresses', async () => {
      const ics = await getCalendar(api, DETAIL_ICAL);
      expectCommonCalendarInvariants(ics, `${key}'s single-session .ics`);

      // Still usable: the event and the way in are both there, only the addresses are not.
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics, 'no platform join URL').toContain(JOIN_PATH);

      expect(ics, 'ATTENDEE was serialized for a non-privileged caller').not.toContain(
        'ATTENDEE'
      );
      for (const email of FIXTURE_EMAILS) {
        expect(ics, `.ics leaked ${email}`).not.toContain(email);
      }
      expect(ics, '.ics leaked a MAILTO').not.toContain('MAILTO:');
    });

    test('the batch export redacts per row, not per request', async () => {
      const ics = await getCalendar(api, BATCH_ICAL);
      expectCommonCalendarInvariants(ics, `${key}'s batch .ics`);
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).not.toContain('ATTENDEE');
      for (const email of FIXTURE_EMAILS) {
        expect(ics, `batch .ics leaked ${email}`).not.toContain(email);
      }
    });
  });
}
