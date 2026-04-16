// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import handler from '../../../pages/api/sessions/[id]/index';

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: vi.fn(),
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

const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const INITIAL_UPDATED_AT = '2026-04-16T12:00:00.000Z';

type MockState = {
  row: Record<string, any> | null;
  activityLog: Array<Record<string, any>>;
  bumpCounter: number;
  updateAttempts: number;
};

function createMockClient(state: MockState) {
  const sessionsBuilder = () => {
    let op: 'select' | 'update' = 'select';
    let updatePayload: Record<string, any> | null = null;
    const filters: Record<string, any> = {};

    const finalize = (mode: 'single' | 'maybeSingle') => {
      if (op === 'select') {
        if (state.row && state.row.id === filters.id) {
          return Promise.resolve({ data: { ...state.row }, error: null });
        }
        if (mode === 'maybeSingle') {
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'Not found' } });
      }

      state.updateAttempts += 1;
      const idMatch = state.row && state.row.id === filters.id;
      const guardPresent = Object.prototype.hasOwnProperty.call(filters, 'updated_at');
      const guardMatch = !guardPresent || state.row?.updated_at === filters.updated_at;

      if (idMatch && guardMatch && updatePayload) {
        state.bumpCounter += 1;
        state.row = {
          ...state.row,
          ...updatePayload,
          updated_at: `2026-04-16T12:00:${String(state.bumpCounter).padStart(2, '0')}.000Z`,
        };
        return Promise.resolve({ data: { ...state.row }, error: null });
      }

      if (mode === 'maybeSingle') {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'No rows' } });
    };

    const api: any = {
      select: vi.fn(() => api),
      update: vi.fn((payload: Record<string, any>) => {
        op = 'update';
        updatePayload = payload;
        return api;
      }),
      eq: vi.fn((col: string, val: any) => {
        filters[col] = val;
        return api;
      }),
      single: vi.fn(() => finalize('single')),
      maybeSingle: vi.fn(() => finalize('maybeSingle')),
    };
    return api;
  };

  const activityBuilder = () => ({
    insert: vi.fn((entry: Record<string, any>) => {
      state.activityLog.push(entry);
      return Promise.resolve({ data: [entry], error: null });
    }),
  });

  return {
    from: vi.fn((table: string) => {
      if (table === 'consultor_sessions') return sessionsBuilder();
      if (table === 'session_activity_log') return activityBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function buildPutReqRes(body: Record<string, any>) {
  return createMocks({
    method: 'PUT',
    query: { id: SESSION_ID },
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('/api/sessions/[id] PUT — concurrency', () => {
  let state: MockState;

  beforeEach(async () => {
    vi.clearAllMocks();

    state = {
      row: {
        id: SESSION_ID,
        title: 'Original',
        description: 'd',
        objectives: 'o',
        updated_at: INITIAL_UPDATED_AT,
        is_active: true,
      },
      activityLog: [],
      bumpCounter: 0,
      updateAttempts: 0,
    };

    const { getApiUser, createServiceRoleClient } = await import('../../../lib/api-auth');
    (getApiUser as any).mockResolvedValue({ user: { id: 'admin-1' }, error: null });
    (createServiceRoleClient as any).mockImplementation(() => createMockClient(state));

    const { getUserRoles, getHighestRole } = await import('../../../utils/roleUtils');
    (getUserRoles as any).mockResolvedValue([
      { role_type: 'admin', is_active: true, school_id: null, community_id: null },
    ]);
    (getHighestRole as any).mockReturnValue('admin');
  });

  it('5 parallel PUTs with same if_updated_at produce exactly one 200 and four 409s', async () => {
    const requests = Array.from({ length: 5 }, (_, i) =>
      buildPutReqRes({
        title: `Racer ${i}`,
        if_updated_at: INITIAL_UPDATED_AT,
      })
    );

    await Promise.all(
      requests.map(({ req, res }) => handler(req as any, res as any))
    );

    const statuses = requests.map(({ res }) => res._getStatusCode()).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);

    // Exactly one row write should have persisted
    expect(state.activityLog).toHaveLength(1);
    expect(state.bumpCounter).toBe(1);

    // All 409 responses carry SESSION_CONFLICT + current row for reconciliation
    const conflicts = requests
      .map(({ res }) => res)
      .filter((res) => res._getStatusCode() === 409);
    expect(conflicts).toHaveLength(4);
    for (const res of conflicts) {
      const body = JSON.parse(res._getData());
      expect(body.code).toBe('SESSION_CONFLICT');
      expect(body.current).toMatchObject({ id: SESSION_ID });
    }
  });

  it('three stale + one current guard: only the current guard wins', async () => {
    // First write: succeeds and advances updated_at
    const primer = buildPutReqRes({
      title: 'Primer',
      if_updated_at: INITIAL_UPDATED_AT,
    });
    await handler(primer.req as any, primer.res as any);
    expect(primer.res._getStatusCode()).toBe(200);

    const newUpdatedAt = state.row!.updated_at;
    expect(newUpdatedAt).not.toBe(INITIAL_UPDATED_AT);

    // Now fire three stale (if_updated_at=initial) + one current (if_updated_at=new)
    const stale = Array.from({ length: 3 }, (_, i) =>
      buildPutReqRes({ title: `Stale ${i}`, if_updated_at: INITIAL_UPDATED_AT })
    );
    const current = buildPutReqRes({ title: 'Current', if_updated_at: newUpdatedAt });

    await Promise.all(
      [...stale, current].map(({ req, res }) => handler(req as any, res as any))
    );

    for (const { res } of stale) {
      expect(res._getStatusCode()).toBe(409);
    }
    expect(current.res._getStatusCode()).toBe(200);

    // 2 successful writes total (primer + current) → 2 activity log entries
    expect(state.activityLog).toHaveLength(2);
    expect(state.row?.title).toBe('Current');
  });

  it('sequential writes each forwarding the latest updated_at all succeed', async () => {
    let guard = INITIAL_UPDATED_AT;

    for (let i = 0; i < 4; i += 1) {
      const { req, res } = buildPutReqRes({
        title: `Step ${i}`,
        if_updated_at: guard,
      });
      await handler(req as any, res as any);
      expect(res._getStatusCode()).toBe(200);
      guard = state.row!.updated_at;
    }

    expect(state.activityLog).toHaveLength(4);
    expect(state.row?.title).toBe('Step 3');
  });

  it('concurrent PUTs with NO guard all succeed (no optimistic lock applied)', async () => {
    const requests = Array.from({ length: 3 }, (_, i) =>
      buildPutReqRes({ title: `Unguarded ${i}` })
    );

    await Promise.all(
      requests.map(({ req, res }) => handler(req as any, res as any))
    );

    for (const { res } of requests) {
      expect(res._getStatusCode()).toBe(200);
    }
    expect(state.activityLog).toHaveLength(3);
  });
});
