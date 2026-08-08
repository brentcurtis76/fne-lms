// @vitest-environment node
/**
 * `meeting_provision` suite — the §15 Z1b DoD "mock-mode provision round trip".
 *
 * Fake-backed end to end: the Zoom side is `createZoomFake()`, the database side is the
 * in-memory harness whose store models the EXCLUDE constraint. No network, no database.
 * The round trip goes through `runZoomTick` and the REAL `createZoomJobRegistry()`, so
 * a handler that existed but was never registered would fail these tests — which is
 * what the Z1b-3 sequencing rule asks for.
 *
 * Every identifier is synthetic (`.test` TLD, `8xxxxxxxxxx` meeting numbers).
 */
import { describe, it, expect, vi } from 'vitest';

import { runZoomTick } from '../../../../lib/zoom/jobs/runner';
import { createZoomJobRegistry } from '../../../../lib/zoom/jobs/registry';
import {
  ambiguousCreateMarker,
  COMPENSATION_FAILED_REASON,
  createMeetingProvisionHandler,
  deriveDurationMinutes,
  generateMeetingPasscode,
  isTerminalAnomalyResolved,
  orderHostCandidates,
  parseCompensationFailedMarker,
  PUBLISHABLE_MEETING_STATUSES,
  readCreatedCheckpoint,
  reservationOverlapBounds,
  toZoomWallClock,
  ZoomNoHostAvailableError,
  type AtomicProvisionPatch,
  type CreatedMeetingCheckpoint,
  type ProvisionHostRow,
  type ProvisionMeetingRow,
  type ProvisionSessionRow,
  type ReservationInsert,
} from '../../../../lib/zoom/jobs/meeting-provision';
import {
  COMPENSATION_PARK_REASON,
  createMeetingDeleteHandler,
  NO_MEETING_ROW_REASON,
} from '../../../../lib/zoom/jobs/meeting-delete';
import { ZoomNonRetryableError, ZoomRetryableError } from '../../../../lib/zoom/errors';
import { createLiveZoomApi, type ZoomApi } from '../../../../lib/zoom/api';
import { createZoomClient } from '../../../../lib/zoom/client';
import type { ZoomTokenProvider } from '../../../../lib/zoom/token';
import { describeJobFailure, serializeJobFailure } from '../../../../lib/zoom/jobs/runner';
import { createZoomFake, type ZoomFake } from '../../../../lib/zoom/fake';
import { applyWebhookLifecycle } from '../../../../lib/zoom/webhook-lifecycle';
import { ZoomJobLeaseLostError, type ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import {
  ZOOM_MEETING_ACTIVE_STATUSES,
  type ZoomJobRow,
  type ZoomMeetingStatus,
} from '../../../../lib/zoom/db-types';
import {
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
  PROJECTION_ENDED_APPLIES_FROM,
  PROJECTION_LIVE_APPLIES_FROM,
  type ZoomWebhookStore,
} from '../../../../lib/zoom/webhook-store';
import {
  createMemoryJobQueue,
  createMemoryProvisionStore,
  type StoredJob,
  type StoredMeeting,
} from './provisionHarness';

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_PROFILE = '22222222-2222-4222-8222-222222222222';
const OTHER_PROFILE = '33333333-3333-4333-8333-333333333333';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';

/** 2026-08-05 is Chile STANDARD time (UTC−4): 15:00 local ⇒ 19:00Z. */
const SESSION: ProvisionSessionRow = {
  id: SESSION_ID,
  school_id: 77,
  growth_community_id: COMMUNITY_ID,
  title: 'Sesión de acompañamiento — Ciclo 2',
  session_date: '2026-08-05',
  start_time: '15:00:00',
  end_time: '16:30:00',
  scheduled_duration_minutes: 90,
  // The §8 eligibility columns (Sol F3). Values are the live CHECK-constraint
  // vocabulary from baseline:7740-7742.
  status: 'programada',
  is_active: true,
  modality: 'online',
  meeting_provider: 'zoom',
  // Z2-1: durable managed intent. This fixture is the session the whole file provisions
  // for, and only a session the scheduler marked "Generar reunión Zoom" is ever
  // provisioned for — so the ONE happy-path fixture is legitimately managed. Every
  // refusal case below derives from it by patch, so nothing else needed changing.
  is_zoom_managed: true,
};

const EXPECTED_STARTS_AT = '2026-08-05T19:00:00.000Z';
const EXPECTED_ENDS_AT = '2026-08-05T20:30:00.000Z';

const HOST_LEAD: ProvisionHostRow = { zoom_user_id: 'zoomUserLead0001', profile_id: LEAD_PROFILE };
const HOST_POOL_A: ProvisionHostRow = { zoom_user_id: 'zoomUserPoolA001', profile_id: null };
const HOST_POOL_B: ProvisionHostRow = { zoom_user_id: 'zoomUserPoolB001', profile_id: null };

function jobRow(overrides: Partial<ZoomJobRow> = {}): ZoomJobRow {
  return {
    id: 'job-standalone',
    job_type: 'meeting_provision',
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

/** Real lifecycle applier over the provision harness's rows/projection. */
function lifecycleStoreFor(
  harness: ReturnType<typeof createMemoryProvisionStore>,
  row: StoredMeeting,
  meetingNumber: number
): ZoomWebhookStore {
  return {
    recordEvent: vi.fn(async () => 'inserted' as const),
    readProcessedAt: vi.fn(async () => undefined),
    markProcessed: vi.fn(async () => undefined),
    findMeetingIdByNumber: vi.fn(async (number: number) =>
      number === meetingNumber ? row.id : null
    ),
    setMeetingStatus: vi.fn(async (_id, status, uuid) => {
      const appliesFrom: readonly string[] =
        status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
      if (!appliesFrom.includes(row.status)) return { applied: false, surface: null };
      row.status = status;
      if (uuid !== null) row.zoom_meeting_uuid = uuid;
      return {
        applied: true,
        surface: { surfaceType: row.surface_type, surfaceId: row.surface_id },
      };
    }),
    setProjectionStatus: vi.fn(async (surface, status) => {
      const projected = harness.projectionFor(surface.surfaceId);
      if (!projected) return;
      const appliesFrom: readonly string[] =
        status === 'live' ? PROJECTION_LIVE_APPLIES_FROM : PROJECTION_ENDED_APPLIES_FROM;
      if (appliesFrom.includes(projected.meeting_status)) projected.meeting_status = status;
    }),
  };
}

function seedFake(): ZoomFake {
  const fake = createZoomFake();
  fake.reset();
  return fake;
}

/**
 * A clock that has spent the whole tick budget by its third read, so `runZoomTick`
 * claims exactly ONE batch and returns. Without it the in-memory queue — which has no
 * `run_after` backoff — would re-claim a just-failed job inside the same tick, and the
 * two runs the crash test is about would collapse into one.
 */
function oneBatchClock(): () => number {
  let read = 0;
  // 0 = startedAt, 1 = the while-check that admits the batch, 2+ = budget exhausted.
  return () => (read++ < 2 ? 0 : 1_000_000);
}

// ---------------------------------------------------------------------------
// §10 — timezone discipline
// ---------------------------------------------------------------------------

describe('meeting_provision · §10 timezone rules', () => {
  it('sends Zoom the Chile WALL CLOCK, not a UTC conversion', () => {
    expect(toZoomWallClock('2026-08-05', '15:00:00')).toBe('2026-08-05T15:00:00');
    expect(toZoomWallClock('2026-08-05', '15:00')).toBe('2026-08-05T15:00:00');
  });

  it('derives duration from start/end when the generated column is NULL', () => {
    expect(deriveDurationMinutes('2026-08-05', '15:00:00', '16:30:00')).toBe(90);
  });

  it('bounds the load window by the ±15/+45 reservation buffers', () => {
    const startsAtMs = Date.parse(EXPECTED_STARTS_AT);
    const { boundLowerIso, boundUpperIso } = reservationOverlapBounds(startsAtMs, 90);
    // lower = start − 60 min, upper = end + 60 min.
    expect(boundLowerIso).toBe('2026-08-05T18:00:00.000Z');
    expect(boundUpperIso).toBe('2026-08-05T21:30:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// §9 — host ordering
// ---------------------------------------------------------------------------

describe('meeting_provision · §9 host resolution', () => {
  it('puts the LEAD facilitator first, then other facilitators, then the pool', () => {
    const hosts = [HOST_POOL_A, { zoom_user_id: 'zoomUserOther001', profile_id: OTHER_PROFILE }, HOST_LEAD];
    const ordered = orderHostCandidates(
      hosts,
      [
        { user_id: LEAD_PROFILE, is_lead: true },
        { user_id: OTHER_PROFILE, is_lead: false },
      ],
      {}
    );
    expect(ordered.map((host) => host.zoom_user_id)).toEqual([
      'zoomUserLead0001',
      'zoomUserOther001',
      'zoomUserPoolA001',
    ]);
  });

  it('orders least-loaded first within a tier, with a deterministic id tie-break', () => {
    const ordered = orderHostCandidates([HOST_POOL_B, HOST_POOL_A], [], {
      zoomUserPoolA001: 3,
      zoomUserPoolB001: 1,
    });
    expect(ordered.map((host) => host.zoom_user_id)).toEqual([
      'zoomUserPoolB001',
      'zoomUserPoolA001',
    ]);

    // Equal load ⇒ ascending zoom_user_id, so two racing workers agree on the order.
    const tied = orderHostCandidates([HOST_POOL_B, HOST_POOL_A], [], {});
    expect(tied.map((host) => host.zoom_user_id)).toEqual([
      'zoomUserPoolA001',
      'zoomUserPoolB001',
    ]);
  });

  it("never offers another person's personal host", () => {
    const ordered = orderHostCandidates(
      [{ zoom_user_id: 'zoomUserStranger', profile_id: OTHER_PROFILE }],
      [{ user_id: LEAD_PROFILE, is_lead: true }],
      {}
    );
    expect(ordered).toEqual([]);
  });
});

describe('meeting_provision · passcode', () => {
  it('generates a 10-char passcode that differs across calls', () => {
    const first = generateMeetingPasscode();
    const second = generateMeetingPasscode();
    expect(first).toHaveLength(10);
    expect(first).toMatch(/^[a-z0-9]{10}$/);
    expect(first).not.toBe(second);
  });
});

// ---------------------------------------------------------------------------
// The §15 DoD round trip
// ---------------------------------------------------------------------------

describe('meeting_provision · mock-mode round trip (§15 Z1b DoD)', () => {
  it('enqueue → runZoomTick → provisioned meeting, projection and done job', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: SESSION,
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD, HOST_POOL_A],
    });
    const queueHarness = createMemoryJobQueue();

    await queueHarness.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    const result = await runZoomTick({
      queue: queueHarness.queue,
      // The REAL dispatch table, with fakes injected.
      registry: createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store }),
      workerId: 'worker-1',
    });

    expect(result).toEqual({ claimed: 1, completed: 1, failed: 0 });

    const meeting = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(meeting.status).toBe('provisioned');
    expect(meeting.zoom_meeting_number).toBeGreaterThan(82000000000);
    expect(meeting.passcode).toMatch(/^[a-z0-9]{10}$/);
    expect(meeting.join_url).toContain(String(meeting.zoom_meeting_number));
    expect(meeting.host_zoom_user_id).toBe('zoomUserLead0001');
    expect(meeting.starts_at).toBe(EXPECTED_STARTS_AT);
    expect(meeting.duration_minutes).toBe(90);

    // §8 provisioning settings, read back off the RESPONSE.
    expect(meeting.effective_settings).toMatchObject({
      join_before_host: false,
      waiting_room: false,
      auto_recording: 'none',
    });

    // The routed Z0B finding: the occurrence uuid is NOT captured at provision.
    expect(meeting.zoom_meeting_uuid).toBeNull();

    // Zoom really holds it, under the reserved host, at the Chile wall clock.
    const atZoom = fake.listMeetings();
    expect(atZoom).toHaveLength(1);
    expect(atZoom[0].startTime).toBe('2026-08-05T15:00:00');
    expect(atZoom[0].timezone).toBe('America/Santiago');
    expect(atZoom[0].topic).toBe('Sesión de acompañamiento — Ciclo 2');
    expect(atZoom[0].hostZoomUserId).toBe('zoomUserLead0001');

    // The projection carries the community id, or the §7 GC-member policy matches
    // nothing and the row is invisible to the people it is for.
    const projected = harness.projectionFor(SESSION_ID);
    expect(projected).toMatchObject({
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      growth_community_id: COMMUNITY_ID,
      meeting_status: 'scheduled',
      starts_at: EXPECTED_STARTS_AT,
      ends_at: EXPECTED_ENDS_AT,
    });

    const job = queueHarness.jobFor('meeting_provision');
    expect(job?.status).toBe('done');
  });

  /**
   * NOTE: this is the REPLAY of a run that COMPLETED (at-least-once redelivery), not the
   * mid-crash case — run 1 persisted the meeting number, so run 2 resumes off anchor 1.
   * The genuine create→persist crash is the next test.
   */
  it('replays a COMPLETED run off the row: no second create, drift re-derived', async () => {
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD],
    });

    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });

    // Run 1 — provisions.
    const first = await handler(context());
    expect(first.created).toBe(true);

    // Run 2 — the at-least-once replay. The row already carries a meeting number, so
    // the create is skipped and only the remaining steps re-run.
    const second = await handler(context());
    expect(second.created).toBe(false);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(fake.listMeetings()).toHaveLength(1);
    expect(harness.meetings).toHaveLength(1);
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('provisioned');
    expect(second.zoom_meeting_number).toBe(first.zoom_meeting_number);

    // Derived from the settings the row actually holds, not from a constant.
    expect(second.effective_auto_recording).toBe('none');
    expect(second.settings_drift).toBe(false);
  });

  it('re-derives §9.4 drift from the PERSISTED row on the replay path', async () => {
    const fake = seedFake();
    // What a first attempt persisted from an account that forces cloud recording on.
    const drifted: StoredMeeting = {
      id: 'meeting-drifted',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: 'zoomUserPoolA001',
      zoom_meeting_number: 82000004242,
      zoom_meeting_uuid: null,
      passcode: 'driftpass1',
      join_url: 'https://example-synthetic.test/j/82000004242',
      effective_settings: { join_before_host: false, waiting_room: false, auto_recording: 'cloud' },
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [drifted],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(result.created).toBe(false);
    // This path used to hardcode 'none' — it reported a clean run for a meeting Zoom
    // is recording. The signal has to survive the resume.
    expect(result.effective_auto_recording).toBe('cloud');
    expect(result.settings_drift).toBe(true);
    expect(fake.listMeetings()).toHaveLength(0);
  });

  it('adopts the post-create checkpoint after a genuine mid-crash: ONE create in two runs', async () => {
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD],
    });
    const queueHarness = createMemoryJobQueue();
    const registry = createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store });

    await queueHarness.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    // THE crash window: Zoom minted the meeting, the persist never landed. Since Sol R6
    // the fresh-create persist IS `adoptCheckpointMeeting`, so that is what fails here;
    // `mockRejectedValueOnce` leaves run 2's genuine adoption call working.
    vi.mocked(harness.store.adoptCheckpointMeeting).mockRejectedValueOnce(
      new Error('connection reset')
    );

    const firstTick = await runZoomTick({
      queue: queueHarness.queue,
      registry,
      workerId: 'worker-1',
      now: oneBatchClock(),
    });
    expect(firstTick).toEqual({ claimed: 1, completed: 0, failed: 1 });

    // The row is exactly what the finding describes — pending, no meeting number...
    const midRow = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(midRow.status).toBe('pending');
    expect(midRow.zoom_meeting_number).toBeNull();

    // ...but the meeting Zoom is holding is NAMED in the job's stage_state, and the
    // untyped failure is retryable, so the job is runnable again.
    const atZoom = fake.listMeetings();
    expect(atZoom).toHaveLength(1);
    const job = queueHarness.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('pending');
    expect(job.stage_state).toMatchObject({
      stage: 'created',
      meeting_id: midRow.id,
      meeting: { number: atZoom[0].id, passcode: atZoom[0].passcode },
    });

    // Run 2 claims the same job WITH that checkpoint and adopts it.
    const secondTick = await runZoomTick({
      queue: queueHarness.queue,
      registry,
      workerId: 'worker-2',
      now: oneBatchClock(),
    });
    expect(secondTick).toEqual({ claimed: 1, completed: 1, failed: 0 });

    // The whole point: one create across both runs, one meeting at Zoom, one row.
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(fake.listMeetings()).toHaveLength(1);
    expect(harness.meetings).toHaveLength(1);

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.zoom_meeting_number).toBe(atZoom[0].id);
    expect(row.passcode).toBe(atZoom[0].passcode);
    expect(row.join_url).toBe(atZoom[0].joinUrl);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });

  it('derives §9.4 drift from the CHECKPOINT settings on the adopt path', async () => {
    const fake = seedFake();
    // A reservation the crashed attempt left behind: pending, host held, no number.
    const reserved: StoredMeeting = {
      id: 'meeting-checkpointed',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: 'zoomUserPoolA001',
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [reserved],
    });
    const job = jobRow({
      stage_state: {
        meeting_id: 'meeting-checkpointed',
        stage: 'created',
        meeting: {
          number: 82000007777,
          passcode: 'checkpoint1',
          join_url: 'https://example-synthetic.test/j/82000007777',
          settings: { join_before_host: false, waiting_room: false, auto_recording: 'cloud' },
        },
      },
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(job)
    );

    expect(result.created).toBe(false);
    expect(result.zoom_meeting_number).toBe(82000007777);
    // Derived from the checkpoint's own settings — the create never re-ran, so there is
    // no response to read and a constant would lose the drift entirely.
    expect(result.effective_auto_recording).toBe('cloud');
    expect(result.settings_drift).toBe(true);

    expect(fake.listMeetings()).toHaveLength(0);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.zoom_meeting_number).toBe(82000007777);
    expect(row.effective_settings).toMatchObject({ auto_recording: 'cloud' });
  });

  it('a stale checkpoint adopter loses its lease before the write and changes nothing', async () => {
    // Sol R5 ②. The former exemption let a reclaimed worker keep going. Argumentless
    // heartbeat is safe: heartbeat_zoom_job COALESCEs NULL stage_state, preserving the
    // created checkpoint that this branch is about to adopt.
    const reserved: StoredMeeting = {
      id: 'meeting-stale-adopter',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const before = { ...reserved };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [reserved],
    });
    const job = jobRow({
      stage_state: {
        stage: 'created',
        meeting_id: reserved.id,
        meeting: {
          number: 82000007601,
          passcode: 'stale7601',
          join_url: 'https://example-synthetic.test/j/82000007601',
          settings: { auto_recording: 'none' },
        },
      },
    });
    const heartbeat = vi.fn(async () => false);
    const ctx: ZoomJobContext = { job, workerId: 'stale-worker', heartbeat };

    await expect(
      createMeetingProvisionHandler({ api: seedFake(), store: harness.store })(ctx)
    ).rejects.toBeInstanceOf(ZoomJobLeaseLostError);

    expect(heartbeat).toHaveBeenCalledTimes(1);
    expect(heartbeat.mock.calls[0]).toEqual([]);
    expect(harness.meetingFor(SESSION_ID)).toEqual(before);
    expect(harness.store.adoptCheckpointMeeting).not.toHaveBeenCalled();
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
  });

  it('completes a checkpoint-adoption CAS miss as superseded with zero writes', async () => {
    const reserved: StoredMeeting = {
      id: 'meeting-adoption-miss',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const before = { ...reserved };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [reserved],
    });
    vi.mocked(harness.store.adoptCheckpointMeeting).mockResolvedValueOnce(false);
    const job = jobRow({
      stage_state: {
        stage: 'created',
        meeting_id: reserved.id,
        meeting: {
          number: 82000007602,
          passcode: 'miss7602x',
          join_url: 'https://example-synthetic.test/j/82000007602',
          settings: { auto_recording: 'none' },
        },
      },
    });

    const result = await createMeetingProvisionHandler({ api: seedFake(), store: harness.store })(
      context(job)
    );

    expect(result).toEqual({
      meeting_id: reserved.id,
      zoom_meeting_number: 82000007602,
      adopted: false,
      superseded: true,
    });
    expect(harness.meetingFor(SESSION_ID)).toEqual(before);
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
  });

  it('keeps ended public after REAL lifecycle lands immediately after adoption commits', async () => {
    // The dual-adopter/lifecycle race's visible half. On old source the legacy write
    // fires the hook before the separate projection exists, so lifecycle cannot publish;
    // the handler then clobbers public back to scheduled. The RPC path publishes first,
    // lifecycle advances both rows, and no late write remains.
    const meetingNumber = 82000007603;
    const reserved: StoredMeeting = {
      id: 'meeting-adoption-lifecycle',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    let runLifecycle = async () => undefined;
    const afterWrite = async (kind: 'recovery' | 'adoption') => {
      if (kind === 'adoption') await runLifecycle();
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [reserved],
      afterAtomicProvision: afterWrite,
      afterLegacyProvisionWrite: afterWrite,
    });
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    const webhookStore = lifecycleStoreFor(harness, row, meetingNumber);
    runLifecycle = async () => {
      await applyWebhookLifecycle(webhookStore, 'meeting.started', {
        id: String(meetingNumber),
        uuid: 'Fk+SyntheticUuid/sol5-adoption==',
      });
      await applyWebhookLifecycle(webhookStore, 'meeting.ended', { id: String(meetingNumber) });
    };
    const job = jobRow({
      stage_state: {
        stage: 'created',
        meeting_id: reserved.id,
        meeting: {
          number: meetingNumber,
          passcode: 'life7603x',
          join_url: `https://example-synthetic.test/j/${meetingNumber}`,
          settings: { auto_recording: 'none' },
        },
      },
    });
    const ctx = context(job);

    await createMeetingProvisionHandler({ api: seedFake(), store: harness.store })(ctx);

    expect(ctx.heartbeat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.heartbeat).mock.calls[0]).toEqual([]);
    expect(row.status).toBe('ended');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.store.adoptCheckpointMeeting).toHaveBeenCalledTimes(1);
  });

  it('keeps ended public after REAL lifecycle lands in the FRESH-create write gap', async () => {
    // Sol R6 ①. The fresh path used to be `markProvisioned` (id-only) → separate
    // `scheduled` upsert. Drive a genuine started→ended through the moment between
    // them: on old source the row ends `ended` while the late upsert publishes
    // `scheduled` over it — a meeting that has finished, badged as upcoming. On new
    // source the guarded RPC publishes first, so lifecycle can move BOTH forward and
    // there is no late write left to undo it.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    let harnessRef: ReturnType<typeof createMemoryProvisionStore> | null = null;

    const afterWrite = async (kind: 'recovery' | 'adoption', row: StoredMeeting) => {
      if (kind !== 'adoption' || harnessRef === null) return;
      const webhookStore = lifecycleStoreFor(
        harnessRef,
        row,
        row.zoom_meeting_number as number
      );
      await applyWebhookLifecycle(webhookStore, 'meeting.started', {
        id: String(row.zoom_meeting_number),
        uuid: 'Fk+SyntheticUuid/sol6-fresh==',
      });
      await applyWebhookLifecycle(webhookStore, 'meeting.ended', {
        id: String(row.zoom_meeting_number),
      });
    };

    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      afterAtomicProvision: afterWrite,
      afterLegacyProvisionWrite: afterWrite,
    });
    harnessRef = harness;

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('ended');
    // The visible half of the finding. `scheduled` here is the bug.
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');

    // ...and it is the guarded RPC that owns the fresh write now, with no unguarded
    // writer left anywhere on the path.
    expect(harness.store.adoptCheckpointMeeting).toHaveBeenCalledTimes(1);
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
  });

  /**
   * Sol R6 ① / Sol R7 ①. A rival lands in the one window the R6 finding names: after the
   * post-create checkpoint heartbeat, before the persist. `winner` decides what the
   * winner's row ends up holding, which is the whole of the R7 finding — sol6 completed
   * green either way and said in a warn that it had not looked.
   */
  function freshCreateCasMiss(
    winner: (row: StoredMeeting, ourNumber: number) => void,
    harnessRef: { current: ReturnType<typeof createMemoryProvisionStore> | null }
  ) {
    return vi.fn(async (stageState?: Record<string, unknown>) => {
      if (stageState?.stage === 'created' && harnessRef.current !== null) {
        const row = harnessRef.current.meetingFor(SESSION_ID) as StoredMeeting;
        const meeting = stageState.meeting as { number: number };
        winner(row, meeting.number);
      }
      return true;
    });
  }

  it('completes a FRESH-create CAS miss as a RESOLVED safe supersession when the winner holds OUR number', async () => {
    // Sol R7 ①, the safe half. The winner adopted our own checkpoint, so the number it
    // persisted IS the number Zoom minted for us: nothing is orphaned, and the result
    // says so as a checked claim (`orphan_risk: false`) rather than declining to say.
    const fake = seedFake();
    const harnessRef: { current: ReturnType<typeof createMemoryProvisionStore> | null } = {
      current: null,
    };
    const heartbeat = freshCreateCasMiss((row, ourNumber) => {
      row.zoom_meeting_number = ourNumber;
      row.status = 'provisioned';
    }, harnessRef);

    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    harnessRef.current = harness;
    const ctx: ZoomJobContext = { job: jobRow(), workerId: 'worker-1', heartbeat };

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(ctx);

    const ourNumber = fake.listMeetings()[0].id;
    expect(result).toEqual({
      meeting_id: (harness.meetingFor(SESSION_ID) as StoredMeeting).id,
      zoom_meeting_number: ourNumber,
      winner_zoom_meeting_number: ourNumber,
      persisted: false,
      superseded: true,
      orphan_risk: false,
    });

    // Exactly one meeting at Zoom, and the row names it. Nothing to cancel by hand.
    expect(fake.listMeetings()).toHaveLength(1);
    expect((harness.meetingFor(SESSION_ID) as StoredMeeting).zoom_meeting_number).toBe(ourNumber);
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
  });

  it('fails NON-retryably with possible_orphan when the winner holds a DIFFERENT number', async () => {
    // The half sol6 completed green. Two meetings exist at Zoom; the row names one of
    // them; ours is the spare. Evidence has to name it or nobody can cancel it.
    const fake = seedFake();
    const RIVAL_NUMBER = 82000009999;
    const harnessRef: { current: ReturnType<typeof createMemoryProvisionStore> | null } = {
      current: null,
    };
    const heartbeat = freshCreateCasMiss((row) => {
      row.zoom_meeting_number = RIVAL_NUMBER;
      row.status = 'provisioned';
    }, harnessRef);

    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    harnessRef.current = harness;
    const ctx: ZoomJobContext = { job: jobRow(), workerId: 'worker-1', heartbeat };

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      ctx
    ).catch((caught) => caught);

    const ourNumber = fake.listMeetings()[0].id;
    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('possible_orphan');
    expect(record.detail).toBe('different_number');
    // The durable half: BOTH numbers, structurally, in what the runner serializes into
    // zoom_jobs.last_error. The created one is the meeting a human has to cancel.
    expect(record.evidence).toEqual({
      meeting_id: (harness.meetingFor(SESSION_ID) as StoredMeeting).id,
      created_zoom_meeting_number: ourNumber,
      winner_zoom_meeting_number: RIVAL_NUMBER,
      cause: 'different_number',
    });
    expect(JSON.parse(serializeJobFailure(record)).evidence.created_zoom_meeting_number).toBe(
      ourNumber
    );

    // Still zero writes: the winner's row is untouched, and nothing reached the UI.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.zoom_meeting_number).toBe(RIVAL_NUMBER);
    expect(row.passcode).toBeNull();
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the row is GONE',
      'row_missing',
      (row: StoredMeeting, harness: ReturnType<typeof createMemoryProvisionStore>) => {
        harness.meetings.splice(harness.meetings.indexOf(row), 1);
      },
    ],
    [
      'the number is back to NULL',
      'number_null',
      (row: StoredMeeting) => {
        row.zoom_meeting_number = null;
        row.status = 'error';
      },
    ],
  ] as const)(
    'fails with possible_orphan when the winner is UNREADABLE: %s',
    async (_label, cause, mutate) => {
      // Not knowing is not the same as being safe. Every unreadable shape goes to the
      // failure side, because a meeting Zoom is holding is unaccounted for either way.
      const fake = seedFake();
      const harnessRef: { current: ReturnType<typeof createMemoryProvisionStore> | null } = {
        current: null,
      };
      const heartbeat = freshCreateCasMiss((row) => {
        mutate(row, harnessRef.current as ReturnType<typeof createMemoryProvisionStore>);
      }, harnessRef);

      const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
      harnessRef.current = harness;
      const ctx: ZoomJobContext = { job: jobRow(), workerId: 'worker-1', heartbeat };

      const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
        ctx
      ).catch((caught) => caught);

      const record = describeJobFailure(error);
      expect(record.reason).toBe('possible_orphan');
      expect(record.detail).toBe(cause);
      expect(record.evidence).toMatchObject({
        created_zoom_meeting_number: fake.listMeetings()[0].id,
        winner_zoom_meeting_number: null,
        cause,
      });
      expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
    }
  );

  it('fails with possible_orphan when the winner RE-READ itself throws', async () => {
    // The third unreadable shape, and the one a `null` return cannot model: the store
    // call rejects. It must not escape as an untyped error — that would be treated as
    // retryable by `fail_zoom_job`'s default and re-enter the handler.
    const fake = seedFake();
    let harness!: ReturnType<typeof createMemoryProvisionStore>;
    const heartbeat = vi.fn(async (stageState?: Record<string, unknown>) => {
      if (stageState?.stage === 'created') {
        const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
        row.zoom_meeting_number = 82000009999;
        row.status = 'provisioned';
        vi.mocked(harness.store.findMeetingBySurface).mockRejectedValueOnce(
          new Error('connection reset')
        );
      }
      return true;
    });

    harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const ctx: ZoomJobContext = { job: jobRow(), workerId: 'worker-1', heartbeat };

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      ctx
    ).catch((caught) => caught);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('possible_orphan');
    expect(record.detail).toBe('read_failed');
    expect(record.evidence).toMatchObject({
      created_zoom_meeting_number: fake.listMeetings()[0].id,
      winner_zoom_meeting_number: null,
      cause: 'read_failed',
    });
  });

  /**
   * The DIFFERENT-number `possible_orphan` round trip, end to end through the runner.
   *
   * REWRITTEN for Sol R8 ①. sol7 asserted the opposite of what this now asserts — that
   * every requeue REPLAYS green off the winner's number — and that was the finding: for
   * this anomaly the winner's number on the row is the state that DEFINES the orphan, so
   * "the row carries a meeting number" is not resolution. Replaying green also took the
   * created number out of `last_error` with it, and the spare meeting at Zoom went dark.
   */
  function differentNumberOrphanRound(
    fake: ZoomFake,
    harness: ReturnType<typeof createMemoryProvisionStore>,
    rivalNumber: number
  ) {
    // The rival wins the CAS on the FIRST attempt only.
    let rivalHasWon = false;
    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    return {
      meeting_provision: (ctx: ZoomJobContext) => {
        const rivalHeartbeat: ZoomJobContext['heartbeat'] = async (stageState) => {
          // Fidelity is load-bearing (Sol R9 ②): checkpoint A lands in the JOB first,
          // exactly as production's heartbeat RPC writes it. Only then does rival row B
          // win the persist CAS. Installing B first while swallowing the heartbeat made
          // the requeue see no checkpoint and masked the self-resolving predicate arm.
          const alive = await ctx.heartbeat(stageState);
          if (alive && stageState?.stage === 'created' && !rivalHasWon) {
            rivalHasWon = true;
            const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
            row.zoom_meeting_number = rivalNumber;
            row.status = 'provisioned';
          }
          return alive;
        };
        return handler({ ...ctx, heartbeat: rivalHeartbeat });
      },
    };
  }

  async function parkedDifferentNumberOrphan() {
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const RIVAL_NUMBER = 82000007777;
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    const registry = differentNumberOrphanRound(fake, harness, RIVAL_NUMBER);

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    const job = jobs.jobFor('meeting_provision') as StoredJob;
    const ourNumber = fake.listMeetings()[0].id;
    expect(job.status).toBe('failed');
    const parked = JSON.parse(job.last_error as string);
    expect(parked).toMatchObject({ kind: 'non_retryable', reason: 'possible_orphan' });
    expect(parked.evidence.created_zoom_meeting_number).toBe(ourNumber);
    expect(createSpy).toHaveBeenCalledTimes(1);
    // The scenario Sol R9 ② says the old double never built: BOTH artifacts coexist.
    expect(job.stage_state).toMatchObject({
      stage: 'created',
      meeting: { number: ourNumber },
    });
    expect(harness.meetingFor(SESSION_ID)?.zoom_meeting_number).toBe(RIVAL_NUMBER);

    return { fake, createSpy, RIVAL_NUMBER, harness, jobs, registry, job, ourNumber };
  }

  async function requeueParkedOrphan(
    scenario: Awaited<ReturnType<typeof parkedDifferentNumberOrphan>>,
    workerId: string
  ): Promise<void> {
    scenario.job.status = 'pending';
    scenario.job.worker_id = null;
    await runZoomTick({
      queue: scenario.jobs.queue,
      registry: scenario.registry,
      workerId,
      now: oneBatchClock(),
    });
  }

  it('row winner B + durable checkpoint created A stays anomaly_unresolved', async () => {
    const scenario = await parkedDifferentNumberOrphan();

    await requeueParkedOrphan(scenario, 'w2');

    expect(scenario.job.status).toBe('failed');
    expect(JSON.parse(scenario.job.last_error as string)).toMatchObject({
      kind: 'non_retryable',
      reason: 'anomaly_unresolved',
      detail: 'possible_orphan',
      evidence: {
        created_zoom_meeting_number: scenario.ourNumber,
        winner_zoom_meeting_number: scenario.RIVAL_NUMBER,
        cause: 'different_number',
      },
    });
  });

  it('three requeues preserve created A in evidence and stay failed', async () => {
    const scenario = await parkedDifferentNumberOrphan();

    // Three requeues of the terminal job — the designated manual lever, pulled by someone
    // who has NOT cancelled the spare meeting at Zoom.
    for (const worker of ['w2', 'w3', 'w4']) {
      await requeueParkedOrphan(scenario, worker);

      // Nothing was created, and nothing was written — the winner's row is already right.
      // (`listMeetings()` holds only OUR meeting: the rival is modelled at the row, so the
      // meeting its number stands for was never minted in the fake. `createSpy` is the
      // assertion that matters — one create across the whole round trip.)
      expect(scenario.createSpy).toHaveBeenCalledTimes(1);
      expect(scenario.fake.listMeetings()).toHaveLength(1);
      expect(scenario.job.status).toBe('failed');

      // And the number a human has to cancel survives every refusal. This is the half
      // sol7's green replay destroyed: `complete_zoom_job` leaves `last_error` alone, but
      // the NEXT ordinary failure would have overwritten an anomaly nobody could see.
      expect(JSON.parse(scenario.job.last_error as string)).toMatchObject({
        kind: 'non_retryable',
        reason: 'anomaly_unresolved',
        detail: 'possible_orphan',
        evidence: {
          created_zoom_meeting_number: scenario.ourNumber,
          winner_zoom_meeting_number: scenario.RIVAL_NUMBER,
          cause: 'different_number',
        },
      });
    }
  });

  it('row number A after operator repair resolves safely', async () => {
    const scenario = await parkedDifferentNumberOrphan();
    const row = scenario.harness.meetingFor(SESSION_ID) as StoredMeeting;
    row.zoom_meeting_number = scenario.ourNumber;

    await requeueParkedOrphan(scenario, 'w2');

    expect(scenario.job.status).toBe('done');
    expect(scenario.job.stage_state).toMatchObject({
      result: { zoom_meeting_number: scenario.ourNumber, created: false },
    });
    expect(scenario.createSpy).toHaveBeenCalledTimes(1);
    expect(scenario.fake.listMeetings()).toHaveLength(1);
  });

  it('no B+A refusal or repaired-A requeue calls createMeeting', async () => {
    const scenario = await parkedDifferentNumberOrphan();

    await requeueParkedOrphan(scenario, 'w2');
    expect(scenario.createSpy).toHaveBeenCalledTimes(1);

    const row = scenario.harness.meetingFor(SESSION_ID) as StoredMeeting;
    row.zoom_meeting_number = scenario.ourNumber;
    await requeueParkedOrphan(scenario, 'w3');

    // The one call belongs to the ORIGINAL attempt. Neither requeue added one.
    expect(scenario.createSpy).toHaveBeenCalledTimes(1);
    expect(scenario.fake.listMeetings()).toHaveLength(1);
  });

  it('after the operator CLEARS the marker, the existing winner replays without creating', async () => {
    // The universal override, and the only exit from a different-number orphan: the
    // operator cancels the spare at Zoom, then clears `last_error`. The row already
    // carries the winner's number, so the requeue is anchor 1 — a REPLAY, never a create.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const RIVAL_NUMBER = 82000007777;
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    const registry = differentNumberOrphanRound(fake, harness, RIVAL_NUMBER);

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');

    job.status = 'pending';
    job.worker_id = null;
    job.last_error = null;
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w2', now: oneBatchClock() });

    expect(job.status).toBe('done');
    expect(job.stage_state).toMatchObject({
      result: { zoom_meeting_number: RIVAL_NUMBER, created: false },
    });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });

  it('a FALSE possible_orphan resolves itself once the created number is anchored', async () => {
    // The other side of identity-based resolution, and the reason it is not simply "refuse
    // until a human clears it": when the row genuinely comes to carry the number THIS
    // attempt created — the winner adopted our checkpoint after all, or an operator
    // repaired a false positive — nothing is orphaned and the requeue must replay.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    // `read_failed`: the winner-read threw, so the handler could not tell WHICH miss it
    // was and failed closed. The row in fact holds our own number.
    let readHasFailed = false;
    const heartbeat: ZoomJobContext['heartbeat'] = async (stageState) => {
      if (stageState?.stage === 'created' && !readHasFailed) {
        readHasFailed = true;
        const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
        row.zoom_meeting_number = (stageState.meeting as { number: number }).number;
        row.status = 'provisioned';
        vi.mocked(harness.store.findMeetingBySurface).mockRejectedValueOnce(
          new Error('connection reset')
        );
      }
      return true;
    };
    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    const registry = {
      meeting_provision: (ctx: ZoomJobContext) => handler({ ...ctx, heartbeat }),
    };

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    expect(JSON.parse(job.last_error as string)).toMatchObject({
      reason: 'possible_orphan',
      detail: 'read_failed',
    });

    job.status = 'pending';
    job.worker_id = null;
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w2', now: oneBatchClock() });

    // Resolved by the anchor, with no marker-clearing: the row names the meeting the
    // evidence names, so there is nothing standing at Zoom that nothing points at.
    expect(job.status).toBe('done');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(fake.listMeetings()).toHaveLength(1);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });

  it('ignores a checkpoint that names a different row and creates normally', async () => {
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const reserved: StoredMeeting = {
      id: 'meeting-mine',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: 'zoomUserPoolA001',
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [reserved],
    });
    // A stale checkpoint pointing at somebody else's reservation. Adopting it would
    // write another surface's meeting onto this row.
    const job = jobRow({
      stage_state: {
        meeting_id: 'meeting-somebody-else',
        stage: 'created',
        meeting: {
          number: 82000008888,
          passcode: 'stalepass1',
          join_url: 'https://example-synthetic.test/j/82000008888',
          settings: { auto_recording: 'none' },
        },
      },
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(job)
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(true);
    expect(result.zoom_meeting_number).not.toBe(82000008888);
    expect(harness.meetingFor(SESSION_ID)?.zoom_meeting_number).toBe(fake.listMeetings()[0].id);
  });

  it('throws LeaseLost at the post-create checkpoint and writes nothing after it', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    // Alive for the pre-create heartbeat, lost by the post-create checkpoint.
    const heartbeat = vi.fn(
      async (stageState?: Record<string, unknown>) => stageState?.stage !== 'created'
    );
    const ctx: ZoomJobContext = { job: jobRow(), workerId: 'worker-1', heartbeat };

    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    await expect(handler(ctx)).rejects.toBeInstanceOf(ZoomJobLeaseLostError);

    expect(heartbeat).toHaveBeenCalledTimes(2);
    // Worker mismatch: this worker no longer owns the job, so it records no verdict —
    // markError would park a failure on a row the new leaseholder is working.
    expect(harness.store.markError).not.toHaveBeenCalled();
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();

    // The documented RESIDUAL, asserted rather than glossed: Zoom holds a meeting, the
    // checkpoint never landed, and nothing points at it.
    expect(fake.listMeetings()).toHaveLength(1);
    expect(harness.meetingFor(SESSION_ID)?.zoom_meeting_number).toBeNull();
  });

  it('takes the next candidate when the first host is busy (23P01)', async () => {
    const fake = seedFake();
    // An existing ACTIVE meeting occupying the lead host across the same window.
    const blocking: StoredMeeting = {
      id: 'meeting-blocking',
      surface_type: 'consultor_session',
      surface_id: '99999999-9999-4999-8999-999999999999',
      school_id: 77,
      host_zoom_user_id: 'zoomUserLead0001',
      zoom_meeting_number: 82000009999,
      zoom_meeting_uuid: null,
      passcode: 'blockpass1',
      join_url: 'https://example-synthetic.test/j/82000009999',
      effective_settings: {},
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD, HOST_POOL_A],
      meetings: [blocking],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(result.candidates_tried).toBe(2);
    expect(result.host_zoom_user_id).toBe('zoomUserPoolA001');
    expect(harness.meetingFor(SESSION_ID)?.host_zoom_user_id).toBe('zoomUserPoolA001');
  });

  it('fails NON-RETRYABLY with a structured no_host_available when candidates run out', async () => {
    const fake = seedFake();
    const blocking: StoredMeeting = {
      id: 'meeting-blocking',
      surface_type: 'consultor_session',
      surface_id: '99999999-9999-4999-8999-999999999999',
      school_id: 77,
      host_zoom_user_id: 'zoomUserPoolA001',
      zoom_meeting_number: 82000009999,
      zoom_meeting_uuid: null,
      passcode: 'blockpass1',
      join_url: 'https://example-synthetic.test/j/82000009999',
      effective_settings: {},
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [blocking],
    });

    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    await expect(handler(context())).rejects.toBeInstanceOf(ZoomNoHostAvailableError);

    // Terminal, and structurally greppable — triage keys on `reason`, never a message.
    const error = await handler(context()).catch((caught) => caught);
    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('no_host_available');
    expect(record.operation).toBe('meeting_provision');

    // Nothing was created at Zoom and no row was left behind.
    expect(fake.listMeetings()).toHaveLength(0);
    expect(harness.meetingFor(SESSION_ID)).toBeUndefined();
  });

  it('resumes a row left in error, re-reserving under the EXCLUDE constraint', async () => {
    const fake = seedFake();
    const errored: StoredMeeting = {
      id: 'meeting-errored',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: 'zoomUserLead0001',
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'error',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: 'Zoom said no',
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD],
      meetings: [errored],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(result.created).toBe(true);
    expect(harness.meetings).toHaveLength(1);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.last_error).toBeNull();
  });

  it('parks an UNTYPED create failure as ambiguous and keeps the reservation', async () => {
    const fake = seedFake();
    const boom = new Error('zoom exploded');
    vi.spyOn(fake, 'createMeeting').mockRejectedValueOnce(boom);
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
    });

    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    const error = await handler(context()).catch((caught) => caught);

    // An untyped throw is precisely the case where we cannot say whether the request
    // went out, so it is treated as ambiguous (Sol F4). Before F4 this released the
    // reservation and rethrew retryably, and the retry created a second meeting.
    expect(describeJobFailure(error).reason).toBe('ambiguous_create_outcome');
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(JSON.parse(row.last_error as string)).toMatchObject({
      reason: 'ambiguous_create_outcome',
      request_id: null,
      message: 'zoom exploded',
    });
  });

  it('flags §9.4 settings drift when effective auto_recording is not none', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    // Model an account that silently forces cloud recording on.
    vi.spyOn(fake, 'createMeeting').mockImplementationOnce(async (input) => ({
      id: 82000000123,
      uuidAtRead: 'Fk+SyntheticUuid/0001==',
      hostZoomUserId: input.hostZoomUserId,
      topic: input.topic,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      timezone: input.timezone,
      joinUrl: 'https://example-synthetic.test/j/82000000123',
      passcode: input.passcode ?? 'zzzzzzzzzz',
      settings: { join_before_host: false, waiting_room: false, auto_recording: 'cloud' },
      status: 'waiting',
    }));

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(result.settings_drift).toBe(true);
    expect(result.effective_auto_recording).toBe('cloud');
    // The signal also LIVES on the row, which is what the reconciler reads.
    expect(harness.meetingFor(SESSION_ID)?.effective_settings).toMatchObject({
      auto_recording: 'cloud',
    });
  });

  it('rejects a community surface non-retryably until Z6', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const job = jobRow({
      payload: { surface_type: 'community_meeting', surface_id: SESSION_ID },
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(job)
    ).catch((caught) => caught);

    expect(describeJobFailure(error).kind).toBe('non_retryable');
    expect(fake.listMeetings()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Sol F4 — ambiguous create outcomes never auto-create again
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sol R6 ② — the already-provisioned replay
// ---------------------------------------------------------------------------

describe('meeting_provision · replay publishes a DERIVED projection (Sol R6 ②)', () => {
  /** A row a previous run provisioned, moved on to `status` by lifecycle or an operator. */
  function replayRow(status: StoredMeeting['status'], meetingNumber: number): StoredMeeting {
    return {
      id: `meeting-replay-${status}`,
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: meetingNumber,
      zoom_meeting_uuid: null,
      passcode: 'replaypass',
      join_url: `https://example-synthetic.test/j/${meetingNumber}`,
      effective_settings: { join_before_host: false, waiting_room: false, auto_recording: 'none' },
      status,
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
  }

  function seedProjection(
    harness: ReturnType<typeof createMemoryProvisionStore>,
    meetingStatus: 'scheduled' | 'live' | 'ended' | 'cancelled'
  ): void {
    harness.projection.set(`consultor_session:${SESSION_ID}`, {
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      growth_community_id: COMMUNITY_ID,
      meeting_status: meetingStatus,
      starts_at: EXPECTED_STARTS_AT,
      ends_at: EXPECTED_ENDS_AT,
    });
  }

  it.each([
    ['started', 'live'],
    ['ended', 'ended'],
    ['cancelled', 'cancelled'],
  ] as const)(
    'a redelivered job over a %s meeting leaves the badge at %s — never scheduled',
    async (meetingStatus, publicStatus) => {
      // The finding itself: the replay branch used to upsert a HARD-CODED `scheduled`
      // through an unguarded ON CONFLICT DO UPDATE, so an at-least-once redelivery
      // landing after `meeting.started` put a live meeting back to "upcoming".
      const fake = seedFake();
      const createSpy = vi.spyOn(fake, 'createMeeting');
      const harness = createMemoryProvisionStore({
        session: SESSION,
        hosts: [HOST_POOL_A],
        meetings: [replayRow(meetingStatus, 82000006100)],
      });
      seedProjection(harness, publicStatus);

      const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
        context()
      );

      expect(result.created).toBe(false);
      expect(createSpy).not.toHaveBeenCalled();
      expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe(publicStatus);
      // Derived from the row inside the RPC, so nothing in TypeScript asserted a status.
      expect(harness.store.syncProjectionFromMeeting).toHaveBeenCalledWith(
        `meeting-replay-${meetingStatus}`,
        COMMUNITY_ID
      );
      expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['started', 'live'],
    ['ended', 'ended'],
  ] as const)(
    'a replay RECREATES a missing projection for a %s meeting, at %s (the healing case)',
    async (meetingStatus, publicStatus) => {
      // The sol2-era stranded-projection residual, structurally healed: because the
      // status is READ rather than asserted, a surface whose projection never landed
      // gets one at the meeting's real status — not a `scheduled` badge for a meeting
      // that has already ended.
      const fake = seedFake();
      const harness = createMemoryProvisionStore({
        session: SESSION,
        hosts: [HOST_POOL_A],
        meetings: [replayRow(meetingStatus, 82000006200)],
      });
      expect(harness.projectionFor(SESSION_ID)).toBeUndefined();

      await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

      expect(harness.projectionFor(SESSION_ID)).toMatchObject({
        surface_type: 'consultor_session',
        surface_id: SESSION_ID,
        school_id: 77,
        growth_community_id: COMMUNITY_ID,
        meeting_status: publicStatus,
        starts_at: EXPECTED_STARTS_AT,
        ends_at: EXPECTED_ENDS_AT,
      });
      expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    }
  );

  it('publishes NOTHING for a replay over a row that failed before Zoom, and FAILS the job', async () => {
    // `error` + a number is not a publishable state: the typed no-op keeps the RPC from
    // announcing a meeting the internal machine never completed. Sol R7 ②: the no-op is
    // still right, and COMPLETING over it was not — the job outcome is now `failed`.
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [replayRow('error', 82000006300)],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('sync_not_publishable');
    expect(record.detail).toBe('82000006300');
    expect(record.evidence).toEqual({
      meeting_id: 'meeting-replay-error',
      zoom_meeting_number: 82000006300,
      sync_outcome: 'not_publishable',
    });

    const outcomes = await Promise.all(
      vi.mocked(harness.store.syncProjectionFromMeeting).mock.results.map((call) => call.value)
    );
    expect(outcomes).toEqual(['not_publishable']);
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sol R7 ② — replay-sync anomalies are terminal, and their requeue cannot create
// ---------------------------------------------------------------------------

describe('meeting_provision · replay-sync anomalies fail the job (Sol R7 ②)', () => {
  const REPLAY_NUMBER = 82000006400;

  function provisionedRow(): StoredMeeting {
    return {
      id: 'meeting-vanishing',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: REPLAY_NUMBER,
      zoom_meeting_uuid: null,
      passcode: 'replaypass',
      join_url: `https://example-synthetic.test/j/${REPLAY_NUMBER}`,
      effective_settings: { join_before_host: false, waiting_room: false, auto_recording: 'none' },
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
  }

  /**
   * The row is deleted under the run, between `findMeetingBySurface` and the projection
   * sync — which is exactly what `missing` MEANS. Modelled by deleting it for real, so
   * the requeue that follows sees the world the anomaly describes rather than a mock
   * return value over an intact row.
   */
  function vanishOnSync(harness: ReturnType<typeof createMemoryProvisionStore>): void {
    vi.mocked(harness.store.syncProjectionFromMeeting).mockImplementationOnce(async () => {
      harness.meetings.length = 0;
      return 'missing';
    });
  }

  it('fails NON-retryably with sync_missing_row when the internal row vanished mid-run', async () => {
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [provisionedRow()],
    });
    vanishOnSync(harness);

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('sync_missing_row');
    // The evidence a human needs to find the meeting Zoom is still holding.
    expect(record.evidence).toEqual({
      meeting_id: 'meeting-vanishing',
      zoom_meeting_number: REPLAY_NUMBER,
      sync_outcome: 'missing',
    });
    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
  });

  it('turns the QUEUE ROW red and keeps the evidence — sol6 completed this green', async () => {
    // Asserted through the runner's own fail path, because "the job outcome is failed" is
    // a claim about `fail_zoom_job(p_retryable => false)`, not about a thrown object.
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [provisionedRow()],
    });
    vanishOnSync(harness);
    const jobs = createMemoryJobQueue();
    const registry = createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store });

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    const tick = await runZoomTick({
      queue: jobs.queue,
      registry,
      workerId: 'w1',
      now: oneBatchClock(),
    });

    expect(tick).toEqual({ claimed: 1, completed: 0, failed: 1 });
    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    expect(JSON.parse(job.last_error as string)).toMatchObject({
      kind: 'non_retryable',
      reason: 'sync_missing_row',
      evidence: { zoom_meeting_number: REPLAY_NUMBER, sync_outcome: 'missing' },
    });
  });

  it('refuses every requeue of a sync_missing_row job with ZERO creates', async () => {
    // THE subtle half of Sol R7 ②. The internal row is gone, so a requeue has no anchor,
    // no marker on any row, and nothing between it and the candidate walk — it would
    // reserve a host and CREATE a second meeting for a surface Zoom already holds one
    // for. The job-level anomaly gate is what stops it.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [provisionedRow()],
    });
    vanishOnSync(harness);
    const jobs = createMemoryJobQueue();
    const registry = createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store });

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    expect(harness.meetings).toHaveLength(0);

    // THREE requeues, not one. The refusal record REPLACES `last_error`, so a gate that
    // only matched the original anomaly shape would hold on w2 and let w3 create — which
    // is what the first draft of this fix did, and what this loop caught.
    for (const worker of ['w2', 'w3', 'w4']) {
      job.status = 'pending';
      job.worker_id = null;
      await runZoomTick({ queue: jobs.queue, registry, workerId: worker, now: oneBatchClock() });

      // First and foremost: nothing was created at Zoom, ever.
      expect(createSpy).not.toHaveBeenCalled();
      expect(fake.listMeetings()).toHaveLength(0);
      // And no row was reserved either — the gate is BEFORE the candidate walk.
      expect(harness.meetings).toHaveLength(0);
      expect(harness.store.insertReservation).not.toHaveBeenCalled();

      // A DIFFERENT reason from the anomaly that produced it: "a human pulled the lever
      // and it is still not resolved", not "the row vanished". The original anomaly and
      // its evidence ride along on every refusal — the meeting number a human needs must
      // not be erased by the act of refusing.
      expect(job.status).toBe('failed');
      expect(JSON.parse(job.last_error as string)).toMatchObject({
        kind: 'non_retryable',
        reason: 'anomaly_unresolved',
        detail: 'sync_missing_row',
        evidence: {
          meeting_id: 'meeting-vanishing',
          zoom_meeting_number: REPLAY_NUMBER,
          sync_outcome: 'missing',
        },
      });
    }
  });

  it('a REPAIRED row lets the requeue replay — the gate keys on state, not on the marker', async () => {
    // Resolution 2 from the header: restore the row carrying the number. The gate sits
    // after the anchors, so a repaired surface needs no marker-clearing at all.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [provisionedRow()],
    });
    vanishOnSync(harness);
    const jobs = createMemoryJobQueue();
    const registry = createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store });

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');

    // The operator restores the row — the meeting number included, which is the point.
    harness.meetings.push(provisionedRow());
    job.status = 'pending';
    job.worker_id = null;
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w2', now: oneBatchClock() });

    expect(job.status).toBe('done');
    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });

  it('a job whose last_error is CLEARED is no longer gated — the operator lever, and its hazard', async () => {
    // Resolution 1's escape hatch, and it is one-way exactly like clearing an
    // ambiguous-create marker: with the row genuinely gone and the marker cleared, the
    // requeue creates. That is correct only when the operator has established the Zoom
    // meeting is gone too. Asserted rather than glossed, because it is the sharpest edge
    // of the contract.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [provisionedRow()],
    });
    vanishOnSync(harness);
    const jobs = createMemoryJobQueue();
    const registry = createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store });

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    expect(createSpy).not.toHaveBeenCalled();

    job.status = 'pending';
    job.worker_id = null;
    job.last_error = null;
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w2', now: oneBatchClock() });

    expect(job.status).toBe('done');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(harness.meetingFor(SESSION_ID)?.zoom_meeting_number).toBe(fake.listMeetings()[0].id);
  });

  it('ignores an ordinary retryable last_error — only the anomaly reasons gate', async () => {
    // The gate is total and defensive: a job requeued after a plain 5xx, or one carrying
    // a hand-edited string, must run normally. Jamming the queue on unparseable text
    // would be a worse failure than the one being fixed.
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    for (const lastError of [
      serializeJobFailure({ kind: 'retryable', message: 'Zoom 502' }),
      'not json at all',
      JSON.stringify({ reason: 'no_host_available' }),
    ]) {
      const local = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
      const result = await createMeetingProvisionHandler({ api: seedFake(), store: local.store })(
        context(jobRow({ last_error: lastError }))
      );
      expect(result.created).toBe(true);
    }

    // ...and the anomaly reasons DO gate, from the same parser.
    await expect(
      createMeetingProvisionHandler({ api: fake, store: harness.store })(
        context(
          jobRow({
            last_error: serializeJobFailure({
              kind: 'non_retryable',
              reason: 'possible_orphan',
              message: 'orphan',
            }),
          })
        )
      )
    ).rejects.toMatchObject({ reason: 'anomaly_unresolved', detail: 'possible_orphan' });
  });
});

