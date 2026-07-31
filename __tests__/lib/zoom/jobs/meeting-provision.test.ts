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
  createMeetingProvisionHandler,
  deriveDurationMinutes,
  generateMeetingPasscode,
  orderHostCandidates,
  reservationOverlapBounds,
  toZoomWallClock,
  ZoomNoHostAvailableError,
  type ProvisionHostRow,
  type ProvisionSessionRow,
} from '../../../../lib/zoom/jobs/meeting-provision';
import { ZoomNonRetryableError, ZoomRetryableError } from '../../../../lib/zoom/errors';
import { createLiveZoomApi, type ZoomApi } from '../../../../lib/zoom/api';
import { createZoomClient } from '../../../../lib/zoom/client';
import type { ZoomTokenProvider } from '../../../../lib/zoom/token';
import { describeJobFailure } from '../../../../lib/zoom/jobs/runner';
import { createZoomFake, type ZoomFake } from '../../../../lib/zoom/fake';
import { applyWebhookLifecycle } from '../../../../lib/zoom/webhook-lifecycle';
import { ZoomJobLeaseLostError, type ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import type { ZoomJobRow } from '../../../../lib/zoom/db-types';
import {
  LIFECYCLE_ENDED_APPLIES_FROM,
  LIFECYCLE_STARTED_APPLIES_FROM,
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

    // THE crash window: Zoom minted the meeting, the persist never landed.
    vi.mocked(harness.store.markProvisioned).mockRejectedValueOnce(new Error('connection reset'));

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

  it('a resolved park RESUMES: an operator-recorded meeting number lets the requeue finish', async () => {
    // Resolution path 1 from the module header. The marker is still on the row — the
    // operator only filled in the number — and the ANCHOR must win over the gate,
    // otherwise the documented recovery is unreachable and the row is stuck forever.
    const fake = seedFake();
    const api: ZoomApi = { ...fake };
    const createSpy = vi.spyOn(api, 'createMeeting');
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
      meetings: [
        {
          id: 'meeting-resolved',
          surface_type: 'consultor_session',
          surface_id: SESSION_ID,
          school_id: 77,
          host_zoom_user_id: HOST_POOL_A.zoom_user_id,
          // What reconciliation against Zoom found.
          zoom_meeting_number: 82000000777,
          zoom_meeting_uuid: null,
          passcode: null,
          join_url: null,
          effective_settings: { auto_recording: 'none' },
          status: 'pending',
          starts_at: EXPECTED_STARTS_AT,
          duration_minutes: 90,
          last_error: ambiguousCreateMarker('synthetic-zm-request-id-0004', 'lost response'),
        },
      ],
    });

    const result = await createMeetingProvisionHandler({ api, store: harness.store })(context());

    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ zoom_meeting_number: 82000000777, created: false });
    // ...and the surface finally reaches the UI.
    expect(harness.projectionFor(SESSION_ID)).toMatchObject({ meeting_status: 'scheduled' });
  });

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

  it('exempts the checkpoint-adopt path — Zoom already holds that meeting', async () => {
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
