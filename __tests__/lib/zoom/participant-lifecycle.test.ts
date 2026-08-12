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
}

/** Models the table's partial unique index and the close guard. */
function storeDouble(options: DoubleOptions = {}) {
  const inserted: AttendanceIntervalInsert[] = [];
  const openQueries: OpenIntervalQuery[] = [];
  const rows: (StoredInterval & { participantUuid?: string | null })[] = [
    ...(options.rows ?? []),
  ];
  const closes: { id: string; leftAt: string }[] = [];

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
      // The partial unique index: (zoom_meeting_uuid, participant_uuid) WHERE uuid NOT NULL.
      if (
        row.participantUuid !== null &&
        rows.some((existing) => existing.participantUuid === row.participantUuid)
      ) {
        return 'duplicate' as const;
      }
      inserted.push(row);
      rows.push({
        id: `row-${rows.length + 1}`,
        joinedAt: row.joinedAt,
        leftAt: null,
        participantUuid: row.participantUuid,
      });
      return 'inserted' as const;
    }),
    listOpenIntervals: vi.fn(async (query: OpenIntervalQuery) => {
      openQueries.push(query);
      return rows
        .filter((row) => row.leftAt === null)
        .filter((row) =>
          query.participantUuid !== null ? row.participantUuid === query.participantUuid : true
        )
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
      body.event_ts
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

  it('[B3] dedupes a uuid-less redelivery in the applier, where no index can help', async () => {
    // A participant whose `participant_uuid` Zoom omitted gets no partial-index
    // protection, so the applier's identity + identical-instant check is the only dedupe
    // there is. Without it every anonymous guest's retry would open a second interval.
    const body = loadBody('meeting-participant_joined.json');
    const object = body.payload?.object as Record<string, unknown>;
    const participant = { ...(object.participant as Record<string, unknown>) };
    delete participant.participant_uuid;
    const uuidless = { ...object, participant };

    const { store, inserted } = storeDouble();
    expect(await applyParticipantEvent(store, 'meeting.participant_joined', uuidless, body.event_ts)).toBe(
      'interval_opened'
    );
    expect(await applyParticipantEvent(store, 'meeting.participant_joined', uuidless, body.event_ts)).toBe(
      'interval_duplicate'
    );
    expect(inserted).toHaveLength(1);
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
