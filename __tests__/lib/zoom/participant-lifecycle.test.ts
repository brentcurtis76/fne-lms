// @vitest-environment node
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  applyParticipantEvent,
  isParticipantEventType,
  PARTICIPANT_EVENT_TYPES,
} from '../../../lib/zoom/participant-lifecycle';
import { LIFECYCLE_EVENT_TYPES } from '../../../lib/zoom/webhook-lifecycle';
import type {
  AttendanceIntervalInsert,
  AttendanceSurface,
  LeaveApplication,
  LeaveApplyOutcome,
  ZoomAttendanceStore,
} from '../../../lib/zoom/attendance-store';
import type { AttendeeCandidate } from '../../../lib/zoom/attendance-identity';

/**
 * Participant ingestion under the §15.3.9 contract — the falsification matrix IS the
 * criteria (`Z7-r5` §4).
 *
 * Every fixture value here is read from the committed Z0B captures. The two participant
 * captures are **two different people** — different `customer_key`, different `user_name`
 * — so they are NOT a joined→left pair and nothing about pairing is inferred from them.
 * Where a history needs constructed events (homonyms, uuid-less joins, downgraded
 * leaves), this file builds them by value and says so at the call site.
 *
 * The store double is faithful, not generous: it models both partial unique indexes,
 * and its `applyLeave` reproduces `zoom_internal.apply_participant_leave`'s semantics —
 * the §15.3.9 close decision (uuid matching exactly one open row, instant not preceding
 * the join) and the observation recorded ATOMICALLY with any close, keyed UNIQUE on the
 * delivery. The decision-to-write section is synchronous, exactly as Postgres commits
 * the function's single transaction, which is what makes the concurrency probes below
 * meaningful rather than tests of the double's scheduling. The REAL function's
 * transaction boundary is asserted in pgTAP 011 (a pre-seeded observation key makes the
 * close roll back), which this suite cross-references rather than duplicates.
 */

const FIXTURE_DIR = path.join(process.cwd(), '__tests__/lib/zoom/fixtures/webhooks');

const HOST_PROFILE = '47d97a10-7c8f-4c34-8519-b4c77ed439d9';
const OCCURRENCE = 'de+IDqR9f3hhT9D8/NA/J1==';
const HOST_PARTICIPANT_UUID = '364B3A17-05C0-6B63-F4FA-2180DCC26971';
const GUEST_PARTICIPANT_UUID = '73823734-9301-A7E5-36F4-684DEEF79FE5';

const SURFACE: AttendanceSurface = {
  surfaceType: 'consultor_session',
  surfaceId: 'a7a7a7a7-0000-0000-0000-000000000001',
  schoolId: 9901,
  zoomMeetingUuid: OCCURRENCE,
};

interface ZoomBody {
  event?: string;
  event_ts?: unknown;
  payload?: { object?: Record<string, unknown> };
}

function loadBody(file: string): ZoomBody {
  const fixture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as {
    rawBody: string;
  };
  return JSON.parse(fixture.rawBody) as ZoomBody;
}

/** Builds a participant event object by value, for the constructed histories. */
function participantObject(participant: Record<string, unknown>): Record<string, unknown> {
  return { uuid: OCCURRENCE, id: '86084701483', participant };
}

interface SeedRow {
  id: string;
  joinedAt: string;
  leftAt: string | null;
  participantUuid?: string | null;
  identityTokens?: string[];
  sourceEventKey?: string | null;
}

interface DoubleOptions {
  surface?: AttendanceSurface | null;
  surfaceByNumber?: AttendanceSurface | null;
  existingProfiles?: string[];
  profilesByEmail?: Record<string, string>;
  expectedAttendees?: AttendeeCandidate[];
  rows?: SeedRow[];
  barrier?: Promise<void>;
}

interface RecordedObservation extends LeaveApplication {
  outcome: Exclude<LeaveApplyOutcome, 'observation_duplicate' | 'occurrence_mismatch'>;
}

/**
 * Models both partial unique indexes and the one-transaction leave applier.
 *
 * `applyLeave` is the double of `zoom_internal.apply_participant_leave`: the delivery
 * key is checked against the recorded observations FIRST (the in-memory equivalent of
 * the INSERT conflict rolling the whole body back), then the §15.3.9 rule runs —
 * close only via participant_uuid matching exactly ONE open row whose join the instant
 * does not precede — and the observation is recorded with the decided outcome. All of
 * it synchronous, as one transaction.
 */
