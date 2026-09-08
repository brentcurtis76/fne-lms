// @vitest-environment node
/**
 * The Z2-1 enqueue gate: §14 flags + delegated §8 eligibility + the dedupe key.
 *
 * `checkSessionEligibility` is mocked with a spy that runs the REAL implementation, so
 * every eligibility assertion below is still checked against production behaviour while
 * also proving the gate delegates instead of restating the conditions (A3). If someone
 * ever inlines "status must be programada" into this module, the delegation assertions
 * go red even though the behavioural ones would still pass.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProvisionSessionRow } from '../../../lib/zoom/jobs/meeting-provision';
import type { ZoomJobQueue } from '../../../lib/zoom/jobs/queue';

const { spyCheckSessionEligibility } = vi.hoisted(() => ({
  spyCheckSessionEligibility: vi.fn(),
}));

vi.mock('../../../lib/zoom/jobs/meeting-provision', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = actual.checkSessionEligibility as (session: unknown) => unknown;
  return {
    ...actual,
    checkSessionEligibility: spyCheckSessionEligibility.mockImplementation(real),
  };
});

import {
  checkCleanupGate,
  checkProvisionGate,
  checkZoomRolloutPolicy,
  enqueueSessionMeetingDelete,
  enqueueSessionProvision,
  parseSchoolAllowlist,
  provisionDedupeKey,
} from '../../../lib/zoom/provisioning-intent';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const APPROVED_AT = '2026-08-04T14:30:00.000Z';

/** Synthetic. A session that passes every check. */
function session(overrides: Partial<ProvisionSessionRow> = {}): ProvisionSessionRow {
  return {
    id: SESSION_ID,
    school_id: 77,
    growth_community_id: COMMUNITY_ID,
    title: 'Sesión de acompañamiento — Ciclo 2',
    session_date: '2026-08-05',
    start_time: '15:00:00',
    end_time: '16:30:00',
    scheduled_duration_minutes: 90,
    status: 'programada',
    is_active: true,
    modality: 'online',
    meeting_provider: 'zoom',
    is_zoom_managed: true,
    ...overrides,
  };
}

const ON: NodeJS.ProcessEnv = { FEATURE_ZOOM_MEETINGS: 'true' };

function fakeQueue(enqueue: ZoomJobQueue['enqueue']): ZoomJobQueue {
  return {
    enqueue,
    claim: vi.fn(async () => []),
    heartbeat: vi.fn(async () => true),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => null),
  };
}

beforeEach(() => {
  spyCheckSessionEligibility.mockClear();
});

// ---------------------------------------------------------------------------
// parseSchoolAllowlist
// ---------------------------------------------------------------------------

describe('parseSchoolAllowlist', () => {
  it('returns null (= all schools) for unset', () => {
    expect(parseSchoolAllowlist(undefined)).toBeNull();
    expect(parseSchoolAllowlist(null)).toBeNull();
  });

  it('returns null (= all schools) for empty and whitespace-only', () => {
    expect(parseSchoolAllowlist('')).toBeNull();
    expect(parseSchoolAllowlist('  ')).toBeNull();
  });

  it('parses a single id', () => {
    expect(parseSchoolAllowlist('12')).toEqual(new Set([12]));
  });

  it('parses a csv list, trimming entries', () => {
    expect(parseSchoolAllowlist('12, 34')).toEqual(new Set([12, 34]));
  });

  it('ignores blank entries between commas', () => {
    expect(parseSchoolAllowlist('12,,34,')).toEqual(new Set([12, 34]));
  });

  it('drops a non-numeric entry WITHOUT widening to all schools', () => {
    // The whole point: a typo must narrow, never open the wave to every school.
    expect(parseSchoolAllowlist('abc')).toEqual(new Set());
    expect(parseSchoolAllowlist('12,abc')).toEqual(new Set([12]));
  });

  it('drops a non-integer entry', () => {
    expect(parseSchoolAllowlist('12.5')).toEqual(new Set());
  });
});

// ---------------------------------------------------------------------------
// provisionDedupeKey
// ---------------------------------------------------------------------------

