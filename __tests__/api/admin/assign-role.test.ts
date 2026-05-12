// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  // F2 fix: the admin path must preserve the caller's schoolId verbatim for
  // a scoped consultor assignment. The previous behavior nulled school_id,
  // which lib/utils/session-policy.ts:31 treats as GLOBAL consultor access
  // — i.e. the normalization silently granted global access (privilege
  // escalation). Admin path now preserves what the caller passed; the ED
  // path is unaffected (ED_ASSIGNABLE_ROLES blocks ED from reaching here
  // with a non-school-scoped role).
  it('admin: assigning "consultor" with body.schoolId=42 → user_roles.school_id is 42 (scoped, NOT null/global)', async () => {
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
    const payload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(payload.role_type).toBe('consultor');
    expect(payload.school_id).toBe(ED_SCHOOL_ID);
  });

  // F2 follow-up: admin assigning a truly global role (admin) with a stray
  // schoolId — the handler preserves the value the caller passed. The admin
  // role does not have the global-vs-scoped semantic that consultor has
  // (admin is always global regardless of school_id), so preserving is safe
  // and avoids hidden normalization on the admin path.
  it('admin: assigning "admin" with body.schoolId=42 → user_roles.school_id preserved as 42', async () => {
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
      body: { targetUserId: TARGET_USER_ID, roleType: 'admin', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const payload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(payload.role_type).toBe('admin');
    expect(payload.school_id).toBe(ED_SCHOOL_ID);
  });

  // F2 (phase 16.1): community_manager and supervisor_de_red do NOT use the
  // null-vs-non-null school_id scope signal (community_manager scopes via
  // community_id; supervisor_de_red scopes via red_id). The admin path
  // therefore preserves any caller-supplied schoolId verbatim — no
  // null-normalization — same as for consultor. Verified by grep on
  // 2026-05-12 across lib/, utils/, pages/.
  it('admin: assigning "community_manager" with schoolId=42 → user_roles.school_id is 42 (preserved, no normalization)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Alfa'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'community_manager', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const payload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(payload.role_type).toBe('community_manager');
    expect(payload.school_id).toBe(ED_SCHOOL_ID);
  });

  it('admin: assigning "supervisor_de_red" with schoolId=42 → user_roles.school_id is 42 (preserved, no normalization)', async () => {
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
      body: { targetUserId: TARGET_USER_ID, roleType: 'supervisor_de_red', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const payload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(payload.role_type).toBe('supervisor_de_red');
    expect(payload.school_id).toBe(ED_SCHOOL_ID);
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

  // F3: schoolId arriving as a digit-string from the client (e.g. selects that
  // post string values) must be coerced to a number before the insert payload
  // is built. user_roles.school_id is an integer column; persisting '42'
  // instead of 42 would silently corrupt downstream joins and integer
  // comparisons (FK gates, profile.school_id ===).
  it("admin: assigning a school-scoped role with schoolId='42' inserts school_id: 42 (number)", async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Alfa'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: '42' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.school_id).toBe(42);
    expect(typeof rolePayload.school_id).toBe('number');

    // The profile update path must also see the coerced numeric value, not '42'.
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls[0].updates[0]).toEqual({
      school_id: 42,
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

  // F2: shared schoolId shape validation applies to the admin path too —
  // malformed/non-numeric/zero/negative inputs must 400 before any DB write.
  it.each([
    ['string non-numeric', 'abc'],
    ['negative integer', -1],
    ['zero integer', 0],
  ] as const)(
    'admin with invalid schoolId (%s) → 400 "schoolId inválido", no inserts',
    async (_label, badSchoolId) => {
      setupAdmin();
      const tracker = makeTracker();
      mockCreateServiceRoleClient.mockReturnValueOnce(buildClient({}, tracker));

      const { req, res } = createMocks({
        method: 'POST',
        body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: badSchoolId },
      });
      await handler(req as never, res as never);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
      expect(countInserts(tracker, 'user_roles')).toBe(0);
      expect(countInserts(tracker, 'growth_communities')).toBe(0);
    },
  );

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
            user_roles: [{ data: [{ role_type: globalRole, school_id: null }], error: null }],
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

  // F1: even if the target's profiles.school_id matches ED's school, an
  // active school-scoped role row tied to a different school must reject
  // the write. Profile and user_roles can diverge (stale or cross-school
  // role assignment), so this gate is enforced independently.
  it('ED targeting user with school-scoped role in another school → 403, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [
            {
              data: [{ role_type: 'docente', school_id: OTHER_SCHOOL_ID }],
              error: null,
            },
          ],
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
  });

  // F1 negative: a school-scoped role with a NULL school_id (legacy or
  // global-stamp row) must NOT trip the cross-school gate; only the
  // explicit-mismatch case rejects.
  it('ED targeting user with school-scoped role and null school_id → 200', async () => {
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
            { data: [{ role_type: 'docente', school_id: null }], error: null },
            { data: { id: ROLE_ROW_ID }, error: null },
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
  });

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

  it('wrong-role auth (authenticated user without admin/ED) → 403, service client never built', async () => {
    setupUnauthorizedRole();

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'Solo administradores o equipo directivo pueden asignar roles',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe('admin/assign-role — ED explicit FK scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ED with malformed body schoolId → 400 "schoolId inválido", no inserts', async () => {
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
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: 'abc' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with schoolId=-1 (negative integer) → 400 "schoolId inválido", no inserts', async () => {
    // Validation must run before the cross-school comparison: negatives are
    // not valid school ids, so they 400 rather than falling through to the
    // 403 cross-school gate (where Number(-1) !== edSchoolId would have
    // previously returned "No se puede asignar rol en otro colegio").
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
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: -1 },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it("ED with schoolId='-1' (negative string) → 400 \"schoolId inválido\", no inserts", async () => {
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
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: '-1' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'schoolId inválido' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with explicit communityId from another school → 403, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          growth_communities: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_comunidad',
        schoolId: ED_SCHOOL_ID,
        communityId: COMMUNITY_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Comunidad no pertenece a tu colegio' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with explicit communityId not found → 404, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          growth_communities: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_comunidad',
        schoolId: ED_SCHOOL_ID,
        communityId: COMMUNITY_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Comunidad no encontrada' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with explicit communityId lookup error → 500, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          growth_communities: [{ data: null, error: { message: 'community lookup failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_comunidad',
        schoolId: ED_SCHOOL_ID,
        communityId: COMMUNITY_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando comunidad' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('ED with explicit generationId from another school → 403, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          generations: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_generacion',
        schoolId: ED_SCHOOL_ID,
        generationId: 'gen-xyz',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Generación no pertenece a tu colegio' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
  });

  it('ED with explicit generationId not found → 404, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          generations: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_generacion',
        schoolId: ED_SCHOOL_ID,
        generationId: 'gen-xyz',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Generación no encontrada' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
  });

  it('ED with explicit generationId lookup error → 500, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          generations: [{ data: null, error: { message: 'generation lookup failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_generacion',
        schoolId: ED_SCHOOL_ID,
        generationId: 'gen-xyz',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando generación' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
  });

  // F2 fix: FK lookups must be gated by roleType. Stray communityId /
  // generationId on a docente assignment should be ignored, not validated
  // against growth_communities / generations.
  it('ED assigning "docente" with stray communityId → 200; growth_communities never queried; payload community_id null', async () => {
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
            { data: [], error: null }, // ED target-role gate
            { data: { id: ROLE_ROW_ID }, error: null }, // role insert
          ],
          schools: [{ data: { name: 'Esc' }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'docente',
        schoolId: ED_SCHOOL_ID,
        communityId: COMMUNITY_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    expect(
      tracker.fromCalls.filter((c) => c.table === 'growth_communities'),
    ).toHaveLength(0);

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.role_type).toBe('docente');
    expect(rolePayload.community_id).toBeNull();
    expect(rolePayload.generation_id).toBeNull();
  });

  it('ED assigning "docente" with stray generationId → 200; generations never queried; payload generation_id null', async () => {
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
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'docente',
        schoolId: ED_SCHOOL_ID,
        generationId: 'gen-xyz',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    expect(
      tracker.fromCalls.filter((c) => c.table === 'generations'),
    ).toHaveLength(0);

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.role_type).toBe('docente');
    expect(rolePayload.generation_id).toBeNull();
    expect(rolePayload.community_id).toBeNull();
  });
});