// ---------------------------------------------------------------------------
// Sol R8 ①② — identity-based resolution, and a gate nothing can get in front of
// ---------------------------------------------------------------------------

describe('meeting_provision · anomaly resolution is per-reason and decided FIRST (Sol R8 ①②)', () => {
  const CREATED_NUMBER = 82000004242;
  const WINNER_NUMBER = 82000009999;
  const RECORDED_NUMBER = 82000006400;

  function rowWith(patch: Partial<ProvisionMeetingRow> = {}): ProvisionMeetingRow {
    return {
      id: 'meeting-1',
      status: 'provisioned',
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      effective_settings: null,
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
      ...patch,
    };
  }

  function checkpointFor(meetingId: string, number: number): CreatedMeetingCheckpoint {
    return {
      meetingId,
      number,
      passcode: 'synthetic1',
      joinUrl: `https://example-synthetic.test/j/${number}`,
      settings: { auto_recording: 'none' },
    };
  }

  const ORPHAN_EVIDENCE = {
    meeting_id: 'meeting-1',
    created_zoom_meeting_number: CREATED_NUMBER,
    winner_zoom_meeting_number: WINNER_NUMBER,
    cause: 'different_number',
  };

  /**
   * The predicate, directly. The handler round trips below prove it is WIRED; this proves
   * it is RIGHT, including the three shapes that are expensive to stage end to end.
   */
  describe('isTerminalAnomalyResolved', () => {
    it('possible_orphan: only the CREATED number resolves it — the winner number never does', () => {
      const marker = { reason: 'possible_orphan' as const, evidence: ORPHAN_EVIDENCE };
      const anchors = (row: ProvisionMeetingRow | null, checkpoint = null) => ({ row, checkpoint });

      // The finding, in one assertion: this is the state that DEFINES the orphan.
      expect(
        isTerminalAnomalyResolved(marker, anchors(rowWith({ zoom_meeting_number: WINNER_NUMBER })))
      ).toBe(false);
      expect(
        isTerminalAnomalyResolved(marker, anchors(rowWith({ zoom_meeting_number: CREATED_NUMBER })))
      ).toBe(true);
      // No row at all, and a row whose number is back to NULL: unanchored either way.
      expect(isTerminalAnomalyResolved(marker, anchors(null))).toBe(false);
      expect(isTerminalAnomalyResolved(marker, anchors(rowWith()))).toBe(false);
    });

    it('possible_orphan: its co-produced checkpoint never resolves it', () => {
      const marker = { reason: 'possible_orphan' as const, evidence: ORPHAN_EVIDENCE };
      const row = rowWith({ status: 'pending' });

      // Sol R9 ①: this checkpoint is the artifact of the SAME attempt that created A
      // and then discovered row winner B. It proves A exists, not that a row accounts for
      // A, so even the superficially "adoptable" same-row/same-number shape is unresolved.
      expect(
        isTerminalAnomalyResolved(marker, {
          row,
          checkpoint: checkpointFor(row.id, CREATED_NUMBER),
        })
      ).toBe(false);
      // Stale-row, wrong-number and no-row variants remain unresolved as before.
      expect(
        isTerminalAnomalyResolved(marker, {
          row,
          checkpoint: checkpointFor('meeting-elsewhere', CREATED_NUMBER),
        })
      ).toBe(false);
      expect(
        isTerminalAnomalyResolved(marker, {
          row,
          checkpoint: checkpointFor(row.id, WINNER_NUMBER),
        })
      ).toBe(false);
      expect(
        isTerminalAnomalyResolved(marker, {
          row: null,
          checkpoint: checkpointFor('meeting-1', CREATED_NUMBER),
        })
      ).toBe(false);
    });

    it('fails CLOSED when the evidence does not carry the number its reason needs', () => {
      // Anomalies recorded before the evidence field existed, hand-edited records, and
      // non-numeric junk. None of them can be shown resolved, so none of them are.
      for (const evidence of [
        null,
        {},
        { created_zoom_meeting_number: String(CREATED_NUMBER) },
        { created_zoom_meeting_number: Number.NaN },
      ]) {
        expect(
          isTerminalAnomalyResolved(
            { reason: 'possible_orphan', evidence },
            { row: rowWith({ zoom_meeting_number: CREATED_NUMBER }), checkpoint: null }
          )
        ).toBe(false);
      }
    });

    it('sync_missing_row: only a restored row carrying the RECORDED number resolves it', () => {
      const marker = {
        reason: 'sync_missing_row' as const,
        evidence: { meeting_id: 'meeting-1', zoom_meeting_number: RECORDED_NUMBER },
      };
      expect(
        isTerminalAnomalyResolved(marker, {
          row: rowWith({ zoom_meeting_number: RECORDED_NUMBER }),
          checkpoint: null,
        })
      ).toBe(true);
      // A row restored around a DIFFERENT meeting leaves the recorded one unaccounted for.
      expect(
        isTerminalAnomalyResolved(marker, {
          row: rowWith({ zoom_meeting_number: WINNER_NUMBER }),
          checkpoint: null,
        })
      ).toBe(false);
      expect(isTerminalAnomalyResolved(marker, { row: null, checkpoint: null })).toBe(false);
    });

    it('sync_not_publishable: the recorded row must ALSO have reached a publishable status', () => {
      const marker = {
        reason: 'sync_not_publishable' as const,
        evidence: { meeting_id: 'meeting-1', zoom_meeting_number: RECORDED_NUMBER },
      };
      const at = (status: ZoomMeetingStatus) =>
        isTerminalAnomalyResolved(marker, {
          row: rowWith({ status, zoom_meeting_number: RECORDED_NUMBER }),
          checkpoint: null,
        });

      // The two the RPC's CASE maps to NULL — the whole of this anomaly.
      expect(at('pending')).toBe(false);
      expect(at('error')).toBe(false);
      for (const status of PUBLISHABLE_MEETING_STATUSES) expect(at(status)).toBe(true);

      // A publishable status on a row that now names a different meeting is not it.
      expect(
        isTerminalAnomalyResolved(marker, {
          row: rowWith({ status: 'provisioned', zoom_meeting_number: WINNER_NUMBER }),
          checkpoint: null,
        })
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // The gate's POSITION (Sol R8 ②): nothing that can fail may run in front of it
  // -------------------------------------------------------------------------

  const markerFor = (reason: string, evidence: Record<string, unknown>): string =>
    serializeJobFailure({
      kind: 'non_retryable',
      reason,
      message: 'the original anomaly',
      evidence,
    });

  const ORPHAN_MARKER = markerFor('possible_orphan', ORPHAN_EVIDENCE);
  const MISSING_ROW_EVIDENCE = {
    meeting_id: 'meeting-vanished',
    zoom_meeting_number: RECORDED_NUMBER,
    sync_outcome: 'missing',
  };
  const MISSING_ROW_MARKER = markerFor('sync_missing_row', MISSING_ROW_EVIDENCE);

  /** Every refusal must look like this: same anomaly, same evidence, zero writes. */
  function expectCarriedForward(
    error: unknown,
    detail: string,
    evidence: Record<string, unknown>
  ): void {
    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe('anomaly_unresolved');
    expect(record.detail).toBe(detail);
    expect(record.evidence).toEqual(evidence);
  }

  it('a TRANSIENT readSession failure cannot replace a sync_missing_row marker', async () => {
    // The R8 ② scenario in its simplest form. sol7 read the session ~130 lines before the
    // gate, so this throw became the job's `last_error` — an untyped, RETRYABLE record —
    // and the anomaly was gone. With the row also gone, the attempt after it created.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    vi.mocked(harness.store.readSession).mockRejectedValue(new Error('connection reset'));

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(jobRow({ last_error: MISSING_ROW_MARKER }))
    ).catch((caught) => caught);

    expectCarriedForward(error, 'sync_missing_row', MISSING_ROW_EVIDENCE);
    // Never reached, which is the invariant: a preflight that cannot run cannot fail, and
    // a preflight that cannot fail cannot overwrite the marker.
    expect(harness.store.readSession).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.store.insertReservation).not.toHaveBeenCalled();
    expect(harness.meetings).toHaveLength(0);
  });

  it('survives the transient failure end to end: the next attempt still cannot create', async () => {
    // The requeue half, through the runner, because "the marker survives" is a claim about
    // what `fail_zoom_job` wrote — and the refusal record lands on the field the gate reads.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    const registry = createZoomJobRegistry({ api: fake, meetingProvisionStore: harness.store });

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    const job = jobs.jobFor('meeting_provision') as StoredJob;
    job.last_error = MISSING_ROW_MARKER;

    // Attempt 1 hits a transient store outage; attempt 2 finds a healthy store.
    vi.mocked(harness.store.readSession).mockRejectedValueOnce(new Error('connection reset'));
    for (const worker of ['w1', 'w2', 'w3']) {
      job.status = 'pending';
      job.worker_id = null;
      await runZoomTick({ queue: jobs.queue, registry, workerId: worker, now: oneBatchClock() });

      expect(job.status).toBe('failed');
      expect(createSpy).not.toHaveBeenCalled();
      expect(harness.meetings).toHaveLength(0);
      expect(JSON.parse(job.last_error as string)).toMatchObject({
        kind: 'non_retryable',
        reason: 'anomaly_unresolved',
        detail: 'sync_missing_row',
        evidence: MISSING_ROW_EVIDENCE,
      });
    }
  });

  it('an INELIGIBLE session neither erases the marker nor releases the reservation', async () => {
    // The ineligible-release path is the one preflight that WRITES, and sol7 ran it before
    // the gate: a cancelled session released the held reservation and failed the job under
    // `session_ineligible`, taking the orphan's number with it.
    const held: StoredMeeting = {
      id: 'meeting-held',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_POOL_A],
      meetings: [held],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(jobRow({ last_error: ORPHAN_MARKER }))
    ).catch((caught) => caught);

    expectCarriedForward(error, 'possible_orphan', ORPHAN_EVIDENCE);
    expect(harness.store.releaseReservation).not.toHaveBeenCalled();
    expect(harness.store.readSession).not.toHaveBeenCalled();
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('pending');
    expect(fake.listMeetings()).toHaveLength(0);
  });

  it('a MISSING session cannot erase the marker either', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      // `readSession` answers null for any other id — the "session deleted" case.
      session: { ...SESSION, id: '99999999-9999-4999-8999-999999999999' },
      hosts: [HOST_POOL_A],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(jobRow({ last_error: ORPHAN_MARKER }))
    ).catch((caught) => caught);

    expectCarriedForward(error, 'possible_orphan', ORPHAN_EVIDENCE);
    expect(harness.store.readSession).not.toHaveBeenCalled();
  });

  it('a CONFIGURATION failure cannot erase the marker — the api is not even built', async () => {
    // `getZoomApi` validates §5 configuration and throws on a bad one. sol7 called it on
    // the handler's first line, so a misconfigured deploy would have converted every marked
    // job into a config error and reopened the create path once the config was fixed.
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    const error = await createMeetingProvisionHandler({
      store: harness.store,
      env: { ZOOM_MODE: 'not-a-mode' },
    })(context(jobRow({ last_error: ORPHAN_MARKER }))).catch((caught) => caught);

    expectCarriedForward(error, 'possible_orphan', ORPHAN_EVIDENCE);
  });

  it('a failing ANCHOR read fails CLOSED, carrying the anomaly forward', async () => {
    // The gate's own read is the one thing it cannot avoid doing. "We could not look" is
    // not "it is resolved", so the refusal is raised anyway — with the original reason and
    // evidence, so a store outage spanning several requeues still cannot launder a marker.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    vi.mocked(harness.store.findMeetingBySurface).mockRejectedValue(new Error('connection reset'));

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(jobRow({ last_error: ORPHAN_MARKER }))
    ).catch((caught) => caught);

    expectCarriedForward(error, 'possible_orphan', ORPHAN_EVIDENCE);
    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.store.insertReservation).not.toHaveBeenCalled();
    expect(harness.store.readSession).not.toHaveBeenCalled();
  });

  it('a sync_missing_row row restored around a DIFFERENT meeting stays refused', async () => {
    // Existence-based resolution accepted this: a row, with a number, therefore "repaired".
    // The recorded meeting is still at Zoom with nothing pointing at it.
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const restored: StoredMeeting = {
      id: 'meeting-restored',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: WINNER_NUMBER,
      zoom_meeting_uuid: null,
      passcode: 'restored01',
      join_url: `https://example-synthetic.test/j/${WINNER_NUMBER}`,
      effective_settings: { auto_recording: 'none' },
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [restored],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(jobRow({ last_error: MISSING_ROW_MARKER }))
    ).catch((caught) => caught);

    expectCarriedForward(error, 'sync_missing_row', MISSING_ROW_EVIDENCE);
    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.store.syncProjectionFromMeeting).not.toHaveBeenCalled();
  });

  it('a sync_not_publishable row replays once its STATUS is repaired, and not before', async () => {
    const parked: StoredMeeting = {
      id: 'meeting-parked',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: RECORDED_NUMBER,
      zoom_meeting_uuid: null,
      passcode: 'parkedpass',
      join_url: `https://example-synthetic.test/j/${RECORDED_NUMBER}`,
      effective_settings: { auto_recording: 'none' },
      status: 'error',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const evidence = {
      meeting_id: 'meeting-parked',
      zoom_meeting_number: RECORDED_NUMBER,
      sync_outcome: 'not_publishable',
    };
    const fake = seedFake();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [parked],
    });
    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    const job = jobRow({ last_error: markerFor('sync_not_publishable', evidence) });

    const refused = await handler(context(job)).catch((caught) => caught);
    expectCarriedForward(refused, 'sync_not_publishable', evidence);
    // `error` is not an active status, so an unrefused requeue would have RE-RESERVED this
    // row and walked into a create. It never gets that far.
    expect(harness.store.reserveExistingMeeting).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();

    // The operator repairs the status the projection could not carry. Same marker, same
    // number, now anchored — so the requeue replays and publishes.
    parked.status = 'provisioned';
    const result = await handler(context(job));
    expect(result).toMatchObject({ zoom_meeting_number: RECORDED_NUMBER, created: false });
    expect(createSpy).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });
});

