import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  applyWebhookLifecycle,
  MAX_PLAUSIBLE_INSTANT_MS,
  MIN_PLAUSIBLE_INSTANT_MS,
  readLifecycleInstant,
} from '../../../lib/zoom/webhook-lifecycle';
import {
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
  type LifecycleInstants,
  type ZoomWebhookStore,
} from '../../../lib/zoom/webhook-store';

/**
 * The observed elapsed instants (Z7-1; plan §11 quantity (3), stored by the C6
 * amendment on `zoom_internal.zoom_meetings.actual_started_at` / `actual_ended_at`).
 *
 * Every value asserted here comes from the COMMITTED Z0B captures rather than from a
 * hand-written body, because the whole risk in this seam is reading the wrong field of
 * a real payload. The two traps the fixtures encode:
 *
 *  - `payload.object.start_time` / `end_time` are ISO strings describing the MEETING;
 *    `event_ts` is a number in MILLISECONDS describing the DELIVERY; and the
 *    `x-zm-request-timestamp` HEADER is in SECONDS. Mixing the last two has already
 *    produced one committed defect in this repo, so the header value is asserted to be
 *    unreachable rather than merely unused.
 *  - `meeting.ended` carries `start_time` as well, and Z7-1 DOES read it — that is what
 *    lets an out-of-order pair record both instants. But `event_ts` may stand in only
 *    for `end_time` on that branch: this event was delivered when the meeting finished,
 *    so using its timestamp as a start would record a zero-length meeting as fact.
 *
 * The store double below models Postgres faithfully and NOT generously: the guard is
 * the applies-from set, and `COALESCE(existing, offered)` is exactly what
 * `zoom_internal.apply_meeting_lifecycle` does — the two are small enough to keep in
 * agreement by inspection, and the real-database half is asserted independently in
 * `supabase/tests/011-zoom-public-rls.sql` so this model is never the only evidence.
 */

const FIXTURE_DIR = path.join(process.cwd(), '__tests__/lib/zoom/fixtures/webhooks');

interface CapturedFixture {
  headers: Record<string, string>;
  rawBody: string;
}

interface ZoomBody {
  event?: unknown;
  event_ts?: unknown;
  payload?: { object?: { id?: unknown; uuid?: unknown; start_time?: unknown; end_time?: unknown } };
}

function loadCapture(file: string): { fixture: CapturedFixture; body: ZoomBody } {
  const fixture = JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as CapturedFixture;
  return { fixture, body: JSON.parse(fixture.rawBody) as ZoomBody };
}

const MEETING_ID = '11111111-2222-3333-4444-555555555555';
const SURFACE_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

/** The row as Postgres holds it — only the columns this seam touches. */
interface MeetingRow {
  status: string;
  zoom_meeting_uuid: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
}

function storeOver(row: MeetingRow): {
  store: ZoomWebhookStore;
  offered: (LifecycleInstants | undefined)[];
} {
  const offered: (LifecycleInstants | undefined)[] = [];
  const store: ZoomWebhookStore = {
    recordEvent: async () => 'inserted',
    readProcessedAt: async () => undefined,
    markProcessed: async () => undefined,
    findMeetingIdByNumber: async (number) => (number === 86084701483 ? MEETING_ID : null),
    setMeetingStatus: async (_id, status, occurrenceUuid, instants) => {
      offered.push(instants);

      // The guard, exactly as `WHERE ... status = ANY (p_applies_from)` evaluates it.
      const appliesFrom: readonly string[] =
        status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
      if (!appliesFrom.includes(row.status)) return { applied: false, surface: null };

      // ...and the SET list, including the fill-while-NULL COALESCE.
      row.status = status;
      if (row.zoom_meeting_uuid === null && occurrenceUuid !== null) {
        row.zoom_meeting_uuid = occurrenceUuid;
      }
      row.actual_started_at = row.actual_started_at ?? instants?.actualStartedAt ?? null;
      row.actual_ended_at = row.actual_ended_at ?? instants?.actualEndedAt ?? null;

      return {
        applied: true,
        surface: { surfaceType: 'consultor_session', surfaceId: SURFACE_ID },
      };
    },
    setProjectionStatus: async () => undefined,
  };
  return { store, offered };
}