// F5: assign-role writes an audit_logs row on success — sensitive policy
// event, mirrors delete-user/reset-password/update-user. Captures
// requester_role so forensic investigations can distinguish ED vs admin
// initiated role grants.
describe('admin/assign-role — audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: successful role assignment writes audit_logs with requester_role=admin', async () => {
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

    const auditInsert = findInsertPayload(tracker, 'audit_logs') as Record<string, any> | undefined;
    expect(auditInsert).toBeDefined();
    expect(auditInsert!.action).toBe('role_assigned');
    expect(auditInsert!.table_name).toBe('user_roles');
    expect(auditInsert!.record_id).toBe(TARGET_USER_ID);
    expect(auditInsert!.user_id).toBe(ADMIN_ID);
    expect(auditInsert!.details.role_type).toBe('docente');
    expect(auditInsert!.details.school_id).toBe(ED_SCHOOL_ID);
    expect(auditInsert!.details.requester_role).toBe('admin');
    expect(auditInsert!.details.requester_user_id).toBe(ADMIN_ID);
  });

  it('ED: successful role assignment writes audit_logs with requester_role=equipo_directivo', async () => {
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
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: ED_SCHOOL_ID },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const auditInsert = findInsertPayload(tracker, 'audit_logs') as Record<string, any> | undefined;
    expect(auditInsert).toBeDefined();
    expect(auditInsert!.action).toBe('role_assigned');
    expect(auditInsert!.user_id).toBe(ED_ID);
    expect(auditInsert!.details.requester_role).toBe('equipo_directivo');
    expect(auditInsert!.details.requester_user_id).toBe(ED_ID);
    expect(auditInsert!.details.role_type).toBe('docente');
  });

  // F1 (phase 16.1): audit details source from request-derived variables
  // (schoolId, finalCommunityId, sanitizedGenerationId) rather than
  // roleInsertData.* — defends against future select-projection refactors
  // silently writing `undefined` to the audit row. With a string schoolId
  // input, the audit row must still capture the coerced numeric value.
  it('admin: audit details capture coerced numeric school_id when body sends string', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Alfa'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { targetUserId: TARGET_USER_ID, roleType: 'docente', schoolId: '42' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const auditInsert = findInsertPayload(tracker, 'audit_logs') as Record<string, any> | undefined;
    expect(auditInsert).toBeDefined();
    expect(auditInsert!.details.school_id).toBe(42);
    expect(typeof auditInsert!.details.school_id).toBe('number');
    expect(auditInsert!.details.role_type).toBe('docente');
    expect(auditInsert!.details.community_id).toBeNull();
    expect(auditInsert!.details.generation_id).toBeNull();
  });

  it('audit_logs insert failure is logged but request still returns 200', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          ...schoolScopedTables('Colegio Alfa'),
          audit_logs: [{ data: null, error: { message: 'audit insert failed' } }],
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
    expect(countInserts(tracker, 'audit_logs')).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      '[assign-role] audit_logs insert failed',
      expect.objectContaining({
        target_user_id: TARGET_USER_ID,
        role_type: 'docente',
        requester_role: 'admin',
      }),
    );
    errSpy.mockRestore();
  });
});

