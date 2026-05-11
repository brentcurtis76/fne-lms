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
    expect(inserted.school_id).toBe(OTHER_SCHOOL_ID);
  });

  it('admin: school-scoped role insert includes user_roles.school_id', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('lider_comunidad', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('lider_comunidad');
    expect(inserted.school_id).toBe(OTHER_SCHOOL_ID);
    expect(typeof inserted.school_id).toBe('number');
  });

  it('admin: GLOBAL role insert does NOT include user_roles.school_id', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('consultor', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('consultor');
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

  it("ED with role='admin' AND invalid schoolId='abc': 403 role error fires before schoolId validation", async () => {
    // F4: error-precedence. The ED role-assignability gate runs BEFORE schoolId
    // shape validation, so a misdirected request returns the actionable 403
    // ("role not assignable") instead of a 400 schoolId error.
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'admin',
        schoolId: 'abc',
      },
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

  it("ED with role='lider_comunidad': 400 — quick-create flow excludes FK-required roles", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('lider_comunidad'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: 'Este rol requiere la asignación completa, no la creación rápida',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("ED with role='lider_generacion': 400 — quick-create flow excludes FK-required roles", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('lider_generacion'),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: 'Este rol requiere la asignación completa, no la creación rápida',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("admin can still create role='lider_comunidad' via quick-create (gate is ED-only)", async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('lider_comunidad', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    expect((roleInsert.inserts[0] as any).role_type).toBe('lider_comunidad');
  });

  it('ED can create another equipo_directivo in their own school (intentional policy per plan)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('equipo_directivo', ED_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('equipo_directivo');
    expect(inserted.school_id).toBe(ED_SCHOOL_ID);
  });

  it('ED cannot create equipo_directivo in another school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('equipo_directivo', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'Cannot create user in another school',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
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

  it("admin with role='superman' (invalid): 400 with 'Rol inválido'", async () => {
    // F3: canonical role allow-list. Junk roles must never reach
    // user_metadata.role or user_roles.role_type, regardless of requester.
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('superman', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Rol inválido' });
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

  it('ED with schoolId=0 in body: 400 with schoolId inválido (positive-integer semantics)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente', 0),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('admin with schoolId=0: 400 with schoolId inválido (positive-integer semantics)', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente', 0),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('ED with schoolId=true (boolean): 400 with schoolId inválido', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: true,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('ED with schoolId=[] (array): 400 with schoolId inválido', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: [],
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('admin with schoolId=-1 (negative integer): 400 with schoolId inválido', async () => {
    // F3: school ids are non-negative in the schema. Negatives must 400.
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: -1,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("admin with schoolId='-1' (negative string): 400 with schoolId inválido", async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: '-1',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("admin with schoolId='01' (leading-zero string): 400 with schoolId inválido", async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: '01',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("admin with schoolId='99999999999999999999' (overflowing string): 400 with schoolId inválido", async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: '99999999999999999999',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('admin with schoolId=Number.MAX_SAFE_INTEGER + 1 (unsafe integer): 400 with schoolId inválido', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: Number.MAX_SAFE_INTEGER + 1,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("ED with schoolId='abc' (non-numeric): 400 with schoolId inválido", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: 'abc',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it("ED with schoolId='42' (string): coerces to numeric 42 and writes number to DB", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        role: 'docente',
        schoolId: '42',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileUpdate = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.updates.length > 0,
    )!;
    expect((profileUpdate.updates[0] as any).school_id).toBe(42);
    expect(typeof (profileUpdate.updates[0] as any).school_id).toBe('number');

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    expect((roleInsert.inserts[0] as any).school_id).toBe(42);
    expect(typeof (roleInsert.inserts[0] as any).school_id).toBe('number');
  });

  it('ED with no role field: defaults to docente and ED gate validates the resolved role', async () => {
    // This also covers the invariant that the ED gate validates resolvedRole
    // rather than the raw body field. With the prior implementation, an
    // undefined body role was skipped by the validator entirely; now the
    // resolved default ('docente') is itself checked against ED_ASSIGNABLE_ROLES.
    // 'docente' is assignable, so the request succeeds and writes role_type='docente'.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        email: 'new@example.com',
        password: 'pw-12345',
        firstName: 'New',
        lastName: 'User',
        // role intentionally omitted
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(tracker.createUserPayload?.user_metadata?.role).toBe('docente');

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('docente');
    expect(inserted.school_id).toBe(ED_SCHOOL_ID);

    const body = res._getJSONData();
    expect(body.user.role).toBe('docente');
  });

  describe('rollback', () => {
    it('profile update fails: explicitly deletes profiles + user_roles + auth user (no FK cascade exists)', async () => {
      setupAdmin();
      const tracker = makeTracker();
      mockCreateServiceRoleClient.mockReturnValueOnce(
        buildAdminClient(
          {
            profiles: [
              { data: null, error: new Error('profile update failed') },
              { data: null, error: null }, // rollback delete
            ],
            user_roles: [{ data: null, error: null }], // rollback delete
          },
          tracker,
        ),
      );

      const { req, res } = createMocks({
        method: 'POST',
        body: bodyFor('docente', OTHER_SCHOOL_ID),
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(500);

      const adminClient = mockCreateServiceRoleClient.mock.results[0].value;
      expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
      expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);

      // profiles.id has no FK cascade to auth.users — rollback must delete
      // the profile row explicitly (mirroring delete-user.ts).
      const profileDeletes = tracker.fromCalls.filter(
        (c) => c.table === 'profiles' && c.deletes > 0,
      );
      expect(profileDeletes).toHaveLength(1);
      expect(profileDeletes[0].eqs).toContainEqual({ col: 'id', val: NEW_USER_ID });

      // user_roles rollback delete is a defense-in-depth no-op when role-insert
      // never ran, but the handler issues it unconditionally.
      const roleDeletes = tracker.fromCalls.filter(
        (c) => c.table === 'user_roles' && c.deletes > 0,
      );
      expect(roleDeletes).toHaveLength(1);
      expect(roleDeletes[0].eqs).toContainEqual({ col: 'user_id', val: NEW_USER_ID });
    });

    it('user_roles insert fails: rolls back auth user + profile + user_roles and returns 500', async () => {
      setupAdmin();
      const tracker = makeTracker();
      mockCreateServiceRoleClient.mockReturnValueOnce(
        buildAdminClient(
          {
            profiles: [
              { data: null, error: null }, // forward-path update succeeds
              { data: null, error: null }, // rollback delete
            ],
            user_roles: [
              { data: null, error: new Error('role insert failed') }, // forward-path insert fails
              { data: null, error: null }, // rollback delete (no-op since insert errored)
            ],
          },
          tracker,
        ),
      );

      const { req, res } = createMocks({
        method: 'POST',
        body: bodyFor('docente', OTHER_SCHOOL_ID),
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toMatch(/role insert failed|Internal server error/i);

      const adminClient = mockCreateServiceRoleClient.mock.results[0].value;
      expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
      expect(adminClient.auth.admin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);

      const profileDeletes = tracker.fromCalls.filter(
        (c) => c.table === 'profiles' && c.deletes > 0,
      );
      expect(profileDeletes).toHaveLength(1);
      expect(profileDeletes[0].eqs).toContainEqual({ col: 'id', val: NEW_USER_ID });

      const roleDeletes = tracker.fromCalls.filter(
        (c) => c.table === 'user_roles' && c.deletes > 0,
      );
      expect(roleDeletes).toHaveLength(1);
      expect(roleDeletes[0].eqs).toContainEqual({ col: 'user_id', val: NEW_USER_ID });
    });
  });
});
