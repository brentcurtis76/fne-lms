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
  OpenIntervalQuery,
  ZoomAttendanceStore,
} from '../../../lib/zoom/attendance-store';
import type { AttendeeCandidate } from '../../../lib/zoom/attendance-identity';
import type { StoredInterval } from '../../../lib/zoom/attendance-intervals';

/**
 * Participant ingestion (Z7-2 [R1]–[R9]).
 *
 * Every fixture value here is read from the committed Z0B captures. The two participant
 * captures are **two different people** — different `customer_key`, different `user_name`
 * — so they are NOT a joined→left pair and nothing about pairing is inferred from them.
 * Where a pair is needed, this file builds one by reusing the host capture's own
 * participant block and adding a `leave_time`, and says so at the call site.
 *
 * The store double is faithful, not generous: it models the partial unique index and the
 * `left_at IS NULL` close guard, because those are the two places where "the applier
 * checks first" would be a race rather than a guarantee.
 */

const FIXTURE_DIR = path.join(process.cwd(), '__tests__/lib/zoom/fixtures/webhooks');

const HOST_PROFILE = '47d97a10-7c8f-4c34-8519-b4c77ed439d9';
const OCCURRENCE = 'de+IDqR9f3hhT9D8/NA/J1==';
const MEETING_NUMBER = 86084701483;
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

interface DoubleOptions {
  surface?: AttendanceSurface | null;
  surfaceByNumber?: AttendanceSurface | null;
  existingProfiles?: string[];
  profilesByEmail?: Record<string, string>;
  expectedAttendees?: AttendeeCandidate[];
  rows?: StoredInterval[];
  barrier?: Promise<void>;
}

/**
 * Models BOTH partial unique indexes and the close guard.
 *
 * The uniqueness checks are synchronous inside `insertInterval`, exactly as Postgres
 * resolves them inside one statement — that is what makes the concurrency test below
 * meaningful rather than a test of this double's scheduling. `listOpenIntervals`
 * filters by ONE key with exact equality, matching the store's query after Codex P1-1;
 * the previous double returned every uuid-less open row regardless of identity, which
 * is why the wrong-person defect survived its own suite.
 */
function storeDouble(options: DoubleOptions = {}) {
  const inserted: AttendanceIntervalInsert[] = [];
  const openQueries: OpenIntervalQuery[] = [];
  const rows: (StoredInterval & {
    participantUuid?: string | null;
    identityTokens?: string[];
    sourceEventKey?: string | null;
  })[] = [...(options.rows ?? [])];
  const closes: { id: string; leftAt: string }[] = [];
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
      // (zoom_meeting_uuid, participant_uuid) WHERE participant_uuid IS NOT NULL:
      if (
        row.participantUuid !== null &&
        rows.some((existing) => existing.participantUuid === row.participantUuid)
      ) {
        return 'duplicate' as const;
      }
      // source_event_key WHERE source_event_key IS NOT NULL — the delivery-level index
      // that covers the uuid-less case a read-then-insert could not (Codex P1-2).
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
      });
      return 'inserted' as const;
    }),
    listOpenIntervals: vi.fn(async (query: OpenIntervalQuery) => {
      openQueries.push(query);
      // ONE search key. uuid → exact equality; otherwise the leave's strongest token
      // matched against EVERY rank the join recorded (`identity_tokens @> ARRAY[token]`),
      // which is what lets a downgraded leave find its own row rather than a namesake's.
      const matches = (row: (typeof rows)[number]) =>
        query.participantUuid !== null
          ? row.participantUuid === query.participantUuid
          : (row.identityTokens ?? []).includes(query.identityToken as string);
      if (query.participantUuid === null && query.identityToken === null) return [];
      return rows
        .filter((row) => row.leftAt === null && matches(row))
        .sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt))
        .map(({ id, joinedAt, leftAt }) => ({ id, joinedAt, leftAt }));
    }),
    closeInterval: vi.fn(async (id: string, leftAt: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      // `.is('left_at', null)` — a replayed leave matches zero rows.
      if (!row || row.leftAt !== null) return false;
      row.leftAt = leftAt;
      closes.push({ id, leftAt });
      return true;
    }),
  };

  return { store, inserted, rows, closes, openQueries };
}

