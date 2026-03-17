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

vi.mock('../../../lib/permissions/directivo', () => ({
  hasDirectivoPermission: mockHasDirectivoPermission,
}));

import handler from '../../../pages/api/school/completion-status/index';

// ── Helpers ────────────────────────────────────────────────────
const USER_ID = 'u0000001-0000-0000-0000-000000000001';
const COMPLETER_ID = 'u0000001-0000-0000-0000-000000000002';

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function directivo(schoolId: number) {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId, isAdmin: false });
}

function admin() {
  mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: null, isAdmin: true });
}

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
});
