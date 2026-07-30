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
import { describeJobFailure } from '../../../../lib/zoom/jobs/runner';
import { createZoomFake, type ZoomFake } from '../../../../lib/zoom/fake';
import { applyWebhookLifecycle } from '../../../../lib/zoom/webhook-lifecycle';
import type { ZoomJobContext } from '../../../../lib/zoom/jobs/types';
import type { ZoomJobRow } from '../../../../lib/zoom/db-types';
import type { ZoomWebhookStore } from '../../../../lib/zoom/webhook-store';
import {
  createMemoryJobQueue,
  createMemoryProvisionStore,
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

  it('is idempotent across a crash after create: createMeeting runs EXACTLY once', async () => {
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

  it("parks the failure on the row and rethrows when Zoom's create fails", async () => {
    const fake = seedFake();
    const boom = new Error('zoom exploded');
    vi.spyOn(fake, 'createMeeting').mockRejectedValueOnce(boom);
    const harness = createMemoryProvisionStore({
      session: SESSION,
      hosts: [HOST_POOL_A],
    });

    const handler = createMeetingProvisionHandler({ api: fake, store: harness.store });
    await expect(handler(context())).rejects.toThrow('zoom exploded');

    const row = harness.meetingFor(SESSION_ID) as StoredMeeting;
    // 'error' is not an ACTIVE status, so the reservation is released for the retry.
    expect(row.status).toBe('error');
    expect(row.last_error).toBe('zoom exploded');
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
        row.status = status;
        if (uuid !== null) row.zoom_meeting_uuid = uuid;
      }),
    };

    await applyWebhookLifecycle(store, 'meeting.started', {
      // Zoom sends the id as a decimal STRING.
      id: String(meetingNumber),
      uuid: occurrenceUuid,
    });

    expect(row.status).toBe('started');
    expect(row.zoom_meeting_uuid).toBe(occurrenceUuid);

    // `meeting.ended` must never blank it.
    await applyWebhookLifecycle(store, 'meeting.ended', { id: String(meetingNumber) });
    expect(row.status).toBe('ended');
    expect(row.zoom_meeting_uuid).toBe(occurrenceUuid);
  });
});
