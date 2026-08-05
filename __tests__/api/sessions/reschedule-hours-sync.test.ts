// @vitest-environment node
/**
 * Z2-3a [A6] — both reschedule paths keep the hour reservation in step (plan §11).
 *
 * Until this chunk NEITHER path touched `contract_hours_ledger`: moving a session
 * from 09:00–10:30 to 09:00–11:30 still billed 1.5 h, and one ledger value drives
 * both what the school pays and what the consultant is paid. These tests assert BOTH
 * directions on BOTH routes — the RPC is called when the planned duration (or the
 * session date) actually moves, and is NOT called otherwise.
 *
 * The RPC's own behaviour — atomicity, the pre-execution guard, the hours > 0
 * refusal — is asserted in the database, in supabase/tests/012-reschedule-hours-rpc.sql.
 * A mock cannot prove a transaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import putHandler from '../../../pages/api/sessions/[id]/index';
import editRequestHandler from '../../../pages/api/sessions/edit-requests/[eid]';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
  checkIsAdmin: vi.fn(),
  createServiceRoleClient: vi.fn(),
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

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
  getHighestRole: vi.fn(),
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: vi.fn(async () => undefined) },
}));

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const EDIT_REQUEST_ID = '99999999-8888-4777-8666-555544443333';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

type RpcCall = { fn: string; args: Record<string, any> };

type MockState = {
  row: Record<string, any>;
  editRequest: Record<string, any>;
  updates: Array<Record<string, any>>;
  editRequestUpdates: Array<Record<string, any>>;
  rpcCalls: RpcCall[];
  /** When set, the reschedule RPC reports this error instead of succeeding. */
  rpcError: string | null;
};