describe('meeting_provision · ambiguous create outcomes', () => {
  /**
   * The exact scenario: Zoom DID create the meeting, and the response was lost on the
   * way back. The fake creates for real, then throws the error the client would raise
   * when it cannot read the body. A handler that treats this as a definite failure
   * releases the interval and creates a second meeting on the next tick.
   */
  function createsThenLosesTheResponse(fake: ZoomFake): ZoomApi {
    return {
      ...fake,
      async createMeeting(input) {
        await fake.createMeeting(input);
        throw new ZoomRetryableError('Zoom returned unparseable JSON for POST /users/x/meetings.', {
          status: 200,
          operation: 'POST /users/x/meetings',
          requestId: 'synthetic-zm-request-id-0001',
          outcome: 'ambiguous',
        });
      },
    };
  }

  it('creates EXACTLY ONCE across repeated ticker runs and keeps the host blocked', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    const registry = {
      meeting_provision: createMeetingProvisionHandler({
        api: createsThenLosesTheResponse(fake),
        store: harness.store,
      }),
    };

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w2', now: oneBatchClock() });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w3', now: oneBatchClock() });

    // ONE meeting at Zoom, no matter how many ticks run.
    expect(fake.listMeetings()).toHaveLength(1);

    // The job is terminal after the first attempt — nothing auto-creates again.
    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    const record = JSON.parse(job.last_error as string);
    expect(record).toMatchObject({
      kind: 'non_retryable',
      reason: 'ambiguous_create_outcome',
      requestId: 'synthetic-zm-request-id-0001',
    });

    // The reservation still blocks the host: status untouched, host still assigned.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(['pending', 'provisioned', 'started']).toContain(row.status);
    expect(row.host_zoom_user_id).toBe(HOST_POOL_A.zoom_user_id);
    expect(harness.store.markError).not.toHaveBeenCalled();

    // ...and the row says WHY, structurally.
    expect(JSON.parse(row.last_error as string)).toMatchObject({
      reason: 'ambiguous_create_outcome',
      request_id: 'synthetic-zm-request-id-0001',
    });
    // It cannot name the meeting, and does not pretend to.
    expect(row.zoom_meeting_number).toBeNull();
  });

  /**
   * Sol R2 ①, end to end: the REAL live adapter over an intercepted fetch, wired into
   * the real handler. An api double asserting the same thing would only prove the
   * handler branches on `outcome` — which R1 already proved. What was broken is the
   * chain: `createMeeting` classified a schema-invalid 2xx as a SUCCESS, so the handler
   * never saw a failure to branch on and marked the row `provisioned` with no number.
   */
  function liveApiAnswering(status: number, body: unknown): ZoomApi {
    const tokens: ZoomTokenProvider = {
      async getToken() {
        return 'token-1';
      },
      async forceRefresh() {
        return 'token-2';
      },
    };
    const fetchImpl = vi.fn(
      async () =>
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { 'x-zm-request-id': 'synthetic-zm-request-id-0003' },
        })
    ) as unknown as typeof fetch;
    return createLiveZoomApi(
      createZoomClient({ tokenProvider: tokens, fetchImpl, sleep: async () => {} })
    );
  }

  it.each([
    ['201 with an empty object', {}],
    ['201 with a partial, mistyped meeting', { id: '82000000042', join_url: '', settings: [] }],
    // Sol R3 ②, end to end. Each of these is a body the OLD adapter accepted: `id` and
    // `join_url` are impeccable, and only the two fields provisioning always SENDS are
    // missing. The old chain persisted an empty passcode and an empty
    // `effective_settings`, and completed the job reporting a clean 'none'.
    [
      '201 with an empty settings object',
      {
        id: 82000000042,
        join_url: 'https://example-synthetic.test/j/82000000042',
        password: '246813',
        settings: {},
      },
    ],
    [
      '201 with no settings at all',
      {
        id: 82000000042,
        join_url: 'https://example-synthetic.test/j/82000000042',
        password: '246813',
      },
    ],
    [
      '201 with no password',
      {
        id: 82000000042,
        join_url: 'https://example-synthetic.test/j/82000000042',
        settings: { auto_recording: 'none' },
      },
    ],
  ])('parks %s instead of provisioning a row with no number', async (_label, body) => {
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    const registry = {
      meeting_provision: createMeetingProvisionHandler({
        api: liveApiAnswering(201, body),
        store: harness.store,
      }),
    };

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });

    // Terminal, under the reason triage and §18 alerting key on.
    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    expect(JSON.parse(job.last_error as string)).toMatchObject({
      kind: 'non_retryable',
      reason: 'ambiguous_create_outcome',
    });

    // The row is PARKED, not provisioned: the reservation keeps blocking the host,
    // because Zoom answered 2xx and a meeting may exist for that interval.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(['pending', 'provisioned', 'started']).toContain(row.status);
    expect(row.host_zoom_user_id).toBe(HOST_POOL_A.zoom_user_id);
    expect(row.zoom_meeting_number).toBeNull();
    expect(JSON.parse(row.last_error as string)).toMatchObject({
      reason: 'ambiguous_create_outcome',
    });

    // The bug in one assertion: this used to be a `provisioned` row with no number.
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
    expect(harness.store.markError).not.toHaveBeenCalled();
    // ...and nothing was published to the UI's status surface.
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();

    // Sol R3 ②'s bar, stated directly: an ABSENT field must never surface as a clean
    // run. `complete_zoom_job` REPLACES `stage_state` with the handler's result, so a
    // job that wrongly completed would be carrying that result right here.
    expect(job.status).not.toBe('done');
    expect(job.stage_state).not.toMatchObject({ effective_auto_recording: 'none' });
    expect(job.stage_state).not.toMatchObject({ settings_drift: false });
    // The row cannot carry a joinable-looking secret either.
    expect(row.passcode).toBeNull();
    expect(row.join_url).toBeNull();
    expect(row.effective_settings).toBeNull();
  });

  it('a DEFINITE pre-create rejection keeps the old path: error, released, retryable', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const api: ZoomApi = {
      ...fake,
      async createMeeting() {
        // Zoom answered 400 — it never created anything.
        throw new ZoomNonRetryableError('Zoom rejected POST with 400: invalid topic.', {
          status: 400,
          operation: 'POST /users/x/meetings',
        });
      },
    };

    const error = await createMeetingProvisionHandler({ api, store: harness.store })(
      context()
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBeUndefined();
    expect(harness.store.markError).toHaveBeenCalledTimes(1);
    expect(harness.store.recordLastError).not.toHaveBeenCalled();
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    // `error` is outside the EXCLUDE predicate ⇒ the host is free again.
    expect(row.status).toBe('error');
    expect(['pending', 'provisioned', 'started']).not.toContain(row.status);
  });

  /**
   * Sol R2 ②. The R1 fix parked the row; nothing stopped the parked row from being
   * used. A parked row is `pending` + a host + no meeting number — byte-for-byte the
   * shape of an ordinary crashed-pre-create reservation — so REQUEUEING the terminal
   * job, which is the manual-triage lever, walked straight into the create path.
   *
   * This is the requeue simulation: park the row through a real ambiguous create, then
   * put the job back to `pending` the way an operator would and re-run the ticker.
   */
  it('refuses every requeue while the ambiguous park is unresolved', async () => {
    const fake = seedFake();
    const api = createsThenLosesTheResponse(fake);
    const createSpy = vi.spyOn(api, 'createMeeting');
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });
    const jobs = createMemoryJobQueue();
    const registry = { meeting_provision: createMeetingProvisionHandler({ api, store: harness.store }) };

    await jobs.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    // Attempt 1: an eligible row, an ambiguous create. This one DOES reach Zoom.
    await runZoomTick({ queue: jobs.queue, registry, workerId: 'w1', now: oneBatchClock() });
    const job = jobs.jobFor('meeting_provision') as StoredJob;
    expect(job.status).toBe('failed');
    expect(createSpy).toHaveBeenCalledTimes(1);

    const parkedRow = harness.meetingFor(SESSION_ID) as StoredMeeting;
    const markerAfterPark = parkedRow.last_error;
    const hostAfterPark = parkedRow.host_zoom_user_id;

    // Now the operator pulls the lever: requeue the terminal job. Three times.
    for (const worker of ['w2', 'w3', 'w4']) {
      job.status = 'pending';
      job.worker_id = null;
      await runZoomTick({ queue: jobs.queue, registry, workerId: worker, now: oneBatchClock() });

      // FIRST, and the whole point: the requeue must not have created at Zoom. Asserted
      // inside the loop so a regression fails on the second create itself rather than on
      // some downstream symptom of it.
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(fake.listMeetings()).toHaveLength(1);

      // Structured, non-retryable, and a DIFFERENT reason from the original park: this
      // is "a human retried without resolving", not "Zoom answered ambiguously".
      expect(job.status).toBe('failed');
      expect(JSON.parse(job.last_error as string)).toMatchObject({
        kind: 'non_retryable',
        reason: 'ambiguous_unresolved',
        requestId: 'synthetic-zm-request-id-0001',
      });
    }

    // The assertion this test exists for: still exactly ONE create at Zoom.
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(fake.listMeetings()).toHaveLength(1);

    // Nothing was touched — not the reservation, not the marker, not the projection.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(row.host_zoom_user_id).toBe(hostAfterPark);
    expect(row.last_error).toBe(markerAfterPark);
    expect(row.zoom_meeting_number).toBeNull();
    expect(harness.store.markError).not.toHaveBeenCalled();
    expect(harness.store.releaseReservation).not.toHaveBeenCalled();
    expect(harness.store.reserveExistingMeeting).not.toHaveBeenCalled();
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
  });

  it('refuses a requeue with ZERO creates when the row was parked before any create', async () => {
    // The pre-create ambiguity: the very first attempt never reached Zoom's handler in
    // a knowable way. Seeded directly, because the point is the count staying at 0.
    const fake = seedFake();
    const api: ZoomApi = { ...fake };
    const createSpy = vi.spyOn(api, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [
        {
          id: 'meeting-parked',
          surface_type: 'consultor_session',
          surface_id: SESSION_ID,
          school_id: 77,
          host_zoom_user_id: HOST_POOL_A.zoom_user_id,
          zoom_meeting_number: null,
          zoom_meeting_uuid: null,
          passcode: null,
          join_url: null,
          effective_settings: null,
          status: 'pending',
          starts_at: EXPECTED_STARTS_AT,
          duration_minutes: 90,
          last_error: ambiguousCreateMarker(undefined, 'transport failure'),
        },
      ],
    });

    const error = await createMeetingProvisionHandler({ api, store: harness.store })(
      context()
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('ambiguous_unresolved');
    expect(describeJobFailure(error).kind).toBe('non_retryable');
    expect(createSpy).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toHaveLength(0);
  });

  /**
   * Resolution path 1's fixture (Sol R3 ①): the meeting the lost create REALLY made at
   * Zoom. Seeded through the fake's own create so the read-back is a genuine Zoom-shaped
   * meeting — passcode, join_url and effective settings included — rather than a double
   * asserting what we hope Zoom returns.
   */
  function seedDiscoveredMeeting(fake: ZoomFake, settings?: Record<string, unknown>) {
    return fake.createMeeting({
      hostZoomUserId: HOST_POOL_A.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'rec0very77',
      ...(settings === undefined ? {} : { settings }),
    });
  }

  /**
   * What the operator leaves behind on resolution path 1: the discovered number, and
   * NOTHING else. No passcode, no join_url, NULL effective settings, the park marker
   * still in place, the reservation still `pending`.
   */
  function operatorResolvedRow(zoomMeetingNumber: number): StoredMeeting {
    return {
      id: 'meeting-resolved',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      // What reconciliation against Zoom found — written by hand.
      zoom_meeting_number: zoomMeetingNumber,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: ambiguousCreateMarker('synthetic-zm-request-id-0004', 'lost response'),
    };
  }

  it('a resolved park RECOVERS: the row is completed from Zoom before anything publishes', async () => {
    // Resolution path 1 from the module header. The anchor must win over the gate — but
    // winning it is not enough: the OLD replay path published a `scheduled` projection
    // over a row that was still `pending`, with no passcode, no join_url and NULL
    // effective settings, and left the park marker on it. A meeting nobody could join,
    // announced to the UI as ready.
    const fake = seedFake();
    const discovered = await seedDiscoveredMeeting(fake);
    const api: ZoomApi = { ...fake };
    const createSpy = vi.spyOn(api, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [operatorResolvedRow(discovered.id)],
    });

    const ctx = context();
    const result = await createMeetingProvisionHandler({ api, store: harness.store })(ctx);

    // Never a second meeting, on any recovery branch.
    expect(createSpy).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toHaveLength(1);

    // The lease is re-proved between the read-back and the write (Sol R4) — and with NO
    // stage_state: this path has no checkpoint of its own, and pushing one would
    // overwrite whatever the job already carries.
    expect(ctx.heartbeat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ctx.heartbeat).mock.calls[0]).toEqual([]);

    // The row is COMPLETE — this is the assertion the sol2 test was missing.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.zoom_meeting_number).toBe(discovered.id);
    expect(row.passcode).toBe('rec0very77');
    expect(row.join_url).toBe(discovered.joinUrl);
    expect(row.join_url).not.toBe('');
    expect(row.effective_settings).toMatchObject({ auto_recording: 'none' });
    // The marker is the record of an UNRESOLVED create; this row is resolved. Cleared in
    // the same UPDATE that provisioned it — never a second write that could be lost.
    expect(row.last_error).toBeNull();
    // ...and the guarded RPC owns both writes, never the fresh-create `markProvisioned`.
    expect(harness.store.recoverProvisionedMeeting).toHaveBeenCalledTimes(1);
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
    expect(harness.store.recordLastError).not.toHaveBeenCalled();

    // ...and only NOW does the surface reach the UI.
    expect(harness.projectionFor(SESSION_ID)).toMatchObject({ meeting_status: 'scheduled' });
    expect(result).toMatchObject({
      zoom_meeting_number: discovered.id,
      created: false,
      effective_auto_recording: 'none',
      settings_drift: false,
    });
  });

  it('keeps ended public after REAL lifecycle lands immediately after recovery commits', async () => {
    // Sol R5 ① regression. The old handler had a CAS→projection gap: lifecycle could
    // move the just-provisioned row started→ended while no projection existed, then the
    // handler inserted `scheduled` after both events were gone. Both callbacks below let
    // this same test run as a negative control against the old and new store seams.
    const fake = seedFake();
    const discovered = await seedDiscoveredMeeting(fake);
    let runLifecycle = async () => undefined;
    const afterWrite = async (kind: 'recovery' | 'adoption') => {
      if (kind === 'recovery') await runLifecycle();
    };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [operatorResolvedRow(discovered.id)],
      afterAtomicProvision: afterWrite,
      afterLegacyProvisionWrite: afterWrite,
    });
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    const webhookStore = lifecycleStoreFor(harness, row, discovered.id);
    runLifecycle = async () => {
      await applyWebhookLifecycle(webhookStore, 'meeting.started', {
        id: String(discovered.id),
        uuid: 'Fk+SyntheticUuid/sol5-recovery==',
      });
      await applyWebhookLifecycle(webhookStore, 'meeting.ended', { id: String(discovered.id) });
    };

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

    expect(row.status).toBe('ended');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');
    // Atomic recovery owns the sole publish; there is no late scheduled upsert left.
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.store.recoverProvisionedMeeting).toHaveBeenCalledTimes(1);
  });

  it('derives §9.4 drift from the RECOVERY read-back, never from the empty row', async () => {
    // The row's `effective_settings` is NULL, and `readAutoRecording(null)` floors to
    // 'none'. If recovery published without re-reading, a meeting Zoom is silently
    // recording would be reported as a clean run.
    const fake = seedFake();
    const discovered = await seedDiscoveredMeeting(fake, { auto_recording: 'cloud' });
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [operatorResolvedRow(discovered.id)],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(result).toMatchObject({ settings_drift: true, effective_auto_recording: 'cloud' });
    expect(harness.meetingFor(SESSION_ID)?.effective_settings).toMatchObject({
      auto_recording: 'cloud',
    });
  });

  it.each([
    [
      'a number that does not answer at Zoom',
      (fake: ZoomFake): ZoomApi => ({ ...fake }),
      // 404 at the fake: nothing was ever created under this number.
      82000000999,
    ],
    [
      'a read-back with no passcode',
      (fake: ZoomFake): ZoomApi => ({
        ...fake,
        async getMeeting(meetingNumber: number) {
          return { ...(await fake.getMeeting(meetingNumber)), passcode: '' };
        },
      }),
      null,
    ],
    [
      'a read-back whose settings never state auto_recording',
      (fake: ZoomFake): ZoomApi => ({
        ...fake,
        async getMeeting(meetingNumber: number) {
          return { ...(await fake.getMeeting(meetingNumber)), settings: {} };
        },
      }),
      null,
    ],
  ])(
    'leaves the parked row UNTOUCHED when recovery hits %s',
    async (_label, makeApi, overrideNumber) => {
      const fake = seedFake();
      const discovered = await seedDiscoveredMeeting(fake);
      const api = makeApi(fake);
      const createSpy = vi.spyOn(api, 'createMeeting');
      const seeded = operatorResolvedRow((overrideNumber as number | null) ?? discovered.id);
      const before = { ...seeded };
      const harness = createMemoryProvisionStore({
        session: SESSION,
        hosts: [HOST_POOL_A],
        meetings: [seeded],
      });

      const ctx = context();
      const error = await createMeetingProvisionHandler({ api, store: harness.store })(ctx).catch(
        (caught) => caught
      );

      // Terminal and structured: triage keys on the reason, and this one is NOT
      // `ambiguous_unresolved` — a human already resolved it, with a number that does
      // not check out. The recorded number rides along as the thing to re-check.
      expect(describeJobFailure(error).kind).toBe('non_retryable');
      expect(describeJobFailure(error).reason).toBe('recovery_unusable');
      expect(describeJobFailure(error).detail).toBe(String(before.zoom_meeting_number));

      // Never a create, on any recovery branch.
      expect(createSpy).not.toHaveBeenCalled();
      expect(fake.listMeetings()).toHaveLength(1);

      // The row is byte-for-byte what the operator left: reservation held, marker in
      // place, no half-written passcode or join_url to make it look joinable.
      expect(harness.meetingFor(SESSION_ID)).toEqual(before);
      expect(harness.store.markProvisioned).not.toHaveBeenCalled();
      expect(harness.store.recoverProvisionedMeeting).not.toHaveBeenCalled();
      expect(harness.store.markError).not.toHaveBeenCalled();
      expect(harness.store.recordLastError).not.toHaveBeenCalled();
      expect(harness.store.releaseReservation).not.toHaveBeenCalled();
      expect(harness.store.reserveExistingMeeting).not.toHaveBeenCalled();
      // The lease guard sits AFTER validation, so a read-back that never validated does
      // not even spend a heartbeat — and cannot have written under a stolen lease.
      expect(ctx.heartbeat).not.toHaveBeenCalled();

      // ...and nothing was announced to the UI.
      expect(harness.store.upsertProjection).not.toHaveBeenCalled();
      expect(harness.projectionFor(SESSION_ID)).toBeUndefined();
    }
  );

  it('a lost lease at the recovery write leaves the row and the UI untouched', async () => {
    // Sol R4, first half. Nothing heartbeats between the row read and the write, and the
    // `getMeeting` in between is a network round trip — long enough for a lease to expire
    // or be stolen. A worker that no longer owns the job must not persist its verdict.
    const fake = seedFake();
    const discovered = await seedDiscoveredMeeting(fake);
    const api: ZoomApi = { ...fake };
    const createSpy = vi.spyOn(api, 'createMeeting');
    const seeded = operatorResolvedRow(discovered.id);
    const before = { ...seeded };
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [seeded],
    });

    const heartbeat = vi.fn(async () => false);
    const ctx: ZoomJobContext = { job: jobRow(), workerId: 'worker-1', heartbeat };

    const error = await createMeetingProvisionHandler({ api, store: harness.store })(ctx).catch(
      (caught) => caught
    );

    // Not a job failure: the runner returns without calling `fail_zoom_job`, because the
    // new leaseholder already owns this job.
    expect(error).toBeInstanceOf(ZoomJobLeaseLostError);
    expect(heartbeat).toHaveBeenCalledTimes(1);

    // The guard is BEFORE the write, so the row is byte-for-byte the operator's: the
    // reservation still held, the park marker still on it, still recoverable.
    expect(harness.meetingFor(SESSION_ID)).toEqual(before);
    expect(harness.store.recoverProvisionedMeeting).not.toHaveBeenCalled();
    expect(harness.store.markProvisioned).not.toHaveBeenCalled();
    expect(harness.store.recordLastError).not.toHaveBeenCalled();

    // ...and nothing reached the UI.
    expect(harness.store.upsertProjection).not.toHaveBeenCalled();
    expect(harness.projectionFor(SESSION_ID)).toBeUndefined();

    // Never a create, on any recovery branch.
    expect(createSpy).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toHaveLength(1);
  });

  it.each([['started'], ['ended']] as const)(
    'a webhook that advances the row to %s mid-read-back SUPERSEDES the recovery',
    async (advanceTo) => {
      // Sol R4, the sharper half. The row is not frozen while the GET is in flight:
      // `LIFECYCLE_STARTED_APPLIES_FROM` includes `pending`, so the meeting the operator
      // recorded can legitimately START (and then END) between the read and the write.
      // An id-only write then RESET a running meeting to `provisioned` and announced it
      // to the UI as `scheduled` — the order-safety class F1 fixed for the webhook path,
      // arriving through the recovery path instead.
      const fake = seedFake();
      const discovered = await seedDiscoveredMeeting(fake);
      const seeded = operatorResolvedRow(discovered.id);
      const harness = createMemoryProvisionStore({
        session: SESSION,
        hosts: [HOST_POOL_A],
        meetings: [seeded],
      });
      const row = harness.meetingFor(SESSION_ID) as StoredMeeting;

      // The REAL lifecycle applier over the same double shape the F1 suite uses, so the
      // advance under test is the one production performs — including its own
      // applies-from guard, which is what makes `pending → started` reachable at all.
      const webhookStore: ZoomWebhookStore = {
        recordEvent: vi.fn(async () => 'inserted' as const),
        readProcessedAt: vi.fn(async () => undefined),
        markProcessed: vi.fn(async () => undefined),
        findMeetingIdByNumber: vi.fn(async (number: number) =>
          number === discovered.id ? row.id : null
        ),
        setMeetingStatus: vi.fn(async (_id, status, uuid) => {
          const appliesFrom: readonly string[] =
            status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
          if (!appliesFrom.includes(row.status)) return { applied: false, surface: null };
          row.status = status;
          if (uuid !== null) row.zoom_meeting_uuid = uuid;
          return {
            applied: true,
            surface: { surfaceType: row.surface_type, surfaceId: row.surface_id },
          };
        }),
        setProjectionStatus: vi.fn(async (surface, status) => {
          const projected = harness.projectionFor(surface.surfaceId);
          if (projected) projected.meeting_status = status;
        }),
      };

      const api: ZoomApi = {
        ...fake,
        async getMeeting(meetingNumber: number) {
          const meeting = await fake.getMeeting(meetingNumber);
          // ...and WHILE that answer was in flight, the meeting it describes started.
          await applyWebhookLifecycle(webhookStore, 'meeting.started', {
            id: String(meetingNumber),
            uuid: 'Fk+SyntheticUuid/0007==',
          });
          if (advanceTo === 'ended') {
            await applyWebhookLifecycle(webhookStore, 'meeting.ended', {
              id: String(meetingNumber),
            });
          }
          return meeting;
        },
      };
      const createSpy = vi.spyOn(api, 'createMeeting');

      const result = await createMeetingProvisionHandler({ api, store: harness.store })(context());

      // The webhook's write stands. This is the state the CAS is racing.
      expect(row.status).toBe(advanceTo);

      // The job COMPLETES: a miss is the world legitimately moving on — another writer
      // got there first — not something a human can act on, so it never reaches triage.
      expect(result).toEqual({
        meeting_id: 'meeting-resolved',
        zoom_meeting_number: discovered.id,
        recovered: false,
        superseded: true,
      });

      // The clobber, refused in both halves. The row is not reset...
      expect(harness.store.recoverProvisionedMeeting).toHaveBeenCalledTimes(1);
      expect(harness.store.markProvisioned).not.toHaveBeenCalled();
      expect(row.status).not.toBe('provisioned');
      // ...which is exactly the documented residual: this row keeps NULL passcode and
      // NULL join_url forever, the honest record of a meeting that ran with no platform
      // join path. The CAS cannot fire again — the status guard is one-way.
      expect(row.passcode).toBeNull();
      expect(row.join_url).toBeNull();
      expect(row.effective_settings).toBeNull();

      // ...and no `scheduled` projection is published over a meeting that is already
      // under way or finished.
      expect(harness.store.upsertProjection).not.toHaveBeenCalled();
      expect(harness.projectionFor(SESSION_ID)).toBeUndefined();

      expect(createSpy).not.toHaveBeenCalled();
      expect(fake.listMeetings()).toHaveLength(1);
    }
  );

  it('a resolved park RESUMES: clearing last_error lets the requeue create', async () => {
    // Resolution path 2. Reconciliation proved no meeting exists, so the operator
    // cleared the marker and the row is an ordinary held reservation again.
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [
        {
          id: 'meeting-cleared',
          surface_type: 'consultor_session',
          surface_id: SESSION_ID,
          school_id: 77,
          host_zoom_user_id: HOST_POOL_A.zoom_user_id,
          zoom_meeting_number: null,
          zoom_meeting_uuid: null,
          passcode: null,
          join_url: null,
          effective_settings: null,
          status: 'pending',
          starts_at: EXPECTED_STARTS_AT,
          duration_minutes: 90,
          last_error: null,
        },
      ],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(fake.listMeetings()).toHaveLength(1);
    expect(result).toMatchObject({ created: true });
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('provisioned');
  });

  it('never releases a row parked by an unresolved ambiguous create', async () => {
    const fake = seedFake();
    const parked: StoredMeeting = {
      id: 'meeting-parked',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      // No number: we never learned one. That is NOT the same as "no meeting exists".
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: ambiguousCreateMarker('synthetic-zm-request-id-0002', 'lost response'),
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_POOL_A],
      meetings: [parked],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    expect(harness.store.releaseReservation).not.toHaveBeenCalled();
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Sol F3 — source-state eligibility and reservation revalidation
// ---------------------------------------------------------------------------

describe('meeting_provision · §8 source-state eligibility', () => {
  /** Every row here is a session the handler must REFUSE before touching Zoom. */
  const INELIGIBLE: Array<{ name: string; patch: Partial<ProvisionSessionRow>; check: string }> = [
    { name: 'cancelled', patch: { status: 'cancelada' }, check: 'status' },
    { name: 'draft', patch: { status: 'borrador' }, check: 'status' },
    { name: 'awaiting approval', patch: { status: 'pendiente_aprobacion' }, check: 'status' },
    { name: 'already under way', patch: { status: 'en_progreso' }, check: 'status' },
    { name: 'soft-deleted', patch: { is_active: false }, check: 'is_active' },
    { name: 'presencial', patch: { modality: 'presencial' }, check: 'modality' },
    { name: 'another provider', patch: { meeting_provider: 'google_meet' }, check: 'meeting_provider' },
    { name: 'no provider intent', patch: { meeting_provider: null }, check: 'meeting_provider' },
    // Z2-1: the closed seam. `meeting_provider = 'zoom'` alone is NOT managed intent —
    // a hand-scheduled Zoom link is exactly that shape.
    { name: 'not managed by the platform', patch: { is_zoom_managed: false }, check: 'is_zoom_managed' },
    {
      name: 'pre-migration row with no flag at all',
      patch: { is_zoom_managed: undefined as unknown as boolean },
      check: 'is_zoom_managed',
    },
  ];

  for (const { name, patch, check } of INELIGIBLE) {
    it(`refuses a ${name} session before any Zoom call, non-retryably`, async () => {
      const fake = seedFake();
      const harness = createMemoryProvisionStore({
        session: { ...SESSION, ...patch },
        hosts: [HOST_LEAD, HOST_POOL_A],
      });

      const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
        context()
      ).catch((caught) => caught);

      // Nothing was created, and no host was even resolved.
      expect(fake.listMeetings()).toHaveLength(0);
      expect(harness.store.listActiveHosts).not.toHaveBeenCalled();
      expect(harness.meetings).toHaveLength(0);

      // Triage keys on the typed pair, never on the message.
      const record = describeJobFailure(error);
      expect(record.kind).toBe('non_retryable');
      expect(record.reason).toBe('session_ineligible');
      expect(record.detail).toBe(check);
    });
  }

  it('provisions a hibrida session — a remote leg is a remote leg', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, modality: 'hibrida' },
      hosts: [HOST_POOL_A],
    });

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());
    expect(fake.listMeetings()).toHaveLength(1);
  });

  it('RELEASES a reservation a previous attempt left on a now-ineligible session', async () => {
    const fake = seedFake();
    const held: StoredMeeting = {
      id: 'meeting-held',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      // Cancelled AFTER the reservation was taken — the realistic ordering.
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_POOL_A],
      meetings: [held],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    expect(fake.listMeetings()).toHaveLength(0);
    // Released into a status the EXCLUDE WHERE ignores, so the host is free again.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('cancelled');
    expect(['pending', 'provisioned', 'started']).not.toContain(row.status);
    expect(row.last_error).toBe('session_ineligible:status');
  });

  it('does NOT release a reservation with a real Zoom meeting behind it', async () => {
    const fake = seedFake();
    const provisioned: StoredMeeting = {
      id: 'meeting-live',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: 82000009999,
      zoom_meeting_uuid: null,
      passcode: 'synthetic1',
      join_url: 'https://example-synthetic.test/j/82000009999',
      effective_settings: { auto_recording: 'none' },
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_POOL_A],
      meetings: [provisioned],
    });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    // The host stays blocked ON PURPOSE: a meeting really exists at Zoom for that
    // window, and freeing the interval would let a second one be booked onto a host
    // who is genuinely occupied. Deleting it at Zoom is Z2's cancel flow.
    expect(harness.store.releaseReservation).not.toHaveBeenCalled();
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('provisioned');
  });
});