function storeDouble(options: DoubleOptions = {}) {
  const inserted: AttendanceIntervalInsert[] = [];
  const rows: (SeedRow & { zoomMeetingUuid?: string })[] = [...(options.rows ?? [])];
  const closes: { id: string; leftAt: string }[] = [];
  const observations: RecordedObservation[] = [];
  const leaveCalls: LeaveApplication[] = [];
  /** Lets a test interleave two appliers at a chosen point. */
  const gate: { barrier: Promise<void> | null } = { barrier: options.barrier ?? null };

  const store: ZoomAttendanceStore = {
    findSurfaceByOccurrence: vi.fn(async () =>
      options.surface === undefined ? SURFACE : options.surface
    ),
    findSurfaceByMeetingNumber: vi.fn(async () => options.surfaceByNumber ?? null),
    profileExists: vi.fn(async (id: string) =>
      (options.existingProfiles ?? [HOST_PROFILE]).includes(id)
    ),
    findProfileIdByEmail: vi.fn(
      async (email: string) => (options.profilesByEmail ?? {})[email.toLowerCase()] ?? null
    ),
    listExpectedAttendees: vi.fn(async () => options.expectedAttendees ?? []),
    insertInterval: vi.fn(async (row: AttendanceIntervalInsert) => {
      if (gate.barrier) await gate.barrier;
      // From here to the push is SYNCHRONOUS — one statement, as Postgres resolves it.
      // (zoom_meeting_uuid, participant_uuid, joined_at) WHERE participant_uuid IS NOT
      // NULL — widened by joined_at so a genuine rejoin reusing the uuid is a NEW row
      // while a redelivery of the same join still collides:
      if (
        row.participantUuid !== null &&
        rows.some(
          (existing) =>
            existing.participantUuid === row.participantUuid &&
            existing.joinedAt === row.joinedAt
        )
      ) {
        return 'duplicate' as const;
      }
      // source_event_key WHERE source_event_key IS NOT NULL — the delivery-level index
      // that covers the uuid-less case a read-then-insert could not.
      if (
        row.sourceEventKey !== null &&
        rows.some((existing) => existing.sourceEventKey === row.sourceEventKey)
      ) {
        return 'duplicate' as const;
      }
      inserted.push(row);
      rows.push({
        id: `row-${rows.length + 1}`,
        joinedAt: row.joinedAt,
        leftAt: null,
        participantUuid: row.participantUuid,
        identityTokens: row.identityTokens,
        sourceEventKey: row.sourceEventKey,
        zoomMeetingUuid: row.zoomMeetingUuid,
      });
      return 'inserted' as const;
    }),
    applyLeave: vi.fn(async (leave: LeaveApplication) => {
      leaveCalls.push(leave);
      if (gate.barrier) await gate.barrier;
      // SYNCHRONOUS from here — the double of the function's single transaction.
      //
      // The observation's UNIQUE source_event_key: a second application of the same
      // delivery does NOTHING AT ALL — in SQL the INSERT conflict rolls back any close
      // the losing call performed; here the check runs first, which is the same
      // one-transaction semantics in a single-threaded double.
      if (observations.some((o) => o.sourceEventKey === leave.sourceEventKey)) {
        return 'observation_duplicate' as const;
      }

      let outcome: RecordedObservation['outcome'];
      if (leave.observedAt === null) {
        outcome = 'no_instant';
      } else if (leave.participantUuid === null) {
        outcome = 'unpairable_leave';
      } else {
        const open = rows.filter(
          (row) => row.leftAt === null && row.participantUuid === leave.participantUuid
        );
        if (
          open.length === 1 &&
          Date.parse(leave.observedAt) >= Date.parse(open[0].joinedAt)
        ) {
          open[0].leftAt = leave.observedAt;
          closes.push({ id: open[0].id, leftAt: leave.observedAt });
          outcome = 'interval_closed';
        } else {
          // Zero or more than one: §15.3.9 rule 3 closes nothing either way. A leave
          // preceding the single open join lands here too.
          outcome = 'no_open_interval';
        }
      }
      observations.push({ ...leave, outcome });
      return outcome;
    }),
  };

  return { store, inserted, rows, closes, observations, leaveCalls };
}

let uniqueKey = 0;
function nextKey(): string {
  uniqueKey += 1;
  return `sha256-delivery-${uniqueKey}`;
}