// F2 regression: lider_comunidad auto-create must still consume request
// generationId for generation-based schools while keeping user_roles.generation_id
// null (that column belongs to lider_generacion). The community row links to
// the generation; the user_roles row does not.
describe('admin/assign-role — lider_comunidad generation-based regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ED lider_comunidad in generation-based school with valid generationId → 200; community linked to generation; user_roles.generation_id null', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    const GENERATION_ID = 'gen-2027';
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null }, // ED scope lookup
            { data: { first_name: 'Inés', last_name: 'Lara' }, error: null }, // user info
            { data: null, error: null }, // profile update
          ],
          user_roles: [
            { data: [], error: null }, // target-role gate
            { data: { id: ROLE_ROW_ID }, error: null }, // role insert
          ],
          generations: [
            { data: { school_id: ED_SCHOOL_ID }, error: null }, // ED FK gate
            { data: [{ id: GENERATION_ID }], error: null }, // existing-generations check
            { data: { id: GENERATION_ID, name: '2027' }, error: null }, // validate in-school
          ],
          schools: [
            { data: { id: ED_SCHOOL_ID, name: 'Esc', has_generations: true }, error: null },
            { data: { name: 'Esc' }, error: null }, // profile update name lookup
          ],
          growth_communities: [{ data: { id: COMMUNITY_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_comunidad',
        schoolId: ED_SCHOOL_ID,
        generationId: GENERATION_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const communityPayload = findInsertPayload(tracker, 'growth_communities') as Record<string, unknown>;
    expect(communityPayload.school_id).toBe(ED_SCHOOL_ID);
    expect(communityPayload.generation_id).toBe(GENERATION_ID);
    expect(communityPayload.name).toBe('Comunidad Inés Lara');

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.role_type).toBe('lider_comunidad');
    expect(rolePayload.community_id).toBe(COMMUNITY_ID);
    // generation_id on user_roles must stay null — that column is reserved
    // for lider_generacion, even though the community itself is linked.
    expect(rolePayload.generation_id).toBeNull();
  });

  it('ED lider_comunidad with generationId from another school → 403, no inserts', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [{ data: [], error: null }],
          generations: [{ data: { school_id: OTHER_SCHOOL_ID }, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'lider_comunidad',
        schoolId: ED_SCHOOL_ID,
        generationId: 'gen-foreign',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Generación no pertenece a tu colegio' });
    expect(countInserts(tracker, 'user_roles')).toBe(0);
    expect(countInserts(tracker, 'growth_communities')).toBe(0);
  });

  it('admin lider_comunidad in school without generations (no generationId) → 200; community generation_id null', async () => {
    // Regression guard: schools where has_generations=false must keep working
    // without a generationId, both before and after the F2 split.
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [
            { data: { first_name: 'Ana', last_name: 'Soto' }, error: null },
            { data: null, error: null },
          ],
          schools: [
            { data: { id: ED_SCHOOL_ID, name: 'Esc', has_generations: false }, error: null },
            { data: { name: 'Esc' }, error: null },
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
    const communityPayload = findInsertPayload(tracker, 'growth_communities') as Record<string, unknown>;
    expect(communityPayload.generation_id).toBeNull();
    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.role_type).toBe('lider_comunidad');
    expect(rolePayload.generation_id).toBeNull();
    expect(rolePayload.community_id).toBe(COMMUNITY_ID);
  });
});

