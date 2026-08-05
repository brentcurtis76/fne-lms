// @vitest-environment node
/**
 * Z2-3b [A3] [A4] [A5] [A6] — the `meeting_delete` handler.
 *
 * Fake-backed end to end, like the provisioning and sync suites: `createZoomFake()` on
 * the Zoom side, the in-memory harness (which models the EXCLUDE constraint and the
 * projection RPC's monotonic guard) on the database side. The round trip goes through
 * `runZoomTick` and the REAL `createZoomJobRegistry()`, so an unregistered handler fails
 * here — [A6].
 *
 * Every identifier is synthetic (`.test` TLD, `8xxxxxxxxxx` meeting numbers).
 */
import { describe, it, expect, vi } from 'vitest';

import { runZoomTick } from '../../../../lib/zoom/jobs/runner';
import { createZoomJobRegistry } from '../../../../lib/zoom/jobs/registry';
import { describeJobFailure } from '../../../../lib/zoom/jobs/runner';
import {
  AMBIGUOUS_PARK_REASON,
  createMeetingDeleteHandler,
  NO_MEETING_ROW_REASON,
} from '../../../../lib/zoom/jobs/meeting-delete';
import {
  ambiguousCreateMarker,
  type ProvisionSessionRow,
} from '../../../../lib/zoom/jobs/meeting-provision';
import { createZoomFake, type ZoomFake } from '../../../../lib/zoom/fake';
import { ZoomJobLeaseLostError, type ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import { SESSION_TIMEZONE } from '../../../../lib/utils/session-timezone';
import { ZOOM_MEETING_ACTIVE_STATUSES, type ZoomJobRow } from '../../../../lib/zoom/db-types';
import {
  createMemoryJobQueue,
  createMemoryProvisionStore,
  type StoredMeeting,
} from './provisionHarness';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const HOST = 'zoomUserPoolA001';
/** The first number `createZoomFake()` mints after `reset()`. Asserted in the seeder. */
const MEETING_NUMBER = 82000000001;

const STARTS_AT = '2026-08-05T19:00:00.000Z';

/** The session as a cancel leaves it: `cancelada`, and still durably managed. */
const CANCELLED: ProvisionSessionRow = {
  id: SESSION_ID,
  school_id: 77,
  growth_community_id: COMMUNITY_ID,
  title: 'Sesión de acompañamiento — Ciclo 2',
  session_date: '2026-08-05',
  start_time: '15:00:00',
  end_time: '16:30:00',
  scheduled_duration_minutes: 90,
  status: 'cancelada',
  is_active: true,
  modality: 'online',
  meeting_provider: 'zoom',
  is_zoom_managed: true,
};

function provisionedRow(overrides: Partial<StoredMeeting> = {}): StoredMeeting {
  return {
    id: 'meeting-1',
    surface_type: 'consultor_session',
    surface_id: SESSION_ID,
    school_id: 77,
    host_zoom_user_id: HOST,
    zoom_meeting_number: MEETING_NUMBER,
    zoom_meeting_uuid: null,
    passcode: 'abcdefghjk',
    join_url: 'https://zoom.test/j/82000000001',
    effective_settings: { auto_recording: 'none' },
    status: 'provisioned',
    starts_at: STARTS_AT,
    duration_minutes: 90,
    last_error: null,
    ...overrides,
  };
}

function jobRow(overrides: Partial<ZoomJobRow> = {}): ZoomJobRow {
  return {
    id: 'job-delete-1',
    job_type: 'meeting_delete',
    payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    dedupe_key: null,
    status: 'leased',
    attempts: 1,
    max_attempts: 5,
    run_after: new Date(0).toISOString(),
    lease_expires_at: null,
    heartbeat_at: null,
    stage_state: {},
    last_error: null,
    worker_id: 'worker-1',
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function context(job: ZoomJobRow = jobRow()): ZoomJobContext {
  return { job, workerId: 'worker-1', heartbeat: vi.fn(async () => true) };
}

/** A fake holding the meeting this suite deletes. */
async function seedFakeWithMeeting(): Promise<ZoomFake> {
  const fake = createZoomFake();
  fake.reset();
  const meeting = await fake.createMeeting({
    hostZoomUserId: HOST,
    topic: CANCELLED.title,
    startTime: '2026-08-05T15:00:00',
    durationMinutes: 90,
    timezone: SESSION_TIMEZONE,
  });
  expect(meeting.id).toBe(MEETING_NUMBER);
  return fake;
}

function harnessFor(
  session: ProvisionSessionRow = CANCELLED,
  meetings: StoredMeeting[] = [provisionedRow()]
) {
  return createMemoryProvisionStore({
    session,
    hosts: [{ zoom_user_id: HOST, profile_id: null }],
    meetings,
  });
}

/** Seeds the projection the way a successful provision would have left it. */
function seedProjection(
  harness: ReturnType<typeof createMemoryProvisionStore>,
  meetingStatus: 'scheduled' | 'live' | 'ended' = 'scheduled'
): void {
  harness.projection.set(`consultor_session:${SESSION_ID}`, {
    surface_type: 'consultor_session',
    surface_id: SESSION_ID,
    school_id: 77,
    growth_community_id: COMMUNITY_ID,
    meeting_status: meetingStatus,
    starts_at: STARTS_AT,
    ends_at: '2026-08-05T20:30:00.000Z',
  });
}

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

describe('meeting_delete — the round trip [A3] [A6]', () => {
  it('[A6] dispatches through the real registry: DELETEs, goes terminal, publishes cancelled', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);
    const queueHarness = createMemoryJobQueue();

    await queueHarness.queue.enqueue({
      job_type: 'meeting_delete',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_delete:consultor_session:${SESSION_ID}`,
    });

    const result = await runZoomTick({
      queue: queueHarness.queue,
      // The REAL dispatch table, with fakes injected.
      registry: createZoomJobRegistry({ api: fake, meetingDeleteStore: harness.deleteStore }),
      workerId: 'worker-1',
    });

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });

    // 1. Zoom no longer holds it.
    expect(fake.listMeetings()).toEqual([]);

    // 2. The row is terminal — and therefore outside the §9 host reservation.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('deleted');
    expect(ZOOM_MEETING_ACTIVE_STATUSES as readonly string[]).not.toContain(row.status);

    // 3. [A3] the public badge is `cancelled`, which is what makes the join 410.
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('[A3] the terminal status releases the host for that window', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);

    await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(context());

    // The reservation is gone: the SAME host can now be booked for the SAME window,
    // which the harness's `insertReservation` decides with the real EXCLUDE model.
    const reserved = await harness.store.insertReservation({
      surface_type: 'consultor_session',
      surface_id: '88888888-8888-4888-8888-888888888888',
      school_id: 77,
      host_zoom_user_id: HOST,
      starts_at: STARTS_AT,
      duration_minutes: 90,
    });
    expect(reserved.reserved).toBe(true);
  });

  it('is idempotent: a redelivered job converges and does not re-call Zoom', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');
    const handler = createMeetingDeleteHandler({ api: fake, store: harness.deleteStore });

    const first = await handler(context());
    expect(first.deleted).toBe(true);

    const second = await handler(context());
    // The row is already `deleted`, so the round trip is skipped rather than replayed.
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(second.deleted).toBe(false);
    expect(second.zoom_missing).toBe(false);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('writes nothing when the lease was lost before the first write', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');
    const ctx: ZoomJobContext = { ...context(), heartbeat: vi.fn(async () => false) };

    await expect(
      createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(ctx)
    ).rejects.toBeInstanceOf(ZoomJobLeaseLostError);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).status).toBe('provisioned');
    expect(fake.listMeetings()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// A Zoom 404 (PM ruling 2)
// ---------------------------------------------------------------------------

describe('meeting_delete — a Zoom 404 is SUCCESS [A4]', () => {
  it('completes, goes terminal, and still lands the projection on cancelled', async () => {
    // The fake holds NO meeting, so `deleteMeeting` 404s exactly as the live client would.
    const fake = createZoomFake();
    fake.reset();
    const harness = harnessFor();
    seedProjection(harness);

    const result = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    );

    expect(result.zoom_missing).toBe(true);
    expect(result.deleted).toBe(false);
    // Retrying a 404 to dead-letter would leave the projection permanently stale —
    // advertising a joinable meeting that does not exist.
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).status).toBe('deleted');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('a NON-404 Zoom failure is NOT swallowed, and nothing goes terminal', async () => {
    const fake = await seedFakeWithMeeting();
    vi.spyOn(fake, 'deleteMeeting').mockRejectedValue(new Error('connection reset'));
    const harness = harnessFor();
    seedProjection(harness);

    await expect(
      createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(context())
    ).rejects.toThrow('connection reset');

    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).status).toBe('provisioned');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });
});

// ---------------------------------------------------------------------------
// Row states
// ---------------------------------------------------------------------------

describe('meeting_delete — row states [A5]', () => {
  it('[A5] refuses a surface with no zoom_meetings row, non-retryably', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(CANCELLED, []);

    const error = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe(NO_MEETING_ROW_REASON);
  });

  it('refuses a session that has vanished, non-retryably', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    const job = jobRow({
      payload: {
        surface_type: 'consultor_session',
        surface_id: '99999999-9999-4999-8999-999999999999',
      },
    });

    const error = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context(job)
    ).catch((e: unknown) => e);

    expect(describeJobFailure(error).reason).toBe('session_missing');
  });

  it('releases a bare reservation without calling Zoom', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(CANCELLED, [
      provisionedRow({
        status: 'pending',
        zoom_meeting_number: null,
        passcode: null,
        join_url: null,
        effective_settings: null,
      }),
    ]);
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    const result = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    );

    // Nothing ever reached Zoom, but the reservation was blocking a host for a window
    // nobody will use — which is the other half of what this job exists for.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(result.zoom_meeting_number).toBeNull();
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).status).toBe('deleted');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('REFUSES to release a reservation parked by an unresolved ambiguous create', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(CANCELLED, [
      provisionedRow({
        status: 'pending',
        zoom_meeting_number: null,
        passcode: null,
        join_url: null,
        effective_settings: null,
        last_error: ambiguousCreateMarker('req-abc', 'Zoom answered 502'),
      }),
    ]);
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    const error = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe(AMBIGUOUS_PARK_REASON);
    expect(record.evidence).toEqual({ meeting_id: 'meeting-1' });

    // A meeting MAY exist at Zoom under a number nobody could read, so the reservation
    // has to keep blocking that host until a human reconciles it. Zero writes.
    expect(deleteSpy).not.toHaveBeenCalled();
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(row.last_error).toContain('ambiguous_create_outcome');
  });

  it('a park that HAS a meeting number is deleted normally', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(CANCELLED, [
      provisionedRow({ last_error: ambiguousCreateMarker('req-abc', 'Zoom answered 502') }),
    ]);
    seedProjection(harness);

    const result = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    );

    // The ambiguity is resolved by the number itself: we know which meeting to remove.
    expect(result.deleted).toBe(true);
    expect(fake.listMeetings()).toEqual([]);
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).last_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Projection outcomes
// ---------------------------------------------------------------------------

describe('meeting_delete — projection outcomes', () => {
  it('treats a BLOCKED projection as success: an ENDED meeting is not rewritten', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness, 'ended');

    const result = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    );

    expect(result.projection).toBe('blocked');
    // The monotonic guard doing its job: a meeting that already ended is not
    // retroactively advertised as cancelled.
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');
  });

  it('overwrites a LIVE badge with cancelled', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness, 'live');

    const result = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    );

    expect(result.projection).toBe('published');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('fails terminally when the projection sync reports the row is missing', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    harness.deleteStore.syncProjectionFromMeeting = vi.fn(async () => 'missing' as const);

    const error = await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('sync_missing_row');
    expect(record.evidence).toMatchObject({ sync_outcome: 'missing' });
  });
});

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

describe('meeting_delete — payload', () => {
  it('refuses a community surface non-retryably (Z6 territory)', async () => {
    const harness = harnessFor();
    const job = jobRow({
      payload: { surface_type: 'community_meeting', surface_id: SESSION_ID },
    });

    const error = await createMeetingDeleteHandler({ store: harness.deleteStore })(
      context(job)
    ).catch((e: unknown) => e);

    expect(describeJobFailure(error).kind).toBe('non_retryable');
  });
});
