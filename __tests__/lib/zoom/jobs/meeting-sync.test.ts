// @vitest-environment node
/**
 * Z2-3b [A1] [A2] [A4] [A5] [A6] — the `meeting_sync` handler.
 *
 * Fake-backed end to end: the Zoom side is `createZoomFake()`, the database side is the
 * in-memory harness whose store models the EXCLUDE constraint and the projection RPC's
 * monotonic guard. No network, no database.
 *
 * The round trip goes through `runZoomTick` and the REAL `createZoomJobRegistry()`, so a
 * handler that existed but was never registered would fail here — which is what the
 * Z1b-3 sequencing rule asks for, and what [A6] asserts.
 *
 * Every identifier is synthetic (`.test` TLD, `8xxxxxxxxxx` meeting numbers).
 */
import { describe, it, expect, vi } from 'vitest';

import { runZoomTick } from '../../../../lib/zoom/jobs/runner';
import { createZoomJobRegistry } from '../../../../lib/zoom/jobs/registry';
import {
  createMeetingSyncHandler,
  isSyncableMeetingStatus,
  MEETING_GONE_REASON,
  NO_MEETING_ROW_REASON,
  SYNCABLE_MEETING_STATUSES,
} from '../../../../lib/zoom/jobs/meeting-sync';
import type { ProvisionSessionRow } from '../../../../lib/zoom/jobs/meeting-provision';
import { describeJobFailure } from '../../../../lib/zoom/jobs/runner';
import { createZoomFake, type ZoomFake } from '../../../../lib/zoom/fake';
import { ZoomJobLeaseLostError, type ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import { SESSION_TIMEZONE } from '../../../../lib/utils/session-timezone';
import type { ZoomJobRow, ZoomMeetingStatus } from '../../../../lib/zoom/db-types';
import { createMemoryJobQueue, createMemoryProvisionStore, type StoredMeeting } from './provisionHarness';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const HOST = 'zoomUserPoolA001';
const OTHER_HOST = 'zoomUserPoolB001';
/** The first number `createZoomFake()` mints after `reset()`. Asserted in the seeder. */
const MEETING_NUMBER = 82000000001;

/**
 * The session AFTER a reschedule: 2026-08-05 moved from 15:00 to 17:00 Chile local, and
 * lengthened from 90 to 120 minutes. August is Chile STANDARD time (UTC−4), so
 * 17:00 local ⇒ 21:00Z.
 */
const RESCHEDULED: ProvisionSessionRow = {
  id: SESSION_ID,
  school_id: 77,
  growth_community_id: COMMUNITY_ID,
  title: 'Sesión de acompañamiento — Ciclo 2',
  session_date: '2026-08-05',
  start_time: '17:00:00',
  end_time: '19:00:00',
  scheduled_duration_minutes: 120,
  status: 'programada',
  is_active: true,
  modality: 'online',
  meeting_provider: 'zoom',
  is_zoom_managed: true,
};

/** Where the meeting stood BEFORE the reschedule: 15:00 local ⇒ 19:00Z, 90 minutes. */
const OLD_STARTS_AT = '2026-08-05T19:00:00.000Z';
const NEW_STARTS_AT = '2026-08-05T21:00:00.000Z';
/** What Zoom must be sent: Chile WALL-CLOCK plus the zone, never the UTC instant. */
const NEW_WALL_CLOCK = '2026-08-05T17:00:00';

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
    join_url: 'https://zoom.test/j/82345678901',
    effective_settings: { auto_recording: 'none' },
    status: 'provisioned',
    starts_at: OLD_STARTS_AT,
    duration_minutes: 90,
    last_error: null,
    ...overrides,
  };
}

