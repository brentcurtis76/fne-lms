import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  applyWebhookLifecycle,
  readLifecycleInstant,
} from '../../../lib/zoom/webhook-lifecycle';
import {
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
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
 *  - `meeting.ended` carries `start_time` as well. Only the ended instant may come from
 *    it here; see `webhook-lifecycle.ts` for why.
 *
 * The store double below models PostgREST faithfully and NOT generously: the guard is
 * the applies-from set (as in Postgres) and the patch is applied verbatim, with no
 * COALESCE. Write-once is the migration trigger's job and is proved in
 * `supabase/tests/011-zoom-public-rls.sql` against a real database — modelling it here
 * would only assert that this file's own model works.
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
  patches: Record<string, unknown>[];
} {
  const patches: Record<string, unknown>[] = [];
  const store: ZoomWebhookStore = {
    recordEvent: async () => 'inserted',
    readProcessedAt: async () => undefined,
    markProcessed: async () => undefined,
    findMeetingIdByNumber: async (number) => (number === 86084701483 ? MEETING_ID : null),
    setMeetingStatus: async (_id, status, occurrenceUuid, actualInstant) => {
      const patch: Record<string, unknown> = { status };
      if (occurrenceUuid !== null) patch.zoom_meeting_uuid = occurrenceUuid;
      if (actualInstant) {
        patch[status === 'started' ? 'actual_started_at' : 'actual_ended_at'] = actualInstant;
      }
      patches.push(patch);

      // The guard, exactly as the UPDATE's `WHERE ... status IN (...)` evaluates it.
      const appliesFrom: readonly string[] =
        status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
      if (!appliesFrom.includes(row.status)) return { applied: false, surface: null };

      Object.assign(row, patch);
      return {
        applied: true,
        surface: { surfaceType: 'consultor_session', surfaceId: SURFACE_ID },
      };
    },
    setProjectionStatus: async () => undefined,
  };
  return { store, patches };
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
    // The captured `meeting.ended` DOES carry `start_time`. Reading it here would make
    // the ended event a second writer of a column the started event owns.
    expect(body.payload?.object?.start_time).toBe('2026-07-29T23:55:56Z');
    expect(row.actual_started_at).toBeNull();
    expect(row.status).toBe('ended');
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

  it('writes no instant column at all when the event carries no usable time', async () => {
    const { body } = loadCapture('meeting-started.json');
    const object = { ...body.payload?.object };
    delete object.start_time;

    const row = freshRow();
    const { store, patches } = storeOver(row);
    await applyWebhookLifecycle(store, 'meeting.started', object, undefined);

    expect(patches).toHaveLength(1);
    expect(patches[0]).not.toHaveProperty('actual_started_at');
    expect(row.actual_started_at).toBeNull();
    // The transition itself still applied — a missing instant is not a failed event.
    expect(row.status).toBe('started');
  });

  it('an OUT-OF-ORDER started (ended first, then the sweep) writes no instant', async () => {
    // The real sequence, not an inspection: `meeting.ended` lands first — Zoom does not
    // order deliveries — and `webhook_sweep` replays the `meeting.started` fifteen
    // minutes later. The status guard refuses it, so the swept event cannot write
    // actual_started_at over a finished occurrence, and cannot touch actual_ended_at.
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
    expect(row.actual_ended_at).toBe('2026-07-30T00:03:26.000Z');

    await applyWebhookLifecycle(
      store,
      'meeting.started',
      started.body.payload?.object,
      started.body.event_ts
    );

    expect(row.status).toBe('ended');
    expect(row.actual_started_at).toBeNull();
    expect(row.actual_ended_at).toBe('2026-07-30T00:03:26.000Z');
  });

  it('a participant event still moves nothing — Z7-1 adds no new applied event type', async () => {
    const { body } = loadCapture('meeting-participant_joined.json');
    const row = freshRow();
    const { store, patches } = storeOver(row);

    await applyWebhookLifecycle(
      store,
      'meeting.participant_joined',
      body.payload?.object,
      body.event_ts
    );

    expect(patches).toHaveLength(0);
    expect(row).toEqual(freshRow());
  });
});