describe('the participant event set is SEPARATE from the lifecycle set ([R1])', () => {
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

describe('participant_joined — [B2] by value from the committed capture', () => {
  it('writes one row with the surface, school, occurrence, instant and source', async () => {
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
      // EVERY rank this participant presented, strongest first — so a leave that arrives
      // with fewer fields still finds THIS row rather than a namesake's.
      identityTokens: [
        'ck:47d97a107c8f4c348519b4c77ed439d9',
        'em:host-1213@example-synthetic.test',
        'nm:anfitrion spike',
      ],
      // The ledger dedupe_key, whose UNIQUE index is the delivery-level idempotency.
      sourceEventKey: 'sha256-of-the-raw-body',
    });
  });

  it('[R9] every row this chunk writes is source=webhook — the store hard-codes it', async () => {
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

  it('[B3] a REDELIVERED joined writes no second row', async () => {
    // The actual duplicate delivery, twice through the applier. Zoom retries and
    // `webhook_sweep` replays, so this is normal operation, not a fault.
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted, rows } = storeDouble();

    const first = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );
    const second = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );

    expect(first).toBe('interval_opened');
    expect(second).toBe('interval_duplicate');
    expect(inserted).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it('[B3] a uuid-less redelivery is deduped by source_event_key, in the DATABASE', async () => {
    // Codex P1-2. The applier used to defend this with a read-then-insert, which two
    // concurrent deliveries can both lose. Dedupe now keys on the ledger's dedupe_key,
    // whose UNIQUE index resolves inside Postgres. Same body ⇒ same sha256 ⇒ same key.
    const body = loadBody('meeting-participant_joined.json');
    const object = body.payload?.object as Record<string, unknown>;
    const participant = { ...(object.participant as Record<string, unknown>) };
    delete participant.participant_uuid;
    const uuidless = { ...object, participant };
    const DELIVERY = 'sha256-of-the-raw-body';

    const { store, inserted } = storeDouble();
    expect(
      await applyParticipantEvent(store, 'meeting.participant_joined', uuidless, body.event_ts, DELIVERY)
    ).toBe('interval_opened');
    expect(
      await applyParticipantEvent(store, 'meeting.participant_joined', uuidless, body.event_ts, DELIVERY)
    ).toBe('interval_duplicate');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].sourceEventKey).toBe(DELIVERY);
    // ...and the applier no longer reads before inserting, so there is no race to lose.
    expect(store.listOpenIntervals).not.toHaveBeenCalled();
  });

  it('[B3] CONCURRENT uuid-less redeliveries still write one row (barrier probe)', async () => {
    // The exact probe Codex ran against the previous version, which produced
    // {"result":["interval_opened","interval_opened"],"insertCount":2}. Both appliers are
    // held at the insert until released, so they interleave the way two concurrent
    // webhook deliveries do; the unique check is then resolved atomically, as Postgres
    // resolves it inside one statement. A sequential replay test does not defend this.
    const body = loadBody('meeting-participant_joined.json');
    const object = body.payload?.object as Record<string, unknown>;
    const participant = { ...(object.participant as Record<string, unknown>) };
    delete participant.participant_uuid;
    const uuidless = { ...object, participant };
    const DELIVERY = 'sha256-of-the-raw-body';

    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { store, inserted } = storeDouble({ barrier });

    const both = Promise.all([
      applyParticipantEvent(store, 'meeting.participant_joined', uuidless, body.event_ts, DELIVERY),
      applyParticipantEvent(store, 'meeting.participant_joined', uuidless, body.event_ts, DELIVERY),
    ]);
    // Both are now parked inside insertInterval. Let them through together.
    await Promise.resolve();
    release();
    const outcomes = await both;

    expect(outcomes.sort()).toEqual(['interval_duplicate', 'interval_opened']);
    expect(inserted).toHaveLength(1);
  });

  it('[P1-1] two SAME-NAMED participants with different customer keys never cross-close', async () => {
    // Codex P1-1's regression. Both are uuid-less, so pairing falls to the identity
    // token — which is `ck:<customer_key>` for each, because customer_key outranks the
    // shared display name. Under the old OR-ed filter both leaves matched both joins and
    // selectIntervalToClose closed the latest, i.e. the wrong person.
    const shared = { user_name: 'Ana Pérez', join_time: '2026-07-29T23:55:00Z' };
    const one = { ...shared, customer_key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1' };
    const two = { ...shared, customer_key: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2', join_time: '2026-07-29T23:56:00Z' };
    const base = { uuid: OCCURRENCE, id: String(MEETING_NUMBER) };

    const { store, rows, closes } = storeDouble({ existingProfiles: [] });
    await applyParticipantEvent(store, 'meeting.participant_joined', { ...base, participant: one }, undefined, 'd1');
    await applyParticipantEvent(store, 'meeting.participant_joined', { ...base, participant: two }, undefined, 'd2');
    expect(rows).toHaveLength(2);

    // The SECOND person leaves. Their interval is the later one, so a wrong-person close
    // would be invisible to a naive assertion — this pins the row id explicitly.
    await applyParticipantEvent(
      store,
      'meeting.participant_left',
      { ...base, participant: { ...two, leave_time: '2026-07-30T00:10:00Z' } },
      undefined,
      'd3'
    );
    expect(closes).toEqual([{ id: 'row-2', leftAt: '2026-07-30T00:10:00.000Z' }]);
    expect(rows[0].leftAt).toBeNull();

    // ...and the FIRST person's leave closes theirs, not the already-closed one.
    await applyParticipantEvent(
      store,
      'meeting.participant_left',
      { ...base, participant: { ...one, leave_time: '2026-07-30T00:20:00Z' } },
      undefined,
      'd4'
    );
    expect(closes).toEqual([
      { id: 'row-2', leftAt: '2026-07-30T00:10:00.000Z' },
      { id: 'row-1', leftAt: '2026-07-30T00:20:00.000Z' },
    ]);
  });

  it('[RE-REVIEW BLOCKER] a DOWNGRADED leave closes nobody, not a namesake', async () => {
    // Codex's counterexample, verbatim, and it was REPRODUCED against the previous
    // implementation before this test existed: A's leave closed B's row.
    //
    //   A joins with customer_key AND the shared name → tokens [ck:a, nm:ana]
    //   B joins with ONLY the shared name            → tokens [nm:ana]
    //   A leaves and Zoom omits customer_key         → searches with nm:ana
    //
    // Under the old single-token design the search found ONLY B and closed B. Now the
    // search finds BOTH (A carries nm:ana at a weaker rank), which is ambiguous — so the
    // applier closes NOTHING and both intervals stay open for the Z7-3 reconcile.
    const base = { uuid: OCCURRENCE, id: String(MEETING_NUMBER) };
    const { store, rows, closes } = storeDouble({ existingProfiles: [] });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      {
        ...base,
        participant: {
          customer_key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
          user_name: 'Ana',
          join_time: '2026-07-29T23:55:00Z',
        },
      },
      undefined,
      'd1'
    );
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      { ...base, participant: { user_name: 'Ana', join_time: '2026-07-29T23:56:00Z' } },
      undefined,
      'd2'
    );
    expect(rows).toHaveLength(2);

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      { ...base, participant: { user_name: 'Ana', leave_time: '2026-07-30T00:10:00Z' } },
      undefined,
      'd3'
    );

    // NEITHER row is closed — the assertion Codex specified.
    expect(outcome).toBe('no_open_interval');
    expect(closes).toEqual([]);
    expect(rows[0].leftAt).toBeNull();
    expect(rows[1].leftAt).toBeNull();
  });

  it('[RE-REVIEW BLOCKER] a downgraded leave DOES close its own row when unambiguous', async () => {
    // The other half: widening storage must not stop a legitimate downgraded leave from
    // pairing. Only A is present, so nm:ana matches exactly one open interval — A's own.
    const base = { uuid: OCCURRENCE, id: String(MEETING_NUMBER) };
    const { store, closes } = storeDouble({ existingProfiles: [] });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      {
        ...base,
        participant: {
          customer_key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
          user_name: 'Ana',
          join_time: '2026-07-29T23:55:00Z',
        },
      },
      undefined,
      'd1'
    );
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      { ...base, participant: { user_name: 'Ana', leave_time: '2026-07-30T00:10:00Z' } },
      undefined,
      'd2'
    );

    expect(outcome).toBe('interval_closed');
    expect(closes).toEqual([{ id: 'row-1', leftAt: '2026-07-30T00:10:00.000Z' }]);
  });

  it('[RE-REVIEW BLOCKER] a strong leave is never matched by name — the query key stays strongest', async () => {
    // The asymmetry: storage widened, the SEARCH key did not. A leave presenting a
    // customer_key searches with ck:, so it cannot be paired to a name-only namesake even
    // though that namesake shares the display name.
    const base = { uuid: OCCURRENCE, id: String(MEETING_NUMBER) };
    const { store, rows, closes } = storeDouble({ existingProfiles: [] });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      { ...base, participant: { user_name: 'Ana', join_time: '2026-07-29T23:56:00Z' } },
      undefined,
      'd1'
    );
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      {
        ...base,
        participant: {
          customer_key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
          user_name: 'Ana',
          leave_time: '2026-07-30T00:10:00Z',
        },
      },
      undefined,
      'd2'
    );

    expect(outcome).toBe('no_open_interval');
    expect(closes).toEqual([]);
    expect(rows[0].leftAt).toBeNull();
  });

  it('[P1-1] a shared display name alone cannot pair two DIFFERENT people', async () => {
    // No customer_key, no e-mail: the token IS the name for both, so they are genuinely
    // indistinguishable to Zoom and to us. The leave closes the latest — which is the
    // honest outcome for two people we cannot tell apart, and is why the token is
    // PRIORITISED rather than OR-ed: a stronger key, when present, always decides first.
    const base = { uuid: OCCURRENCE, id: String(MEETING_NUMBER) };
    const { store, inserted } = storeDouble({ existingProfiles: [] });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      { ...base, participant: { user_name: 'Ana Pérez', join_time: '2026-07-29T23:55:00Z' } },
      undefined,
      'e1'
    );
    expect(inserted[0].identityTokens).toEqual(['nm:ana pérez']);
  });

  it('[B5] the GUEST capture: four empty-string fields, and none of them matches', async () => {
    // Built from the guest's own participant block plus a join_time, because the committed
    // guest capture is a `participant_left`. Its customer_key is not one of ours, its
    // e-mail is "", and its name is not an expected attendee — so: unmatched, user_id NULL.
    const left = loadBody('meeting-participant_left.json');
    const object = left.payload?.object as Record<string, unknown>;
    const participant = {
      ...(object.participant as Record<string, unknown>),
      join_time: '2026-07-29T23:57:10Z',
    };

    const { store, inserted } = storeDouble({ expectedAttendees: [] });
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      { ...object, participant },
      left.event_ts
    );

    expect(inserted[0].matchedBy).toBe('unmatched');
    expect(inserted[0].userId).toBeNull();
    expect(inserted[0].transientEmail).toBeNull();
    expect(inserted[0].customerKey).toBe('38a578a26df462bfe9cd1d7bbe5a0b77');
    expect(inserted[0].participantUuid).toBe(GUEST_PARTICIPANT_UUID);
    // The store was never asked to look up the empty e-mail.
    expect(store.findProfileIdByEmail).not.toHaveBeenCalled();
  });

  it('[B6] two candidate profiles for one display name ⇒ unmatched, user_id NULL', async () => {
    const { store, inserted } = storeDouble({
      existingProfiles: [],
      expectedAttendees: [
        { userId: 'user-ana-1', name: 'Ana Pérez' },
        { userId: 'user-ana-2', name: 'ana  pérez' },
      ],
    });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      {
        uuid: OCCURRENCE,
        id: String(MEETING_NUMBER),
        participant: { user_name: 'Ana Pérez', join_time: '2026-07-29T23:56:00Z' },
      },
      undefined
    );

    expect(inserted[0].matchedBy).toBe('unmatched');
    expect(inserted[0].userId).toBeNull();
  });

  it('matches a single expected attendee by name, and records matched_by=name', async () => {
    const { store, inserted } = storeDouble({
      existingProfiles: [],
      expectedAttendees: [{ userId: 'user-ana', name: 'Ana Pérez' }],
    });

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      {
        uuid: OCCURRENCE,
        id: String(MEETING_NUMBER),
        participant: { user_name: '  ANA   pérez ', join_time: '2026-07-29T23:56:00Z' },
      },
      undefined
    );

    expect(inserted[0]).toMatchObject({ matchedBy: 'name', userId: 'user-ana' });
  });

  it('matches by e-mail when the key names nobody, and skips the attendee query', async () => {
    const { store, inserted } = storeDouble({
      existingProfiles: [],
      profilesByEmail: { 'host-1213@example-synthetic.test': 'user-by-email' },
    });
    const body = loadBody('meeting-participant_joined.json');

    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );

    expect(inserted[0]).toMatchObject({ matchedBy: 'email', userId: 'user-by-email' });
    // Short-circuit: the hierarchy answered before the name branch needed data.
    expect(store.listExpectedAttendees).not.toHaveBeenCalled();
  });

  it('writes no row when there is no usable join instant', async () => {
    const { store, inserted } = storeDouble();
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      { uuid: OCCURRENCE, id: String(MEETING_NUMBER), participant: { user_name: 'Sin Hora' } },
      undefined
    );
    expect(outcome).toBe('no_instant');
    expect(inserted).toEqual([]);
  });
});