describe('the participant event set is SEPARATE from the lifecycle set', () => {
  it('names exactly the two participant events', () => {
    expect(PARTICIPANT_EVENT_TYPES).toEqual([
      'meeting.participant_joined',
      'meeting.participant_left',
    ]);
  });

  it('shares no member with LIFECYCLE_EVENT_TYPES — those move a STATUS, these do not', () => {
    const overlap = (PARTICIPANT_EVENT_TYPES as readonly string[]).filter((type) =>
      (LIFECYCLE_EVENT_TYPES as readonly string[]).includes(type)
    );
    expect(overlap).toEqual([]);
    expect(LIFECYCLE_EVENT_TYPES).toEqual(['meeting.started', 'meeting.ended']);
  });

  it('ignores every other event type, including the lifecycle ones', () => {
    expect(isParticipantEventType('meeting.started')).toBe(false);
    expect(isParticipantEventType('recording.completed')).toBe(false);
    expect(isParticipantEventType('meeting.participant_joined')).toBe(true);
  });
});

describe('participant_joined — by value from the committed capture', () => {
  it('writes one row with the surface, school, occurrence, instant and evidence', async () => {
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble();

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      'sha256-of-the-raw-body'
    );

    expect(outcome).toBe('interval_opened');
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual({
      surfaceType: 'consultor_session',
      surfaceId: SURFACE.surfaceId,
      schoolId: 9901,
      zoomMeetingUuid: OCCURRENCE,
      participantUuid: HOST_PARTICIPANT_UUID,
      userId: HOST_PROFILE,
      customerKey: '47d97a107c8f4c348519b4c77ed439d9',
      displayName: 'Anfitrion Spike',
      transientEmail: 'host-1213@example-synthetic.test',
      matchedBy: 'customer_key',
      joinedAt: '2026-07-29T23:55:56.000Z',
      // EVERY rank this participant presented, strongest first — reconciliation
      // evidence for Z7-3 and the facilitator suggestion, never a closure key.
      identityTokens: [
        'ck:47d97a107c8f4c348519b4c77ed439d9',
        'em:host-1213@example-synthetic.test',
        'nm:anfitrion spike',
      ],
      // The ledger dedupe_key, whose UNIQUE index is the delivery-level idempotency.
      sourceEventKey: 'sha256-of-the-raw-body',
    });
  });

  it('every row this chunk writes is source=webhook — the store hard-codes it', async () => {
    // Asserted at the store rather than the applier: `insertInterval` has no `source`
    // parameter to get wrong, which is why the insert shape above carries none.
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble();
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );
    expect(inserted[0]).not.toHaveProperty('source');
  });

  it('a REDELIVERED joined writes no second row', async () => {
    // The actual duplicate delivery, twice through the applier. Zoom retries and
    // `webhook_sweep` replays, so this is normal operation, not a fault.
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble();

    const first = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      'sha256-same-delivery'
    );
    const second = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      'sha256-same-delivery'
    );

    expect(first).toBe('interval_opened');
    expect(second).toBe('interval_duplicate');
    expect(inserted).toHaveLength(1);
  });

  it('CONCURRENT uuid-less redeliveries still write one row (barrier probe)', async () => {
    // Two applications of the same uuid-less body released at the same instant. The
    // double resolves uniqueness synchronously inside insertInterval — as Postgres
    // does inside one statement — so exactly one wins, whatever the interleaving.
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store, inserted } = storeDouble({ barrier });
    const object = participantObject({
      user_name: 'Invitada Sin Uuid',
      join_time: '2026-07-29T23:58:00Z',
    });

    const first = applyParticipantEvent(
      store,
      'meeting.participant_joined',
      object,
      1785369357392,
      'sha256-uuidless-delivery'
    );
    const second = applyParticipantEvent(
      store,
      'meeting.participant_joined',
      object,
      1785369357392,
      'sha256-uuidless-delivery'
    );
    release();
    const outcomes = await Promise.all([first, second]);

    expect(outcomes.sort()).toEqual(['interval_duplicate', 'interval_opened']);
    expect(inserted).toHaveLength(1);
  });

  it('the GUEST capture: four empty-string fields, and none of them matches', async () => {
    // email, participant_user_id, id and registrant_id are all "" on the committed
    // guest capture. `""` is Zoom saying "absent"; a matcher that treats it as a value
    // matches every anonymous guest to the same phantom person.
    const leftBody = loadBody('meeting-participant_left.json');
    const participant = (leftBody.payload?.object as { participant: Record<string, unknown> })
      .participant;
    const { store, inserted } = storeDouble({ existingProfiles: [] });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({ ...participant, join_time: '2026-07-29T23:56:30Z' }),
      1785369357392,
      nextKey()
    );

    expect(outcome).toBe('interval_opened');
    expect(inserted[0].userId).toBeNull();
    expect(inserted[0].matchedBy).toBe('unmatched');
    expect(inserted[0].transientEmail).toBeNull();
  });

  it('two candidate profiles for one display name ⇒ unmatched, user_id NULL', async () => {
    const { store, inserted } = storeDouble({
      existingProfiles: [],
      expectedAttendees: [
        { userId: 'aaaaaaaa-0000-0000-0000-000000000001', name: 'Ana Pérez' },
        { userId: 'aaaaaaaa-0000-0000-0000-000000000002', name: 'ana  pérez' },
      ],
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({ user_name: 'Ana Pérez', join_time: '2026-07-29T23:56:30Z' }),
      1785369357392,
      nextKey()
    );

    expect(outcome).toBe('interval_opened');
    expect(inserted[0].userId).toBeNull();
    expect(inserted[0].matchedBy).toBe('unmatched');
  });

  it('matches a single expected attendee by name, and records matched_by=name', async () => {
    const { store, inserted } = storeDouble({
      existingProfiles: [],
      expectedAttendees: [
        { userId: 'aaaaaaaa-0000-0000-0000-000000000003', name: 'Benjamín Soto' },
      ],
    });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({ user_name: '  benjamín   soto ', join_time: '2026-07-29T23:56:30Z' }),
      1785369357392,
      nextKey()
    );

    expect(inserted[0].userId).toBe('aaaaaaaa-0000-0000-0000-000000000003');
    expect(inserted[0].matchedBy).toBe('name');
  });

  it('matches by e-mail when the key names nobody, and skips the attendee query', async () => {
    const { store, inserted } = storeDouble({
      existingProfiles: [],
      profilesByEmail: { 'docente@example-synthetic.test': 'bbbbbbbb-0000-0000-0000-000000000001' },
    });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({
        user_name: 'Docente Prueba',
        email: 'Docente@Example-Synthetic.test',
        join_time: '2026-07-29T23:56:30Z',
      }),
      1785369357392,
      nextKey()
    );

    expect(inserted[0].userId).toBe('bbbbbbbb-0000-0000-0000-000000000001');
    expect(inserted[0].matchedBy).toBe('email');
    expect(store.listExpectedAttendees).not.toHaveBeenCalled();
  });

  it('writes no row when there is no usable join instant', async () => {
    const { store, inserted } = storeDouble();
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({ user_name: 'Sin Instante' }),
      'not-a-timestamp',
      nextKey()
    );
    expect(outcome).toBe('no_instant');
    expect(inserted).toHaveLength(0);
  });
});

