// @vitest-environment node
/**
 * Z2-1 [A7] — POST /api/sessions/bulk-approve enqueues once per eligible session and
 * zero times for the ineligible ones in the SAME batch, with the never-fail semantics
 * of [A5].
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const MANAGED_ID = '55555555-5555-4555-8555-555555555551';
const PRESENCIAL_ID = '55555555-5555-4555-8555-555555555552';
const UNMANAGED_ID = '55555555-5555-4555-8555-555555555553';
const SCHOOL_ID = 77;

const {
  mockCheckIsAdmin,
  mockCreateServiceRoleClient,
  mockValidateFacilitatorIntegrity,
  mockCreateReservation,
  mockPrepareReservation,
  mockEnqueue,
} = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockValidateFacilitatorIntegrity: vi.fn(),
  mockCreateReservation: vi.fn(),
  mockPrepareReservation: vi.fn(),
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
  prepareReservation: mockPrepareReservation,
  HOUR_AVAILABILITY_ERROR_ES: 'No se pudo verificar la disponibilidad de horas.',
}));

vi.mock('../../../lib/zoom/jobs/queue', () => ({
  defaultZoomJobQueue: () => ({
    enqueue: mockEnqueue,
    claim: vi.fn(),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));

import handler from '../../../pages/api/sessions/bulk-approve';

function sessionRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
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

interface ClientState {
  rows: Array<Record<string, unknown>>;
  updated: Array<Record<string, unknown>>;
}

function createClient(state: ClientState) {
  let sessionCall = 0;

  const sessionsBuilder = () => {
    sessionCall += 1;
    const isRead = sessionCall === 1;
    let payload: Record<string, unknown> = {};

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, unknown>) => {
        payload = p;
        return api;
      }),
      in: vi.fn(() => api),
      eq: vi.fn(() => api),
    };

    // Both paths are awaited builders — `.select('*').in().in()` on read and
    // `.update().in().select('*')` on write — so the builder itself is thenable.
    api.then = (resolve: (v: unknown) => void) => {
      if (isRead) return resolve({ data: state.rows.map((r) => ({ ...r })), error: null });
      state.updated = state.rows.map((r) => ({ ...r, ...payload }));
      return resolve({ data: state.updated.map((r) => ({ ...r })), error: null });
    };

    return api;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_facilitators') {
        const api: any = {
          select: vi.fn(() => api),
          in: vi.fn(async () => ({ data: [], error: null })),
        };
        return api;
      }
      if (table === 'session_activity_log') {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function reqRes(sessionIds: string[]) {
  return createMocks({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { session_ids: sessionIds },
  });
}

let state: ClientState;
const ORIGINAL_FLAG = process.env.FEATURE_ZOOM_MEETINGS;
const ORIGINAL_ALLOWLIST = process.env.ZOOM_SCHOOL_ALLOWLIST;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const MIXED_BATCH = [MANAGED_ID, PRESENCIAL_ID, UNMANAGED_ID];

beforeEach(() => {
  vi.clearAllMocks();
  setEnv('FEATURE_ZOOM_MEETINGS', 'true');
  setEnv('ZOOM_SCHOOL_ALLOWLIST', undefined);

  state = {
    rows: [
      sessionRow(MANAGED_ID),
      // Managed intent set, but nothing to join — the modality gate refuses it.
      sessionRow(PRESENCIAL_ID, { modality: 'presencial' }),
      // A hand-scheduled Zoom link: right provider, no managed intent.
      sessionRow(UNMANAGED_ID, { is_zoom_managed: false, meeting_link: 'https://zoom.us/j/1' }),
    ],
    updated: [],
  };

  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => createClient(state));
  mockValidateFacilitatorIntegrity.mockResolvedValue({ valid: true, errors: [] });
  mockPrepareReservation.mockResolvedValue({ kind: 'skipped' });
  mockCreateReservation.mockResolvedValue({ skipped: false, ledger_entry_id: 'ledger-1', error: null });
  mockEnqueue.mockResolvedValue('enqueued');
});

afterEach(() => {
  setEnv('FEATURE_ZOOM_MEETINGS', ORIGINAL_FLAG);
  setEnv('ZOOM_SCHOOL_ALLOWLIST', ORIGINAL_ALLOWLIST);
});

describe('POST /api/sessions/bulk-approve — Zoom provisioning enqueue', () => {
  it('[A7] enqueues once for the eligible session and zero times for the rest', async () => {
    const { req, res } = reqRes(MIXED_BATCH);
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.approved_count).toBe(3);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const arg = mockEnqueue.mock.calls[0][0];
    expect(arg.payload).toEqual({ surface_type: 'consultor_session', surface_id: MANAGED_ID });
  });

  it('[A7] the dedupe key carries the batch approved_at the route wrote', async () => {
    const { req, res } = reqRes(MIXED_BATCH);
    await handler(req as any, res as any);

    const approvedAt = state.updated[0].approved_at as string;
    expect(mockEnqueue.mock.calls[0][0].dedupe_key).toBe(
      `meeting_provision:consultor_session:${MANAGED_ID}:${approvedAt}`
    );
  });

  it('[A7] enqueues once per eligible session when the whole batch is eligible', async () => {
    state.rows = [sessionRow(MANAGED_ID), sessionRow(UNMANAGED_ID, {})];

    const { req, res } = reqRes([MANAGED_ID, UNMANAGED_ID]);
    await handler(req as any, res as any);

    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue.mock.calls.map((c) => c[0].payload.surface_id).sort()).toEqual(
      [MANAGED_ID, UNMANAGED_ID].sort()
    );
  });

  it('[A7] a throwing enqueue does not fail the batch, and does not stop the next one', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.rows = [sessionRow(MANAGED_ID), sessionRow(UNMANAGED_ID, {})];
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = reqRes([MANAGED_ID, UNMANAGED_ID]);
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.approved_count).toBe(2);
    expect(body.data.sessions.every((s: any) => s.status === 'programada')).toBe(true);
    // Both were attempted — the first failure did not abort the loop.
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it('[A7] enqueues nothing when the master flag is off', async () => {
    setEnv('FEATURE_ZOOM_MEETINGS', 'false');

    const { req, res } = reqRes(MIXED_BATCH);
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A7] enqueues nothing when the batch school is outside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = reqRes(MIXED_BATCH);
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