describe('participant_left — [B4] and [R4]', () => {
  /** A real pair: the host's own block, joined then left. The fixtures cannot supply one. */
  function hostPair() {
    const joined = loadBody('meeting-participant_joined.json');
    const object = joined.payload?.object as Record<string, unknown>;
    const participant = object.participant as Record<string, unknown>;
    return {
      joinedObject: object,
      joinedEventTs: joined.event_ts,
      leftObject: {
        ...object,
        participant: { ...participant, leave_time: '2026-07-30T00:01:25Z' },
      },
    };
  }

  it('closes the matching open interval', async () => {
    const { joinedObject, joinedEventTs, leftObject } = hostPair();
    const { store, rows, closes } = storeDouble();

    await applyParticipantEvent(store, 'meeting.participant_joined', joinedObject, joinedEventTs);
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      leftObject,
      undefined
    );

    expect(outcome).toBe('interval_closed');
    expect(closes).toEqual([{ id: 'row-1', leftAt: '2026-07-30T00:01:25.000Z' }]);
    expect(rows[0].leftAt).toBe('2026-07-30T00:01:25.000Z');
  });

  it('[R4] a left matching NOTHING writes no row and still reports success', async () => {
    // The committed guest capture, used as itself: its join was never seen. Every
    // alternative to writing nothing fabricates — `joined_at = leave_time` invents a
    // zero-length interval, `joined_at = actual_started_at` invents unobserved presence.
    const body = loadBody('meeting-participant_left.json');
    const { store, inserted, rows, closes } = storeDouble();

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      body.payload?.object,
      body.event_ts
    );

    expect(outcome).toBe('no_open_interval');
    expect(inserted).toEqual([]);
    expect(rows).toEqual([]);
    expect(closes).toEqual([]);
    expect(store.insertInterval).not.toHaveBeenCalled();
  });

  it('[B9] an OUT-OF-ORDER leave leaves the interval open and raises nothing ([R7])', async () => {
    const { joinedObject, joinedEventTs } = hostPair();
    const object = joinedObject as Record<string, unknown>;
    const participant = object.participant as Record<string, unknown>;
    const { store, rows, closes } = storeDouble();

    await applyParticipantEvent(store, 'meeting.participant_joined', joinedObject, joinedEventTs);
    // A leave BEFORE the join. The database CHECK would refuse this row; the applier must
    // never offer it one, because a constraint violation here becomes a 500 and Zoom
    // retries the same malformed body forever.
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      { ...object, participant: { ...participant, leave_time: '2026-07-29T20:00:00Z' } },
      undefined
    );

    expect(outcome).toBe('no_open_interval');
    expect(rows[0].leftAt).toBeNull();
    expect(closes).toEqual([]);
  });

  it('a REPLAYED leave cannot re-close an interval — the close is guarded', async () => {
    const { joinedObject, joinedEventTs, leftObject } = hostPair();
    const { store, closes } = storeDouble();

    await applyParticipantEvent(store, 'meeting.participant_joined', joinedObject, joinedEventTs);
    await applyParticipantEvent(store, 'meeting.participant_left', leftObject, undefined);
    const replay = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      leftObject,
      undefined
    );

    expect(replay).toBe('no_open_interval');
    expect(closes).toHaveLength(1);
  });

  it('closes the LATEST open interval when a rejoin produced two', async () => {
    const { joinedObject, joinedEventTs } = hostPair();
    const object = joinedObject as Record<string, unknown>;
    const participant = object.participant as Record<string, unknown>;
    const { store, closes } = storeDouble();

    await applyParticipantEvent(store, 'meeting.participant_joined', joinedObject, joinedEventTs);
    // A rejoin carries a NEW participant_uuid, so the partial index does not collapse it.
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      {
        ...object,
        participant: {
          ...participant,
          participant_uuid: 'REJOIN-0000-0000-0000-000000000001',
          join_time: '2026-07-30T00:10:00Z',
        },
      },
      undefined
    );
    await applyParticipantEvent(
      store,
      'meeting.participant_left',
      {
        ...object,
        participant: {
          ...participant,
          participant_uuid: 'REJOIN-0000-0000-0000-000000000001',
          leave_time: '2026-07-30T00:20:00Z',
        },
      },
      undefined
    );

    expect(closes).toEqual([{ id: 'row-2', leftAt: '2026-07-30T00:20:00.000Z' }]);
  });

  it('reports a leave from a participant with no identity at all as unpairable', async () => {
    const { store, closes } = storeDouble();
    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_left',
      {
        uuid: OCCURRENCE,
        id: String(MEETING_NUMBER),
        participant: { customer_key: '', email: '', user_name: '', leave_time: '2026-07-30T00:01:25Z' },
      },
      undefined
    );
    expect(outcome).toBe('unpairable_leave');
    expect(closes).toEqual([]);
  });
});

