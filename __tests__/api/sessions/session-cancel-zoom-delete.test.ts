// @vitest-environment node
/**
 * Z2-3b [A7] [A8] [A9] [A10] — cancelling a session takes its Zoom meeting with it, and
 * never fails because of Zoom.
 *
 * Two routes: `POST /api/sessions/[id]/cancel` (which has TWO paths — the hour-tracking
 * clause flow and the legacy simple cancel, and both reach `cancelada`) and
 * `POST /api/sessions/series/[groupId]/cancel`.
 *
 * The cancellation-clause flow itself is untouched by this chunk; these tests assert the
 * enqueue BESIDE it, and that the clause result still comes back unchanged.
 *
 * Only the QUEUE seam is faked. The §14 flags, the managed-intent gate, the dedupe key and
 * the route wiring are real. The session double is FILTER-AWARE: a canned row resolves
 * only when the recorded `.eq()` filters match it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const GROUP_ID = '55555555-5555-4555-8555-555555555555';
const SCHOOL_ID = 77;

const {
  mockCheckIsAdmin,
  mockCreateServiceRoleClient,
  mockExecuteCancellation,
  mockEnqueue,
} = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockExecuteCancellation: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  checkIsAdmin: mockCheckIsAdmin,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res, message, status, details) => {
    res.status(status).json({ error: message, details });
  }),
  sendApiResponse: vi.fn((res, data, status = 200) => {
    res.status(status).json({ data });
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

// Only `executeCancellation` is stubbed — it is a multi-table transaction of its own, and
// PM ruling 5 puts it out of scope. `evaluateCancellationClause` and
// `calculateNoticeHours` stay REAL, so the legacy path's clause result is genuine.
vi.mock('../../../lib/services/hour-tracking', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, executeCancellation: mockExecuteCancellation };
});

// The ONLY faked seam on the Zoom side.
vi.mock('../../../lib/zoom/jobs/queue', () => ({
  defaultZoomJobQueue: () => ({
    enqueue: mockEnqueue,
    claim: vi.fn(),
    heartbeat: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));

import cancelHandler from '../../../pages/api/sessions/[id]/cancel';
import seriesCancelHandler from '../../../pages/api/sessions/series/[groupId]/cancel';

interface MockState {
  row: Record<string, any>;
  /** The series batch. */
  seriesRows: Record<string, any>[];
}

let state: MockState;

function matches(row: Record<string, any>, filters: Array<[string, unknown]>): boolean {
  return filters.every(([column, value]) => row[column] === value);
}