describe('meeting_provision · §9 reservation revalidation on resume', () => {
  /** A `pending` reservation held under a host, no meeting at Zoom yet. */
  function heldReservation(overrides: Partial<StoredMeeting> = {}): StoredMeeting {
    return {
      id: 'meeting-held',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
      ...overrides,
    };
  }

  it('reuses an undrifted reservation untouched', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [heldReservation()],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(result).toMatchObject({ host_zoom_user_id: HOST_POOL_A.zoom_user_id, created: true });
    // Nothing to move, so no re-reservation round trip.
    expect(harness.store.reserveExistingMeeting).not.toHaveBeenCalled();
  });

  it('re-reserves when the session was RESCHEDULED after the reservation was taken', async () => {
    const fake = seedFake();
    // The row still protects the OLD interval; the session now starts two hours later.
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, start_time: '17:00:00', end_time: '18:30:00' },
      hosts: [HOST_POOL_A],
      meetings: [heldReservation()],
    });

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

    const expectedStartsAt = '2026-08-05T21:00:00.000Z';
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;

    // The EXCLUDE-protected interval is the interval that was sent to Zoom.
    expect(Date.parse(row.starts_at)).toBe(Date.parse(expectedStartsAt));
    expect(row.duration_minutes).toBe(90);
    const created = fake.listMeetings()[0];
    expect(created.startTime).toBe('2026-08-05T17:00:00');
    expect(created.durationMinutes).toBe(90);
    expect(harness.store.reserveExistingMeeting).toHaveBeenCalledWith(
      'meeting-held',
      HOST_POOL_A.zoom_user_id,
      expectedStartsAt,
      90
    );
  });

  it('walks candidates when the NEW interval collides on the held host', async () => {
    const fake = seedFake();
    // Somebody else already owns HOST_POOL_A at the new time.
    const blocker: StoredMeeting = {
      id: 'meeting-blocker',
      surface_type: 'consultor_session',
      surface_id: '99999999-9999-4999-8999-999999999999',
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: 82000001111,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'provisioned',
      starts_at: '2026-08-05T21:00:00.000Z',
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, start_time: '17:00:00', end_time: '18:30:00' },
      hosts: [HOST_POOL_A, HOST_POOL_B],
      meetings: [heldReservation(), blocker],
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    // 23P01 on the held host ⇒ the fresh candidate walk moved it to the next pool host.
    expect(result).toMatchObject({ host_zoom_user_id: HOST_POOL_B.zoom_user_id });
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.host_zoom_user_id).toBe(HOST_POOL_B.zoom_user_id);
    expect(Date.parse(row.starts_at)).toBe(Date.parse('2026-08-05T21:00:00.000Z'));
  });

  it('keeps the checkpoint-adopt reservation window — Zoom already holds that meeting', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({
      // Rescheduled, but a previous attempt already created at Zoom and checkpointed.
      session: { ...SESSION, start_time: '17:00:00', end_time: '18:30:00' },
      hosts: [HOST_POOL_A],
      meetings: [heldReservation()],
    });
    const job = jobRow({
      stage_state: {
        stage: 'created',
        meeting_id: 'meeting-held',
        meeting: {
          number: 82000005555,
          passcode: 'synthetic2',
          join_url: 'https://example-synthetic.test/j/82000005555',
          settings: { auto_recording: 'none' },
        },
      },
    });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(job)
    );

    // Adopted, not created, and NOT re-reserved: the meeting Zoom holds is at the old
    // time, so moving the reservation would protect an interval Zoom does not know
    // about. Reconciling a rescheduled meeting with Zoom is Z2's reschedule sync.
    expect(result).toMatchObject({ created: false, zoom_meeting_number: 82000005555 });
    expect(fake.listMeetings()).toHaveLength(0);
    expect(harness.store.reserveExistingMeeting).not.toHaveBeenCalled();
    expect(Date.parse((harness.meetingFor(SESSION_ID) as StoredMeeting).starts_at)).toBe(
      Date.parse(EXPECTED_STARTS_AT)
    );
  });
});