describe('the §15.3.9 falsification matrix — leaves close ONLY via participant_uuid', () => {
  it('[C1] stable uuid join → leave: opens, then closes on the uuid match', async () => {
    const { store, closes, observations, rows } = storeDouble();
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        join_time: '2026-07-29T23:56:30Z',
      }),
      1785369357392,
      nextKey()
    );

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        leave_time: '2026-07-30T00:01:25Z',
      }),
      1785369686564,
      nextKey()
    );

    expect(outcome).toBe('interval_closed');
    expect(closes).toHaveLength(1);
    expect(rows[0].leftAt).toBe('2026-07-30T00:01:25.000Z');
    expect(observations).toHaveLength(1);
    expect(observations[0].outcome).toBe('interval_closed');
  });

  it('[C2] missing join, then leave: closes nothing; the observation is recorded', async () => {
    const { store, closes, observations } = storeDouble();

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        customer_key: '38a578a26df462bfe9cd1d7bbe5a0b77',
        leave_time: '2026-07-30T00:01:25Z',
      }),
      1785369686564,
      'sha256-c2-leave'
    );

    expect(outcome).toBe('no_open_interval');
    expect(closes).toHaveLength(0);
    // The durable private record: identity evidence + the decided outcome.
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      schoolId: 9901,
      zoomMeetingUuid: OCCURRENCE,
      sourceEventKey: 'sha256-c2-leave',
      observedAt: '2026-07-30T00:01:25.000Z',
      participantUuid: GUEST_PARTICIPANT_UUID,
      customerKey: '38a578a26df462bfe9cd1d7bbe5a0b77',
      displayName: 'Invitada Spike',
      identityTokens: ['ck:38a578a26df462bfe9cd1d7bbe5a0b77', 'nm:invitada spike'],
      outcome: 'no_open_interval',
    });
  });

  it('[C3] two uuid-less homonyms: two open rows; neither leave closes anything', async () => {
    const { store, closes, observations, rows } = storeDouble({ existingProfiles: [] });
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({ user_name: 'Ana', join_time: '2026-07-29T23:56:00Z' }),
      1785369357392,
      nextKey()
    );
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({ user_name: 'Ana', join_time: '2026-07-29T23:57:00Z' }),
      1785369357392,
      nextKey()
    );
    expect(rows.filter((row) => row.leftAt === null)).toHaveLength(2);

    const firstLeave = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({ user_name: 'Ana', leave_time: '2026-07-30T00:01:00Z' }),
      1785369686564,
      nextKey()
    );
    const secondLeave = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({ user_name: 'Ana', leave_time: '2026-07-30T00:02:00Z' }),
      1785369686564,
      nextKey()
    );

    expect(firstLeave).toBe('unpairable_leave');
    expect(secondLeave).toBe('unpairable_leave');
    expect(closes).toHaveLength(0);
    expect(rows.every((row) => row.leftAt === null)).toBe(true);
    expect(observations.map((o) => o.outcome)).toEqual([
      'unpairable_leave',
      'unpairable_leave',
    ]);
  });

  it('[C4] H1 vs H2 — provably indistinguishable, and BOTH close nothing', async () => {
    // H1: B joins as "Ana"; B leaves as "Ana".
    // H2: B joins as "Ana"; A's join webhook is never delivered; A leaves as "Ana".
    // Identical webhook input, identical database state — the old contract required
    // opposite outcomes and was therefore unsatisfiable. §15.3.9's rule gives both
    // the same safe answer. One history builder, run twice, asserted identical.
    const runHistory = async () => {
      const { store, closes, observations, rows } = storeDouble({ existingProfiles: [] });
      await applyParticipantEvent(
        store,
        'meeting.participant_joined',
        participantObject({ user_name: 'Ana', join_time: '2026-07-29T23:56:00Z' }),
        1785369357392,
        'sha256-h-join'
      );
      const leaveOutcome = await applyParticipantEvent(
        store,
        'meeting.participant_left',
        participantObject({ user_name: 'Ana', leave_time: '2026-07-30T00:10:00Z' }),
        1785369686564,
        'sha256-h-leave'
      );
      return {
        leaveOutcome,
        closes: [...closes],
        stillOpen: rows.filter((row) => row.leftAt === null).length,
        observationOutcomes: observations.map((o) => o.outcome),
      };
    };

    const h1 = await runHistory();
    const h2 = await runHistory();

    // Identical output — the applier cannot tell the histories apart, and does not try.
    expect(h1).toEqual(h2);
    // And that output closes NOTHING: the close set is empty in both.
    expect(h1.leaveOutcome).toBe('unpairable_leave');
    expect(h1.closes).toEqual([]);
    expect(h1.stillOpen).toBe(1);
    expect(h1.observationOutcomes).toEqual(['unpairable_leave']);
  });

  it('[C5] identity downgrade between join and leave: closes nothing', async () => {
    // A joins with customer_key + name but NO uuid; A's leave arrives with only the
    // name. Under the withdrawn contract the downgraded token found a row to close.
    // Under §15.3.9 a uuid-less leave closes nothing, whatever evidence it carries.
    const { store, closes, observations, rows } = storeDouble({ existingProfiles: [] });
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({
        customer_key: '38a578a26df462bfe9cd1d7bbe5a0b77',
        user_name: 'Ana',
        join_time: '2026-07-29T23:56:00Z',
      }),
      1785369357392,
      nextKey()
    );

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({ user_name: 'Ana', leave_time: '2026-07-30T00:10:00Z' }),
      1785369686564,
      nextKey()
    );

    expect(outcome).toBe('unpairable_leave');
    expect(closes).toHaveLength(0);
    expect(rows[0].leftAt).toBeNull();
    expect(observations[0].outcome).toBe('unpairable_leave');
  });

  it('[C6] duplicate byte-identical delivery: no second row, no second close, no second observation', async () => {
    const { store, closes, observations } = storeDouble({
      rows: [
        {
          id: 'row-open',
          joinedAt: '2026-07-29T23:56:00.000Z',
          leftAt: null,
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
      ],
    });
    const leave = participantObject({
      participant_uuid: GUEST_PARTICIPANT_UUID,
      user_name: 'Invitada Spike',
      leave_time: '2026-07-30T00:01:25Z',
    });

    const first = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      leave,
      1785369686564,
      'sha256-c6-delivery'
    );
    // Byte-identical redelivery: same body, same ledger dedupe_key.
    const second = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      leave,
      1785369686564,
      'sha256-c6-delivery'
    );

    expect(first).toBe('interval_closed');
    expect(second).toBe('observation_duplicate');
    expect(closes).toHaveLength(1);
    expect(observations).toHaveLength(1);
    expect(observations[0].outcome).toBe('interval_closed');
  });

  it('[C6b] CONCURRENT application of one delivery: exactly one outcome persists', async () => {
    // Route and sweep release the same delivery at the same instant. The double's
    // applyLeave resolves the observation key synchronously inside the call — as the
    // real function's single transaction does — so one application closes and records,
    // and the other does NOTHING AT ALL. The failure §15.3.9 names — one application
    // closes the interval while the other logs the same delivery as unmatched — is
    // impossible exactly when observation + close are one transaction. pgTAP 011
    // asserts the same boundary against the real function: a pre-seeded observation
    // key makes the close roll back.
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store, closes, observations } = storeDouble({
      barrier,
      rows: [
        {
          id: 'row-open',
          joinedAt: '2026-07-29T23:56:00.000Z',
          leftAt: null,
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
      ],
    });
    const leave = participantObject({
      participant_uuid: GUEST_PARTICIPANT_UUID,
      user_name: 'Invitada Spike',
      leave_time: '2026-07-30T00:01:25Z',
    });

    const route = applyParticipantEvent(
      store,
      'meeting.participant_left',
      leave,
      1785369686564,
      'sha256-c6b-delivery'
    );
    const sweep = applyParticipantEvent(
      store,
      'meeting.participant_left',
      leave,
      1785369686564,
      'sha256-c6b-delivery'
    );
    release();
    const outcomes = await Promise.all([route, sweep]);

    expect(outcomes.sort()).toEqual(['interval_closed', 'observation_duplicate']);
    expect(closes).toHaveLength(1);
    expect(observations).toHaveLength(1);
    // The one persisted record says CLOSED. No record anywhere says unmatched — the
    // delivery cannot be both closed and logged unmatched.
    expect(observations[0].outcome).toBe('interval_closed');
    expect(observations.some((o) => o.outcome === 'no_open_interval')).toBe(false);
  });

  it('[C7] byte-different duplicate: uuid path deduped by the widened index', async () => {
    // Same join, delivered twice with different bytes (different dedupe_key). The
    // (occurrence, uuid, joined_at) index still refuses the second row.
    const { store, inserted } = storeDouble();
    const join = participantObject({
      participant_uuid: GUEST_PARTICIPANT_UUID,
      user_name: 'Invitada Spike',
      join_time: '2026-07-29T23:56:30Z',
    });

    const first = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      join,
      1785369357392,
      'sha256-c7-first-bytes'
    );
    const second = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      join,
      1785369357392,
      'sha256-c7-second-bytes'
    );

    expect(first).toBe('interval_opened');
    expect(second).toBe('interval_duplicate');
    expect(inserted).toHaveLength(1);
  });

  it('[C7] byte-different duplicate: the uuid-less duplicate is ACCEPTED — a stated limitation', async () => {
    // No heuristic. The report supersedes the double-counted row wholesale (Z7-3);
    // resolving it here would mean matching on client-assertable identity, which is
    // the defect class this contract removed.
    const { store, inserted } = storeDouble({ existingProfiles: [] });
    const join = participantObject({ user_name: 'Ana', join_time: '2026-07-29T23:56:30Z' });

    const first = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      join,
      1785369357392,
      'sha256-c7u-first-bytes'
    );
    const second = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      join,
      1785369357392,
      'sha256-c7u-second-bytes'
    );

    expect(first).toBe('interval_opened');
    expect(second).toBe('interval_opened');
    expect(inserted).toHaveLength(2);
  });

  it('[C8] reconnect: one row per join; each closes by its own uuid', async () => {
    // Zoom's uuid is meeting-scoped, so a rejoin may REUSE it. Sequential
    // join→leave→join→leave: each leave finds exactly one open row.
    const { store, closes, rows } = storeDouble();
    const key = () => nextKey();

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        join_time: '2026-07-29T23:56:00Z',
      }),
      1785369357392,
      key()
    );
    await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        leave_time: '2026-07-29T23:58:00Z',
      }),
      1785369686564,
      key()
    );
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        join_time: '2026-07-30T00:00:00Z',
      }),
      1785369357392,
      key()
    );
    await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        leave_time: '2026-07-30T00:05:00Z',
      }),
      1785369686564,
      key()
    );

    expect(rows).toHaveLength(2);
    expect(closes).toHaveLength(2);
    expect(rows.map((row) => row.leftAt)).toEqual([
      '2026-07-29T23:58:00.000Z',
      '2026-07-30T00:05:00.000Z',
    ]);
  });

  it('[C8] TWO open rows under one uuid (lost first leave): the next leave closes NEITHER', async () => {
    // Rule 3: more than one open match ⇒ close nothing. Choosing "the latest" is how
    // a gap became presence under the old contract. The report resolves it.
    const { store, closes, observations, rows } = storeDouble({
      rows: [
        {
          id: 'row-a',
          joinedAt: '2026-07-29T23:56:00.000Z',
          leftAt: null,
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
        {
          id: 'row-b',
          joinedAt: '2026-07-30T00:00:00.000Z',
          leftAt: null,
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
      ],
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        leave_time: '2026-07-30T00:05:00Z',
      }),
      1785369686564,
      nextKey()
    );

    expect(outcome).toBe('no_open_interval');
    expect(closes).toHaveLength(0);
    expect(rows.every((row) => row.leftAt === null)).toBe(true);
    expect(observations[0].outcome).toBe('no_open_interval');
  });

  it('[C9] leave preceding join: closes nothing, never applied retroactively', async () => {
    const { store, closes, observations, rows } = storeDouble({
      rows: [
        {
          id: 'row-open',
          joinedAt: '2026-07-30T00:00:00.000Z',
          leftAt: null,
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
      ],
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        leave_time: '2026-07-29T23:59:00Z',
      }),
      1785369686564,
      nextKey()
    );

    expect(outcome).toBe('no_open_interval');
    expect(closes).toHaveLength(0);
    expect(rows[0].leftAt).toBeNull();
    expect(observations[0].outcome).toBe('no_open_interval');
  });

  it('[C10] no eligible token at all: distinct outcome from [C2] in the log', async () => {
    // A leave with NO participant_uuid — whatever else it presents — is unpairable.
    // [C2]'s uuid-bearing leave that matches nothing logs no_open_interval; this logs
    // unpairable_leave. Two different causes, two legible outcomes.
    const { store, observations } = storeDouble();

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({ leave_time: '2026-07-30T00:01:25Z' }),
      1785369686564,
      nextKey()
    );

    expect(outcome).toBe('unpairable_leave');
    expect(observations[0].outcome).toBe('unpairable_leave');
    expect(observations[0].identityTokens).toEqual([]);
  });

  it('a leave with no usable instant still records its observation (no_instant)', async () => {
    const { store, closes, observations } = storeDouble({
      rows: [
        {
          id: 'row-open',
          joinedAt: '2026-07-29T23:56:00.000Z',
          leftAt: null,
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
      ],
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
      }),
      'not-a-timestamp',
      nextKey()
    );

    expect(outcome).toBe('no_instant');
    expect(closes).toHaveLength(0);
    expect(observations[0]).toMatchObject({ observedAt: null, outcome: 'no_instant' });
  });

  it('a REPLAYED leave (new bytes) cannot re-close: zero open rows ⇒ no_open_interval', async () => {
    const { store, closes, observations, rows } = storeDouble({
      rows: [
        {
          id: 'row-closed',
          joinedAt: '2026-07-29T23:56:00.000Z',
          leftAt: '2026-07-30T00:01:25.000Z',
          participantUuid: GUEST_PARTICIPANT_UUID,
        },
      ],
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        leave_time: '2026-07-30T00:02:00Z',
      }),
      1785369686564,
      nextKey()
    );

    expect(outcome).toBe('no_open_interval');
    expect(closes).toHaveLength(0);
    expect(rows[0].leftAt).toBe('2026-07-30T00:01:25.000Z');
    expect(observations[0].outcome).toBe('no_open_interval');
  });

  it('the leave path is ONE store call — applyLeave — and never touches insertInterval', async () => {
    const { store, leaveCalls } = storeDouble();

    await applyParticipantEvent(
      store,
      'meeting.participant_left',
      participantObject({
        participant_uuid: GUEST_PARTICIPANT_UUID,
        user_name: 'Invitada Spike',
        customer_key: '38a578a26df462bfe9cd1d7bbe5a0b77',
        leave_time: '2026-07-30T00:01:25Z',
      }),
      1785369686564,
      'sha256-single-call'
    );

    expect(leaveCalls).toHaveLength(1);
    expect(store.insertInterval).not.toHaveBeenCalled();
    // The evidence rides the observation; the matching hierarchy is never consulted
    // on a leave — there is no row to attribute and nothing it could close.
    expect(store.listExpectedAttendees).not.toHaveBeenCalled();
    expect(store.findProfileIdByEmail).not.toHaveBeenCalled();
    expect(leaveCalls[0].identityTokens).toEqual([
      'ck:38a578a26df462bfe9cd1d7bbe5a0b77',
      'nm:invitada spike',
    ]);
  });

  it('a leave without its ledger dedupe_key fails LOUDLY — the observation is mandatory', async () => {
    // Unreachable from the route and the sweep, which always pass it. A future caller
    // that forgets must not silently record an undeduplicatable leave.
    const { store } = storeDouble();
    await expect(
      applyParticipantEvent(
        store,
        'meeting.participant_left',
        participantObject({
          participant_uuid: GUEST_PARTICIPANT_UUID,
          leave_time: '2026-07-30T00:01:25Z',
        }),
        1785369686564
      )
    ).rejects.toThrow(/dedupe_key/);
  });
});

