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

import handler from '../../../pages/api/admin/assign-role';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const TARGET_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ROLE_ROW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMMUNITY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ED_SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 999;

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  inserts: unknown[];
  updates: unknown[];
  selects: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
  rpcCalls: Array<{ fn: string; args?: unknown }>;
}

function makeTracker(): Tracker {
  return { fromCalls: [], rpcCalls: [] };
}

/**
 * Sequenced supabase client: each from(table) call consumes the next
 * configured result for that table. The proxy chain handles await,
 * .single() / .maybeSingle(), .insert / .update / .select / .eq / .limit,
 * recording payloads for assertion.
 */
function buildClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  rpcResult: TableResult = { data: null, error: null },
) {
  const indices: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };

      const fromCall: FromCall = {
        table,
        index: idx,
        inserts: [],
        updates: [],
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
          if (prop === 'insert') {
            return vi.fn((arg: unknown) => {
              fromCall.inserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'update') {
            return vi.fn((arg: unknown) => {
              fromCall.updates.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'select') {
            return vi.fn((arg?: unknown) => {
              fromCall.selects.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'eq') {
            return vi.fn((col: string, val: unknown) => {
              fromCall.eqs.push({ col, val });
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return vi.fn(() => ({
              then: (resolve: (v: unknown) => void) => resolve(resolved),
            }));
          }
          return vi.fn(() => new Proxy({}, proxyHandler));
        },
      };
      return new Proxy({}, proxyHandler);
    }),
    rpc: vi.fn((fn: string, args?: unknown) => {
      tracker.rpcCalls.push({ fn, args });
      const r = { data: rpcResult.data ?? null, error: rpcResult.error ?? null };
      return { then: (resolve: (v: unknown) => void) => resolve(r) };
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

// Helpers to count operations for assertions.
function countInserts(tracker: Tracker, table: string) {
  return tracker.fromCalls
    .filter((c) => c.table === table)
    .reduce((sum, c) => sum + c.inserts.length, 0);
}

function findInsertPayload(tracker: Tracker, table: string): unknown | undefined {
  for (const call of tracker.fromCalls) {
    if (call.table === table && call.inserts.length > 0) return call.inserts[0];
  }
  return undefined;
}

// School-scoped role assignments (docente/lider_generacion/equipo_directivo/
// encargado_licitacion) follow the same supabase sequence: insert role,
// fetch school name, update profile.
function schoolScopedTables(schoolName = 'Escuela Test') {
  return {
    user_roles: [{ data: { id: ROLE_ROW_ID }, error: null }],
    schools: [{ data: { name: schoolName }, error: null }],
    profiles: [{ data: null, error: null }],
  };
}

describe('admin/assign-role — admin path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin can assign global role "admin" (no school context, no profile update)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        { user_roles: [{ data: { id: ROLE_ROW_ID }, error: null }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'admin' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);

    const payload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(payload.role_type).toBe('admin');
    expect(payload.school_id).toBeNull();
    expect(payload.is_active).toBe(true);
    expect(payload.assigned_by).toBe(ADMIN_ID);

    // No school-level profile update for global role.
    expect(tracker.fromCalls.filter((c) => c.table === 'profiles')).toHaveLength(0);
    expect(tracker.rpcCalls.map((r) => r.fn)).toEqual(['refresh_user_roles_cache']);
  });

  it('admin can assign "consultor" with schoolId — no profile school update', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        { user_roles: [{ data: { id: ROLE_ROW_ID }, error: null }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'consultor', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    // consultor is not in the handler's school-level role list: no profile update.
    expect(tracker.fromCalls.filter((c) => c.table === 'profiles')).toHaveLength(0);
    expect(tracker.fromCalls.filter((c) => c.table === 'schools')).toHaveLength(0);
  });

  it('admin can assign "docente" — inserts role and updates profile school_id', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Alfa'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(1);
    expect(profileCalls[0].updates[0]).toEqual({
      school_id: ED_SCHOOL_ID,
      school: 'Colegio Alfa',
    });
  });

  it('admin can assign "equipo_directivo" — inserts role and updates profile school', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Beta'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'equipo_directivo', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls[0].updates[0]).toEqual({
      school_id: ED_SCHOOL_ID,
      school: 'Colegio Beta',
    });
  });

  it('admin assigning "lider_comunidad" auto-creates a community with school_id', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { first_name: 'Ana', last_name: 'Soto' }, error: null }, // user info lookup
            { data: null, error: null }, // profile update slot
          ],
          schools: [
            { data: { id: ED_SCHOOL_ID, name: 'Colegio Gamma', has_generations: false }, error: null },
            { data: { name: 'Colegio Gamma' }, error: null },
          ],
          generations: [{ data: [], error: null }],
          growth_communities: [{ data: { id: COMMUNITY_ID }, error: null }],
          user_roles: [{ data: { id: ROLE_ROW_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'lider_comunidad', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'growth_communities')).toBe(1);

    const communityPayload = findInsertPayload(tracker, 'growth_communities') as Record<string, unknown>;
    expect(communityPayload.school_id).toBe(ED_SCHOOL_ID);
    expect(communityPayload.name).toBe('Comunidad Ana Soto');
    expect(communityPayload.generation_id).toBeNull();

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.community_id).toBe(COMMUNITY_ID);
    expect(rolePayload.role_type).toBe('lider_comunidad');
  });
});