// F2 regression: FK sanitization applies on the admin path too — stray
// communityId/generationId on a docente assignment must be nulled on the
// inserted user_roles row and must never trigger growth_communities /
// generations lookups (admin path skips ED's FK gates, so the test simply
// asserts the persisted payload nulls the unused FKs).
describe('admin/assign-role — admin stray-FK regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin assigning "docente" with stray communityId → 200; payload community_id null; growth_communities never queried', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Alfa'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'docente',
        schoolId: ED_SCHOOL_ID,
        communityId: COMMUNITY_ID,
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    expect(
      tracker.fromCalls.filter((c) => c.table === 'growth_communities'),
    ).toHaveLength(0);

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.role_type).toBe('docente');
    expect(rolePayload.community_id).toBeNull();
    expect(rolePayload.generation_id).toBeNull();
  });

  it('admin assigning "docente" with stray generationId → 200; payload generation_id null; generations never queried', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(schoolScopedTables('Colegio Alfa'), tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        targetUserId: TARGET_USER_ID,
        roleType: 'docente',
        schoolId: ED_SCHOOL_ID,
        generationId: 'gen-xyz',
      },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);
    expect(
      tracker.fromCalls.filter((c) => c.table === 'generations'),
    ).toHaveLength(0);

    const rolePayload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(rolePayload.role_type).toBe('docente');
    expect(rolePayload.generation_id).toBeNull();
    expect(rolePayload.community_id).toBeNull();
  });
});