describe('provisionDedupeKey', () => {
  it('has the documented shape', () => {
    expect(provisionDedupeKey(SESSION_ID, APPROVED_AT)).toBe(
      `meeting_provision:consultor_session:${SESSION_ID}:${APPROVED_AT}`
    );
  });

  it('is identical for the same session and the same approved_at', () => {
    expect(provisionDedupeKey(SESSION_ID, APPROVED_AT)).toBe(
      provisionDedupeKey(SESSION_ID, APPROVED_AT)
    );
  });

  it('differs for the same session approved later — a re-approval mints a fresh job', () => {
    expect(provisionDedupeKey(SESSION_ID, '2026-08-04T15:00:00.000Z')).not.toBe(
      provisionDedupeKey(SESSION_ID, APPROVED_AT)
    );
  });

  it('differs across sessions approved at the same instant', () => {
    expect(provisionDedupeKey('22222222-2222-4222-8222-222222222222', APPROVED_AT)).not.toBe(
      provisionDedupeKey(SESSION_ID, APPROVED_AT)
    );
  });
});

// ---------------------------------------------------------------------------
// checkProvisionGate
// ---------------------------------------------------------------------------

describe('checkProvisionGate', () => {
  it('passes a managed, eligible session with the flag on and no allowlist', () => {
    expect(checkProvisionGate(session(), ON)).toBeNull();
  });

  it('refuses when FEATURE_ZOOM_MEETINGS is unset', () => {
    expect(checkProvisionGate(session(), {})).toEqual({ reason: 'feature_disabled' });
  });

  it("refuses when FEATURE_ZOOM_MEETINGS is 'false'", () => {
    expect(checkProvisionGate(session(), { FEATURE_ZOOM_MEETINGS: 'false' })).toEqual({
      reason: 'feature_disabled',
    });
  });

  it("refuses any non-'true' value — the repo flag convention is the exact string", () => {
    expect(checkProvisionGate(session(), { FEATURE_ZOOM_MEETINGS: '1' })).toEqual({
      reason: 'feature_disabled',
    });
    expect(checkProvisionGate(session(), { FEATURE_ZOOM_MEETINGS: 'TRUE' })).toEqual({
      reason: 'feature_disabled',
    });
  });

  it('checks the master flag BEFORE anything else — no eligibility call at all', () => {
    checkProvisionGate(session({ status: 'cancelada' }), {});
    expect(spyCheckSessionEligibility).not.toHaveBeenCalled();
  });

  /** Every §8 refusal, surfaced by delegation. */
  const INELIGIBLE: Array<{ name: string; patch: Partial<ProvisionSessionRow>; check: string }> = [
    { name: 'draft', patch: { status: 'borrador' }, check: 'status' },
    { name: 'cancelled', patch: { status: 'cancelada' }, check: 'status' },
    { name: 'soft-deleted', patch: { is_active: false }, check: 'is_active' },
    { name: 'presencial', patch: { modality: 'presencial' }, check: 'modality' },
    { name: 'another provider', patch: { meeting_provider: 'google_meet' }, check: 'meeting_provider' },
    { name: 'no provider', patch: { meeting_provider: null }, check: 'meeting_provider' },
    { name: 'not managed', patch: { is_zoom_managed: false }, check: 'is_zoom_managed' },
  ];

  for (const { name, patch, check } of INELIGIBLE) {
    it(`refuses a ${name} session with check '${check}'`, () => {
      const row = session(patch);
      expect(checkProvisionGate(row, ON)).toEqual({ reason: 'session_ineligible', check });
      // Delegation, not restatement: the gate asked the provisioner's own predicate.
      expect(spyCheckSessionEligibility).toHaveBeenCalledWith(row);
    });
  }

  it('refuses a school outside a non-empty allowlist', () => {
    expect(
      checkProvisionGate(session({ school_id: 77 }), {
        ...ON,
        ZOOM_SCHOOL_ALLOWLIST: '12, 34',
      })
    ).toEqual({ reason: 'school_not_allowlisted', schoolId: 77 });
  });

  it('passes a school inside a non-empty allowlist', () => {
    expect(
      checkProvisionGate(session({ school_id: 34 }), { ...ON, ZOOM_SCHOOL_ALLOWLIST: '12, 34' })
    ).toBeNull();
  });

  it('passes every school when the allowlist is unset, empty or whitespace-only', () => {
    expect(checkProvisionGate(session(), ON)).toBeNull();
    expect(checkProvisionGate(session(), { ...ON, ZOOM_SCHOOL_ALLOWLIST: '' })).toBeNull();
    expect(checkProvisionGate(session(), { ...ON, ZOOM_SCHOOL_ALLOWLIST: '   ' })).toBeNull();
  });

  it('a malformed allowlist refuses rather than opening every school', () => {
    expect(
      checkProvisionGate(session({ school_id: 77 }), { ...ON, ZOOM_SCHOOL_ALLOWLIST: 'colegio-77' })
    ).toEqual({ reason: 'school_not_allowlisted', schoolId: 77 });
  });

  it('reports the allowlist before ineligibility — rollout policy is evaluated first (B1)', () => {
    // Before Unit B1 the order was flag → eligibility → allowlist, so this exact input
    // answered `session_ineligible`. The provision gate now runs the whole shared rollout
    // policy before it reads any source state, so the wave refusal wins.
    expect(
      checkProvisionGate(session({ school_id: 77, is_zoom_managed: false }), {
        ...ON,
        ZOOM_SCHOOL_ALLOWLIST: '12',
      })
    ).toEqual({ reason: 'school_not_allowlisted', schoolId: 77 });
  });

  it('delegates: an allowlist refusal happens before ANY eligibility call', () => {
    checkProvisionGate(session({ school_id: 77, status: 'cancelada' }), {
      ...ON,
      ZOOM_SCHOOL_ALLOWLIST: '12',
    });
    expect(spyCheckSessionEligibility).not.toHaveBeenCalled();
  });

  it('delegates: once rollout passes, canonical eligibility is called exactly once with the row', () => {
    const row = session({ school_id: 12, status: 'borrador' });
    expect(checkProvisionGate(row, { ...ON, ZOOM_SCHOOL_ALLOWLIST: '12' })).toEqual({
      reason: 'session_ineligible',
      check: 'status',
    });
    expect(spyCheckSessionEligibility).toHaveBeenCalledTimes(1);
    expect(spyCheckSessionEligibility).toHaveBeenCalledWith(row);
  });

  it('agrees with checkZoomRolloutPolicy on every rollout outcome for the same school and env', () => {
    const envs: NodeJS.ProcessEnv[] = [
      {},
      { FEATURE_ZOOM_MEETINGS: 'false' },
      ON,
      { ...ON, ZOOM_SCHOOL_ALLOWLIST: '77' },
      { ...ON, ZOOM_SCHOOL_ALLOWLIST: '12' },
      { ...ON, ZOOM_SCHOOL_ALLOWLIST: 'colegio-77' },
    ];
    for (const env of envs) {
      const rollout = checkZoomRolloutPolicy(77, env);
      const gate = checkProvisionGate(session({ school_id: 77 }), env);
      expect(gate).toEqual(rollout);
    }
  });
});

