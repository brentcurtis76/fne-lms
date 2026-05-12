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

import handler from '../../../pages/api/admin/remove-role';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const TARGET_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROLE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ED_SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 999;

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  updates: number;
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

      const fromCall: FromCall = { table, index: idx, updates: 0, selects: [], eqs: [] };
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
          if (prop === 'update') {
            return vi.fn(() => {
              fromCall.updates += 1;
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'maybeSingle' || prop === 'single') {
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

function countUpdates(tracker: Tracker) {
  return tracker.fromCalls
    .filter((c) => c.table === 'user_roles')
    .reduce((sum, c) => sum + c.updates, 0);
}

describe('admin/remove-role — POST (ED auth + scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: can remove any role (no scope check)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [{ data: { id: ROLE_ID, is_active: false }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countUpdates(tracker)).toBe(1);
    // No profile or role lookup on admin path
    expect(tracker.fromCalls.filter((c) => c.table === 'profiles')).toHaveLength(0);
  });

  it('ED: can remove a school-scoped role within their school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            // role lookup
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: ED_SCHOOL_ID,
                is_active: true,
              },
              error: null,
            },
            // defense-in-depth: other active roles on target — empty/safe
            { data: [{ id: ROLE_ID, role_type: 'docente', school_id: ED_SCHOOL_ID }], error: null },
            // update result
            { data: { id: ROLE_ID, is_active: false }, error: null },
          ],
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countUpdates(tracker)).toBe(1);
  });

  it('ED: 403 when role is not in ED_ASSIGNABLE_ROLES (e.g. consultor)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'consultor',
                school_id: null,
                is_active: true,
              },
              error: null,
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado para remover este rol' });
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 403 when role is admin', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'admin',
                school_id: null,
                is_active: true,
              },
              error: null,
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 403 when target user is in another school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: ED_SCHOOL_ID,
                is_active: true,
              },
              error: null,
            },
          ],
          profiles: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para remover roles de este usuario',
    });
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 403 when target holds a global role (defense-in-depth)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: ED_SCHOOL_ID,
                is_active: true,
              },
              error: null,
            },
            // target also holds an admin role — must block
            {
              data: [
                { id: ROLE_ID, role_type: 'docente', school_id: ED_SCHOOL_ID },
                { id: OTHER_ROLE_ID, role_type: 'admin', school_id: null },
              ],
              error: null,
            },
          ],
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 403 when target holds a school-scoped role in another school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: ED_SCHOOL_ID,
                is_active: true,
              },
              error: null,
            },
            {
              data: [
                { id: ROLE_ID, role_type: 'docente', school_id: ED_SCHOOL_ID },
                { id: OTHER_ROLE_ID, role_type: 'docente', school_id: OTHER_SCHOOL_ID },
              ],
              error: null,
            },
          ],
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 403 when roleRow.school_id is another school (privilege bypass regression)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: OTHER_SCHOOL_ID,
                is_active: true,
              },
              error: null,
            },
          ],
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado para remover este rol' });
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 403 when roleRow.school_id is null on a school-scoped role (orphan row)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: null,
                is_active: true,
              },
              error: null,
            },
          ],
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado para remover este rol' });
    expect(countUpdates(tracker)).toBe(0);
  });

  it('ED: 200 when roleRow.school_id matches edSchoolId (positive control)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [
            {
              data: {
                id: ROLE_ID,
                user_id: TARGET_USER_ID,
                role_type: 'docente',
                school_id: ED_SCHOOL_ID,
                is_active: true,
              },
              error: null,
            },
            { data: [{ id: ROLE_ID, role_type: 'docente', school_id: ED_SCHOOL_ID }], error: null },
            { data: { id: ROLE_ID, is_active: false }, error: null },
          ],
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countUpdates(tracker)).toBe(1);
  });

  it('ED: 404 when role not found', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          user_roles: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Rol no encontrado' });
  });

  it('ED with schoolId=null: 403 (service client never built)', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
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
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong role: 401 or 403', async () => {
    setupUnauthorizedRole();

    const { req, res } = createMocks({
      method: 'POST',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect([401, 403]).toContain(res._getStatusCode());
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 when roleId missing', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(buildClient({}, tracker));

    const { req, res } = createMocks({
      method: 'POST',
      body: {},
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'roleId is required' });
  });

  it('rejects non-POST methods', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      body: { roleId: ROLE_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
  });
});
