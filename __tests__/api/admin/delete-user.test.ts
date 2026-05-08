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

import handler from '../../../pages/api/admin/delete-user';

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
  deletes: number;
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
  authDeletes: string[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], authDeletes: [] };
}

function buildAdminClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
) {
  const indices: Record<string, number> = {};

  return {
    auth: {
      admin: {
        deleteUser: vi.fn(async (userId: string) => {
          tracker.authDeletes.push(userId);
          return { data: null, error: null };
        }),
      },
    },
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = {
        table,
        index: idx,
        deletes: 0,
        selects: [],
        eqs: [],
      };
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
          if (prop === 'delete') {
            return vi.fn(() => {
              fromCall.deletes += 1;
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'select') {
            return vi.fn((vals?: unknown) => {
              fromCall.selects.push(vals);
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

// Builds result tables for a successful cascade-delete (admin or ED success).
// `includeProfileLookup` adds the ED-only pre-check select result at profiles[0];
// the actual deletion result then sits at profiles[1].
function successTables(opts: { includeProfileLookup: boolean; lookupSchoolId?: number | null }) {
  const profiles: TableResult[] = [];
  if (opts.includeProfileLookup) {
    profiles.push({ data: { school_id: opts.lookupSchoolId ?? ED_SCHOOL_ID }, error: null });
  }
  profiles.push({ data: [{ id: TARGET_USER_ID }], error: null });

  return {
    platform_feedback: [{ data: null, error: null }],
    user_roles: [{ data: null, error: null }],
    profiles,
  };
}

// Counts cascade-delete operations for assertions: feedback delete, user_roles
// delete, profiles delete, and auth.admin.deleteUser. Profile *lookups* (ED
// pre-check) do not count.
function countCascade(tracker: Tracker) {
  const feedbackDeletes = tracker.fromCalls
    .filter((c) => c.table === 'platform_feedback')
    .reduce((sum, c) => sum + c.deletes, 0);
  const userRoleDeletes = tracker.fromCalls
    .filter((c) => c.table === 'user_roles')
    .reduce((sum, c) => sum + c.deletes, 0);
  const profileDeletes = tracker.fromCalls
    .filter((c) => c.table === 'profiles')
    .reduce((sum, c) => sum + c.deletes, 0);
  const authDeletes = tracker.authDeletes.length;
  return { feedbackDeletes, userRoleDeletes, profileDeletes, authDeletes };
}

describe('admin/delete-user — POST (ED auth + scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: can delete any user (no profile lookup performed)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({ includeProfileLookup: false }), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Admin path: profiles is only touched once — for the delete itself, no lookup.
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].selects).toHaveLength(1); // .select() after .delete()
    expect(profileCalls[0].deletes).toBe(1);

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 1,
      userRoleDeletes: 1,
      profileDeletes: 1,
      authDeletes: 1,
    });
  });

  it('ED: can delete a user in their own school (full cascade runs)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        successTables({ includeProfileLookup: true, lookupSchoolId: ED_SCHOOL_ID }),
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // Two profiles touches: lookup + delete
    expect(profileCalls).toHaveLength(2);
    // First: lookup with select + eq, no delete
    expect(profileCalls[0].selects).toHaveLength(1);
    expect(profileCalls[0].deletes).toBe(0);
    expect(profileCalls[0].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
    // Second: the actual cascade delete
    expect(profileCalls[1].deletes).toBe(1);

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 1,
      userRoleDeletes: 1,
      profileDeletes: 1,
      authDeletes: 1,
    });
  });

  it('ED: 403 when target user is in another school — no cascade runs', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para eliminar este usuario',
    });

    // Lookup happened, but no cascade-delete touched any table or auth.
    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 0,
      userRoleDeletes: 0,
      profileDeletes: 0,
      authDeletes: 0,
    });
  });

  it('ED: 404 when target profile is not found (no cascade runs)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Usuario no encontrado' });

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 0,
      userRoleDeletes: 0,
      profileDeletes: 0,
      authDeletes: 0,
    });
  });

  it('ED: 500 when profile lookup errors (no cascade runs)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [{ data: null, error: { message: 'lookup failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando usuario' });

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 0,
      userRoleDeletes: 0,
      profileDeletes: 0,
      authDeletes: 0,
    });
  });

  it('ED: can delete another equipo_directivo in the same school', async () => {
    // The handler does not inspect target role — only target school. An ED
    // peer in the same school is therefore deletable. This guards against any
    // future "no peers" rule slipping in unannounced.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        successTables({ includeProfileLookup: true, lookupSchoolId: ED_SCHOOL_ID }),
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 1,
      userRoleDeletes: 1,
      profileDeletes: 1,
      authDeletes: 1,
    });
  });

  it('ED with schoolId=null from auth helper: 403 defensive guard (service client never built)', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'School context missing for equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('unauthenticated: 401 (service client never built)', async () => {
    setupUnauthenticated();

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong role: rejected with 401 or 403 (no cascade runs)', async () => {
    setupUnauthorizedRole();

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID },
    });
    await handler(req as never, res as never);

    expect([401, 403]).toContain(res._getStatusCode());
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('admin: cannot delete own account (no cascade runs)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(buildAdminClient({}, tracker));

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: ADMIN_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: 'No puedes eliminar tu propia cuenta',
    });

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 0,
      userRoleDeletes: 0,
      profileDeletes: 0,
      authDeletes: 0,
    });
  });

  it('ED: cannot delete own account (no cascade runs)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(buildAdminClient({}, tracker));

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: ED_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: 'No puedes eliminar tu propia cuenta',
    });

    const counts = countCascade(tracker);
    expect(counts).toEqual({
      feedbackDeletes: 0,
      userRoleDeletes: 0,
      profileDeletes: 0,
      authDeletes: 0,
    });
  });
});
