// @vitest-environment node
/**
 * Route suite for `/api/zoom/webhook` (§17 test matrix slice, Z1b-3).
 *
 * Everything here is fake-backed: the store is an in-memory double and the bodies come
 * from the committed fixture library (`__tests__/lib/zoom/fixtures/webhooks/`), whose
 * signatures were recomputed over the redacted bodies with the placeholder secret. No
 * network, no database, no real secret.
 *
 * The fixtures' `x-zm-request-timestamp` is fixed, so every test pins `now` to it —
 * which also means the freshness boundary is exercised deliberately rather than by
 * wall-clock accident.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { createHash } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { handleZoomWebhook, MAX_WEBHOOK_BODY_BYTES } from '../../../pages/api/zoom/webhook';
import { computeWebhookSignature } from '../../../lib/zoom/verifier';
import {
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
  PROJECTION_ENDED_APPLIES_FROM,
  PROJECTION_LIVE_APPLIES_FROM,
  type LedgerWriteResult,
  type MeetingSurfaceKeys,
  type ProjectionLifecycleStatus,
  type ZoomLifecycleStatus,
  type ZoomWebhookEventInsert,
  type ZoomWebhookStore,
} from '../../../lib/zoom/webhook-store';

import meetingStartedFixture from '../../lib/zoom/fixtures/webhooks/meeting-started.json';
import meetingEndedFixture from '../../lib/zoom/fixtures/webhooks/meeting-ended.json';
import participantJoinedFixture from '../../lib/zoom/fixtures/webhooks/meeting-participant_joined.json';

const FIXTURE_SECRET = 'fixture-secret-token-not-a-real-secret';

/** The instant the fixtures were signed at. Every fixture shares one timestamp. */
const FIXTURE_NOW_MS = Number(meetingStartedFixture.headers['x-zm-request-timestamp']) * 1000;

const CONFIGURED_ENV = {
  ZOOM_WEBHOOK_SECRET_TOKEN: FIXTURE_SECRET,
} as unknown as NodeJS.ProcessEnv;

/** `payload.object.id` as it appears in the fixtures — a decimal string. */
const FIXTURE_MEETING_NUMBER = 86084701483;
/** `payload.object.uuid` from the started fixture. Carries `+`, `/` and `==`. */
const FIXTURE_OCCURRENCE_UUID = 'de+IDqR9f3hhT9D8/NA/J1==';
/**
 * A DIFFERENT uuid, standing in for what a provision-time create/read returned. The
 * started-event assertion checks the row ends up with the OCCURRENCE uuid, not this —
 * the routed Z0B finding.
 */
const PROVISION_TIME_UUID = 'Fk+SyntheticUuid/0001==';

const MEETING_ROW_ID = '9f1d6e2a-1c44-4a7e-9a11-0c2f5b7d8e30';

// ---------------------------------------------------------------------------
// In-memory store double
// ---------------------------------------------------------------------------

interface LedgerRow {
  event: ZoomWebhookEventInsert;
  processed_at: string | null;
}

interface MeetingRow {
  id: string;
  status: string;
  zoom_meeting_uuid: string | null;
  /** The projection's key. Defaulted so existing fixtures need not spell it out. */
  surface_id?: string;
}

/** The projection row the §6 UI badge reads. Absent = no row for that surface. */
interface ProjectionRow {
  surface_type: string;
  surface_id: string;
  meeting_status: string;
}

const DEFAULT_SURFACE_ID = 'aaaa1111-2222-4333-8444-555566667777';

/**
 * MODELS THE MONOTONIC GUARD, exactly as `provisionHarness` models the EXCLUDE
 * constraint: `setMeetingStatus` / `setProjectionStatus` here re-implement the
 * conditional UPDATE's `WHERE ... IN (...)` and answer "zero rows" where Postgres
 * would. A double that wrote unconditionally would make every ordering test below
 * assert nothing. The applies-from sets are imported rather than re-typed so the
 * double cannot disagree with the store about WHICH statuses those are.
 */
