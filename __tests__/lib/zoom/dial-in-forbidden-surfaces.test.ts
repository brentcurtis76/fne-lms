// @vitest-environment node
/**
 * Z2-4e [G6] — the three surfaces dial-in data may NEVER reach.
 *
 * Ruling 1 opened exactly one door (`POST /api/meet/session/[id]/join`) and closed
 * three others by name:
 *
 *   - notification payloads — persisted in the event log and rendered into e-mail
 *     (chunk Z2-4a invariant 2, `lib/services/session-lifecycle-notifications.ts:28`)
 *   - .ics files — plain-text artifacts that outlive the reader's permissions
 *     (`lib/utils/session-ical.ts:16-20`)
 *   - `public.session_meetings_public` — asserted at schema level in
 *     `supabase/tests/002-zoom-internal-isolation.sql` instead, since it is a column
 *     that must not exist rather than a value that must not appear
 *
 * ## Why the inputs below carry fields their types do not declare
 *
 * Neither builder has a dial-in parameter, so passing well-typed input would prove
 * only that TypeScript compiled — a claim that survives someone spreading a joined
 * `zoom_meetings` row into the call site tomorrow. So each builder is handed the
 * session row WITH the meeting's dial-in fields attached, exactly as an over-broad
 * `select` would deliver them, and asserted to emit none of them. That makes these
 * whitelist tests: they fail the moment either builder starts passing its input
 * through instead of naming the fields it serializes.
 *
 * Synthetic values only, and deliberately distinctive so their absence means
 * something. The numbers are inside Chile's reserved-for-fiction 55xx block.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTriggerNotification } = vi.hoisted(() => ({
  mockTriggerNotification: vi.fn(),
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: mockTriggerNotification },
}));

import { createSessionCalendar } from '../../../lib/utils/session-ical';
import type { ICalSessionInput } from '../../../lib/utils/session-ical';
import { notifySessionLifecycle } from '../../../lib/services/session-lifecycle-notifications';
import type { LifecycleSessionRow } from '../../../lib/services/session-lifecycle-notifications';

const SESSION_ID = '7c9e1a20-3b4c-4d5e-8f60-1a2b3c4d5e6f';
const FACILITATOR_ID = '8d0f2b31-4c5d-4e6f-9071-2b3c4d5e6f70';

/** The three values that must not appear in any artifact produced below. */
const DIAL_IN_NUMBER = '+56 2 5555 0177';
const PASSCODE = 'SYNTHDIALIN0177';
const MEETING_NUMBER = '82000009177';

/** The dial-in columns, shaped as an over-broad `select` would hand them over. */
const leakedMeetingColumns = {
  passcode: PASSCODE,
  zoom_meeting_number: MEETING_NUMBER,
  dial_in_numbers: [
    { country_name: 'Chile', city: 'Santiago', number: DIAL_IN_NUMBER, type: 'toll' },
  ],
};

/** Assert against the SERIALIZED artifact — a field lookup would miss a nested leak. */
function expectNoDialIn(serialized: string) {
  expect(serialized).not.toContain(DIAL_IN_NUMBER);
  expect(serialized).not.toContain(PASSCODE);
  expect(serialized).not.toContain(MEETING_NUMBER);
  expect(serialized).not.toContain('dial_in');
  expect(serialized).not.toContain('5555');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('[G6] .ics files never carry dial-in credentials', () => {
  const session = {
    id: SESSION_ID,
    title: 'Sesión sintética de consultoría',
    description: 'Descripción sintética',
    session_date: '2026-09-15',
    start_time: '09:00',
    end_time: '10:30',
    location: 'Sala sintética',
    join_url: `https://genera.test/meet/session/${SESSION_ID}`,
    status: 'programada' as const,
    created_at: '2026-09-01T12:00:00Z',
    updated_at: '2026-09-01T12:00:00Z',
    school_name: 'Colegio Sintético',
    facilitators: [
      { first_name: 'Ana', last_name: 'Sintética', email: 'ana@sintetico.test' },
    ],
    ...leakedMeetingColumns,
  } as ICalSessionInput;

  it('emits none of them, even with attendees enabled', () => {
    const ics = createSessionCalendar([session], 'Sesiones', { includeAttendees: true }).toString();

    // The .ics is genuinely produced — otherwise the absence proves nothing.
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('Sesión sintética de consultoría');
    expectNoDialIn(ics);
  });

  it('emits none of them on the default, attendee-less path either', () => {
    const ics = createSessionCalendar([session]).toString();

    expect(ics).toContain('BEGIN:VEVENT');
    expectNoDialIn(ics);
  });
});

describe('[G6] notification payloads never carry dial-in credentials', () => {
  /** Minimal service-role stub: one facilitator, no attendees. */
  function clientWithOneFacilitator() {
    return {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            then: (resolve: (v: unknown) => void) =>
              resolve({
                data: table === 'session_facilitators' ? [{ user_id: FACILITATOR_ID }] : [],
                error: null,
              }),
          })),
        })),
      })),
    };
  }

  const session = {
    id: SESSION_ID,
    title: 'Sesión sintética de consultoría',
    session_date: '2026-09-15',
    start_time: '09:00',
    end_time: '10:30',
    meeting_link: 'https://example.test/j/82000009177?pwd=SYNTHDIALIN0177',
    ...leakedMeetingColumns,
  } as LifecycleSessionRow;

  for (const event of ['session_created', 'session_rescheduled', 'session_cancelled'] as const) {
    it(`${event} carries the platform URL and no dial-in field`, async () => {
      await notifySessionLifecycle({
        client: clientWithOneFacilitator() as never,
        session,
        event,
        previous: { session_date: '2026-09-10', start_time: '09:00', end_time: '10:30' },
      });

      expect(mockTriggerNotification).toHaveBeenCalledTimes(1);
      const [emitted, payload] = mockTriggerNotification.mock.calls[0];

      expect(emitted).toBe(event);
      // The payload really was built — the recipient union resolved somebody.
      expect(payload.facilitator_ids).toEqual([FACILITATOR_ID]);
      expect(payload.session.join_url).toContain(`/meet/session/${SESSION_ID}`);
      expectNoDialIn(JSON.stringify(payload));

      mockTriggerNotification.mockClear();
    });
  }
});
