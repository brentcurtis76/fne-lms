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

// Bypass the auth-tier rate limiter (10 req/min) — without this, adding new
// test cases tips the bucket over and later tests start receiving 429 instead
// of the status they expect. The rate limit itself is not under test here.
vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    rateLimit: () => async () => true,
  };
});

import handler from '../../../pages/api/admin/reset-password';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ED_ID = '99999999-9999-4999-8999-999999999999';
const TARGET_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ED_SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 999;
const TEMP_PASSWORD = 'Temp-Password-1234!';

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  selects: unknown[];
  updates: unknown[];
  inserts: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
}

interface UpdateUserCall {
  userId: string;
  payload: Record<string, unknown>;
}

interface Tracker {
  fromCalls: FromCall[];
  updateUserCalls: UpdateUserCall[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], updateUserCalls: [] };
}

function buildAdminClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  opts: { updateUserError?: unknown } = {},
) {
  const indices: Record<string, number> = {};

  return {
    auth: {
      admin: {
        updateUserById: vi.fn(async (userId: string, payload: Record<string, unknown>) => {
          tracker.updateUserCalls.push({ userId, payload });
          if (opts.updateUserError) {
            return { data: null, error: opts.updateUserError };
          }
          return { data: { user: { id: userId } }, error: null };
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
        selects: [],
        updates: [],
        inserts: [],
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
          if (prop === 'select') {
            return vi.fn((vals?: unknown) => {
              fromCall.selects.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'update') {
            return vi.fn((vals: unknown) => {
              fromCall.updates.push(vals);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'insert') {
            return vi.fn((vals: unknown) => {
              fromCall.inserts.push(vals);
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

function setupWrongRole() {
  mockCheckIsAdminOrEquipoDirectivo.mockResolvedValueOnce({
    isAuthorized: false,
    role: 'docente',
    schoolId: null,
    user: { id: ED_ID } as any,
    error: null,
  });
}

// Builds result tables for a successful password reset.
// `includeProfileLookup` adds the ED-only pre-check select result at profiles[0];
// the actual profile update (password_change_required flag) then sits at
// profiles[1].
//
// For ED scope, the handler also fetches active user_roles for the
// target-role gate (defense-in-depth — reject targets that hold any role
// outside ED_ASSIGNABLE_ROLES). Pass `targetRoles` to override the default
// (empty array → no global role → passes the gate).
function successTables(opts: {
  includeProfileLookup: boolean;
  lookupSchoolId?: number | null;
  targetRoles?: Array<{ role_type: string; school_id?: number | null }>;
}) {
  const profiles: TableResult[] = [];
  if (opts.includeProfileLookup) {
    profiles.push({ data: { school_id: opts.lookupSchoolId ?? ED_SCHOOL_ID }, error: null });
  }
  profiles.push({ data: null, error: null });

  const tables: Record<string, TableResult[]> = {
    profiles,
    audit_logs: [{ data: null, error: null }],
  };
  if (opts.includeProfileLookup) {
    tables.user_roles = [{ data: opts.targetRoles ?? [], error: null }];
  }
  return tables;
}

// Asserts the temporary password never escaped the auth.admin.updateUserById
// call: it must not appear in audit_log inserts, profile updates, or any
// other tracked write.
function assertTempPasswordNotLeaked(tracker: Tracker) {
  const stringify = (v: unknown) => JSON.stringify(v ?? null);
  for (const call of tracker.fromCalls) {
    for (const ins of call.inserts) {
      expect(stringify(ins)).not.toContain(TEMP_PASSWORD);
    }
    for (const upd of call.updates) {
      expect(stringify(upd)).not.toContain(TEMP_PASSWORD);
    }
  }
}

describe('admin/reset-password — POST (ED auth + scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: can reset any user (no profile lookup performed)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const client = buildAdminClient(
      successTables({ includeProfileLookup: false }),
      tracker,
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(client);

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Admin path: profiles is touched once — for the password_change_required
    // update only, no lookup beforehand.
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].selects).toHaveLength(0);
    expect(profileCalls[0].updates).toHaveLength(1);

    expect(tracker.updateUserCalls).toHaveLength(1);
    expect(tracker.updateUserCalls[0].userId).toBe(TARGET_USER_ID);
    expect(tracker.updateUserCalls[0].payload).toMatchObject({ password: TEMP_PASSWORD });

    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].inserts).toHaveLength(1);
    expect((auditCalls[0].inserts[0] as any).details).toMatchObject({
      target_user_id: TARGET_USER_ID,
      requester_role: 'admin',
      requester_user_id: ADMIN_ID,
    });
    expect((auditCalls[0].inserts[0] as any).user_id).toBe(ADMIN_ID);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED: can reset a user in their own school', async () => {
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
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // Two profiles touches: lookup + post-reset update
    expect(profileCalls).toHaveLength(2);
    // First: lookup with select + eq, no update
    expect(profileCalls[0].selects).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
    expect(profileCalls[0].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
    // Second: the password_change_required flag update
    expect(profileCalls[1].updates).toHaveLength(1);

    expect(tracker.updateUserCalls).toHaveLength(1);
    expect(tracker.updateUserCalls[0].userId).toBe(TARGET_USER_ID);
    expect(tracker.updateUserCalls[0].payload).toMatchObject({ password: TEMP_PASSWORD });

    // Audit log records requester_role for ED-initiated resets.
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].inserts).toHaveLength(1);
    expect((auditCalls[0].inserts[0] as any).details).toMatchObject({
      target_user_id: TARGET_USER_ID,
      requester_role: 'equipo_directivo',
      requester_user_id: ED_ID,
    });
    expect((auditCalls[0].inserts[0] as any).user_id).toBe(ED_ID);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED: 403 when target user is in another school — updateUserById not called', async () => {
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
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'No autorizado para restablecer la contraseña de este usuario',
    });

    // Lookup happened, but no password mutation.
    expect(tracker.updateUserCalls).toHaveLength(0);
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED: 404 when target profile is not found — updateUserById not called', async () => {
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
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toMatchObject({ error: 'Usuario no encontrado' });

    expect(tracker.updateUserCalls).toHaveLength(0);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED: 403 when target holds a global role (admin) — updateUserById not called', async () => {
    // F1 defense-in-depth: profile.school_id matches but the target also holds
    // a global role. The read path filters such users out of listings; this
    // guards the write path so password reset is blocked too.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [{ data: [{ role_type: 'admin' }], error: null }],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'No autorizado para restablecer la contraseña de este usuario',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED: 403 when target holds a school-scoped role in another school — updateUserById not called', async () => {
    // F1 extension: even if profile.school_id matches edSchoolId, an active
    // school-scoped role row tied to a different school must reject the write.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [
            {
              data: [{ role_type: 'docente', school_id: OTHER_SCHOOL_ID }],
              error: null,
            },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'No autorizado para restablecer la contraseña de este usuario',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED: 500 when user_roles lookup errors — updateUserById not called', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [{ data: null, error: { message: 'role lookup failed' } }],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({
      error: 'Error verificando roles del usuario',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    assertTempPasswordNotLeaked(tracker);
  });

  it('ED with schoolId=null from auth helper: 403 defensive guard (service client never built)', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'School context missing for equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong role: 403 with role-aware message (service client never built)', async () => {
    setupWrongRole();

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'Solo administradores o equipo directivo pueden restablecer contraseñas',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('admin: 400 when admin tries to reset their own password — updateUserById not called', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const client = buildAdminClient(
      successTables({ includeProfileLookup: false }),
      tracker,
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(client);

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: ADMIN_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({
      error: 'No puedes restablecer tu propia contraseña — usa el flujo normal de recuperación',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(0);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
  });

  it('ED: 400 when ED tries to reset their own password — updateUserById not called, school lookup skipped', async () => {
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
      body: { userId: ED_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({
      error: 'No puedes restablecer tu propia contraseña — usa el flujo normal de recuperación',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(0);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
  });

  it('unauthenticated: 401 (service client never built)', async () => {
    setupUnauthenticated();

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
});