// ---------------------------------------------------------------------------
// The tie into Z1b-3's webhook route
// ---------------------------------------------------------------------------

describe('meeting_provision · meeting.started captures the occurrence uuid', () => {
  it('binds the uuid the fake mints at start, not the one create returned', async () => {
    const fake = seedFake();
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    const meetingNumber = row.zoom_meeting_number as number;
    expect(row.zoom_meeting_uuid).toBeNull();

    // Zoom mints a NEW uuid for the occurrence.
    const { occurrenceUuid, previousUuid } = fake.startOccurrence(meetingNumber);
    expect(occurrenceUuid).not.toBe(previousUuid);

    // The lifecycle the route and the sweep share, applied to the provisioned row.
    const store: ZoomWebhookStore = {
      recordEvent: vi.fn(async () => 'inserted' as const),
      readProcessedAt: vi.fn(async () => undefined),
      markProcessed: vi.fn(async () => undefined),
      findMeetingIdByNumber: vi.fn(async (number: number) =>
        number === meetingNumber ? row.id : null
      ),
      setMeetingStatus: vi.fn(async (_id, status, uuid) => {
        const appliesFrom: readonly string[] =
          status === 'started' ? LIFECYCLE_STARTED_APPLIES_FROM : LIFECYCLE_ENDED_APPLIES_FROM;
        if (!appliesFrom.includes(row.status)) return { applied: false, surface: null };
        row.status = status;
        if (uuid !== null) row.zoom_meeting_uuid = uuid;
        return {
          applied: true,
          surface: { surfaceType: row.surface_type, surfaceId: row.surface_id },
        };
      }),
      // Writes straight onto the row `meeting_provision` upserted moments ago — this is
      // the §6 projection the UI badge reads, and F1 is what finally moves it.
      setProjectionStatus: vi.fn(async (surface, status) => {
        const projected = harness.projectionFor(surface.surfaceId);
        if (projected) projected.meeting_status = status;
      }),
    };

    // Provisioning left the projection at `scheduled`; only the lifecycle moves it.
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');

    await applyWebhookLifecycle(store, 'meeting.started', {
      // Zoom sends the id as a decimal STRING.
      id: String(meetingNumber),
      uuid: occurrenceUuid,
    });

    expect(row.status).toBe('started');
    expect(row.zoom_meeting_uuid).toBe(occurrenceUuid);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('live');

    // `meeting.ended` must never blank it.
    await applyWebhookLifecycle(store, 'meeting.ended', { id: String(meetingNumber) });
    expect(row.status).toBe('ended');
    expect(row.zoom_meeting_uuid).toBe(occurrenceUuid);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');

    // ...and a duplicate/swept `started` arriving now moves neither surface back.
    await applyWebhookLifecycle(store, 'meeting.started', {
      id: String(meetingNumber),
      uuid: occurrenceUuid,
    });
    expect(row.status).toBe('ended');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('ended');
  });
});

