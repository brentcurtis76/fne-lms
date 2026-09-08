// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { buildChainableQuery } from '../assessment-builder/_helpers';

// ── Hoisted mocks ──────────────────────────────────────────────
const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockSendAuthError,
  mockHandleMethodNotAllowed,
  mockHasDirectivoPermission,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: mockSendAuthError,
  handleMethodNotAllowed: mockHandleMethodNotAllowed,
}));

vi.mock('../../../lib/permissions/directivo', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/permissions/directivo')>('../../../lib/permissions/directivo');
  return { ...actual, hasDirectivoPermission: mockHasDirectivoPermission };
});

import handler from '../../../pages/api/school/change-history/index';

// ── Helpers ────────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function denied() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false, via: null });
}

function directivo(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false, via: 'equipo_directivo' });
}

function admin() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: null, isAdmin: true, via: 'admin' });
}

/** An ASSIGNED consultor: hasDirectivoPermission admits them, scoped to the assigned school. */
function consultor(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false, via: 'consultor' });
}


/** A chainable query that RECORDS every call, so a test can prove the predicates the handler sent. */
function recordingQuery(data: unknown, error: unknown = null, count: number | null = null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (value: unknown) => void) => resolve({ data, error, count });
      if (prop === '__calls') return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return new Proxy({}, handler);
      };
    },
  };
  return new Proxy({}, handler) as any;
}
const callsOf = (chain: any): Array<{ method: string; args: unknown[] }> => chain.__calls;

function buildServiceClient(historyData: unknown[] | null, historyError: unknown = null, count: number | null = null) {
  return {
    from: vi.fn(() => buildChainableQuery(historyData, historyError, count)),
  };
}

// ── Tests ──────────────────────────────────────────────────────
describe('GET /api/school/change-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default sendAuthError implementation
    mockSendAuthError.mockImplementation((res: any, msg: string) => {
      res.status(401).json({ error: msg });
    });
    mockHandleMethodNotAllowed.mockImplementation((res: any, methods: string[]) => {
      res.setHeader('Allow', methods.join(', '));
      res.status(405).json({ error: 'Method not allowed' });
    });
  });

  it('returns 401 without auth', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '1' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 405 for non-GET methods', async () => {
    authed();
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req, res);

    expect(mockHandleMethodNotAllowed).toHaveBeenCalledWith(expect.anything(), ['GET']);
  });

  it('returns 403 for users without directivo/admin/consultor role', async () => {
    authed();
    denied();
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient([]));

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '1' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('directivos');
  });

  it('returns 200 with history array and total count', async () => {
    authed();
    directivo(42);
    const historyRows = [
      { id: '1', feature: 'transversal_context', action: 'update', created_at: '2026-03-16T10:00:00Z' },
      { id: '2', feature: 'transversal_context', action: 'initial_save', created_at: '2026-03-15T10:00:00Z' },
    ];
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient(historyRows, null, 2));

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.history).toHaveLength(2);
    expect(data.total).toBe(2);
  });

  it('filters by feature param correctly', async () => {
    authed();
    directivo(42);
    const mockClient = buildServiceClient([{ id: '1', feature: 'migration_plan' }], null, 1);
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '42', feature: 'migration_plan' },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    // Verify the from() was called (Supabase chaining verified through successful response)
    expect(mockClient.from).toHaveBeenCalledWith('school_change_history');
  });

  it('validates feature param — rejects invalid values', async () => {
    authed();
    directivo(42);
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient([]));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '42', feature: 'invalid_feature' },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('feature');
  });

  it('paginates with limit/offset', async () => {
    authed();
    directivo(42);
    mockCreateServiceRoleClient.mockReturnValue(
      buildServiceClient([{ id: '3' }], null, 15)
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '42', limit: '5', offset: '10' },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.total).toBe(15);
  });

  it('validates school_id is a number', async () => {
    authed();
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient([]));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: 'abc' },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('school_id');
  });

  it('requires school_id for admin users', async () => {
    authed();
    admin();
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient([]));

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('school_id');
  });

  it('directivo can only access own school', async () => {
    authed();
    // hasDirectivoPermission returns false when directivo requests another school
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false });
    mockCreateServiceRoleClient.mockReturnValue(buildServiceClient([]));

    const { req, res } = createMocks({
      method: 'GET',
      query: { school_id: '999' },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 500 on database error', async () => {
    authed();
    directivo(42);
    mockCreateServiceRoleClient.mockReturnValue(
      buildServiceClient(null, { message: 'DB error' })
    );

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('historial');
  });

  // ── R5 / Codex round 1 finding 2: consultor scope = migration_plan only ──
  describe('consultor scope (pending product decision)', () => {
    const HISTORY_ROW = { id: 'h-1', school_id: 42, feature: 'migration_plan', action: 'update', user_id: USER_ID, user_name: 'x', created_at: '2026-01-01T00:00:00Z' };

    it.each([
      ['no feature', {}],
      ['feature=transversal_context', { feature: 'transversal_context' }],
      ['feature=context_responses', { feature: 'context_responses' }],
      ['an unknown feature', { feature: 'migration_plan_x' }],
    ])('refuses an assigned consultor with 403 and reads nothing when asked for %s', async (_label, extra) => {
      authed();
      consultor(42);
      const client = buildServiceClient([HISTORY_ROW], null, 1);
      mockCreateServiceRoleClient.mockReturnValue(client);

      const { req, res } = createMocks({ method: 'GET', query: { school_id: '42', ...extra } });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).code).toBe('consultor_access_pending_decision');
      expect(client.from).not.toHaveBeenCalled();
    });

    it('serves an assigned consultor ONLY the migration_plan history (feature pinned in the query)', async () => {
      authed();
      consultor(42);
      const chains: any[] = [];
      const client = { from: vi.fn((table: string) => { const q = recordingQuery(table === 'school_change_history' ? [HISTORY_ROW] : [], null, 1); chains.push(q); return q; }) };
      mockCreateServiceRoleClient.mockReturnValue(client);

      const { req, res } = createMocks({ method: 'GET', query: { school_id: '42', feature: 'migration_plan' } });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const calls = callsOf(chains[0]);
      expect(calls).toEqual(expect.arrayContaining([
        { method: 'eq', args: ['school_id', 42] },
        { method: 'eq', args: ['feature', 'migration_plan'] },
      ]));
    });

    it('treats a permission without a full role (no via) as consultor scope — fail closed', async () => {
      authed();
      mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: 42, isAdmin: false });
      const client = buildServiceClient([HISTORY_ROW], null, 1);
      mockCreateServiceRoleClient.mockReturnValue(client);

      const { req, res } = createMocks({ method: 'GET', query: { school_id: '42', feature: 'transversal_context' } });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(client.from).not.toHaveBeenCalled();
    });

    it('a directivo still reads every feature without pinning one (control)', async () => {
      authed();
      directivo(42);
      const chains: any[] = [];
      const client = { from: vi.fn((table: string) => { const q = recordingQuery(table === 'school_change_history' ? [HISTORY_ROW] : [], null, 1); chains.push(q); return q; }) };
      mockCreateServiceRoleClient.mockReturnValue(client);

      const { req, res } = createMocks({ method: 'GET', query: {} });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(callsOf(chains[0]).filter(c => c.method === 'eq' && c.args[0] === 'feature')).toHaveLength(0);
    });
  });
});