// ---------------------------------------------------------------------------
// checkZoomRolloutPolicy — the shared §14 layer on its own (Unit B1)
// ---------------------------------------------------------------------------

describe('checkZoomRolloutPolicy', () => {
  it('passes with the master flag on and no allowlist', () => {
    expect(checkZoomRolloutPolicy(77, ON)).toBeNull();
  });

  it("refuses every non-'true' master value — the exact-string convention", () => {
    for (const value of [undefined, '', 'false', 'TRUE', 'True', '1', 'yes', ' true']) {
      const env: NodeJS.ProcessEnv = value === undefined ? {} : { FEATURE_ZOOM_MEETINGS: value };
      expect(checkZoomRolloutPolicy(77, env)).toEqual({ reason: 'feature_disabled' });
    }
  });

  it('passes an allowlisted school', () => {
    expect(checkZoomRolloutPolicy(77, { ...ON, ZOOM_SCHOOL_ALLOWLIST: '12, 77' })).toBeNull();
  });

  it('refuses a school outside a non-empty allowlist, naming the school', () => {
    expect(checkZoomRolloutPolicy(77, { ...ON, ZOOM_SCHOOL_ALLOWLIST: '12' })).toEqual({
      reason: 'school_not_allowlisted',
      schoolId: 77,
    });
  });

  it('a malformed non-empty allowlist fails closed rather than opening every school', () => {
    expect(checkZoomRolloutPolicy(77, { ...ON, ZOOM_SCHOOL_ALLOWLIST: 'colegio-77' })).toEqual({
      reason: 'school_not_allowlisted',
      schoolId: 77,
    });
  });

  it('treats an unset, empty or whitespace-only allowlist as every school', () => {
    for (const raw of [undefined, '', '   ']) {
      const env: NodeJS.ProcessEnv = raw === undefined ? ON : { ...ON, ZOOM_SCHOOL_ALLOWLIST: raw };
      expect(checkZoomRolloutPolicy(77, env)).toBeNull();
    }
  });

  it('never invokes session eligibility — a draft can ask without being programada', () => {
    checkZoomRolloutPolicy(77, ON);
    checkZoomRolloutPolicy(77, {});
    checkZoomRolloutPolicy(77, { ...ON, ZOOM_SCHOOL_ALLOWLIST: '12' });
    expect(spyCheckSessionEligibility).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cleanup stays flag-free after the rollout-policy extraction (Unit B1)
// ---------------------------------------------------------------------------

describe('cleanup ignores the rollout policy', () => {
  const OFF_AND_OUT: NodeJS.ProcessEnv = {
    FEATURE_ZOOM_MEETINGS: 'false',
    ZOOM_SCHOOL_ALLOWLIST: '12',
  };

  it('checkCleanupGate passes durable managed intent with no environment at all', () => {
    expect(checkCleanupGate(session({ school_id: 77, status: 'cancelada' }))).toBeNull();
    expect(spyCheckSessionEligibility).not.toHaveBeenCalled();
  });

  it('enqueues meeting_delete with the master flag off AND the school outside the allowlist', async () => {
    const queue = { enqueue: vi.fn().mockResolvedValue('enqueued') } as unknown as ZoomJobQueue;
    const outcome = await enqueueSessionMeetingDelete({
      session: session({ school_id: 77, status: 'cancelada', is_zoom_managed: true }),
      queue,
      env: OFF_AND_OUT,
    });
    expect(outcome).toEqual({
      status: 'enqueued',
      dedupeKey: `meeting_delete:consultor_session:${SESSION_ID}`,
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(checkZoomRolloutPolicy(77, OFF_AND_OUT)).not.toBeNull();
  });

  it('still refuses an unmanaged session, and never touches the queue', async () => {
    const queue = { enqueue: vi.fn() } as unknown as ZoomJobQueue;
    const outcome = await enqueueSessionMeetingDelete({
      session: session({ status: 'cancelada', is_zoom_managed: false }),
      queue,
      env: ON,
    });
    expect(outcome).toEqual({ status: 'skipped', refusal: { reason: 'not_managed' } });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// enqueueSessionProvision
// ---------------------------------------------------------------------------

describe('enqueueSessionProvision', () => {
  it('enqueues exactly the documented job on a pass', async () => {
    const enqueue = vi.fn(async () => 'enqueued' as const);
    const outcome = await enqueueSessionProvision({
      session: session(),
      approvedAt: APPROVED_AT,
      queue: fakeQueue(enqueue),
      env: ON,
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_provision:consultor_session:${SESSION_ID}:${APPROVED_AT}`,
    });
    expect(outcome).toEqual({
      status: 'enqueued',
      dedupeKey: `meeting_provision:consultor_session:${SESSION_ID}:${APPROVED_AT}`,
    });
  });

  it("surfaces a deduped enqueue as 'duplicate', not as an error", async () => {
    const outcome = await enqueueSessionProvision({
      session: session(),
      approvedAt: APPROVED_AT,
      queue: fakeQueue(vi.fn(async () => 'duplicate' as const)),
      env: ON,
    });
    expect(outcome.status).toBe('duplicate');
  });

  it('skips with the refusal attached and never touches the queue', async () => {
    const enqueue = vi.fn(async () => 'enqueued' as const);
    const outcome = await enqueueSessionProvision({
      session: session({ is_zoom_managed: false }),
      approvedAt: APPROVED_AT,
      queue: fakeQueue(enqueue),
      env: ON,
    });

    expect(enqueue).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      status: 'skipped',
      refusal: { reason: 'session_ineligible', check: 'is_zoom_managed' },
    });
  });

  it('swallows a queue throw — approval must never fail because of Zoom', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('zoom_jobs enqueue failed: connection reset');

    const outcome = await enqueueSessionProvision({
      session: session(),
      approvedAt: APPROVED_AT,
      queue: fakeQueue(
        vi.fn(async () => {
          throw boom;
        })
      ),
      env: ON,
    });

    expect(outcome).toEqual({ status: 'failed', error: boom });
    // Logged against the session id so an operator can find it.
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(SESSION_ID));
    consoleError.mockRestore();
  });

  it('swallows a queue that cannot even be built (missing Zoom service env)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // No `queue` injected and no Supabase env ⇒ `defaultZoomJobQueue` throws while
    // constructing the service client. Still not the caller's problem.
    const outcome = await enqueueSessionProvision({
      session: session(),
      approvedAt: APPROVED_AT,
      env: ON,
    });

    expect(outcome.status).toBe('failed');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(SESSION_ID));
    consoleError.mockRestore();
  });
});