// ---------------------------------------------------------------------------
// Z2-4d — the dial-in set reaches the row, through BOTH provisioning RPCs
//
// Dial-in numbers were already being persisted, unnamed, inside `effective_settings`;
// this chunk names them in a column derived inside the two RPCs' single `UPDATE`. The
// handler itself is UNCHANGED — which is precisely why these tests read the stored ROW
// rather than asserting a call was made. A test that asserted "the RPC was called with
// the settings" would have passed before the migration existed.
//
// Both paths are covered because both functions were amended: an amendment applied to
// one and not the other is the failure the mutation probe reproduces.
// ---------------------------------------------------------------------------

describe('meeting_provision · Z2-4d dial-in capture', () => {
  const DIAL_IN = [
    { country: 'CL', country_name: 'Chile', city: 'Santiago', number: '+56 2 5555 0100', type: 'toll' },
  ];

  /** Resolution path 1's fixture, as the operator leaves it: number only. */
  function operatorResolvedRow(zoomMeetingNumber: number): StoredMeeting {
    return {
      id: 'meeting-dialin-recovery',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_POOL_A.zoom_user_id,
      zoom_meeting_number: zoomMeetingNumber,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: ambiguousCreateMarker('synthetic-zm-request-id-0009', 'lost response'),
    };
  }

  it('ADOPTION path: a fresh create on an audio-plan tenant lands the numbers on the row', async () => {
    const fake = seedFake();
    fake.setDialInNumbers(DIAL_IN);
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.dial_in_numbers).toEqual(DIAL_IN);
    // Derived, never independently supplied: the column and its source agree by
    // construction because the SQL sets both in one UPDATE.
    expect(row.effective_settings?.global_dial_in_numbers).toEqual(row.dial_in_numbers);
    expect(harness.store.adoptCheckpointMeeting).toHaveBeenCalledTimes(1);
  });

  it('RECOVERY path: a resolved park on an audio-plan tenant lands the numbers on the row', async () => {
    const fake = seedFake();
    fake.setDialInNumbers(DIAL_IN);
    const discovered = await fake.createMeeting({
      hostZoomUserId: HOST_POOL_A.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'rec0very77',
    });
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [operatorResolvedRow(discovered.id)],
    });

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.dial_in_numbers).toEqual(DIAL_IN);
    expect(row.effective_settings?.global_dial_in_numbers).toEqual(row.dial_in_numbers);
    expect(harness.store.recoverProvisionedMeeting).toHaveBeenCalledTimes(1);
  });

  it('ADOPTION path: a tenant with NO audio plan still provisions, with a null column', async () => {
    // The failure that must never happen: a school without a dial-in plan cannot be
    // refused a meeting over a field Zoom simply does not send.
    const fake = seedFake();
    fake.setDialInNumbers(null);
    const harness = createMemoryProvisionStore({ session: SESSION, hosts: [HOST_POOL_A] });

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.dial_in_numbers).toBeNull();
    expect(row.effective_settings).not.toHaveProperty('global_dial_in_numbers');
    expect(row.join_url).toContain(String(row.zoom_meeting_number));
    expect(result).toMatchObject({ created: true });
  });

  it('RECOVERY path: a tenant with NO audio plan still provisions, with a null column', async () => {
    const fake = seedFake();
    fake.setDialInNumbers(null);
    const discovered = await fake.createMeeting({
      hostZoomUserId: HOST_POOL_A.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'rec0very77',
    });
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [operatorResolvedRow(discovered.id)],
    });

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.dial_in_numbers).toBeNull();
    expect(row.effective_settings).not.toHaveProperty('global_dial_in_numbers');
  });
});