describe('surface resolution — it reads zoom_meetings and nothing else', () => {
  it('resolves by occurrence uuid first', async () => {
    const body = loadBody('meeting-participant_joined.json');
    const { store } = storeDouble();

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      nextKey()
    );

    expect(store.findSurfaceByOccurrence).toHaveBeenCalledWith(OCCURRENCE);
    expect(store.findSurfaceByMeetingNumber).not.toHaveBeenCalled();
  });

  it('falls back to the meeting number when the uuid is not on the row yet', async () => {
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble({
      surface: null,
      surfaceByNumber: { ...SURFACE, zoomMeetingUuid: null },
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      nextKey()
    );

    expect(outcome).toBe('interval_opened');
    expect(store.findSurfaceByMeetingNumber).toHaveBeenCalledWith(86084701483);
    // The row still carries the occurrence uuid — the event's own, not the meeting row's.
    expect(inserted[0].zoomMeetingUuid).toBe(OCCURRENCE);
  });

  it('accepts meeting-number fallback when the established uuid matches', async () => {
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble({
      surface: null,
      surfaceByNumber: { ...SURFACE, zoomMeetingUuid: OCCURRENCE },
    });

    await expect(applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      nextKey()
    )).resolves.toBe('interval_opened');

    expect(inserted).toHaveLength(1);
  });

  it.each([
    'meeting.participant_joined',
    'meeting.participant_left',
  ] as const)('rejects a conflicting occurrence on number fallback for %s', async (eventType) => {
    const body = loadBody(eventType === 'meeting.participant_joined'
      ? 'meeting-participant_joined.json'
      : 'meeting-participant_left.json');
    const established = { ...SURFACE, zoomMeetingUuid: 'established-occurrence' };
    const { store, inserted, observations, closes } = storeDouble({
      surface: null,
      surfaceByNumber: established,
    });

    const outcome = await applyParticipantEvent(
      store,
      eventType,
      { ...body.payload?.object, uuid: 'foreign-occurrence' },
      body.event_ts,
      nextKey()
    );

    expect(outcome).toBe('unresolved_surface');
    expect(inserted).toHaveLength(0);
    expect(observations).toHaveLength(0);
    expect(closes).toHaveLength(0);
    expect(store.insertInterval).not.toHaveBeenCalled();
    expect(store.applyLeave).not.toHaveBeenCalled();
    expect(established.zoomMeetingUuid).toBe('established-occurrence');
  });

  it('an unresolved surface is ledger-only and NOT an error', async () => {
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble({ surface: null, surfaceByNumber: null });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts,
      nextKey()
    );

    expect(outcome).toBe('unresolved_surface');
    expect(inserted).toHaveLength(0);
  });

  it('the store it is handed has NO method that could move a status', () => {
    // Structural: the participant path cannot write zoom_meetings because its store
    // type has no member that reaches it. A new method here must be added knowingly.
    const { store } = storeDouble();
    expect(Object.keys(store).sort()).toEqual([
      'applyLeave',
      'findProfileIdByEmail',
      'findSurfaceByMeetingNumber',
      'findSurfaceByOccurrence',
      'insertInterval',
      'listExpectedAttendees',
      'profileExists',
    ]);
  });

  it('a lifecycle event handed to this applier does nothing at all', async () => {
    const { store, inserted, observations } = storeDouble();
    const outcome = await applyParticipantEvent(
      store,
      'meeting.started',
      participantObject({}),
      1785369357392,
      nextKey()
    );
    expect(outcome).toBe('ignored_event_type');
    expect(inserted).toHaveLength(0);
    expect(observations).toHaveLength(0);
    expect(store.findSurfaceByOccurrence).not.toHaveBeenCalled();
  });
});
