// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdminOrEquipoDirectivo, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdminOrEquipoDirectivo: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdminOrEquipoDirectivo: mockCheckIsAdminOrEquipoDirectivo,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

import handler from '../../../pages/api/admin/user-roles';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const TARGET_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ED_SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 999;

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [] };
}

function buildClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = { table, index: idx, selects: [], eqs: [] };
      tracker.fromCalls.push(fromCall);

      const resolved = {
        data: result.data ?? null,
        error: result.error ?? null,
      };

      const proxyHandler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'select') {
            return vi.fn((vals?: unknown) => {
              fromCall.selects.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'maybeSingle' || prop === 'single' || prop === 'order') {
            return vi.fn(() => new Proxy({}, proxyHandler));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
  };
}

function setupAdmin() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'admin',
    schoolId: null,
    user: { id: ADMIN_ID } as any,
    error: null,
  });
}

function setupEquipoDirectivo(schoolId: number | null) {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: true,
    role: 'equipo_directivo',
    schoolId,
    user: { id: ED_ID } as any,
    error: null,
  });
}

function setupUnauthenticated() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: null,
    schoolId: null,
    user: null,
    error: new Error('No active session'),
  });
}

function setupUnauthorizedRole() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: null,
    schoolId: null,
    user: { id: '00000000-0000-4000-8000-000000000001' } as any,
    error: null,
  });
}

describe('admin/user-roles — GET (ED auth + scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: returns all roles for the target user (no profile lookup)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: [
                { role_type: 'admin', school_id: null },
                { role_type: 'docente', school_id: ED_SCHOOL_ID },
              ],
              error: null,
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.roles).toHaveLength(2);
    expect(body.highestRole).toBe('admin');

    // No profile lookup for admin path
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(0);
  });

  it('ED: returns only school-scoped roles in own school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [
            {
              data: [
                { role_type: 'docente', school_id: ED_SCHOOL_ID },
                { role_type: 'admin', school_id: null },
                { role_type: 'lider_comunidad', school_id: ED_SCHOOL_ID },
                { role_type: 'docente', school_id: OTHER_SCHOOL_ID },
              ],
              error: null,
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    // admin and cross-school docente filtered out
    expect(body.roles).toHaveLength(2);
    expect(body.roles.every((r: any) => r.school_id === ED_SCHOOL_ID)).toBe(true);
  });

  // F3 regression: the ED filter must be strict equality on school_id —
  // orphan rows (school-scoped role_type with school_id IS NULL) are NOT
  // real role grants and should not be surfaced through the single-user
  // roles view. The list-page filter at users.ts handles legacy-null
  // surfacing for backfill; this view is intentionally stricter.
  it('ED: orphan school-scoped role with school_id=null is filtered out', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [
            {
              data: [
                { role_type: 'docente', school_id: ED_SCHOOL_ID },
                { role_type: 'docente', school_id: null }, // orphan — must NOT appear
              ],
              error: null,
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.roles).toHaveLength(1);
    expect(body.roles[0]).toMatchObject({ role_type: 'docente', school_id: ED_SCHOOL_ID });
  });

  it('ED: 403 when target user is in another school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para ver roles de este usuario',
    });
    // user_roles should not be queried
    const userRoleCalls = tracker.fromCalls.filter((c) => c.table === 'user_roles');
    expect(userRoleCalls).toHaveLength(0);
  });

  it('ED: 404 when target profile is not found', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Usuario no encontrado' });
  });

  it('ED with schoolId=null: 403 (service client never built)', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'School context missing for equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('unauthenticated: 401', async () => {
    setupUnauthenticated();

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong role: 401 or 403', async () => {
    setupUnauthorizedRole();

    const { req, res } = createMocks({
      method: 'GET',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect([401, 403]).toContain(res._getStatusCode());
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 when userId missing', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {},
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'userId is required' });
  });

  it('rejects non-GET methods', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      query: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
  });
});