function createFakeStore(
  options: { meetings?: Record<number, MeetingRow>; projections?: ProjectionRow[] } = {}
) {
  const ledger = new Map<string, LedgerRow>();
  const meetings = new Map<number, MeetingRow>(
    Object.entries(options.meetings ?? {}).map(([number, row]) => [Number(number), { ...row }])
  );
  const projections: ProjectionRow[] = (options.projections ?? []).map((row) => ({ ...row }));

  const store: ZoomWebhookStore = {
    recordEvent: vi.fn(async (event: ZoomWebhookEventInsert): Promise<LedgerWriteResult> => {
      if (ledger.has(event.dedupe_key)) return 'duplicate';
      ledger.set(event.dedupe_key, { event, processed_at: null });
      return 'inserted';
    }),
    readProcessedAt: vi.fn(async (dedupeKey: string) => {
      const row = ledger.get(dedupeKey);
      return row ? row.processed_at : undefined;
    }),
    markProcessed: vi.fn(async (dedupeKey: string, processedAt: string) => {
      const row = ledger.get(dedupeKey);
      if (row) row.processed_at = processedAt;
    }),
    findMeetingIdByNumber: vi.fn(async (meetingNumber: number) => {
      return meetings.get(meetingNumber)?.id ?? null;
    }),
    setMeetingStatus: vi.fn(
      async (meetingId: string, status: ZoomLifecycleStatus, occurrenceUuid: string | null) => {
        const appliesFrom: readonly string[] =
          status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
        for (const row of meetings.values()) {
          if (row.id !== meetingId) continue;
          // The guard. Zero rows matched ⇒ nothing written, nothing returned.
          if (!appliesFrom.includes(row.status)) return { applied: false, surface: null };
          row.status = status;
          if (occurrenceUuid !== null) row.zoom_meeting_uuid = occurrenceUuid;
          return {
            applied: true,
            surface: {
              surfaceType: 'consultor_session' as const,
              surfaceId: row.surface_id ?? DEFAULT_SURFACE_ID,
            },
          };
        }
        return { applied: false, surface: null };
      }
    ),
    setProjectionStatus: vi.fn(
      async (surface: MeetingSurfaceKeys, status: ProjectionLifecycleStatus) => {
        const appliesFrom: readonly string[] =
          status === 'live' ? PROJECTION_LIVE_APPLIES_FROM : PROJECTION_ENDED_APPLIES_FROM;
        const row = projections.find(
          (candidate) =>
            candidate.surface_type === surface.surfaceType &&
            candidate.surface_id === surface.surfaceId
        );
        // No row for this surface (a meeting created outside the LMS) ⇒ no-op.
        if (!row) return;
        if (!appliesFrom.includes(row.meeting_status)) return;
        row.meeting_status = status;
      }
    ),
  };

  return { store, ledger, meetings, projections };
}

// ---------------------------------------------------------------------------
// Invocation helper
// ---------------------------------------------------------------------------

interface InvokeOptions {
  method?: string;
  rawBody?: string | Buffer;
  headers?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  store?: ZoomWebhookStore;
  nowMs?: number;
}

/**
 * Drives the route the way Next does with `bodyParser: false` — as a stream.
 *
 * The emits are synchronous on purpose: the handler attaches its `data`/`end`
 * listeners before it first yields (its only work beforehand is the secret check and
 * the method check, both synchronous), so the bytes cannot be missed.
 */
async function invoke(options: InvokeOptions) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: (options.method ?? 'POST') as 'POST',
    headers: options.headers ?? {},
  });

  const pending = handleZoomWebhook(req, res, {
    env: options.env ?? CONFIGURED_ENV,
    store: options.store,
    now: () => options.nowMs ?? FIXTURE_NOW_MS,
  });

  if (options.rawBody !== undefined) {
    req.emit('data', Buffer.isBuffer(options.rawBody) ? options.rawBody : Buffer.from(options.rawBody, 'utf8'));
  }
  req.emit('end');
  await pending;

  return res;
}

