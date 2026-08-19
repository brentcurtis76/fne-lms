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

/**
 * S5: this endpoint had NO password rule of any kind. The fixture used to be
 * `pw-12345`, which the endpoint accepted happily; it now fails the shared
 * policy (no uppercase), so the happy-path fixture is a compliant value and the
 * old shape is exercised as an explicit rejection case below.
 */
const VALID_PASSWORD = 'Sintetica-2026';
const WEAK_PASSWORD = 'pw-12345';

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
        security_audit_events: [{ data: null, error: null }],
      },
      tracker,
    ),
  );
}

function bodyFor(role: string | undefined, schoolId?: number) {
  const body: Record<string, unknown> = {
    email: 'new@example.com',
    password: VALID_PASSWORD,
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

  // Phase 16.7 F1 — Inverted from the previous "school_id undefined for global
  // role" assertion, which codified a privilege-escalation bug. Per
  // lib/utils/session-policy.ts:31, `consultor.school_id IS NULL` is the
  // signal for GLOBAL consultor access. When admin creates a user with
  // `role=consultor, schoolId=42`, the old behavior dropped school_id and
  // silently granted global access. Mirrors assign-role.ts F2 (Phase 16):
  // the create-user path must preserve the caller's schoolId verbatim for
  // non-school-scoped roles, not normalize to null.
  it('admin: assigning consultor with schoolId=42 preserves user_roles.school_id=42 (matches assign-role.ts F2)', async () => {
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
    expect(inserted.school_id).toBe(OTHER_SCHOOL_ID);
    expect(typeof inserted.school_id).toBe('number');
  });

  // Phase 16.7 F1 follow-up: community_manager and supervisor_de_red also do
  // not use the null-vs-non-null school_id scope signal (verified in
  // assign-role.ts Phase 16 F2). Preserving the caller's schoolId verbatim
  // is safe and mirrors the assign-role.ts behavior.
  it('admin: assigning community_manager with schoolId=42 preserves user_roles.school_id=42', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('community_manager', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('community_manager');
    expect(inserted.school_id).toBe(OTHER_SCHOOL_ID);
  });

  it('admin: assigning supervisor_de_red with schoolId=42 preserves user_roles.school_id=42', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('supervisor_de_red', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const roleInsert = tracker.fromCalls.find(
      (c) => c.table === 'user_roles' && c.inserts.length > 0,
    )!;
    const inserted = roleInsert.inserts[0] as any;
    expect(inserted.role_type).toBe('supervisor_de_red');
    expect(inserted.school_id).toBe(OTHER_SCHOOL_ID);
  });

  // Phase 16.7 F1: structured visibility warn (mirrors assign-role.ts F3).
  // When admin creates a user with a non-school-scoped role + non-null
  // schoolId, the handler logs a scope-mismatch warn so operators can
  // investigate whether the scoping was intentional. Persistence is
  // unchanged: school_id preserved verbatim per F1 above.
  it('admin: creating consultor with schoolId emits scope-mismatch warn', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('consultor', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      '[create-user] admin scoped a non-school-scoped role',
      expect.objectContaining({
        target_user_id: NEW_USER_ID,
        role_type: 'consultor',
        school_id: OTHER_SCHOOL_ID,
        requester_user_id: ADMIN_ID,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    warnSpy.mockRestore();
  });

  it('admin: creating docente with schoolId does NOT emit scope-mismatch warn (school-scoped role)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stockHappyPath(tracker);

    const { req, res } = createMocks({
      method: 'POST',
      body: bodyFor('docente', OTHER_SCHOOL_ID),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(warnSpy).not.toHaveBeenCalledWith(
      '[create-user] admin scoped a non-school-scoped role',
      expect.anything(),
    );
    warnSpy.mockRestore();
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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
        password: VALID_PASSWORD,
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

/**
 * S14 — the handler now does what the UI has always claimed.
 *
 * Both quick-create surfaces (`/admin/school-users`, `/admin/user-management`)
 * tell the administrator: "El usuario deberá cambiar su contraseña en el primer
 * inicio de sesión." The handler wrote `must_change_password: false`, so they
 * never were — the administrator-chosen password became the account's permanent
 * password, known to two people, and (before S4) nothing in the platform would
 * ever have forced a change even if the flag had been set.
 */
describe('admin/create-user — forced first-login change (S14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets must_change_password: true on the created profile', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({ method: 'POST', body: bodyFor('docente', OTHER_SCHOOL_ID) });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileUpdate = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.updates.length > 0,
    )!;
    // The whole defect, in one assertion.
    expect((profileUpdate.updates[0] as any).must_change_password).toBe(true);
  });

  it('tells the caller so, in the response', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({ method: 'POST', body: bodyFor('docente', OTHER_SCHOOL_ID) });
    await handler(req as never, res as never);

    expect(res._getJSONData().user).toMatchObject({ mustChangePassword: true });
  });

  it('does the same for an equipo_directivo requester', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({ method: 'POST', body: bodyFor('docente', ED_SCHOOL_ID) });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const profileUpdate = tracker.fromCalls.find(
      (c) => c.table === 'profiles' && c.updates.length > 0,
    )!;
    expect((profileUpdate.updates[0] as any).must_change_password).toBe(true);
  });
});

describe('admin/create-user — server-side password policy (S5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['the old fixture shape (no uppercase)', WEAK_PASSWORD],
    ['too short', 'Ab1'],
    ['no lowercase', 'SINTETICA2026'],
    ['no number', 'SinteticaSegura'],
    ['a single character', 'a'],
  ])('400 for a password that is %s — no account is created', async (_label, weak) => {
    setupAdmin();
    // Deliberately no `stockHappyPath` here. `vi.clearAllMocks()` clears call
    // history but NOT a queued `mockReturnValueOnce`, so a client queued for a
    // request that never builds one would be handed to the NEXT test — bound to
    // a tracker that test does not hold, and silently invisible to it.

    const { req, res } = createMocks({
      method: 'POST',
      body: { ...bodyFor('docente', OTHER_SCHOOL_ID), password: weak },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/^La contraseña/);
    // The service-role client is built lazily AFTER validation, so nothing was
    // even connected to, let alone written.
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('400 in es-CL when email or password is missing', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: { email: 'new@example.com' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({
      error: 'Email y contraseña son obligatorios',
    });
  });
});

describe('admin/create-user — audit (S3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records user_created_manual with actor, target and role', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({ method: 'POST', body: bodyFor('docente', OTHER_SCHOOL_ID) });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const audit = tracker.fromCalls.filter((c) => c.table === 'security_audit_events');
    expect(audit).toHaveLength(1);
    expect(audit[0].inserts[0]).toMatchObject({
      action: 'user_created_manual',
      outcome: 'success',
      actor_user_id: ADMIN_ID,
      actor_role: 'admin',
      target_user_id: NEW_USER_ID,
      school_id: OTHER_SCHOOL_ID,
    });
  });

  it('never puts the chosen password anywhere but the GoTrue call', async () => {
    setupAdmin();
    const tracker = makeTracker();
    stockHappyPath(tracker);

    const { req, res } = createMocks({ method: 'POST', body: bodyFor('docente', OTHER_SCHOOL_ID) });
    await handler(req as never, res as never);

    for (const call of tracker.fromCalls) {
      for (const payload of [...call.inserts, ...call.updates]) {
        expect(JSON.stringify(payload ?? null)).not.toContain(VALID_PASSWORD);
      }
    }
    expect(res._getData()).not.toContain(VALID_PASSWORD);
  });

  it('a failed audit does not fail the creation — fail-open, but reported', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [{ data: null, error: null }],
          user_roles: [{ data: null, error: null }],
          security_audit_events: [{ data: null, error: { message: 'audit insert failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({ method: 'POST', body: bodyFor('docente', OTHER_SCHOOL_ID) });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().audited).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(
      '[security-audit] write failed',
      expect.objectContaining({ action: 'user_created_manual' }),
    );
    errSpy.mockRestore();
  });
});
