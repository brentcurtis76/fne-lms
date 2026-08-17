// @vitest-environment node
/**
 * Z2-1 [A4] [A5] [A6] — POST /api/sessions/[id]/approve enqueues the Zoom provisioning
 * job, and approval NEVER fails because of Zoom.
 *
 * Only the queue seam is faked: the gate, the dedupe key and the route wiring are all
 * the real thing, so a change to any of them shows up here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SCHOOL_ID = 77;

const { mockCheckIsAdmin, mockCreateServiceRoleClient, mockValidateFacilitatorIntegrity, mockCreateReservation, mockEnqueue } =
  vi.hoisted(() => ({
    mockCheckIsAdmin: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockValidateFacilitatorIntegrity: vi.fn(),
    mockCreateReservation: vi.fn(),
    mockEnqueue: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/utils/facilitator-validation', () => ({
  validateFacilitatorIntegrity: mockValidateFacilitatorIntegrity,
}));

vi.mock('../../../lib/services/hour-tracking', () => ({
  createReservation: mockCreateReservation,
  HOUR_AVAILABILITY_ERROR_ES: 'No se pudo verificar la disponibilidad de horas.',
}));

// The ONLY faked seam. `provisioning-intent` builds the queue through this factory.
vi.mock('../../../lib/zoom/jobs/queue', () => ({
  defaultZoomJobQueue: () => ({
    enqueue: mockEnqueue,
    claim: vi.fn(),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));

import handler from '../../../pages/api/sessions/[id]/approve';

interface ClientState {
  session: Record<string, unknown>;
  /** Rows deleted from `contract_hours_ledger` — the compensating action's footprint. */
  ledgerDeletes: string[];
  updated: Record<string, unknown> | null;
}

function createClient(state: ClientState) {
  let sessionCall = 0;

  const sessionsBuilder = () => {
    sessionCall += 1;
    const isRead = sessionCall === 1;
    let payload: Record<string, unknown> | null = null;

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, unknown>) => {
        payload = p;
        return api;
      }),
      eq: vi.fn(() => api),
      single: vi.fn(async () => {
        if (isRead) return { data: { ...state.session }, error: null };
        state.updated = { ...state.session, ...(payload || {}) };
        return { data: { ...state.updated }, error: null };
      }),
    };
    return api;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_facilitators') {
        const api: any = {
          select: vi.fn(() => api),
          eq: vi.fn(async () => ({ data: [], error: null })),
        };
        return api;
      }
      if (table === 'session_activity_log') {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
      }
      if (table === 'contract_hours_ledger') {
        const api: any = {
          delete: vi.fn(() => api),
          eq: vi.fn(async (_col: string, val: string) => {
            state.ledgerDeletes.push(val);
            return { data: null, error: null };
          }),
        };
        return api;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

/** A session the scheduler marked "Generar reunión Zoom", awaiting approval. */
function managedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    school_id: SCHOOL_ID,
    growth_community_id: '44444444-4444-4444-8444-444444444444',
    title: 'Sesión de acompañamiento',
    session_date: '2026-08-05',
    start_time: '15:00:00',
    end_time: '16:30:00',
    scheduled_duration_minutes: 90,
    status: 'borrador',
    is_active: true,
    modality: 'online',
    meeting_provider: 'zoom',
    meeting_link: null,
    is_zoom_managed: true,
    ...overrides,
  };
}

function reqRes() {
  return createMocks({
    method: 'POST',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
  });
}

let state: ClientState;
const ORIGINAL_FLAG = process.env.FEATURE_ZOOM_MEETINGS;
const ORIGINAL_ALLOWLIST = process.env.ZOOM_SCHOOL_ALLOWLIST;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  setEnv('FEATURE_ZOOM_MEETINGS', 'true');
  setEnv('ZOOM_SCHOOL_ALLOWLIST', undefined);

  state = { session: managedSession(), ledgerDeletes: [], updated: null };

  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => createClient(state));
  mockValidateFacilitatorIntegrity.mockResolvedValue({ valid: true, errors: [] });
  mockCreateReservation.mockResolvedValue({ skipped: false, ledger_entry_id: 'ledger-1', error: null });
  mockEnqueue.mockResolvedValue('enqueued');
});

afterEach(() => {
  setEnv('FEATURE_ZOOM_MEETINGS', ORIGINAL_FLAG);
  setEnv('ZOOM_SCHOOL_ALLOWLIST', ORIGINAL_ALLOWLIST);
});

describe('POST /api/sessions/[id]/approve — Zoom provisioning enqueue', () => {
  it('[A4] enqueues exactly one job with the documented payload and dedupe key', async () => {
    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);

    const approvedAt = state.updated?.approved_at as string;
    expect(typeof approvedAt).toBe('string');

    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_provision',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_provision:consultor_session:${SESSION_ID}:${approvedAt}`,
    });
  });

  it('[A4] the key uses the approved_at the route actually wrote', async () => {
    const { req, res } = reqRes();
    await handler(req as any, res as any);

    const body = JSON.parse(res._getData());
    const approvedAt = body.data.session.approved_at;
    const key = mockEnqueue.mock.calls[0][0].dedupe_key as string;
    expect(key.endsWith(`:${approvedAt}`)).toBe(true);
  });

  it('[A5] returns its normal 200 and the same body when enqueue throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.session.status).toBe('programada');
    expect(body.data.session.id).toBe(SESSION_ID);
    // The ledger reservation survives: no compensating delete ran.
    expect(state.ledgerDeletes).toEqual([]);
    consoleError.mockRestore();
  });

  it('[A5] a duplicate enqueue is indistinguishable from a fresh one to the caller', async () => {
    mockEnqueue.mockResolvedValue('duplicate');

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.session.status).toBe('programada');
  });

  it('[A6] does not enqueue when the master flag is off', async () => {
    setEnv('FEATURE_ZOOM_MEETINGS', 'false');

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A6] does not enqueue when the master flag is unset', async () => {
    setEnv('FEATURE_ZOOM_MEETINGS', undefined);

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A6] does not enqueue when the school is outside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A6] DOES enqueue when the school is inside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', `12, ${SCHOOL_ID}`);

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('[A6] does not enqueue an unmanaged session, even with a zoom provider', async () => {
    state.session = managedSession({ is_zoom_managed: false });

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A6] does not enqueue a presencial session', async () => {
    state.session = managedSession({ modality: 'presencial' });

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A6] does not enqueue when the approval itself was rejected', async () => {
    state.session = managedSession({ status: 'programada' });

    const { req, res } = reqRes();
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