/** Headers exactly as the fixture recorded them, lower-cased by Node in production. */
function fixtureHeaders(fixture: { headers: Record<string, string> }): Record<string, string> {
  return {
    'content-type': fixture.headers['content-type'],
    'x-zm-request-timestamp': fixture.headers['x-zm-request-timestamp'],
    'x-zm-signature': fixture.headers['x-zm-signature'],
  };
}

function sha256Hex(raw: string | Buffer): string {
  return createHash('sha256')
    .update(Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8'))
    .digest('hex');
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------

describe('/api/zoom/webhook — availability and method', () => {
  it('answers 404 when ZOOM_WEBHOOK_SECRET_TOKEN is absent (feature absent → route absent)', async () => {
    const { store, ledger } = createFakeStore();
    const res = await invoke({
      env: {} as NodeJS.ProcessEnv,
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Not found' });
    // An unconfigured deployment must not be able to write the ledger either.
    expect(ledger.size).toBe(0);
    expect(store.recordEvent).not.toHaveBeenCalled();
  });

  it('answers 405 with an Allow header for GET on a configured deployment', async () => {
    const { store } = createFakeStore();
    const res = await invoke({ method: 'GET', store });

    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader('Allow')).toBe('POST');
    expect(store.recordEvent).not.toHaveBeenCalled();
  });

  it('answers 413 for a body past the 1 MB cap without recording anything', async () => {
    const { store } = createFakeStore();
    const oversized = Buffer.alloc(MAX_WEBHOOK_BODY_BYTES + 1, 0x61);

    const res = await invoke({
      store,
      rawBody: oversized,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(413);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Payload too large' });
    expect(store.recordEvent).not.toHaveBeenCalled();
  });
});

describe('/api/zoom/webhook — verification', () => {
  it('answers 401 for a tampered signature and never echoes the reason', async () => {
    const { store } = createFakeStore();
    const good = meetingStartedFixture.headers['x-zm-signature'];
    // Flip one hex nibble — same length, so the constant-time compare is the thing
    // that rejects it rather than the length guard.
    const tampered = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');

    const res = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: { ...fixtureHeaders(meetingStartedFixture), 'x-zm-signature': tampered },
    });

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Unauthorized' });
    expect(store.recordEvent).not.toHaveBeenCalled();
  });

  it('answers 401 for a stale timestamp even though the signature is valid', async () => {
    const { store } = createFakeStore();
    const res = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
      // One second past the 600 s absolute window.
      nowMs: FIXTURE_NOW_MS + 601_000,
    });

    expect(res._getStatusCode()).toBe(401);
    expect(store.recordEvent).not.toHaveBeenCalled();
  });

  it('answers 401 when the signature header is missing entirely', async () => {
    const { store } = createFakeStore();
    const headers = fixtureHeaders(meetingStartedFixture);
    delete headers['x-zm-signature'];

    const res = await invoke({ store, rawBody: meetingStartedFixture.rawBody, headers });

    expect(res._getStatusCode()).toBe(401);
    expect(store.recordEvent).not.toHaveBeenCalled();
  });

  it('verifies the bytes that arrived, not a re-serialization', async () => {
    const { store } = createFakeStore();
    // Byte-identical content, different formatting: re-serializing before verifying
    // would accept this. It must not.
    const reserialized = JSON.stringify(JSON.parse(meetingStartedFixture.rawBody), null, 2);
    expect(reserialized).not.toBe(meetingStartedFixture.rawBody);

    const res = await invoke({
      store,
      rawBody: reserialized,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(401);
  });
});

describe('/api/zoom/webhook — CRC handshake', () => {
  /**
   * `endpoint.url_validation` is not in the captured library (the spike's subscription
   * was already validated), so this body is invented with the library's conventions:
   * synthetic token, placeholder secret, signature recomputed over the exact bytes.
   */
  const CRC_BODY = JSON.stringify({
    event: 'endpoint.url_validation',
    payload: { plainToken: 'SyntheticPlainToken0424' },
    event_ts: 1785369356750,
  });
  const CRC_TIMESTAMP = String(Math.floor(FIXTURE_NOW_MS / 1000));

  function crcHeaders(secret = FIXTURE_SECRET, body = CRC_BODY): Record<string, string> {
    return {
      'content-type': 'application/json; charset=utf-8',
      'x-zm-request-timestamp': CRC_TIMESTAMP,
      'x-zm-signature': computeWebhookSignature(secret, CRC_TIMESTAMP, body),
    };
  }

  it('answers the challenge with plainToken + HMAC(plainToken, secret)', async () => {
    const { store, ledger } = createFakeStore();
    const res = await invoke({ store, rawBody: CRC_BODY, headers: crcHeaders() });

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.plainToken).toBe('SyntheticPlainToken0424');
    expect(body.encryptedToken).toMatch(/^[0-9a-f]{64}$/);

    // No ledger row for a handshake — Zoom re-validates every 72 h.
    expect(store.recordEvent).not.toHaveBeenCalled();
    expect(ledger.size).toBe(0);
  });

  it('refuses to answer an UNVERIFIED challenge — the route is not a MAC oracle', async () => {
    const { store } = createFakeStore();
    const res = await invoke({
      store,
      rawBody: CRC_BODY,
      // Signed with a secret we do not hold: an attacker choosing plainToken.
      headers: crcHeaders('an-attacker-chosen-secret'),
    });

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Unauthorized' });
  });
});

describe('/api/zoom/webhook — ledger', () => {
  it('records a verified event keyed by sha256 of the exact raw bytes', async () => {
    const { store, ledger } = createFakeStore();
    const res = await invoke({
      store,
      rawBody: participantJoinedFixture.rawBody,
      headers: fixtureHeaders(participantJoinedFixture),
    });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ status: 'ok' });

    const expectedKey = sha256Hex(participantJoinedFixture.rawBody);
    expect(store.recordEvent).toHaveBeenCalledTimes(1);
    const row = ledger.get(expectedKey);
    expect(row).toBeDefined();
    expect(row?.event.event_type).toBe('meeting.participant_joined');
    expect(row?.event.raw_payload).toEqual(JSON.parse(participantJoinedFixture.rawBody));
    expect(row?.processed_at).not.toBeNull();
  });

  it('absorbs a Zoom retry: 200, no second insert, no second application', async () => {
    const { store, ledger, meetings } = createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status: 'provisioned',
          zoom_meeting_uuid: PROVISION_TIME_UUID,
        },
      },
    });

    const first = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });
    expect(first._getStatusCode()).toBe(200);

    const second = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(second._getStatusCode()).toBe(200);
    expect(JSON.parse(second._getData())).toEqual({ status: 'duplicate' });
    expect(ledger.size).toBe(1);
    // recordEvent is attempted twice (that IS the dedupe check) but only the first
    // call inserted, and the lifecycle was applied exactly once.
    expect(store.recordEvent).toHaveBeenCalledTimes(2);
    expect(store.setMeetingStatus).toHaveBeenCalledTimes(1);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('started');
  });

  it('finishes a replay whose first delivery recorded the row but never applied it', async () => {
    const { store, ledger, meetings } = createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status: 'provisioned',
          zoom_meeting_uuid: PROVISION_TIME_UUID,
        },
      },
    });

    // Simulate the crash window: row present, processed_at still NULL.
    ledger.set(sha256Hex(meetingStartedFixture.rawBody), {
      event: {
        dedupe_key: sha256Hex(meetingStartedFixture.rawBody),
        event_type: 'meeting.started',
        zoom_meeting_uuid: FIXTURE_OCCURRENCE_UUID,
        raw_payload: JSON.parse(meetingStartedFixture.rawBody),
      },
      processed_at: null,
    });

    const res = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(200);
    expect(ledger.size).toBe(1);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('started');
    expect(ledger.get(sha256Hex(meetingStartedFixture.rawBody))?.processed_at).not.toBeNull();
  });

  it('answers 500 when the ledger insert fails, so Zoom retries', async () => {
    const { store } = createFakeStore();
    (store.recordEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('zoom_webhook_events insert failed: connection reset')
    );

    const res = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Internal error' });
  });
});