function createMockClient() {
  const sessionsBuilder = () => {
    const filters: Array<[string, unknown]> = [];
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, any> | null = null;
    let inIds: string[] | null = null;

    const finalize = () => {
      // The series route selects a SET; the single route selects one row.
      if (inIds !== null || filters.some(([column]) => column === 'recurrence_group_id')) {
        const batch = state.seriesRows.filter(
          (row) =>
            matches(row, filters) && (inIds === null || inIds.includes(row.id as string))
        );
        if (op === 'select') return Promise.resolve({ data: batch.map((r) => ({ ...r })), error: null });
        for (const row of batch) Object.assign(row, payload || {});
        return Promise.resolve({ data: batch.map((r) => ({ ...r })), error: null });
      }

      if (!matches(state.row, filters)) return Promise.resolve({ data: null, error: null });
      if (op === 'select') return Promise.resolve({ data: { ...state.row }, error: null });
      state.row = { ...state.row, ...(payload || {}) };
      return Promise.resolve({ data: { ...state.row }, error: null });
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, any>) => {
        op = 'update';
        payload = p;
        return api;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return api;
      }),
      in: vi.fn((_column: string, values: string[]) => {
        inIds = values;
        return api;
      }),
      not: vi.fn(() => api),
      gte: vi.fn(() => api),
      single: vi.fn(() => finalize()),
      maybeSingle: vi.fn(() => finalize()),
      then: (resolve: any, reject: any) => finalize().then(resolve, reject),
    };
    return api;
  };

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_notifications') {
        const api: any = {
          update: vi.fn(() => api),
          eq: vi.fn(() => api),
          then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
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

/** A managed, approved, remote session — one that really does have a Zoom meeting. */
function managedSession(overrides: Record<string, any> = {}) {
  return {
    id: SESSION_ID,
    school_id: SCHOOL_ID,
    growth_community_id: '44444444-4444-4444-8444-444444444444',
    title: 'Sesión de acompañamiento',
    status: 'programada',
    modality: 'online',
    meeting_provider: 'zoom',
    is_zoom_managed: true,
    is_active: true,
    session_date: '2026-09-10',
    start_time: '09:00:00',
    end_time: '10:30:00',
    scheduled_duration_minutes: 90,
    recurrence_group_id: GROUP_ID,
    hour_type_key: null,
    contrato_id: null,
    ...overrides,
  };
}

function cancelRequest(body: Record<string, any> = {}) {
  return createMocks({
    method: 'POST',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
    body: { cancellation_reason: 'El colegio suspendió la jornada', ...body },
  });
}

function seriesCancelRequest() {
  return createMocks({
    method: 'POST',
    query: { groupId: GROUP_ID },
    headers: { 'content-type': 'application/json' },
    body: { cancellation_reason: 'Cambio de calendario', scope: 'all_future' },
  });
}

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

  state = { row: managedSession(), seriesRows: [] };

  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => createMockClient());
  mockExecuteCancellation.mockResolvedValue({
    success: true,
    clause_result: { clause: 'menos_24h', ledger_status: 'penalizada' },
    cancelled_notice_hours: 6,
  });
  mockEnqueue.mockResolvedValue('enqueued');
});

afterEach(() => {
  setEnv('FEATURE_ZOOM_MEETINGS', ORIGINAL_FLAG);
  setEnv('ZOOM_SCHOOL_ALLOWLIST', ORIGINAL_ALLOWLIST);
});

// ---------------------------------------------------------------------------
// POST /api/sessions/[id]/cancel — the legacy path
// ---------------------------------------------------------------------------

describe('POST /api/sessions/[id]/cancel — legacy path [A7] [A8] [A10]', () => {
  it('[A7] enqueues exactly one meeting_delete with the exact argument object', async () => {
    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_delete',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_delete:consultor_session:${SESSION_ID}`,
    });
    // The session's own state change committed.
    expect(state.row.status).toBe('cancelada');
  });

  it('[A8] returns its normal 200 and the same body when the queue THROWS', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.session.status).toBe('cancelada');
    expect(body.data.session.cancellation_reason).toBe('El colegio suspendió la jornada');
    expect(state.row.status).toBe('cancelada');
    consoleError.mockRestore();
  });

  it('[A8] a duplicate enqueue is indistinguishable from a fresh one', async () => {
    mockEnqueue.mockResolvedValue('duplicate');

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.session.status).toBe('cancelada');
  });

  it.each([
    ['the master flag is off', 'FEATURE_ZOOM_MEETINGS', 'false'],
    ['the master flag is unset', 'FEATURE_ZOOM_MEETINGS', undefined],
  ])('[A10] does not enqueue when %s', async (_label, name, value) => {
    setEnv(name, value);

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A10] does not enqueue when the school is outside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A10] DOES enqueue when the school is inside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', `12, ${SCHOOL_ID}`);

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue for an unmanaged session', async () => {
    state.row = managedSession({ is_zoom_managed: false });

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the cancel itself was refused', async () => {
    state.row = managedSession({ status: 'cancelada' });

    const { req, res } = cancelRequest();
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/sessions/[id]/cancel — the hour-tracking clause path
// ---------------------------------------------------------------------------

