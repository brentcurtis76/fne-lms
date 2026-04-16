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

const SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
const INITIAL_UPDATED_AT = '2026-04-16T10:00:00.000Z';

type MockState = {
  row: Record<string, any> | null;
  activityLog: Array<Record<string, any>>;
  bumpCounter: number;
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

      // op === 'update'
      const idMatch = state.row && state.row.id === filters.id;
      const guardPresent = Object.prototype.hasOwnProperty.call(filters, 'updated_at');
      const guardMatch = !guardPresent || state.row?.updated_at === filters.updated_at;

      if (idMatch && guardMatch && updatePayload) {
        state.bumpCounter += 1;
        state.row = {
          ...state.row,
          ...updatePayload,
          updated_at: `2026-04-16T10:00:${String(state.bumpCounter).padStart(2, '0')}.000Z`,
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

describe('/api/sessions/[id] PUT — optimistic locking', () => {
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

  it('returns 200 when if_updated_at matches and writes one activity log row', async () => {
    const { req, res } = buildPutReqRes({
      title: 'Updated title',
      if_updated_at: INITIAL_UPDATED_AT,
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.activityLog).toHaveLength(1);
    expect(state.row?.title).toBe('Updated title');
    expect(state.row?.updated_at).not.toBe(INITIAL_UPDATED_AT);
  });

  it('returns 409 when if_updated_at does not match', async () => {
    const { req, res } = buildPutReqRes({
      title: 'Stale update',
      if_updated_at: '2020-01-01T00:00:00.000Z',
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(409);
    const body = JSON.parse(res._getData());
    expect(body.code).toBe('SESSION_CONFLICT');
    expect(body.current).toMatchObject({ id: SESSION_ID });
    expect(state.activityLog).toHaveLength(0);
  });

  it('two concurrent PUTs with same if_updated_at yield exactly one 200 and one 409, no duplicate activity_log', async () => {
    const first = buildPutReqRes({
      title: 'Change A',
      if_updated_at: INITIAL_UPDATED_AT,
    });
    const second = buildPutReqRes({
      title: 'Change B',
      if_updated_at: INITIAL_UPDATED_AT,
    });

    await Promise.all([
      handler(first.req as any, first.res as any),
      handler(second.req as any, second.res as any),
    ]);

    const statuses = [first.res._getStatusCode(), second.res._getStatusCode()].sort();
    expect(statuses).toEqual([200, 409]);

    const conflictRes = first.res._getStatusCode() === 409 ? first.res : second.res;
    const conflictBody = JSON.parse(conflictRes._getData());
    expect(conflictBody.code).toBe('SESSION_CONFLICT');
    expect(conflictBody.current).toMatchObject({ id: SESSION_ID });

    expect(state.activityLog).toHaveLength(1);
  });

  it('omitting if_updated_at still succeeds (backwards compatible)', async () => {
    const { req, res } = buildPutReqRes({
      title: 'No guard',
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(state.activityLog).toHaveLength(1);
  });
});