describe('surface resolution ([R2]) and [B8] — it reads zoom_meetings and nothing else', () => {
  it('resolves by occurrence uuid first', async () => {
    const body = loadBody('meeting-participant_joined.json');
    const { store } = storeDouble();
    await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );
    expect(store.findSurfaceByOccurrence).toHaveBeenCalledWith(OCCURRENCE);
    expect(store.findSurfaceByMeetingNumber).not.toHaveBeenCalled();
  });

  it('falls back to the meeting number when the uuid is not on the row yet', async () => {
    // Normal: the first participant joining is often what STARTS the meeting, so the
    // event can beat `meeting.started` — and until that lands, zoom_meeting_uuid is NULL.
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble({
      surface: null,
      surfaceByNumber: { ...SURFACE, zoomMeetingUuid: null },
    });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );

    expect(outcome).toBe('interval_opened');
    expect(store.findSurfaceByMeetingNumber).toHaveBeenCalledWith(MEETING_NUMBER);
    // The row still keys on the EVENT's occurrence uuid, which is the correct one.
    expect(inserted[0].zoomMeetingUuid).toBe(OCCURRENCE);
  });

  it('an unresolved surface is ledger-only and NOT an error ([R2])', async () => {
    // A meeting created outside the LMS emits participant events too.
    const body = loadBody('meeting-participant_joined.json');
    const { store, inserted } = storeDouble({ surface: null, surfaceByNumber: null });

    const outcome = await applyParticipantEvent(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );

    expect(outcome).toBe('unresolved_surface');
    expect(inserted).toEqual([]);
  });

  it('[B8] the store it is handed has NO method that could move a status', () => {
    // Structural, not behavioural: a participant event cannot reach `setMeetingStatus`
    // or `setProjectionStatus` because the object passed to it does not have them. A
    // `started` write here would re-enter the §9 EXCLUDE active set and re-acquire a host.
    const { store } = storeDouble();
    expect(Object.keys(store).sort()).toEqual([
      'closeInterval',
      'findProfileIdByEmail',
      'findSurfaceByMeetingNumber',
      'findSurfaceByOccurrence',
      'insertInterval',
      'listExpectedAttendees',
      'listOpenIntervals',
      'profileExists',
    ]);
    expect(store).not.toHaveProperty('setMeetingStatus');
    expect(store).not.toHaveProperty('setProjectionStatus');
    expect(store).not.toHaveProperty('insertMeeting');
  });

  it('a lifecycle event handed to this applier does nothing at all', async () => {
    const { store, inserted } = storeDouble();
    const outcome = await applyParticipantEvent(
      store,
      'meeting.started',
      { uuid: OCCURRENCE, id: String(MEETING_NUMBER) },
      undefined
    );
    expect(outcome).toBe('ignored_event_type');
    expect(inserted).toEqual([]);
    expect(store.findSurfaceByOccurrence).not.toHaveBeenCalled();
  });
});