describe('POST /api/sessions/[id]/cancel — clause path [A7] [A8]', () => {
  beforeEach(() => {
    state.row = managedSession({ hour_type_key: 'acompanamiento', contrato_id: 'contract-1' });
  });

  it('[A7] enqueues one meeting_delete, and leaves the clause result untouched', async () => {
    const { req, res } = cancelRequest({ cancelled_by: 'school' });
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).toHaveBeenCalledWith({
      job_type: 'meeting_delete',
      payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
      dedupe_key: `meeting_delete:consultor_session:${SESSION_ID}`,
    });

    // PM ruling 5: the clause flow is BESIDE this, not inside it.
    const body = JSON.parse(res._getData());
    expect(body.data.clause_result).toEqual({
      clause: 'menos_24h',
      ledger_status: 'penalizada',
    });
    expect(body.data.cancelled_notice_hours).toBe(6);
    expect(mockExecuteCancellation).toHaveBeenCalledTimes(1);
  });

  it('[A8] returns its normal 200 and the same body when the queue THROWS', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = cancelRequest({ cancelled_by: 'school' });
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.clause_result.ledger_status).toBe('penalizada');
    consoleError.mockRestore();
  });

  it('does not enqueue when the clause flow itself failed', async () => {
    mockExecuteCancellation.mockResolvedValue({ success: false, error: 'ledger locked' });

    const { req, res } = cancelRequest({ cancelled_by: 'school' });
    await cancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/sessions/series/[groupId]/cancel
// ---------------------------------------------------------------------------

describe('POST /api/sessions/series/[groupId]/cancel — [A9] [A8] [A10]', () => {
  const SECOND_ID = '66666666-6666-4666-8666-666666666666';
  const THIRD_ID = '77777777-7777-4777-8777-777777777777';

  beforeEach(() => {
    state.seriesRows = [
      managedSession({ id: SESSION_ID }),
      // Unmanaged: nothing at Zoom, so nothing to remove.
      managedSession({ id: SECOND_ID, is_zoom_managed: false }),
      managedSession({ id: THIRD_ID }),
    ];
  });

  it('[A9] enqueues one meeting_delete per MANAGED session and zero for the rest', async () => {
    const { req, res } = seriesCancelRequest();
    await seriesCancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).data.cancelled_count).toBe(3);

    // Two jobs for three cancelled sessions — asserted on the exact arguments, so a
    // route that enqueued the right COUNT for the wrong sessions would still fail.
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue.mock.calls.map((call) => call[0])).toEqual([
      {
        job_type: 'meeting_delete',
        payload: { surface_type: 'consultor_session', surface_id: SESSION_ID },
        dedupe_key: `meeting_delete:consultor_session:${SESSION_ID}`,
      },
      {
        job_type: 'meeting_delete',
        payload: { surface_type: 'consultor_session', surface_id: THIRD_ID },
        dedupe_key: `meeting_delete:consultor_session:${THIRD_ID}`,
      },
    ]);
  });

  it('[A9] enqueues nothing when no session in the batch is managed', async () => {
    state.seriesRows = state.seriesRows.map((row) => ({ ...row, is_zoom_managed: false }));

    const { req, res } = seriesCancelRequest();
    await seriesCancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A8] returns its normal 200 and the same body when the queue THROWS', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockEnqueue.mockRejectedValue(new Error('zoom_jobs enqueue failed: connection reset'));

    const { req, res } = seriesCancelRequest();
    await seriesCancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data.cancelled_count).toBe(3);
    // One throwing enqueue does not stop the next: every managed session still got a job.
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    // And the sessions really were cancelled.
    expect(state.seriesRows.every((row) => row.status === 'cancelada')).toBe(true);
    consoleError.mockRestore();
  });

  it('[A10] does not enqueue when the master flag is off', async () => {
    setEnv('FEATURE_ZOOM_MEETINGS', 'false');

    const { req, res } = seriesCancelRequest();
    await seriesCancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('[A10] does not enqueue when the school is outside the allowlist', async () => {
    setEnv('ZOOM_SCHOOL_ALLOWLIST', '12, 34');

    const { req, res } = seriesCancelRequest();
    await seriesCancelHandler(req as any, res as any);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when the batch matched nothing', async () => {
    state.seriesRows = [];

    const { req, res } = seriesCancelRequest();
    await seriesCancelHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