describe('/api/zoom/webhook — lifecycle application (§15 rows only)', () => {
  it('meeting.started writes status AND the OCCURRENCE uuid from the payload', async () => {
    const { store, meetings } = createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status: 'provisioned',
          zoom_meeting_uuid: PROVISION_TIME_UUID,
        },
      },
    });

    const res = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(200);
    const row = meetings.get(FIXTURE_MEETING_NUMBER);
    expect(row?.status).toBe('started');
    // The routed Z0B finding: the uuid is the one the OCCURRENCE announced, and the
    // provision-time value it replaced is gone.
    expect(row?.zoom_meeting_uuid).toBe(FIXTURE_OCCURRENCE_UUID);
    expect(row?.zoom_meeting_uuid).not.toBe(PROVISION_TIME_UUID);
    expect(store.setMeetingStatus).toHaveBeenCalledWith(
      MEETING_ROW_ID,
      'started',
      FIXTURE_OCCURRENCE_UUID
    );
  });

  it('meeting.ended sets status and leaves the captured uuid untouched', async () => {
    const { store, meetings } = createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status: 'started',
          zoom_meeting_uuid: FIXTURE_OCCURRENCE_UUID,
        },
      },
    });

    const res = await invoke({
      store,
      rawBody: meetingEndedFixture.rawBody,
      headers: fixtureHeaders(meetingEndedFixture),
    });

    expect(res._getStatusCode()).toBe(200);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('ended');
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.zoom_meeting_uuid).toBe(FIXTURE_OCCURRENCE_UUID);
    expect(store.setMeetingStatus).toHaveBeenCalledWith(MEETING_ROW_ID, 'ended', null);
  });

  it('an unknown meeting number is a row-only 200 (normal until provisioning exists)', async () => {
    const { store, ledger } = createFakeStore({ meetings: {} });

    const res = await invoke({
      store,
      rawBody: meetingStartedFixture.rawBody,
      headers: fixtureHeaders(meetingStartedFixture),
    });

    expect(res._getStatusCode()).toBe(200);
    expect(store.findMeetingIdByNumber).toHaveBeenCalledWith(FIXTURE_MEETING_NUMBER);
    expect(store.setMeetingStatus).not.toHaveBeenCalled();
    expect(ledger.size).toBe(1);
    expect(ledger.get(sha256Hex(meetingStartedFixture.rawBody))?.processed_at).not.toBeNull();
  });

  it('a non-lifecycle event is recorded and applied as a deliberate no-op', async () => {
    const { store, ledger } = createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status: 'provisioned',
          zoom_meeting_uuid: PROVISION_TIME_UUID,
        },
      },
    });

    const res = await invoke({
      store,
      rawBody: participantJoinedFixture.rawBody,
      headers: fixtureHeaders(participantJoinedFixture),
    });

    expect(res._getStatusCode()).toBe(200);
    // Z1b-3 does not look up meetings for events it does not apply, and enqueues
    // nothing — participant handling is Z7, recordings are Z4.
    expect(store.findMeetingIdByNumber).not.toHaveBeenCalled();
    expect(store.setMeetingStatus).not.toHaveBeenCalled();
    expect(ledger.get(sha256Hex(participantJoinedFixture.rawBody))?.processed_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sol F1 — order-safe lifecycle + projection
// ---------------------------------------------------------------------------

/**
 * The ordering matrix. Zoom does not order its deliveries and `webhook_sweep` replays
 * events minutes late, so every one of these arrival orders is reachable in normal
 * operation. In each case the assertions are the same three: the internal row ends
 * `ended`, the projection ends `ended`, and the row never re-enters the §9 EXCLUDE
 * active set (`pending`/`provisioned`/`started`) — because that set is what would
 * re-acquire the host.
 */
describe('/api/zoom/webhook — F1 lifecycle ordering + projection', () => {
  const SURFACE_ID = 'bbbb1111-2222-4333-8444-555566667777';

  function seeded(status: string, meetingStatus: string) {
    return createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status,
          zoom_meeting_uuid: null,
          surface_id: SURFACE_ID,
        },
      },
      projections: [
        {
          surface_type: 'consultor_session',
          surface_id: SURFACE_ID,
          meeting_status: meetingStatus,
        },
      ],
    });
  }

  /** The EXCLUDE predicate's WHERE clause, restated where the assertion reads it. */
  const ACTIVE_RESERVING_STATUSES = ['pending', 'provisioned', 'started'];

  async function deliver(store: ZoomWebhookStore, fixture: typeof meetingStartedFixture) {
    const res = await invoke({ store, rawBody: fixture.rawBody, headers: fixtureHeaders(fixture) });
    expect(res._getStatusCode()).toBe(200);
  }

  it('started → ended: both surfaces end ended, and the host is released', async () => {
    const { store, meetings, projections } = seeded('provisioned', 'scheduled');

    await deliver(store, meetingStartedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('started');
    expect(projections[0].meeting_status).toBe('live');

    await deliver(store, meetingEndedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('ended');
    expect(projections[0].meeting_status).toBe('ended');
    expect(ACTIVE_RESERVING_STATUSES).not.toContain(meetings.get(FIXTURE_MEETING_NUMBER)?.status);
  });

  it('ended BEFORE started: the late started is refused, both surfaces stay ended', async () => {
    const { store, meetings, projections } = seeded('provisioned', 'scheduled');

    // `meeting.ended` first — it applies from `provisioned`, so it lands.
    await deliver(store, meetingEndedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('ended');
    expect(projections[0].meeting_status).toBe('ended');

    // ...and the started that Zoom delivered out of order can never reopen it.
    await deliver(store, meetingStartedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('ended');
    expect(projections[0].meeting_status).toBe('ended');
    expect(ACTIVE_RESERVING_STATUSES).not.toContain(meetings.get(FIXTURE_MEETING_NUMBER)?.status);
  });

  it('duplicate started and duplicate ended are absorbed without moving anything back', async () => {
    const { store, meetings, projections } = seeded('provisioned', 'scheduled');

    await deliver(store, meetingStartedFixture);
    // Byte-identical replay: the ledger absorbs it and `processed_at` is already set.
    await deliver(store, meetingStartedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('started');
    expect(projections[0].meeting_status).toBe('live');

    await deliver(store, meetingEndedFixture);
    await deliver(store, meetingEndedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('ended');
    expect(projections[0].meeting_status).toBe('ended');
    expect(ACTIVE_RESERVING_STATUSES).not.toContain(meetings.get(FIXTURE_MEETING_NUMBER)?.status);
  });

  it('a meeting with no projection row (created outside the LMS) is a silent no-op', async () => {
    const { store, meetings, projections } = createFakeStore({
      meetings: {
        [FIXTURE_MEETING_NUMBER]: {
          id: MEETING_ROW_ID,
          status: 'provisioned',
          zoom_meeting_uuid: null,
          surface_id: SURFACE_ID,
        },
      },
      projections: [],
    });

    await deliver(store, meetingStartedFixture);
    expect(meetings.get(FIXTURE_MEETING_NUMBER)?.status).toBe('started');
    expect(store.setProjectionStatus).toHaveBeenCalledTimes(1);
    expect(projections).toHaveLength(0);
  });
});