// ---------------------------------------------------------------------------
// Sol item 5 — `meeting_provision` and `meeting_delete` racing on one surface
// ---------------------------------------------------------------------------

/**
 * `claim_zoom_jobs` leases with `FOR UPDATE SKIP LOCKED`, which stops two tickers taking
 * the same job ROW and says nothing about two DIFFERENT jobs for the same surface. Vercel
 * crons overlap by design, so a `meeting_delete` can run to completion inside a
 * `meeting_provision`'s create→persist window.
 *
 * Every test below DRIVES the ordering rather than hoping for it: the cancellation and
 * its delete job are executed from inside a seam of the provisioner's own call sequence,
 * so the interleaving is the same on every run and on every machine. The assertions are
 * the END STATE — no live meeting at the fake, no active reservation, a cancelled
 * projection — never the mechanism.
 */
describe('meeting_provision · Sol item 5 — a cancellation racing a provision', () => {
  function deleteContext(): ZoomJobContext {
    return {
      job: jobRow({ id: 'job-delete-1', job_type: 'meeting_delete' }),
      workerId: 'worker-2',
      heartbeat: vi.fn(async () => true),
    };
  }

  /**
   * A scheduled session mid-provision, plus the lever that cancels it. `session` is a
   * MUTABLE copy: the harness's `readSession` reads it on every call, so flipping
   * `status` here is exactly what a cancel commit looks like to a re-read.
   */
  function racing(meetings?: StoredMeeting[]) {
    const session: ProvisionSessionRow = { ...SESSION };
    const harness = createMemoryProvisionStore({
      session,
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD],
      meetings,
    });
    const fake = seedFake();

    /**
     * The cancellation as the product performs it: the source row flips to `cancelada`
     * and the `meeting_delete` it enqueues is RUN TO COMPLETION. Its outcome is returned
     * rather than swallowed — Sol's step 3 is a delete that finds nothing and dies
     * terminally, and the test has to be able to assert that it really did.
     */
    async function cancelAndRunDelete(): Promise<{ outcome: string; reason?: string }> {
      session.status = 'cancelada';
      try {
        await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(
          deleteContext()
        );
        return { outcome: 'completed' };
      } catch (error) {
        return { outcome: 'failed', reason: describeJobFailure(error).reason };
      }
    }

    return { session, harness, fake, cancelAndRunDelete };
  }

  /**
   * Sol m1 (round 3). The failure copy used to branch on what the caller knew about the
   * row BEFORE awaiting the Zoom DELETE — and a concurrent `meeting_delete` can retire a
   * numberless row while that request is in flight, so "keeps blocking its host" could be
   * read by an operator after it stopped being true. Re-reading the row would only move
   * the staleness, so the sentence is state-NEUTRAL instead: the Zoom meeting number and
   * the one required action, which hold whatever the row is doing, and no claim about the
   * host slot at all. Applied to both call shapes, which is why this is a shared helper.
   */
  function expectStateNeutralCompensationCopy(error: Error, zoomNumber: number): void {
    expect(error.message).toContain(`CANCEL ZOOM MEETING ${zoomNumber} AT ZOOM`);
    // The vocabulary of the two removed clauses. A regression that reintroduces either
    // branch fails here rather than in a reviewer's reading of the diff.
    expect(error.message).not.toMatch(/blocking|bookable|reservation|host/i);
  }

  it('[L1] THE NAMED INTERLEAVING: the delete runs before any row exists and never returns', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    let deleteOutcome: { outcome: string; reason?: string } | null = null;

    // THE DEVICE. The cancellation and its delete are driven from inside the
    // provisioner's own `insertReservation` — after the eligibility gate has passed and
    // before any row exists for the delete to find. That is Sol's step 2 and step 3,
    // executed in the one place that reproduces them exactly.
    const store = {
      ...harness.store,
      insertReservation: async (row: ReservationInsert) => {
        deleteOutcome = await cancelAndRunDelete();
        return harness.store.insertReservation(row);
      },
    };

    const result = await createMeetingProvisionHandler({ api: fake, store })(context());

    // Step 3, verbatim: the delete found nothing to delete and failed TERMINALLY. It is
    // not coming back, which is what makes step 4 unrecoverable without this fix.
    expect(deleteOutcome).toEqual({ outcome: 'failed', reason: NO_MEETING_ROW_REASON });
    // Step 4 really happened — the provisioner did reach Zoom. A test where the create
    // never ran would prove nothing.
    expect(createSpy).toHaveBeenCalledTimes(1);

    // --- THE END STATE ---------------------------------------------------
    // No live Zoom meeting: `listMeetings()` excludes deleted ones, so this is the
    // orphan assertion.
    expect(fake.listMeetings()).toEqual([]);
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    // No active hours reservation: `cancelled` is outside the §9 EXCLUDE predicate, so
    // the host is free.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('cancelled');
    expect(ZOOM_MEETING_ACTIVE_STATUSES).not.toContain(row.status);
    expect(row.zoom_meeting_number).toBeNull();

    // A cancelled projection.
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');

    // And the job is a COMPLETION carrying the number it minted and then removed.
    expect(result).toMatchObject({
      persisted: false,
      compensated: true,
      trigger: 'status',
      zoom_missing: false,
    });
    expect(harness.store.adoptCheckpointMeeting).not.toHaveBeenCalled();
  });

  it('[L1] and with the reservation ALREADY placed: the delete retires the row mid-create', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    let deleteOutcome: { outcome: string; reason?: string } | null = null;

    // The same race one step later: the reservation exists, so the delete finds a
    // NUMBERLESS row, retires it and completes GREEN — still believing it has nothing to
    // remove at Zoom, because at that instant it does not.
    const realCreate = fake.createMeeting.bind(fake);
    const api: ZoomApi = {
      ...fake,
      createMeeting: async (input) => {
        const created = await realCreate(input);
        deleteOutcome = await cancelAndRunDelete();
        return created;
      },
    };

    const result = await createMeetingProvisionHandler({ api, store: harness.store })(
      context()
    );

    expect(deleteOutcome).toEqual({ outcome: 'completed' });

    expect(fake.listMeetings()).toEqual([]);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    // Left as the DELETE wrote it — that writer got there first and owns the record.
    expect(row.status).toBe('deleted');
    expect(ZOOM_MEETING_ACTIVE_STATUSES).not.toContain(row.status);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
    expect(result).toMatchObject({ compensated: true, trigger: 'status' });
  });

  it('[L1] THE RESIDUAL WINDOW: the delete lands between the re-check and the persist CAS', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    // The narrowest ordering there is: the cancellation commits AFTER the post-create
    // re-check has already read a `programada` session, and its delete retires the row
    // before the compare-and-set reaches it. The row is then numberless AND inactive, so
    // the CAS can never match — a miss that used to be reported as `possible_orphan`.
    const store = {
      ...harness.store,
      adoptCheckpointMeeting: async (id: string, patch: AtomicProvisionPatch) => {
        await cancelAndRunDelete();
        return harness.store.adoptCheckpointMeeting(id, patch);
      },
    };

    const result = await createMeetingProvisionHandler({ api: fake, store })(context());

    expect(fake.listMeetings()).toEqual([]);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('deleted');
    expect(row.zoom_meeting_number).toBeNull();
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
    // Resolved as a retirement, NOT as an unexplained orphan a human has to chase.
    expect(result).toMatchObject({ compensated: true, trigger: 'surface_retired' });
  });

  it('[L2] the REVERSE order is equally safe: delete first, provision second', async () => {
    // A crashed-pre-create attempt left a bare reservation; the cancel and its delete run
    // to completion FIRST, and the provisioner is claimed afterwards.
    const reservation: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const { harness, fake, cancelAndRunDelete } = racing([reservation]);
    const createSpy = vi.spyOn(fake, 'createMeeting');

    expect(await cancelAndRunDelete()).toEqual({ outcome: 'completed' });

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    // The eligibility gate refuses before a host is even resolved: nothing is created, so
    // there is nothing to compensate.
    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    expect(createSpy).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toEqual([]);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('deleted');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('[L3] the happy path is untouched: no cancellation, one create, one provisioned row', async () => {
    const { harness, fake } = racing();
    const createSpy = vi.spyOn(fake, 'createMeeting');
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    const result = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toHaveLength(1);
    expect(result.created).toBe(true);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('provisioned');
    expect(row.zoom_meeting_number).toBe(result.zoom_meeting_number);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('scheduled');
  });

  it('[L3] and a normal cancel of a PROVISIONED meeting still deletes it at Zoom', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();

    await createMeetingProvisionHandler({ api: fake, store: harness.store })(context());
    expect(fake.listMeetings()).toHaveLength(1);

    // No race at all — the ordinary cancel, after the provision has fully landed.
    expect(await cancelAndRunDelete()).toEqual({ outcome: 'completed' });

    expect(fake.listMeetings()).toEqual([]);
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('deleted');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('[L4] both workers terminate and the loser does not spin', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();
    let deleteOutcome: { outcome: string; reason?: string } | null = null;

    const store = {
      ...harness.store,
      insertReservation: async (row: ReservationInsert) => {
        deleteOutcome = await cancelAndRunDelete();
        return harness.store.insertReservation(row);
      },
    };

    // Through the REAL runner and registry, because "does not spin" is a claim about the
    // JOB, not about the handler: a retryable failure would leave it `pending` for the
    // next tick to pick up, forever, since no backoff turns a cancelled session into a
    // scheduled one.
    const queueHarness = createMemoryJobQueue();
    await queueHarness.queue.enqueue({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
    });

    const tick = await runZoomTick({
      queue: queueHarness.queue,
      registry: createZoomJobRegistry({ api: fake, meetingProvisionStore: store }),
      workerId: 'worker-1',
      now: oneBatchClock(),
    });

    // The delete worker terminated (terminally, having found nothing)...
    expect(deleteOutcome).toEqual({ outcome: 'failed', reason: NO_MEETING_ROW_REASON });
    // ...and so did the provisioner, as a COMPLETION. Not `failed`, so nothing is
    // dead-lettered; not `pending`, so nothing re-claims it.
    expect(tick).toEqual({ claimed: 1, completed: 1, failed: 0 });
    expect(queueHarness.jobFor('meeting_provision')?.status).toBe('done');
    expect(queueHarness.queue.fail).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toEqual([]);
  });

  it('[L5] a compensating delete that FAILS is durable, visible, and keeps blocking the host', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();

    // Sol's named interleaving again — the delete runs before any row exists, so the
    // reservation this provisioner is about to place is still ACTIVE and still ours when
    // the compensation runs. That is the case where keeping the host blocked matters.
    const store = {
      ...harness.store,
      insertReservation: async (row: ReservationInsert) => {
        await cancelAndRunDelete();
        return harness.store.insertReservation(row);
      },
    };

    // Zoom refuses the compensating DELETE with something that is NOT a 404 — so we
    // cannot conclude the meeting is gone, and it is not.
    const api: ZoomApi = {
      ...fake,
      deleteMeeting: async () => {
        throw new ZoomNonRetryableError('Zoom 500 on DELETE /meetings/…', {
          status: 500,
          operation: 'DELETE /meetings',
        });
      },
    };

    const error = await createMeetingProvisionHandler({ api, store })(
      context()
    ).catch((caught) => caught);

    const ourNumber = fake.listMeetings()[0].id;
    const record = describeJobFailure(error);
    expect(record.kind).toBe('non_retryable');
    expect(record.reason).toBe(COMPENSATION_FAILED_REASON);
    expect(record.detail).toBe('status');
    // The durable half, structurally, in what the runner writes to zoom_jobs.last_error.
    expect(record.evidence).toEqual({
      meeting_id: 'meeting-1',
      created_zoom_meeting_number: ourNumber,
      trigger: 'status',
    });
    expect(JSON.parse(serializeJobFailure(record)).evidence.created_zoom_meeting_number).toBe(
      ourNumber
    );

    // Sol m1 (round 3): the operator sentence names the meeting and the one required
    // action and claims NOTHING about the host slot. Asserted here on the STILL-ACTIVE
    // path and again on the already-retired one below, so one sentence serves both
    // truthfully.
    expectStateNeutralCompensationCopy(error as Error, ourNumber);

    // The meeting really is still standing — the failure is not decorative.
    expect(fake.listMeetings()).toHaveLength(1);

    // The row is PARKED, not released: it keeps `pending`, so the §9 EXCLUDE constraint
    // goes on blocking a host a live meeting occupies, and the marker names that meeting.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(ZOOM_MEETING_ACTIVE_STATUSES).toContain(row.status);
    expect(parseCompensationFailedMarker(row.last_error)).toMatchObject({
      reason: COMPENSATION_FAILED_REASON,
      zoom_meeting_number: ourNumber,
      trigger: 'status',
    });

    // And `meeting_delete` REFUSES to free that host, exactly as it refuses an
    // ambiguous-create park. Without this, the next delete would release the reservation
    // and overwrite the one marker naming the standing meeting.
    const refused = await createMeetingDeleteHandler({
      api: fake,
      store: harness.deleteStore,
    })(deleteContext()).catch((caught) => caught);
    const refusal = describeJobFailure(refused);
    expect(refusal.reason).toBe(COMPENSATION_PARK_REASON);
    expect(refusal.evidence).toEqual({ meeting_id: 'meeting-1', zoom_meeting_number: ourNumber });
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('pending');
    expect(fake.listMeetings()).toHaveLength(1);
  });

  it('[L5b] the ALREADY-RETIRED path gets that same sentence, which is why it can be true', async () => {
    // The r29 window with the compensating DELETE failing. `meeting_delete` got there
    // first: the row is `deleted` and numberless, so it holds no §9 reservation — this is
    // exactly where the old copy's "keeps blocking its host" branch was false, and where
    // a caller that read the row a moment earlier would have said it anyway.
    const fake = seedFake();
    const minted = await fake.createMeeting({
      hostZoomUserId: HOST_LEAD.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'retired111',
    });
    const retiredRow: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'deleted',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_LEAD],
      meetings: [retiredRow],
    });

    // Not a 404, so the meeting cannot be concluded gone — and it is not.
    const api: ZoomApi = {
      ...fake,
      deleteMeeting: async () => {
        throw new ZoomNonRetryableError('Zoom 500 on DELETE /meetings/…', {
          status: 500,
          operation: 'DELETE /meetings',
        });
      },
    };

    const error = await createMeetingProvisionHandler({ api, store: harness.store })(
      context(
        jobRow({
          stage_state: {
            stage: 'created',
            meeting_id: 'meeting-1',
            meeting: {
              number: minted.id,
              passcode: minted.passcode,
              join_url: minted.joinUrl,
              settings: minted.settings,
            },
          },
        })
      )
    ).catch((caught) => caught);

    const record = describeJobFailure(error);
    expect(record.reason).toBe(COMPENSATION_FAILED_REASON);
    expect(record.evidence).toEqual({
      meeting_id: 'meeting-1',
      created_zoom_meeting_number: minted.id,
      trigger: 'status',
    });

    // The same sentence [L5] asserts on the still-active row. One copy, both states.
    expectStateNeutralCompensationCopy(error as Error, minted.id);

    // The durable marker still names the standing meeting, and the retiring writer's
    // status is left exactly where it put it — `recordLastError` touches neither.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('deleted');
    expect(parseCompensationFailedMarker(row.last_error)).toMatchObject({
      reason: COMPENSATION_FAILED_REASON,
      zoom_meeting_number: minted.id,
      trigger: 'status',
    });
    expect(fake.listMeetings()).toHaveLength(1);
  });

  it('a compensating delete that answers 404 is success: the meeting was already gone', async () => {
    const { harness, fake, cancelAndRunDelete } = racing();

    const store = {
      ...harness.store,
      insertReservation: async (row: ReservationInsert) => {
        await cancelAndRunDelete();
        return harness.store.insertReservation(row);
      },
    };
    const realCreate = fake.createMeeting.bind(fake);
    const api: ZoomApi = {
      ...fake,
      createMeeting: async (input) => {
        const created = await realCreate(input);
        // Somebody removed it at Zoom in between — the state we were about to ask for.
        await fake.deleteMeeting(created.id);
        return created;
      },
    };

    const result = await createMeetingProvisionHandler({ api, store })(context());

    expect(result).toMatchObject({ compensated: true, zoom_missing: true });
    expect(fake.listMeetings()).toEqual([]);
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('cancelled');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('a STRANDED post-create checkpoint on an ineligible session is taken off Zoom too', async () => {
    // The crash-shaped version of the same end state: a previous attempt created at Zoom
    // and died before persisting, and the session was cancelled in between. The
    // eligibility gate used to refuse and walk away, leaving that meeting standing.
    const fake = seedFake();
    const minted = await fake.createMeeting({
      hostZoomUserId: HOST_LEAD.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'stranded11',
    });
    const reservation: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      facilitators: [{ user_id: LEAD_PROFILE, is_lead: true }],
      hosts: [HOST_LEAD],
      meetings: [reservation],
    });
    const checkpoint: CreatedMeetingCheckpoint = {
      meetingId: 'meeting-1',
      number: minted.id,
      passcode: minted.passcode,
      joinUrl: minted.joinUrl,
      settings: minted.settings as Record<string, unknown>,
    };

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(
        jobRow({
          stage_state: {
            stage: 'created',
            meeting_id: checkpoint.meetingId,
            meeting: {
              number: checkpoint.number,
              passcode: checkpoint.passcode,
              join_url: checkpoint.joinUrl,
              settings: checkpoint.settings,
            },
          },
        })
      )
    ).catch((caught) => caught);

    // Same terminal outcome as before — the job state did not change.
    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    // ...but the meeting no longer stands, and the host is free.
    expect(fake.listMeetings()).toEqual([]);
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('cancelled');
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('leaves an UNRESOLVED ambiguous park alone: it still refuses rather than compensating', async () => {
    // The ambiguous park outranks the checkpoint: its reservation is protecting a host
    // against a meeting nobody could name, and the checkpoint does not name it either.
    const fake = seedFake();
    const parked: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'pending',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: ambiguousCreateMarker('req-abc', 'gateway timeout'),
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_LEAD],
      meetings: [parked],
    });
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context()
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    expect(deleteSpy).not.toHaveBeenCalled();
    // The reservation is UNCHANGED — still pending, still blocking, still parked.
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('pending');
    expect(row.last_error).toBe(parked.last_error);
  });

  // -------------------------------------------------------------------------
  // r29 · Sol R-A — the THIRD window: the delete gets there first and greens out
  // -------------------------------------------------------------------------

  /**
   * A job row that OUTLIVES one attempt, plus the heartbeat contract that makes the
   * checkpoint durable: `heartbeat_zoom_job` COALESCEs a NULL `p_stage_state`, so an
   * argumentless call extends the lease and leaves `stage_state` alone, and a call with
   * a payload REPLACES it. `fail_zoom_job` never touches the column, which is exactly
   * why a checkpoint survives a failed attempt and is available to the retry.
   */
  function resumableContext(): { job: ZoomJobRow; ctx: ZoomJobContext } {
    const job = jobRow();
    const ctx: ZoomJobContext = {
      job,
      workerId: 'worker-1',
      heartbeat: vi.fn(async (stageState?: Record<string, unknown>) => {
        if (stageState !== undefined) job.stage_state = stageState;
        return true;
      }),
    };
    return { job, ctx };
  }

  it('[R1] THE THIRD WINDOW: a checkpointed meeting survives a delete that retired the bare reservation', async () => {
    const { session, harness, fake } = racing();

    // --- ATTEMPT 1: reserve, create, checkpoint, then die RETRYABLY --------
    // The death is `readSession` throwing on the post-create re-check — the cheapest
    // shape of "the process did not get to the persist", and retryable, so the job comes
    // back. Everything before it really happened: the row is reserved, Zoom holds a
    // meeting, and the job's `stage_state` names it.
    const { job, ctx } = resumableContext();
    let reads = 0;
    const attemptOneStore = {
      ...harness.store,
      readSession: async (surfaceId: string) => {
        reads += 1;
        if (reads === 2) throw new ZoomRetryableError('connection reset by peer');
        return harness.store.readSession(surfaceId);
      },
    };

    const crash = await createMeetingProvisionHandler({ api: fake, store: attemptOneStore })(
      ctx
    ).catch((caught) => caught);
    expect(describeJobFailure(crash).kind).toBe('retryable');

    // The checkpoint LANDED, and it names the meeting Zoom is holding.
    const created = fake.listMeetings();
    expect(created).toHaveLength(1);
    const checkpoint = readCreatedCheckpoint(job.stage_state);
    expect(checkpoint?.number).toBe(created[0].id);

    const reserved = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(reserved.status).toBe('pending');
    expect(reserved.zoom_meeting_number).toBeNull();
    expect(checkpoint?.meetingId).toBe(reserved.id);

    // --- THE CANCELLATION, and the REAL delete ----------------------------
    // Not a stand-in: `createMeetingDeleteHandler` over the shared rows. It finds the
    // NUMBERLESS row, so it skips the Zoom call entirely — there is nothing it can name —
    // marks the row `deleted`, CLEARS `last_error`, publishes `cancelled`, and completes
    // GREEN. That greenness is the whole problem: nothing anywhere says a meeting is
    // still standing.
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');
    session.status = 'cancelada';
    const deleteResult = await createMeetingDeleteHandler({
      api: fake,
      store: harness.deleteStore,
    })(deleteContext());

    expect(deleteResult).toMatchObject({ deleted: false, zoom_missing: false });
    expect(deleteSpy).not.toHaveBeenCalled();
    const retired = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(retired.status).toBe('deleted');
    expect(retired.last_error).toBeNull();
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
    // ...and the meeting is STILL LIVE at Zoom. This is the state the retry inherits.
    expect(fake.listMeetings()).toHaveLength(1);

    // --- ATTEMPT 2: the retry, carrying the checkpoint ---------------------
    // Snapshot the writes that must NOT happen: the row belongs to the delete now.
    const releasesBefore = (harness.store.releaseReservation as ReturnType<typeof vi.fn>).mock
      .calls.length;
    const syncsBefore = (harness.store.syncProjectionFromMeeting as ReturnType<typeof vi.fn>)
      .mock.calls.length;

    const retry = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      ctx
    ).catch((caught) => caught);

    // The job still terminates the same way — this round changes what it CLEANS UP, not
    // what it decides.
    expect(describeJobFailure(retry).reason).toBe('session_ineligible');

    // --- THE END STATE: the fake holds NO live meeting --------------------
    // Asserted FIRST and on the fake's own inventory, so a regression prints the
    // standing meeting rather than a call count that has to be interpreted.
    expect(fake.listMeetings()).toEqual([]);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(created[0].id);

    // The already-retired row is left exactly as its writer left it: no release, no
    // republish, no marker.
    const after = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(after.status).toBe('deleted');
    expect(after.last_error).toBeNull();
    expect(
      (harness.store.releaseReservation as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBe(releasesBefore);
    expect(
      (harness.store.syncProjectionFromMeeting as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBe(syncsBefore);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });

  it('[R3] the ambiguous park still outranks the checkpoint on a RETIRED row too', async () => {
    // The precedence this round must not disturb. An unresolved ambiguous marker means
    // we never learned whether a meeting exists, and the checkpoint on the job names a
    // DIFFERENT question — so widening the status set must not let it decide this row.
    const fake = seedFake();
    const minted = await fake.createMeeting({
      hostZoomUserId: HOST_LEAD.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'ambiguous1',
    });
    const parkedAndRetired: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'cancelled',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: ambiguousCreateMarker('req-xyz', 'gateway timeout'),
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_LEAD],
      meetings: [parkedAndRetired],
    });
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(
        jobRow({
          stage_state: {
            stage: 'created',
            meeting_id: 'meeting-1',
            meeting: {
              number: minted.id,
              passcode: minted.passcode,
              join_url: minted.joinUrl,
              settings: minted.settings,
            },
          },
        })
      )
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(fake.listMeetings()).toHaveLength(1);
    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    expect(row.status).toBe('cancelled');
    expect(row.last_error).toBe(parkedAndRetired.last_error);
  });

  it('[R3] and an `error` row is still NOT compensable: it is a provisioner record, not a retirement', async () => {
    // `RETIRED_MEETING_STATUSES` deliberately excludes `error`. A numberless `error` row
    // is a definite pre-create failure this handler wrote itself — nothing retired the
    // surface — so widening to retired statuses must not sweep it in.
    const fake = seedFake();
    const minted = await fake.createMeeting({
      hostZoomUserId: HOST_LEAD.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'errorrow11',
    });
    const erroredRow: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: null,
      zoom_meeting_uuid: null,
      passcode: null,
      join_url: null,
      effective_settings: null,
      status: 'error',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: 'Zoom 400 on POST /users/…/meetings',
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_LEAD],
      meetings: [erroredRow],
    });
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');

    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(
        jobRow({
          stage_state: {
            stage: 'created',
            meeting_id: 'meeting-1',
            meeting: {
              number: minted.id,
              passcode: minted.passcode,
              join_url: minted.joinUrl,
              settings: minted.settings,
            },
          },
        })
      )
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(harness.meetingFor(SESSION_ID)?.status).toBe('error');
  });

  it('[R4] THE NEGATIVE CONTROL: a retired row CARRYING a number is not this process to compensate', async () => {
    // The ownership boundary `held.zoom_meeting_number === null` draws, and the one thing
    // [R1] cannot prove. A retired NUMBERLESS row is the row whose retirement PROVES
    // `meeting_delete` skipped the Zoom call, so this process still owns the meeting. A
    // retired row WITH a number was retired by a writer that DID call Zoom — that meeting
    // is not ours, and compensating it would have this job issue a DELETE against a
    // meeting another writer already owns and already published a projection for.
    const fake = seedFake();
    const minted = await fake.createMeeting({
      hostZoomUserId: HOST_LEAD.zoom_user_id,
      topic: SESSION.title,
      startTime: '2026-08-05T15:00:00',
      durationMinutes: 90,
      timezone: 'America/Santiago',
      passcode: 'numbered11',
    });
    const provisioned: StoredMeeting = {
      id: 'meeting-1',
      surface_type: 'consultor_session',
      surface_id: SESSION_ID,
      school_id: 77,
      host_zoom_user_id: HOST_LEAD.zoom_user_id,
      zoom_meeting_number: minted.id,
      zoom_meeting_uuid: null,
      passcode: minted.passcode,
      join_url: minted.joinUrl,
      effective_settings: minted.settings,
      status: 'provisioned',
      starts_at: EXPECTED_STARTS_AT,
      duration_minutes: 90,
      last_error: null,
    };
    const harness = createMemoryProvisionStore({
      session: { ...SESSION, status: 'cancelada' },
      hosts: [HOST_LEAD],
      meetings: [provisioned],
    });

    // The OTHER writer, run for real: it finds the number, calls Zoom, retires the row and
    // publishes `cancelled`. Everything after this belongs to it.
    const deleteSpy = vi.spyOn(fake, 'deleteMeeting');
    await createMeetingDeleteHandler({ api: fake, store: harness.deleteStore })(deleteContext());
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(fake.listMeetings()).toEqual([]);

    const afterDelete = { ...(harness.meetingFor(SESSION_ID) as StoredMeeting) };
    expect(afterDelete.status).toBe('deleted');
    expect(afterDelete.zoom_meeting_number).toBe(minted.id);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');

    // Now the provision retry arrives carrying a checkpoint naming the SAME row and the
    // SAME meeting — the [R1] shape in every respect except the number on the row.
    const error = await createMeetingProvisionHandler({ api: fake, store: harness.store })(
      context(
        jobRow({
          stage_state: {
            stage: 'created',
            meeting_id: 'meeting-1',
            meeting: {
              number: minted.id,
              passcode: minted.passcode,
              join_url: minted.joinUrl,
              settings: minted.settings,
            },
          },
        })
      )
    ).catch((caught) => caught);

    expect(describeJobFailure(error).reason).toBe('session_ineligible');

    // NO second DELETE — asserted on the call count, because the fake would answer a
    // second one with a 404 and the job would green out over it.
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    // ...and the row and the projection are byte-for-byte as the delete left them: no
    // release, no marker, no republish.
    expect({ ...(harness.meetingFor(SESSION_ID) as StoredMeeting) }).toEqual(afterDelete);
    expect(harness.projectionFor(SESSION_ID)?.meeting_status).toBe('cancelled');
  });
});
