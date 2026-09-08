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

import handler from '../../../pages/api/school/completion-status/index';

// ── Helpers ────────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const COMPLETER_ID = 'u0000001-0000-0000-0000-000000000002';

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function directivo(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false, via: 'equipo_directivo' });
}

function admin() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: null, isAdmin: true, via: 'admin' });
}

/** An ASSIGNED consultor: admitted by hasDirectivoPermission, scoped to the assigned school. */
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

/**
 * Build a multi-table mock service client for completion-status.
 * The endpoint does 3 parallel queries then a conditional profiles lookup.
 */
function buildStatusClient(opts: {
  transversal?: { data: unknown; error?: unknown };
  planStatus?: { data: unknown; error?: unknown };
  lastUpdates?: { data: unknown; error?: unknown };
  profiles?: { data: unknown; error?: unknown };
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'school_transversal_context') {
        return buildChainableQuery(opts.transversal?.data ?? null, opts.transversal?.error ?? null);
      }
      if (table === 'school_plan_completion_status') {
        return buildChainableQuery(opts.planStatus?.data ?? [], opts.planStatus?.error ?? null);
      }
      if (table === 'school_change_history') {
        return buildChainableQuery(opts.lastUpdates?.data ?? [], opts.lastUpdates?.error ?? null);
      }
      if (table === 'profiles') {
        return buildChainableQuery(opts.profiles?.data ?? [], opts.profiles?.error ?? null);
      }
      return buildChainableQuery(null, null);
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────
describe('GET /api/school/completion-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('returns 403 for unauthorized roles', async () => {
    authed();
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: false, schoolId: null, isAdmin: false });
    mockCreateServiceRoleClient.mockReturnValue(buildStatusClient({}));

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '1' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns status object with all 3 features', async () => {
    authed();
    directivo(42);

    const mockClient = buildStatusClient({
      transversal: {
        data: { is_completed: true, completed_at: '2026-03-15T10:00:00Z', completed_by: COMPLETER_ID },
      },
      planStatus: {
        data: [
          { feature: 'migration_plan', is_completed: true, completed_at: '2026-03-14T10:00:00Z', completed_by: COMPLETER_ID },
          { feature: 'context_responses', is_completed: false, completed_at: null, completed_by: null },
        ],
      },
      lastUpdates: {
        data: [
          { feature: 'transversal_context', user_name: 'Ana García', created_at: '2026-03-16T08:00:00Z' },
          { feature: 'migration_plan', user_name: 'Ana García', created_at: '2026-03-15T08:00:00Z' },
        ],
      },
      profiles: {
        data: [{ id: COMPLETER_ID, name: 'Ana García' }],
      },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);

    // All three features present
    expect(data.status).toHaveProperty('transversal_context');
    expect(data.status).toHaveProperty('migration_plan');
    expect(data.status).toHaveProperty('context_responses');

    // transversal_context is completed
    expect(data.status.transversal_context.is_completed).toBe(true);
    expect(data.status.transversal_context.completed_at).toBe('2026-03-15T10:00:00Z');

    // migration_plan is completed
    expect(data.status.migration_plan.is_completed).toBe(true);

    // context_responses is not completed
    expect(data.status.context_responses.is_completed).toBe(false);
  });

  it('resolves completed_by to user names', async () => {
    authed();
    directivo(42);

    const mockClient = buildStatusClient({
      transversal: {
        data: { is_completed: true, completed_at: '2026-03-15T10:00:00Z', completed_by: COMPLETER_ID },
      },
      planStatus: { data: [] },
      lastUpdates: { data: [] },
      profiles: {
        data: [{ id: COMPLETER_ID, name: 'María López' }],
      },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.status.transversal_context.completed_by_name).toBe('María López');
  });

  it('includes last_updated info from change history', async () => {
    authed();
    directivo(42);

    const mockClient = buildStatusClient({
      transversal: { data: null },
      planStatus: { data: [] },
      lastUpdates: {
        data: [
          { feature: 'migration_plan', user_name: 'Carlos Díaz', created_at: '2026-03-16T12:00:00Z' },
        ],
      },
      profiles: { data: [] },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // migration_plan merges last_updated from change history even without completion data
    expect(data.status.migration_plan.last_updated_at).toBe('2026-03-16T12:00:00Z');
    expect(data.status.migration_plan.last_updated_by_name).toBe('Carlos Díaz');
  });

  it('returns empty/false status for schools with no data', async () => {
    authed();
    directivo(42);

    const mockClient = buildStatusClient({
      transversal: { data: null },
      planStatus: { data: [] },
      lastUpdates: { data: [] },
      profiles: { data: [] },
    });
    mockCreateServiceRoleClient.mockReturnValue(mockClient);

    const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());

    for (const feature of ['transversal_context', 'migration_plan', 'context_responses']) {
      expect(data.status[feature].is_completed).toBe(false);
      expect(data.status[feature].completed_at).toBeNull();
      expect(data.status[feature].completed_by_name).toBeNull();
      expect(data.status[feature].last_updated_at).toBeNull();
      expect(data.status[feature].last_updated_by_name).toBeNull();
    }
  });

  it('requires school_id for admin users', async () => {
    authed();
    admin();
    mockCreateServiceRoleClient.mockReturnValue(buildStatusClient({}));

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('school_id');
  });

  // ── R5 / Codex round 1 finding 2: consultor scope = migration_plan only ──
  describe('consultor scope (pending product decision)', () => {
    function consultorClient() {
      const tables: string[] = [];
      const chains: Array<{ table: string; chain: any }> = [];
      const client = {
        from: vi.fn((table: string) => {
          tables.push(table);
          let chain: any;
          if (table === 'school_plan_completion_status') {
            chain = recordingQuery([{ feature: 'migration_plan', is_completed: true, completed_at: '2026-02-01T00:00:00Z', completed_by: COMPLETER_ID }]);
          } else if (table === 'school_change_history') {
            chain = recordingQuery([{ feature: 'migration_plan', user_name: 'Alguien', created_at: '2026-02-02T00:00:00Z' }]);
          } else if (table === 'profiles') {
            chain = recordingQuery({ id: COMPLETER_ID, name: 'Completador' });
          } else if (table === 'school_transversal_context') {
            // The transversal context must NEVER be read on this scope: a read blows up loudly.
            throw new Error('school_transversal_context read on consultor scope');
          } else {
            chain = recordingQuery(null);
          }
          chains.push({ table, chain });
          return chain;
        }),
      };
      return { client, tables, chains };
    }

    it('returns the migration_plan status ONLY and never reads the transversal context', async () => {
      authed();
      consultor(42);
      const { client, tables, chains } = consultorClient();
      mockCreateServiceRoleClient.mockReturnValue(client);

      const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.scope).toBe('migration_plan');
      expect(Object.keys(data.status)).toEqual(['migration_plan']);
      expect(data.status.migration_plan).toEqual({
        is_completed: true,
        completed_at: '2026-02-01T00:00:00Z',
        completed_by_name: 'Completador',
        last_updated_at: '2026-02-02T00:00:00Z',
        last_updated_by_name: 'Alguien',
      });
      expect(tables).not.toContain('school_transversal_context');
      // Every completion / history read is pinned to the migration_plan feature.
      const scoped = chains.filter(c => c.table === 'school_plan_completion_status' || c.table === 'school_change_history');
      expect(scoped).toHaveLength(2);
      for (const { chain } of scoped) {
        expect(callsOf(chain)).toEqual(expect.arrayContaining([{ method: 'eq', args: ['feature', 'migration_plan'] }]));
      }
    });

    it('treats a permission without a full role (no via) as consultor scope — fail closed', async () => {
      authed();
      mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: 42, isAdmin: false });
      const { client, tables } = consultorClient();
      mockCreateServiceRoleClient.mockReturnValue(client);

      const { req, res } = createMocks({ method: 'GET', query: {} });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(Object.keys(JSON.parse(res._getData()).status)).toEqual(['migration_plan']);
      expect(tables).not.toContain('school_transversal_context');
    });

    it('answers 500 (no partial status) when the migration-plan read fails', async () => {
      authed();
      consultor(42);
      mockCreateServiceRoleClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'school_plan_completion_status') return buildChainableQuery(null, { code: '42501', message: 'denied' });
          return buildChainableQuery([]);
        }),
      });

      const { req, res } = createMocks({ method: 'GET', query: { school_id: '42' } });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });
});