function createMockClient(state: MockState) {
  const sessionsBuilder = () => {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, any> | null = null;

    const finalize = () => {
      if (op === 'select') return Promise.resolve({ data: { ...state.row }, error: null });
      state.updates.push(payload || {});
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
      eq: vi.fn(() => api),
      single: vi.fn(() => finalize()),
      maybeSingle: vi.fn(() => finalize()),
      then: undefined,
    };
    return api;
  };

  const editRequestsBuilder = () => {
    let op: 'select' | 'update' = 'select';
    let payload: Record<string, any> | null = null;

    const finalize = () => {
      if (op === 'select') return Promise.resolve({ data: { ...state.editRequest }, error: null });
      state.editRequestUpdates.push(payload || {});
      state.editRequest = { ...state.editRequest, ...(payload || {}) };
      return Promise.resolve({ data: { ...state.editRequest }, error: null });
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((p: Record<string, any>) => {
        op = 'update';
        payload = p;
        return api;
      }),
      eq: vi.fn(() => api),
      single: vi.fn(() => finalize()),
      maybeSingle: vi.fn(() => finalize()),
    };
    return api;
  };

  return {
    rpc: vi.fn(async (fn: string, args: Record<string, any>) => {
      state.rpcCalls.push({ fn, args });
      if (fn === 'reschedule_session_hours' && state.rpcError) {
        return { data: null, error: { message: state.rpcError } };
      }
      return { data: { applied: true, revision_written: true }, error: null };
    }),
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_edit_requests') return editRequestsBuilder();
      if (table === 'session_facilitators') {
        const api: any = {
          select: vi.fn(() => api),
          eq: vi.fn(async () => ({ data: [], error: null })),
          single: vi.fn(async () => ({ data: { id: 'fac-1' }, error: null })),
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

function sessionRow(overrides: Record<string, any> = {}) {
  return {
    id: SESSION_ID,
    title: 'Sesión de acompañamiento',
    description: 'd',
    objectives: 'o',
    status: 'programada',
    modality: 'online',
    meeting_provider: null,
    meeting_link: null,
    is_zoom_managed: false,
    is_active: true,
    session_date: '2026-09-10',
    start_time: '09:00:00',
    end_time: '10:30:00',
    updated_at: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

function editRequestRow(changes: Record<string, { old: unknown; new: unknown }>) {
  return {
    id: EDIT_REQUEST_ID,
    session_id: SESSION_ID,
    status: 'pending',
    requested_by: ADMIN_ID,
    changes,
    consultor_sessions: { title: 'Sesión de acompañamiento' },
  };
}

function put(body: Record<string, any>) {
  return createMocks({
    method: 'PUT',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
    body,
  });
}

function approveEditRequest() {
  return createMocks({
    method: 'PUT',
    query: { eid: EDIT_REQUEST_ID },
    headers: { 'content-type': 'application/json' },
    body: { action: 'approve' },
  });
}

const rescheduleCalls = (state: MockState) =>
  state.rpcCalls.filter((c) => c.fn === 'reschedule_session_hours');

let state: MockState;

beforeEach(async () => {
  vi.clearAllMocks();
  state = {
    row: sessionRow(),
    editRequest: editRequestRow({}),
    updates: [],
    editRequestUpdates: [],
    rpcCalls: [],
    rpcError: null,
  };

  const { getApiUser, checkIsAdmin, createServiceRoleClient } = await import(
    '../../../lib/api-auth'
  );
  (getApiUser as any).mockResolvedValue({ user: { id: ADMIN_ID }, error: null });
  (checkIsAdmin as any).mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  (createServiceRoleClient as any).mockImplementation(() => createMockClient(state));

  const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
  (getUserRoles as any).mockResolvedValue([
    { role_type: 'admin', is_active: true, school_id: null, community_id: null },
  ]);
  (getHighestRole as any).mockReturnValue('admin');
});

describe('PUT /api/sessions/[id] — reschedule keeps the ledger in step [A6]', () => {
  it('calls the RPC when end_time moves the planned duration', async () => {
    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
    expect(rescheduleCalls(state)[0].args).toEqual({
      p_session_id: SESSION_ID,
      p_actor_id: ADMIN_ID,
    });
  });

  it('calls the RPC when start_time moves the planned duration', async () => {
    const { req, res } = put({ start_time: '08:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
  });

  it('calls the RPC on a session_date-only move, so the ledger date follows [A7]', async () => {
    const { req, res } = put({ session_date: '2026-09-24' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
  });

  it('does NOT call the RPC on a title-only PUT', async () => {
    const { req, res } = put({ title: 'Nuevo título' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ title: 'Nuevo título' });
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('does NOT call the RPC on an unrelated multi-field PUT', async () => {
    const { req, res } = put({ description: 'Notas', objectives: 'Objetivos', location: 'Sala 2' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('does NOT call the RPC once the session is under way — planned values are frozen', async () => {
    state.row = sessionRow({ status: 'en_progreso' });

    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('does NOT call the RPC before approval — no reservation exists yet', async () => {
    state.row = sessionRow({ status: 'borrador' });

    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('fails loudly with 500 in es-CL when the recomputation errors — never silently stale', async () => {
    state.rpcError = 'las horas planificadas están congeladas';

    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe(
      'La sesión se actualizó, pero no se pudieron recalcular las horas del contrato. Revise el libro de horas antes de continuar.'
    );
  });
});

describe('PUT /api/sessions/edit-requests/[eid] — approve keeps the ledger in step [A6]', () => {
  it('calls the RPC when the approved change moves the planned duration', async () => {
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
    expect(rescheduleCalls(state)[0].args).toEqual({
      p_session_id: SESSION_ID,
      p_actor_id: ADMIN_ID,
    });
  });

  it('calls the RPC when the approved change is a session_date move [A7]', async () => {
    state.editRequest = editRequestRow({
      session_date: { old: '2026-09-10', new: '2026-09-24' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
  });

  it('does NOT call the RPC when the approved change is title-only', async () => {
    state.editRequest = editRequestRow({
      title: { old: 'Sesión de acompañamiento', new: 'Sesión reprogramada' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('does NOT call the RPC when the session is already under way', async () => {
    state.row = sessionRow({ status: 'completada' });
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('fails with 500 and leaves the request unapproved when the recomputation errors', async () => {
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });
    state.rpcError = 'no se pudo recalcular';

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe(
      'Los cambios se aplicaron a la sesión, pero no se pudieron recalcular las horas del contrato. Revise el libro de horas antes de continuar.'
    );
    // The request stays retryable rather than closing over a stale ledger.
    expect(state.editRequestUpdates).toHaveLength(0);
    expect(state.editRequest.status).toBe('pending');
  });
});