describe('admin/assign-role — equipo_directivo path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ED can assign each role in ED_ASSIGNABLE_ROLES — exercised individually so a
  // failure pinpoints the offending role rather than masking it inside a loop.
  it('ED can assign "docente" within own school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null }, // ED scope lookup
            { data: null, error: null }, // profile update
          ],
          user_roles: [
            { data: [], error: null }, // ED target-role gate (no global role)
            { data: { id: ROLE_ROW_ID }, error: null }, // role insert
          ],
          schools: [{ data: { name: 'Esc' }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.school_id).toBe(ED_SCHOOL_ID);
  });

  it('ED can assign "lider_generacion" within own school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [
            { data: [], error: null },
            { data: { id: ROLE_ROW_ID }, error: null },
          ],
          schools: [{ data: { name: 'Esc' }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'lider_generacion', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('ED can assign "equipo_directivo" within own school (peer ED grant)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [
            { data: [], error: null },
            { data: { id: ROLE_ROW_ID }, error: null },
          ],
          schools: [{ data: { name: 'Esc' }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'equipo_directivo', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('ED can assign "encargado_licitacion" within own school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [
            { data: [], error: null },
            { data: { id: ROLE_ROW_ID }, error: null },
          ],
          schools: [{ data: { name: 'Esc' }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'encargado_licitacion', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('ED assigning "lider_comunidad" auto-creates community with school_id === edSchoolId', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null }, // ED scope lookup
            { data: { first_name: 'Luz', last_name: 'Vera' }, error: null }, // user info
            { data: null, error: null }, // profile update
          ],
          user_roles: [
            { data: [], error: null }, // ED target-role gate
            { data: { id: ROLE_ROW_ID }, error: null }, // role insert
          ],
          schools: [
            { data: { id: ED_SCHOOL_ID, name: 'Esc', has_generations: false }, error: null },
            { data: { name: 'Esc' }, error: null },
          ],
          generations: [{ data: [], error: null }],
          growth_communities: [{ data: { id: COMMUNITY_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      // Body omits schoolId — handler overrides to edSchoolId.
      body: { targetUserId: TARGET_USER_ID, roleType: 'lider_comunidad' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const communityPayload = findInsertPayload(tracker, 'growth_communities') as Record<string, unknown>;
    expect(communityPayload.school_id).toBe(ED_SCHOOL_ID);
    expect(communityPayload.name).toBe('Comunidad Luz Vera');

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.community_id).toBe(COMMUNITY_ID);
    expect(rolePayload.school_id).toBe(ED_SCHOOL_ID);
  });

  // Roles outside ED_ASSIGNABLE_ROLES must be rejected before any DB write.
  it.each(['admin', 'consultor', 'community_manager', 'supervisor_de_red'] as const)(
    'ED assigning "%s" → 403, no user_roles or growth_communities insert',
    async (roleType) => {
      setupEquipoDirectivo(ED_SCHOOL_ID);
      const tracker = makeTracker();
      mockCreateServiceRoleClient.mockReturnValueOnce(buildClient({}, tracker));

      const { req, res } = createMocks({
        method: 'POST',
        body: { targetUserId: TARGET_USER_ID, roleType, schoolId: ED_SCHOOL_ID },
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({
        error: 'Role not assignable by equipo_directivo',
      });
      expect(countInserts(tracker, 'user_roles')).toBe(0);
      expect(countInserts(tracker, 'growth_communities')).toBe(0);
    },
  );

  it('ED targeting a user in another school → 403, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        { profiles: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para asignar roles a este usuario',
    });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with mismatched body schoolId → 403, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        { profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: OTHER_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No se puede asignar rol en otro colegio',
    });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it.each(['admin', 'consultor'] as const)(
    'ED targeting user holding global role "%s" → 403, no inserts',
    async (globalRole) => {
      setupEquipoDirectivo(ED_SCHOOL_ID);
      const tracker = makeTracker();
      mockCreateServiceRoleClient.mockReturnValueOnce(
        buildClient(
          {
            profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
            user_roles: [{ data: [{ role_type: globalRole }], error: null }],
          },
          tracker,
        ),
      );

      const { req, res } = createMocks({
        method: 'POST',
        body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({
        error: 'No autorizado para asignar roles a este usuario',
      });
      expect(countInserts(tracker, 'user_roles')).toBe(0);
      expect(countInserts(tracker, 'growth_communities')).toBe(0);
    },
  );

  it('ED profile lookup error → 500 "Error verificando usuario", no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        { profiles: [{ data: null, error: { message: 'lookup failed' } }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando usuario' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED user_roles lookup error → 500 "Error verificando roles del usuario", no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: null, error: { message: 'role lookup failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando roles del usuario' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED target profile missing → 404 "Usuario no encontrado", no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        { profiles: [{ data: null, error: null }] },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Usuario no encontrado' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with schoolId=null from auth helper → 403, service client never built', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'School context missing for equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('admin/assign-role — auth guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unauthenticated → 401, service client never built', async () => {
    setupUnauthenticated();

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong-role auth → 401, service client never built', async () => {
    setupUnauthorizedRole();

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});