// Regression guard for the school_id override gate. Today ED_ASSIGNABLE_ROLES
// is identical to SCHOOL_SCOPED_ROLES, so there is no real role exercising the
// "ED-assignable AND non-school-scoped" branch. We simulate that hypothetical
// expansion by re-importing the handler with a doMock'd roleUtils that adds
// 'community_manager' to ED_ASSIGNABLE_ROLES, and assert the handler does NOT
// stamp edSchoolId onto the user_roles row.
describe('admin/assign-role — hypothetical non-school-scoped ED-assignable role', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock('../../../utils/roleUtils');
    vi.doUnmock('../../../lib/api-auth');
    vi.resetModules();
  });

  it('ED assigning a hypothetical non-school-scoped role does NOT overwrite schoolId with edSchoolId', async () => {
    vi.doMock('../../../utils/roleUtils', async () => {
      const actual = await vi.importActual<typeof import('../../../utils/roleUtils')>(
        '../../../utils/roleUtils',
      );
      return {
        ...actual,
        // Hypothetical product expansion: ED may assign a global
        // (non-school-scoped) role. The fix under test must NOT
        // stamp edSchoolId onto its user_roles row.
        ED_ASSIGNABLE_ROLES: [...actual.SCHOOL_SCOPED_ROLES, 'community_manager'],
      };
    });

    // The top-level vi.mock for lib/api-auth applies to the statically
    // imported handler. After resetModules() the dynamic import below
    // re-resolves the module, so we re-register the api-auth mock too.
    vi.doMock('../../../lib/api-auth', async () => {
      const actual = await vi.importActual<typeof import('../../../lib/api-auth')>(
        '../../../lib/api-auth',
      );
      return {
        ...actual,
        checkIsAdminOrEquipoDirectivo: mockCheckIsAdminOrEquipoDirectivo,
        createServiceRoleClient: mockCreateServiceRoleClient,
      };
    });

    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildClient(
        {
          profiles: [{ data: { school_id: ED_SCHOOL_ID }, error: null }],
          user_roles: [
            { data: [], error: null }, // ED target-role gate: no global role on target
            { data: { id: ROLE_ROW_ID }, error: null }, // role insert
          ],
        },
        tracker,
      ),
    );

    const { default: dynHandler } = await import('../../../pages/api/admin/assign-role');

    const { req, res } = createMocks({
      method: 'POST',
      // Empty-string schoolId exercises the defensive normalization branch:
      // the handler must collapse '' to an explicit null on the insert payload
      // rather than letting '' flow through ambiguously.
      body: { targetUserId: TARGET_USER_ID, roleType: 'community_manager', schoolId: '' },
    });
    await dynHandler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(countInserts(tracker, 'user_roles')).toBe(1);

    const payload = findInsertPayload(tracker, 'user_roles') as Record<string, unknown>;
    expect(payload.role_type).toBe('community_manager');
    // The override gate is the regression target: school_id must be normalized
    // to null (not '') for non-school-scoped ED-assignable roles.
    expect(payload.school_id).toBeNull();

    // And the school-level profile update branch must not fire for a
    // non-school-scoped role with no schoolId.
    expect(tracker.fromCalls.filter((c) => c.table === 'profiles')).toHaveLength(1);
    expect(
      tracker.fromCalls.filter((c) => c.table === 'profiles')[0].updates,
    ).toHaveLength(0);
  });
});