function jobRow(overrides: Partial<ZoomJobRow> = {}): ZoomJobRow {
  return {
    id: 'job-sync-1',
    job_type: 'meeting_sync',
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

/**
 * A fake holding the meeting this suite reschedules, at its ORIGINAL time.
 *
 * Seeded through the real `createMeeting` so the fake's own invariants apply. The number
 * it mints is deterministic after `reset()`; asserting it keeps MEETING_NUMBER honest.
 */
async function seedFakeWithMeeting(): Promise<ZoomFake> {
  const fake = createZoomFake();
  fake.reset();
  const meeting = await fake.createMeeting({
    hostZoomUserId: HOST,
    topic: RESCHEDULED.title,
    startTime: '2026-08-05T15:00:00',
    durationMinutes: 90,
    timezone: SESSION_TIMEZONE,
  });
  expect(meeting.id).toBe(MEETING_NUMBER);
  return fake;
}

/** The fake's current view of a meeting, for assertions. */
function zoomMeetingIn(fake: ZoomFake, meetingNumber = MEETING_NUMBER) {
  return fake.listMeetings().find((meeting) => meeting.id === meetingNumber);
}

function harnessFor(
  session: ProvisionSessionRow = RESCHEDULED,
  meetings: StoredMeeting[] = [provisionedRow()]
) {
  return createMemoryProvisionStore({
    session,
    hosts: [{ zoom_user_id: HOST, profile_id: null }],
    meetings,
  });
}

/** Seeds the projection the way a successful provision would have left it. */
function seedProjection(harness: ReturnType<typeof createMemoryProvisionStore>): void {
  harness.projection.set(`consultor_session:${SESSION_ID}`, {
    surface_type: 'consultor_session',
    surface_id: SESSION_ID,
    school_id: 77,
    growth_community_id: COMMUNITY_ID,
    meeting_status: 'scheduled',
    starts_at: OLD_STARTS_AT,
    ends_at: '2026-08-05T20:30:00.000Z',
  });
}

// ---------------------------------------------------------------------------
// §10 — the wall-clock contract
// ---------------------------------------------------------------------------

describe('meeting_sync — §10 timezone discipline [A1]', () => {
  it('PATCHes Chile WALL-CLOCK plus the zone, never the UTC instant', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);
    const patchSpy = vi.spyOn(fake, 'patchMeeting');

    const result = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    );

    expect(patchSpy).toHaveBeenCalledTimes(1);
    expect(patchSpy).toHaveBeenCalledWith(MEETING_NUMBER, {
      startTime: NEW_WALL_CLOCK,
      durationMinutes: 120,
      timezone: 'America/Santiago',
    });
    // The instant is the CONVERTED value, and the two must not be confused: the string
    // sent to Zoom is local, the row and the projection carry UTC.
    expect(NEW_WALL_CLOCK).not.toBe(NEW_STARTS_AT);
    expect(result.starts_at).toBe(NEW_STARTS_AT);
  });

  it('derives the duration from start/end when scheduled_duration_minutes is NULL', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor({ ...RESCHEDULED, scheduled_duration_minutes: null });
    seedProjection(harness);
    const patchSpy = vi.spyOn(fake, 'patchMeeting');

    await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(context());

    expect(patchSpy.mock.calls[0][1].durationMinutes).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// The happy path, through the REAL registry
// ---------------------------------------------------------------------------

describe('meeting_sync — the round trip [A1] [A2] [A6]', () => {
  it('[A6] dispatches through the real registry, moves the row, and republishes', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);
    const queueHarness = createMemoryJobQueue();

    await queueHarness.queue.enqueue({
      job_type: 'meeting_sync',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_sync:consultor_session:${SESSION_ID}:${NEW_STARTS_AT}:120`,
    });

    const result = await runZoomTick({
      queue: queueHarness.queue,
      // The REAL dispatch table, with fakes injected.
      registry: createZoomJobRegistry({ api: fake, meetingSyncStore: harness.syncStore }),
      workerId: 'worker-1',
    });

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });

    // 1. the internal row
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.starts_at).toBe(NEW_STARTS_AT);
    expect(row.duration_minutes).toBe(120);
    expect(row.status).toBe('provisioned');

    // 2. Zoom
    const meeting = zoomMeetingIn(fake);
    expect(meeting?.startTime).toBe(NEW_WALL_CLOCK);
    expect(meeting?.durationMinutes).toBe(120);
    expect(meeting?.timezone).toBe('America/Santiago');

    // 3. the projection — republished from the row, so it carries the NEW window
    const projected = harness.projectionFor(SESSION_ID);
    expect(projected?.meeting_status).toBe('scheduled');
    expect(projected?.starts_at).toBe(NEW_STARTS_AT);
    expect(projected?.ends_at).toBe('2026-08-05T23:00:00.000Z');
  });

  it('is idempotent: a redelivered job converges on the same world', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);
    const handler = createMeetingSyncHandler({ api: fake, store: harness.syncStore });

    await handler(context());
    const afterFirst = { ...(harness.meetingFor(SESSION_ID) as StoredMeeting) };
    await handler(context());

    expect(harness.meetingFor(SESSION_ID)).toEqual(afterFirst);
    expect(zoomMeetingIn(fake)?.startTime).toBe(NEW_WALL_CLOCK);
  });

  it('writes nothing when the lease was lost before the first write', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    const patchSpy = vi.spyOn(fake, 'patchMeeting');
    const ctx: ZoomJobContext = { ...context(), heartbeat: vi.fn(async () => false) };

    await expect(
      createMeetingSyncHandler({ api: fake, store: harness.syncStore })(ctx)
    ).rejects.toBeInstanceOf(ZoomJobLeaseLostError);

    expect(patchSpy).not.toHaveBeenCalled();
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).starts_at).toBe(OLD_STARTS_AT);
  });
});

// ---------------------------------------------------------------------------
// Re-checked eligibility on claim (PM ruling 6)
// ---------------------------------------------------------------------------

describe('meeting_sync — eligibility is re-checked on claim [A2]', () => {
  it('refuses a session cancelled between enqueue and claim, non-retryably', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor({ ...RESCHEDULED, status: 'cancelada' });
    const patchSpy = vi.spyOn(fake, 'patchMeeting');

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('session_ineligible');
    expect(record.detail).toBe('status');
    // Nothing was written and Zoom was never called.
    expect(patchSpy).not.toHaveBeenCalled();
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).starts_at).toBe(OLD_STARTS_AT);
  });

  it.each([
    ['is_active', { is_active: false }, 'is_active'],
    ['modality', { modality: 'presencial' }, 'modality'],
    ['is_zoom_managed', { is_zoom_managed: false }, 'is_zoom_managed'],
  ])('refuses on %s, non-retryably', async (_label, patch, detail) => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor({ ...RESCHEDULED, ...patch } as ProvisionSessionRow);

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('session_ineligible');
    expect(record.detail).toBe(detail);
  });

  it('[A5] refuses a surface with no zoom_meetings row, non-retryably', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(RESCHEDULED, []);

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
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

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context(job)
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('session_missing');
  });
});

// ---------------------------------------------------------------------------
// Row states
// ---------------------------------------------------------------------------

describe('meeting_sync — row states', () => {
  it('completes as a no-op when the meeting was never provisioned', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(RESCHEDULED, [
      provisionedRow({ status: 'pending', zoom_meeting_number: null, passcode: null, join_url: null }),
    ]);
    const patchSpy = vi.spyOn(fake, 'patchMeeting');

    const result = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    );

    // `meeting_provision` re-proves its own reservation against the current schedule, so
    // there is nothing for this handler to do and nothing for a human to triage.
    expect(result).toEqual({ meeting_id: 'meeting-1', synced: false, reason: 'not_provisioned' });
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it.each<ZoomMeetingStatus>(['pending', 'started', 'ended', 'cancelled', 'deleted', 'error'])(
    'refuses to move a row in status %s, non-retryably',
    async (status) => {
      const fake = await seedFakeWithMeeting();
      const harness = harnessFor(RESCHEDULED, [provisionedRow({ status })]);
      const patchSpy = vi.spyOn(fake, 'patchMeeting');

      const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
        context()
      ).catch((e: unknown) => e);

      const record = describeJobFailure(error);
      expect(record.kind).toBe('non_retryable');
      expect(record.reason).toBe('meeting_not_syncable');
      expect(record.detail).toBe(status);
      expect(patchSpy).not.toHaveBeenCalled();
    }
  );

  it('only `provisioned` is syncable', () => {
    expect([...SYNCABLE_MEETING_STATUSES]).toEqual(['provisioned']);
    expect(isSyncableMeetingStatus('provisioned')).toBe(true);
    expect(isSyncableMeetingStatus('started')).toBe(false);
  });

  it('fails terminally, and tells ZOOM NOTHING, when the new window is host-busy', async () => {
    const fake = await seedFakeWithMeeting();
    // A second meeting already occupies the host at the NEW time.
    const harness = harnessFor(RESCHEDULED, [
      provisionedRow(),
      provisionedRow({
        id: 'meeting-2',
        surface_id: '88888888-8888-4888-8888-888888888888',
        zoom_meeting_number: 82345678902,
        starts_at: NEW_STARTS_AT,
        duration_minutes: 120,
      }),
    ]);
    const patchSpy = vi.spyOn(fake, 'patchMeeting');

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('sync_host_busy');
    expect(record.evidence).toEqual({
      meeting_id: 'meeting-1',
      target_starts_at: NEW_STARTS_AT,
      target_duration_minutes: 120,
    });
    // The whole reason the database write comes first: Zoom is still at the old time, so
    // the two sides agree and a human has a consistent world to repair.
    expect(patchSpy).not.toHaveBeenCalled();
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).starts_at).toBe(OLD_STARTS_AT);
    expect(zoomMeetingIn(fake)?.startTime).toBe('2026-08-05T15:00:00');
  });

  it('moves onto a window a DIFFERENT host occupies', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor(RESCHEDULED, [
      provisionedRow(),
      provisionedRow({
        id: 'meeting-2',
        surface_id: '88888888-8888-4888-8888-888888888888',
        host_zoom_user_id: OTHER_HOST,
        zoom_meeting_number: 82345678902,
        starts_at: NEW_STARTS_AT,
        duration_minutes: 120,
      }),
    ]);
    seedProjection(harness);

    const result = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    );

    expect(result.synced).toBe(true);
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).starts_at).toBe(NEW_STARTS_AT);
  });
});

// ---------------------------------------------------------------------------
// A Zoom 404 (PM ruling 3)
// ---------------------------------------------------------------------------

describe('meeting_sync — a Zoom 404 is a terminal FAILURE [A4]', () => {
  it('fails non-retryably, records the marker, and does not re-create', async () => {
    // The fake holds NO meeting, so `patchMeeting` 404s exactly as the live client would.
    const fake = createZoomFake();
    fake.reset();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = harnessFor();
    seedProjection(harness);

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe(MEETING_GONE_REASON);
    expect(record.detail).toBe(String(MEETING_NUMBER));
    expect(record.evidence).toEqual({
      meeting_id: 'meeting-1',
      zoom_meeting_number: MEETING_NUMBER,
    });

    // Re-provisioning is `meeting_provision`'s job; a second creator here would mint a
    // meeting outside the §9 host reservation.
    expect(createSpy).not.toHaveBeenCalled();

    // The marker lands on the row, structurally.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(JSON.parse(row.last_error as string).reason).toBe(MEETING_GONE_REASON);
    expect(JSON.parse(row.last_error as string).zoom_meeting_number).toBe(MEETING_NUMBER);
    // The projection was NOT advanced over a meeting that does not exist.
    expect(harness.projectionFor(SESSION_ID)?.starts_at).toBe(OLD_STARTS_AT);
  });

  it('a NON-404 Zoom failure keeps its own retry class', async () => {
    const fake = await seedFakeWithMeeting();
    vi.spyOn(fake, 'patchMeeting').mockRejectedValue(
      Object.assign(new Error('boom'), { name: 'ZoomRetryableError' })
    );
    const harness = harnessFor();

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    ).catch((e: unknown) => e);

    // An untyped throw is retryable by the runner's own default — the handler did not
    // swallow it into a terminal reason of its own.
    expect(describeJobFailure(error).reason).toBeUndefined();
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).last_error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Projection anomalies (the Sol R7 ② precedent)
// ---------------------------------------------------------------------------

describe('meeting_sync — an anomaly is not an outcome', () => {
  it('fails terminally when the projection sync reports the row is missing', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    seedProjection(harness);
    harness.syncStore.syncProjectionFromMeeting = vi.fn(async () => 'missing' as const);

    const error = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    ).catch((e: unknown) => e);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('sync_missing_row');
    expect(record.evidence).toMatchObject({ sync_outcome: 'missing' });
  });

  it('treats a BLOCKED projection as success — the monotonic guard doing its job', async () => {
    const fake = await seedFakeWithMeeting();
    const harness = harnessFor();
    // A `meeting.ended` webhook already advanced the badge; `scheduled` may not follow it.
    harness.projection.set(`consultor_session:${SESSION_ID}`, {
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      growth_community_id: COMMUNITY_ID,
      meeting_status: 'ended',
      starts_at: OLD_STARTS_AT,
      ends_at: '2026-08-05T20:30:00.000Z',
    });

    const result = await createMeetingSyncHandler({ api: fake, store: harness.syncStore })(
      context()
    );

    expect(result.projection).toBe('blocked');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');
  });
});

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

describe('meeting_sync — payload', () => {
  it('refuses a community surface non-retryably (Z6 territory)', async () => {
    const harness = harnessFor();
    const job = jobRow({
      payload: { surface_type: 'community_meeting', surface_id: SESSION_ID },
    });

    const error = await createMeetingSyncHandler({ store: harness.syncStore })(
      context(job)
    ).catch((e: unknown) => e);

    expect(describeJobFailure(error).kind).toBe('non_retryable');
  });

  it('refuses a payload with no surface_id non-retryably', async () => {
    const harness = harnessFor();
    const job = jobRow({ payload: { surface_type: 'consultor_session' } });

    const error = await createMeetingSyncHandler({ store: harness.syncStore })(
      context(job)
    ).catch((e: unknown) => e);

    expect(describeJobFailure(error).kind).toBe('non_retryable');
  });
});
