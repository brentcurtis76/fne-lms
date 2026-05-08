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

import handler from '../../../pages/api/admin/create-user';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const ED_SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 999;
const NEW_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  inserts: unknown[];
  updates: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
  deletes: number;
}

interface Tracker {
  fromCalls: FromCall[];
  createUserPayload: any;
}

function makeTracker(): Tracker {
  return { fromCalls: [], createUserPayload: null };
}

function buildAdminClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  createUserResult: { data: any; error: any } = {
    data: { user: { id: NEW_USER_ID, email: 'new@example.com' } },
    error: null,
  },
) {
  const indices: Record<string, number> = {};

  return {
    auth: {
      admin: {
        createUser: vi.fn(async (payload: any) => {
          tracker.createUserPayload = payload;
          return createUserResult;
        }),
        deleteUser: vi.fn(async () => ({ data: null, error: null })),
      },
    },
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = {
        table,
        index: idx,
        inserts: [],
        updates: [],
        eqs: [],
        deletes: 0,
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
          if (prop === 'insert') {
            return vi.fn((vals: unknown) => {
              fromCall.inserts.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'update') {
            return vi.fn((vals: unknown) => {
              fromCall.updates.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'delete') {
            return vi.fn(() => {
              fromCall.deletes += 1;
              return new Proxy({}, proxyHandler);
            });
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

function stockHappyPath(tracker: Tracker) {
  mockCreateServiceRoleClient.mockReturnValueOnce(
    buildAdminClient(
      {
        profiles: [{ data: null, error: null }],
        user_roles: [{ data: null, error: null }],
      },
      tracker,
    ),
  );
}

function bodyFor(role: string | undefined, schoolId?: number) {
  const body: Record<string, unknown> = {
    email: 'new@example.com',
    password: 'pw-12345',
    firstName: 'New',
    lastName: 'User',
  };
  if (role !== undefined) body.role = role;
  if (schoolId !== undefined) body.schoolId = schoolId;
  return body;
}

describe('admin/create-user — POST (ED auth + scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: can create a docente in any school', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileUpdate = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.updates.length > 0,
    )!;
    expect((profileUpdate.updates[0] as any).school_id).toBe(OTHER_SCHOOL_ID);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('docente');
    expect(inserted.school_id).toBeUndefined();
  });

  it('ED with no schoolId in body: handler auto-binds to edSchoolId', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileUpdate = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.updates.length > 0,
    )!;
    expect((profileUpdate.updates[0] as any).school_id).toBe(ED_SCHOOL_ID);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    expect((roleInsert.inserts[0] as any).school_id).toBe(ED_SCHOOL_ID);
  });

  it('ED with schoolId === edSchoolId: succeeds', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente', ED_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('ED with schoolId !== edSchoolId: 403', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'Cannot create user in another school',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("ED with role='admin': 403", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('admin'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'Role not assignable by equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("ED with role='consultor': 403", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('consultor'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'Role not assignable by equipo_directivo',
    });
  });

  it("ED with role='lider_comunidad': succeeds and inserts school_id", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('lider_comunidad'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('lider_comunidad');
    expect(inserted.school_id).toBe(ED_SCHOOL_ID);
  });

  it('ED with schoolId=null from auth helper: 403 defensive guard', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente'),
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
      body: bodyFor('docente'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});