function freshRow(overrides: Partial<MeetingRow> = {}): MeetingRow {
  return {
    status: 'provisioned',
    zoom_meeting_uuid: null,
    actual_started_at: null,
    actual_ended_at: null,
    ...overrides,
  };
}

describe('readLifecycleInstant', () => {
  it('prefers the meeting-shaped ISO field over the delivery timestamp', () => {
    expect(readLifecycleInstant('2026-07-29T23:55:56Z', 1785369356750)).toBe(
      '2026-07-29T23:55:56.000Z'
    );
  });

  it('falls back to `event_ts`, read as MILLISECONDS', () => {
    expect(readLifecycleInstant(undefined, 1785369356750)).toBe('2026-07-29T23:55:56.750Z');
  });

  it('[B1] REJECTS a header-seconds value, which used to become a 1970 instant', () => {
    // The reviewer's own probe, as a named case. `x-zm-request-timestamp` is 1785368934
    // SECONDS; the old `Number.isSafeInteger(x) && x > 0` accepted it and produced
    // 1970-01-21 — silently, as a fact about a 2026 meeting, on the surface an admin
    // compares against planned hours.
    const headerSeconds = 1785368934;
    expect(new Date(headerSeconds).toISOString()).toBe('1970-01-21T15:56:08.934Z');
    expect(readLifecycleInstant(undefined, headerSeconds)).toBeNull();
  });

  it('[B1] REJECTS Number.MAX_SAFE_INTEGER, which used to throw RangeError', () => {
    // The reviewer's other probe. The old guard passed it to `new Date(...)`, whose
    // `toISOString()` threw out of a webhook route — a 500, and Zoom retrying the same
    // malformed body forever against an endpoint that can never accept it.
    expect(() => new Date(Number.MAX_SAFE_INTEGER).toISOString()).toThrow(RangeError);
    expect(readLifecycleInstant(undefined, Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(readLifecycleInstant(undefined, -Number.MAX_SAFE_INTEGER)).toBeNull();
  });

  it('[B1] applies the same band to the ISO path — Date.parse accepts year 275760', () => {
    expect(Number.isFinite(Date.parse('+275760-09-13T00:00:00Z'))).toBe(true);
    expect(readLifecycleInstant('+275760-09-13T00:00:00Z', undefined)).toBeNull();
    expect(readLifecycleInstant('1970-01-01T00:00:00Z', undefined)).toBeNull();
  });

  it('[B1] the band is wide enough that every real value still passes unchanged', () => {
    // Existing behaviour for the fixtures' real values is the other half of the criterion.
    expect(readLifecycleInstant('2026-07-29T23:55:56Z', undefined)).toBe(
      '2026-07-29T23:55:56.000Z'
    );
    expect(readLifecycleInstant(undefined, 1785369356750)).toBe('2026-07-29T23:55:56.750Z');
    expect(readLifecycleInstant(new Date(MIN_PLAUSIBLE_INSTANT_MS).toISOString(), undefined)).toBe(
      '2000-01-01T00:00:00.000Z'
    );
    expect(readLifecycleInstant(undefined, MIN_PLAUSIBLE_INSTANT_MS)).toBe(
      '2000-01-01T00:00:00.000Z'
    );
    expect(readLifecycleInstant(undefined, MAX_PLAUSIBLE_INSTANT_MS)).toBe(
      '2100-01-01T00:00:00.000Z'
    );
    expect(readLifecycleInstant(undefined, MIN_PLAUSIBLE_INSTANT_MS - 1)).toBeNull();
    expect(readLifecycleInstant(undefined, MAX_PLAUSIBLE_INSTANT_MS + 1)).toBeNull();
  });

  it('yields null rather than a fabricated instant when neither is usable', () => {
    // Failing toward NULL is the required direction: a missing comparison value shows
    // as a missing panel column, a fabricated one is presented to an admin as evidence
    // about a consultant's billable presence.
    expect(readLifecycleInstant(undefined, undefined)).toBeNull();
    expect(readLifecycleInstant('', undefined)).toBeNull();
    expect(readLifecycleInstant('not a date', undefined)).toBeNull();
    expect(readLifecycleInstant(null, null)).toBeNull();
    expect(readLifecycleInstant(undefined, '1785369356750')).toBeNull();
    expect(readLifecycleInstant(undefined, 0)).toBeNull();
    expect(readLifecycleInstant(undefined, -1)).toBeNull();
  });
});

describe('applyWebhookLifecycle — observed instants, by value from the committed captures', () => {
  it('`meeting.started` records actual_started_at from payload.object.start_time', async () => {
    const { body } = loadCapture('meeting-started.json');
    const row = freshRow();
    const { store } = storeOver(row);

    await applyWebhookLifecycle(store, 'meeting.started', body.payload?.object, body.event_ts);

    expect(row.actual_started_at).toBe('2026-07-29T23:55:56.000Z');
    // The started event owns only its own column.
    expect(row.actual_ended_at).toBeNull();
    // ...and the pre-existing behaviour is untouched.
    expect(row.status).toBe('started');
    expect(row.zoom_meeting_uuid).toBe('de+IDqR9f3hhT9D8/NA/J1==');
  });

  it('`meeting.ended` records actual_ended_at from payload.object.end_time', async () => {
    const { body } = loadCapture('meeting-ended.json');
    const row = freshRow({ status: 'started' });
    const { store } = storeOver(row);

    await applyWebhookLifecycle(store, 'meeting.ended', body.payload?.object, body.event_ts);

    expect(row.actual_ended_at).toBe('2026-07-30T00:03:26.000Z');
    expect(row.status).toBe('ended');
    expect(row.zoom_meeting_uuid).toBe('de+IDqR9f3hhT9D8/NA/J1==');
  });

  it('`meeting.ended` cannot overwrite an actual_started_at that `started` recorded', async () => {
    // It offers one — its payload carries `start_time` — but the fill-while-NULL rule
    // means the value `meeting.started` recorded is the one that stands.
    const { body } = loadCapture('meeting-ended.json');
    const row = freshRow({ status: 'started', actual_started_at: '2020-01-01T00:00:00.000Z' });
    const { store, offered } = storeOver(row);

    await applyWebhookLifecycle(store, 'meeting.ended', body.payload?.object, body.event_ts);

    expect(offered[0]?.actualStartedAt).toBe('2026-07-29T23:55:56.000Z');
    expect(row.actual_started_at).toBe('2020-01-01T00:00:00.000Z');
    expect(row.actual_ended_at).toBe('2026-07-30T00:03:26.000Z');
  });

  it('`meeting.ended` fills a missing occurrence uuid but cannot overwrite one already established', async () => {
    // Ended-before-started is supported. The later start is refused by the lifecycle
    // guard, so ended is the only event that can make the occurrence report-eligible.
    // The SQL COALESCE still makes an established identity immutable on replay.
    const { body } = loadCapture('meeting-ended.json');
    expect(body.payload?.object?.uuid).toBe('de+IDqR9f3hhT9D8/NA/J1==');

    const missing = freshRow({ status: 'started' });
    await applyWebhookLifecycle(
      storeOver(missing).store,
      'meeting.ended',
      body.payload?.object,
      body.event_ts
    );
    expect(missing.zoom_meeting_uuid).toBe('de+IDqR9f3hhT9D8/NA/J1==');

    const established = freshRow({
      status: 'started',
      zoom_meeting_uuid: 'Established/Occurrence==',
    });
    const { store } = storeOver(established);

    await applyWebhookLifecycle(store, 'meeting.ended', body.payload?.object, body.event_ts);

    expect(established.zoom_meeting_uuid).toBe('Established/Occurrence==');
  });

  it('`event_ts` may stand in for end_time but NEVER for start_time on the ended branch', async () => {
    // The ended event is delivered when the meeting FINISHED. Letting its timestamp
    // fall back into actual_started_at would record a zero-length meeting as fact, and
    // that number is the one an admin compares a consultant's billable presence against.
    const { body } = loadCapture('meeting-ended.json');
    const object = { ...body.payload?.object };
    delete object.start_time;
    delete object.end_time;

    const row = freshRow({ status: 'started' });
    const { store, offered } = storeOver(row);

    await applyWebhookLifecycle(store, 'meeting.ended', object, body.event_ts);

    expect(offered[0]).toEqual({
      actualStartedAt: null,
      actualEndedAt: '2026-07-30T00:03:26.781Z',
    });
    expect(row.actual_started_at).toBeNull();
  });

  it('never derives an instant from the x-zm-request-timestamp header', async () => {
    // The header is SECONDS and the body's event_ts is MILLISECONDS. This asserts the
    // recorded value is neither reading of the header, in either unit.
    const { fixture, body } = loadCapture('meeting-started.json');
    const headerSeconds = Number(fixture.headers['x-zm-request-timestamp']);
    expect(Number.isSafeInteger(headerSeconds)).toBe(true);

    const row = freshRow();
    const { store } = storeOver(row);
    await applyWebhookLifecycle(store, 'meeting.started', body.payload?.object, body.event_ts);

    expect(row.actual_started_at).not.toBe(new Date(headerSeconds).toISOString());
    expect(row.actual_started_at).not.toBe(new Date(headerSeconds * 1000).toISOString());
  });

  it('uses the body `event_ts` in milliseconds when Zoom omits start_time', async () => {
    const { body } = loadCapture('meeting-started.json');
    const object = { ...body.payload?.object };
    delete object.start_time;

    const row = freshRow();
    const { store } = storeOver(row);
    await applyWebhookLifecycle(store, 'meeting.started', object, body.event_ts);

    expect(body.event_ts).toBe(1785369356750);
    expect(row.actual_started_at).toBe('2026-07-29T23:55:56.750Z');
  });

  it('offers no instant at all when the event carries no usable time', async () => {
    const { body } = loadCapture('meeting-started.json');
    const object = { ...body.payload?.object };
    delete object.start_time;

    const row = freshRow();
    const { store, offered } = storeOver(row);
    await applyWebhookLifecycle(store, 'meeting.started', object, undefined);

    expect(offered).toEqual([{ actualStartedAt: null, actualEndedAt: null }]);
    expect(row.actual_started_at).toBeNull();
    // The transition itself still applied — a missing instant is not a failed event.
    expect(row.status).toBe('started');
  });

  it('a REPLAYED started cannot overwrite the instant the first delivery recorded', async () => {
    // `webhook_sweep` re-applies events fifteen minutes or more after they arrive, and
    // `started` is in its own applies-from set, so the second call is APPLIED — the
    // fill-while-NULL rule, not the status guard, is what protects the value here.
    const { body } = loadCapture('meeting-started.json');
    const row = freshRow();
    const { store } = storeOver(row);

    await applyWebhookLifecycle(store, 'meeting.started', body.payload?.object, body.event_ts);
    expect(row.actual_started_at).toBe('2026-07-29T23:55:56.000Z');

    await applyWebhookLifecycle(
      store,
      'meeting.started',
      { ...body.payload?.object, start_time: '2001-01-01T00:00:00Z' },
      body.event_ts
    );

    expect(row.actual_started_at).toBe('2026-07-29T23:55:56.000Z');
  });

  it('an OUT-OF-ORDER pair still records BOTH exact instants', async () => {
    // The real sequence, not an inspection: `meeting.ended` lands first — Zoom does not
    // order deliveries — and `webhook_sweep` replays the `meeting.started` fifteen
    // minutes later, where the status guard refuses it. The row must not be left with a
    // NULL start: the `ended` payload stated when the occurrence began, so both columns
    // carry their exact fixture values by the time the dust settles.
    const ended = loadCapture('meeting-ended.json');
    const started = loadCapture('meeting-started.json');

    const row = freshRow();
    const { store } = storeOver(row);

    await applyWebhookLifecycle(
      store,
      'meeting.ended',
      ended.body.payload?.object,
      ended.body.event_ts
    );
    expect(row.status).toBe('ended');

    await applyWebhookLifecycle(
      store,
      'meeting.started',
      started.body.payload?.object,
      started.body.event_ts
    );

    expect(row.status).toBe('ended');
    expect(row.actual_started_at).toBe('2026-07-29T23:55:56.000Z');
    expect(row.actual_ended_at).toBe('2026-07-30T00:03:26.000Z');
    // The refused `started` cannot repair this row later. The ended delivery therefore
    // has to persist its occurrence UUID immediately so report reconciliation is eligible.
    expect(row.zoom_meeting_uuid).toBe('de+IDqR9f3hhT9D8/NA/J1==');
  });

  it('a participant event still moves nothing — Z7-1 adds no new applied event type', async () => {
    const { body } = loadCapture('meeting-participant_joined.json');
    const row = freshRow();
    const { store, offered } = storeOver(row);

    await applyWebhookLifecycle(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );

    expect(offered).toHaveLength(0);
    expect(row).toEqual(freshRow());
  });
});
