// @vitest-environment node
/**
 * Z2-3a [A6] / r21 — both reschedule paths move the session AND the ledger, in ONE
 * transaction, through ONE RPC.
 *
 * Until Z2-3a NEITHER path touched `contract_hours_ledger` at all: moving a session
 * from 09:00–10:30 to 09:00–11:30 still billed 1.5 h. Z2-3a closed that with a second
 * call, and Sol found the hole that left — a failure between the session write and the
 * ledger write left the session moved and the ledger stale, with nothing to roll back.
 * r21 replaces both call pairs with `apply_session_reschedule`.
 *
 * What this file owns is the WIRING: that a schedule-moving request goes through that
 * one RPC on both routes and carries the whole column map to it, that a request with no
 * ledger consequence does not, and that a refusal is reported in es-CL without the
 * session having moved.
 *
 * What it CANNOT own is the transaction. Atomicity under an injected failure, the
 * optimistic guard writing nothing, the `programada` ledger gate and the hours
 * arithmetic are all asserted in the database, in
 * supabase/tests/013-session-reschedule-atomic.sql and 012-reschedule-hours-rpc.sql.
 * A mock cannot prove a rollback.
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
const RPC_NAME = 'apply_session_reschedule';

type RpcCall = { fn: string; args: Record<string, any> };

type MockState = {
  row: Record<string, any>;
  editRequest: Record<string, any>;
  /** Writes that reached `.update()` — i.e. did NOT go through the RPC. */
  updates: Array<Record<string, any>>;
  editRequestUpdates: Array<Record<string, any>>;
  rpcCalls: RpcCall[];
  /** When set, the reschedule RPC reports this error instead of succeeding. */
  rpcError: { message: string; hint?: string } | null;
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
    rpc: vi.fn(async (fn: string, args: Record<string, any> = {}) => {
      state.rpcCalls.push({ fn, args });

      if (fn !== RPC_NAME) return { data: null, error: null };

      // A failure inside the RPC rolls BOTH writes back, so the double leaves its row
      // exactly as it was — the point of the whole round.
      if (state.rpcError) return { data: null, error: state.rpcError };

      if (args.p_if_updated_at && args.p_if_updated_at !== state.row.updated_at) {
        return { data: { conflict: true, current: { ...state.row } }, error: null };
      }

      state.row = { ...state.row, ...(args.p_updates || {}) };

      return {
        data: {
          conflict: false,
          session: { ...state.row },
          hours: { applied: true, revision_written: true },
        },
        error: null,
      };
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

const rescheduleCalls = (state: MockState) => state.rpcCalls.filter((c) => c.fn === RPC_NAME);

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

describe('PUT /api/sessions/[id] — reschedule is one transaction [A6]', () => {
  it('routes an end_time move through the RPC, carrying the whole column map', async () => {
    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
    expect(rescheduleCalls(state)[0].args).toEqual({
      p_session_id: SESSION_ID,
      p_actor_id: ADMIN_ID,
      p_updates: { end_time: '11:00:00' },
      p_if_updated_at: null,
    });
    // The session write went through the RPC and NOWHERE else: two write paths for one
    // reschedule is the defect this round closed.
    expect(state.updates).toHaveLength(0);
  });

  it('routes a start_time move through the RPC', async () => {
    const { req, res } = put({ start_time: '08:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
    expect(state.updates).toHaveLength(0);
  });

  it('routes a session_date-only move through the RPC, so the ledger date follows [A7]', async () => {
    const { req, res } = put({ session_date: '2026-09-24' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
    expect(rescheduleCalls(state)[0].args.p_updates).toEqual({ session_date: '2026-09-24' });
  });

  it('carries the other changed fields into the SAME transaction as the times', async () => {
    // A PUT that renames AND moves must not split into two writes: the title would land
    // even when the reschedule is rolled back.
    const { req, res } = put({ title: 'Nuevo título', end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)[0].args.p_updates).toEqual({
      title: 'Nuevo título',
      end_time: '11:00:00',
    });
    expect(state.updates).toHaveLength(0);
  });

  it('does NOT use the RPC on a title-only PUT — it has no ledger consequence', async () => {
    const { req, res } = put({ title: 'Nuevo título' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.updates[0]).toEqual({ title: 'Nuevo título' });
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('does NOT use the RPC on an unrelated multi-field PUT', async () => {
    const { req, res } = put({ description: 'Notas', objectives: 'Objetivos', location: 'Sala 2' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it.each([
    ['under way', 'en_progreso'],
    ['not yet approved', 'borrador'],
  ])(
    'still routes a time edit through the RPC when the session is %s — the ledger gate is the RPC\'s',
    async (_label, status) => {
      // The route used to decide whether the ledger should follow. It no longer does:
      // the caller is not the security boundary, so the `programada` gate lives inside
      // `apply_session_reschedule` and is asserted in pgTAP [B7]. The session edit is
      // still allowed, and still returns 200.
      state.row = sessionRow({ status });

      const { req, res } = put({ end_time: '11:00:00' });
      await putHandler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      expect(rescheduleCalls(state)).toHaveLength(1);
      expect(state.updates).toHaveLength(0);
    }
  );

  it('fails loudly with 500 in es-CL when the recomputation errors — and says the session did NOT move', async () => {
    state.rpcError = {
      message: 'las horas planificadas están congeladas',
      hint: 'reschedule_hours',
    };

    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe(
      'No se pudieron recalcular las horas del contrato, así que la sesión no se modificó. Revise el libro de horas antes de reintentar.'
    );
    // The copy is not a claim the code cannot back: the row really is untouched.
    expect(state.row.end_time).toBe('10:30:00');
  });

  it('reports a plain update failure as an update failure, not as an hours failure', async () => {
    // No `reschedule_hours` hint — a constraint violation on the session write itself.
    state.rpcError = { message: 'invalid input value for enum' };

    const { req, res } = put({ end_time: '11:00:00' });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe('Error al actualizar sesión');
  });

  it('rejects a stale if_updated_at with 409 and the row the RPC returned', async () => {
    const { req, res } = put({
      end_time: '11:00:00',
      if_updated_at: '2020-01-01T00:00:00.000Z',
    });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('SESSION_CONFLICT');
    expect(body.current.end_time).toBe('10:30:00');
    expect(state.row.end_time).toBe('10:30:00');
  });

  it('passes a matching if_updated_at into the RPC rather than guarding outside it', async () => {
    const { req, res } = put({
      end_time: '11:00:00',
      if_updated_at: '2026-08-05T10:00:00.000Z',
    });
    await putHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)[0].args.p_if_updated_at).toBe('2026-08-05T10:00:00.000Z');
  });
});

describe('PUT /api/sessions/edit-requests/[eid] — approve is one transaction [A6]', () => {
  it('routes an approved duration change through the SAME RPC', async () => {
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
      p_updates: { end_time: '11:00:00' },
      // r29 (Sol m4): was `null` — this route left the RPC's optimistic guard unused and
      // relied on a JS old-value comparison made outside the transaction. It now sends
      // the row it read, and the guard runs where the writes run.
      p_if_updated_at: '2026-08-05T10:00:00.000Z',
    });
    expect(state.updates).toHaveLength(0);
  });

  it('routes an approved session_date move through the RPC [A7]', async () => {
    state.editRequest = editRequestRow({
      session_date: { old: '2026-09-10', new: '2026-09-24' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
  });

  it('does NOT use the RPC when the approved change is title-only', async () => {
    state.editRequest = editRequestRow({
      title: { old: 'Sesión de acompañamiento', new: 'Sesión reprogramada' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    // Not asserted through `state.updates`: this route's plain-update branch awaits the
    // builder without `.select()`, which this double does not resolve (as it never did).
    // `session-reschedule-zoom-sync.test.ts` owns the thenable variant.
    expect(rescheduleCalls(state)).toHaveLength(0);
  });

  it('still routes through the RPC when the session is already under way', async () => {
    // As on the admin PUT: the `programada` ledger gate is the RPC's, not the route's.
    state.row = sessionRow({ status: 'completada' });
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)).toHaveLength(1);
  });

  it('fails with 500, leaves the request unapproved AND leaves the session unmoved', async () => {
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });
    state.rpcError = { message: 'no se pudo recalcular', hint: 'reschedule_hours' };

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe(
      'No se pudieron recalcular las horas del contrato, así que los cambios no se aplicaron a la sesión. Revise el libro de horas antes de reintentar.'
    );
    // The request stays retryable rather than closing over a stale ledger…
    expect(state.editRequestUpdates).toHaveLength(0);
    expect(state.editRequest.status).toBe('pending');
    // …and, new in r21, the session did not move either.
    expect(state.row.end_time).toBe('10:30:00');
  });

  // -------------------------------------------------------------------------
  // r29 · Sol m4 — the approval path uses the RPC's own guard [R7]
  //
  // This route passed NO `if_updated_at`, so its only protection against a concurrent
  // edit was the JS old-value comparison it makes against a row read several statements
  // earlier — with the whole facilitator revalidation in between — while the RPC's
  // purpose-built, pgTAP-proven guard sat unused. The guard is enforced INSIDE the same
  // transaction as the session write and the ledger write, which is where it belongs.
  // -------------------------------------------------------------------------

  it("[R7] passes the session's updated_at into the RPC", async () => {
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(rescheduleCalls(state)[0].args.p_if_updated_at).toBe('2026-08-05T10:00:00.000Z');
  });

  it('[R7] rejects a stale guard with 409 and writes NOTHING', async () => {
    state.editRequest = editRequestRow({
      end_time: { old: '10:30:00', new: '11:00:00' },
    });

    // The race, driven rather than hoped for: a concurrent writer commits in the gap
    // between this route reading the session and the RPC running. The JS comparison above
    // it saw the OLD row and waved the approval through; only the in-transaction guard
    // can still catch it.
    const { createServiceRoleClient } = await import('../../../lib/api-auth');
    (createServiceRoleClient as any).mockImplementation(() => {
      const client = createMockClient(state);
      const from = client.from;
      return {
        ...client,
        from: (table: string) => {
          const builder: any = from(table);
          if (table !== 'consultor_sessions') return builder;
          const read = builder.single;
          builder.single = vi.fn(async () => {
            const result = await read();
            state.row = { ...state.row, updated_at: '2026-08-06T09:00:00.000Z' };
            return result;
          });
          return builder;
        },
      };
    });

    const { req, res } = approveEditRequest();
    await editRequestHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('SESSION_CONFLICT');
    expect(body.current.end_time).toBe('10:30:00');

    // Nothing written: not the session, not the ledger (the RPC is one transaction), and
    // not the edit request — which stays `pending`, so the reviewer can retry it.
    expect(state.row.end_time).toBe('10:30:00');
    expect(state.updates).toHaveLength(0);
    expect(state.editRequestUpdates).toHaveLength(0);
    expect(state.editRequest.status).toBe('pending');
  });
});

describe('one implementation, two callsites', () => {
  it('both routes reach the ledger through the same RPC name', async () => {
    const first = put({ end_time: '11:00:00' });
    await putHandler(first.req as any, first.res as any);

    state.row = sessionRow();
    state.editRequest = editRequestRow({ end_time: { old: '10:30:00', new: '11:00:00' } });

    const second = approveEditRequest();
    await editRequestHandler(second.req as any, second.res as any);

    const names = state.rpcCalls.map((c) => c.fn);
    expect(names).toEqual([RPC_NAME, RPC_NAME]);
  });
});
