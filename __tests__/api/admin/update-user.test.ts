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

import handler from '../../../pages/api/admin/update-user';

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
  inserts: unknown[];
  updates: unknown[];
  eqs: Array<{ col: string; val: unknown }>;
  selects: unknown[];
}

interface Tracker {
  fromCalls: FromCall[];
  authUpdates: Array<{ userId: string; payload: unknown }>;
}

function makeTracker(): Tracker {
  return { fromCalls: [], authUpdates: [] };
}

function buildAdminClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
) {
  const indices: Record<string, number> = {};

  return {
    auth: {
      admin: {
        updateUserById: vi.fn(async (userId: string, payload: unknown) => {
          tracker.authUpdates.push({ userId, payload });
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
        inserts: [],
        updates: [],
        eqs: [],
        selects: [],
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
          if (prop === 'select') {
            return vi.fn((vals: unknown) => {
              fromCall.selects.push(vals);
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

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: TARGET_USER_ID,
    first_name: 'Updated',
    last_name: 'Name',
    ...overrides,
  };
}

describe('admin/update-user — POST (ED auth + scoping)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: can update any user (no profile lookup performed)', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [{ data: null, error: null }],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school: 'Some School' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // Admin path: no select-only profile lookup; first profiles call is the update.
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(1);
    expect((profileCalls[0].updates[0] as any).school).toBe('Some School');
    expect((profileCalls[0].updates[0] as any).first_name).toBe('Updated');

    // Audit log records requester_role for admin-initiated edits.
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].inserts).toHaveLength(1);
    expect((auditCalls[0].inserts[0] as any).details).toMatchObject({
      requester_role: 'admin',
      requester_user_id: ADMIN_ID,
    });
    expect((auditCalls[0].inserts[0] as any).user_id).toBe(ADMIN_ID);
  });

  it('ED: can update a user in their own school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    // First call: lookup with select + eq
    expect(profileCalls[0].selects).toHaveLength(1);
    expect(profileCalls[0].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
    // Second call: the update — must NOT mutate `school` for ED
    expect(profileCalls[1].updates).toHaveLength(1);
    expect((profileCalls[1].updates[0] as any).school).toBeUndefined();

    // Audit log records requester_role for ED-initiated edits.
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].inserts).toHaveLength(1);
    expect((auditCalls[0].inserts[0] as any).details).toMatchObject({
      requester_role: 'equipo_directivo',
      requester_user_id: ED_ID,
    });
    expect((auditCalls[0].inserts[0] as any).user_id).toBe(ED_ID);
  });

  it('ED: can update email of a same-school target with no global roles', async () => {
    // Documents the approved policy: email/name edits are intentional, not a
    // security gap. School and role changes remain gated separately.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    const adminClient = buildAdminClient(
      {
        profiles: [
          { data: { school_id: ED_SCHOOL_ID }, error: null },
          { data: null, error: null },
        ],
        user_roles: [{ data: [], error: null }],
        audit_logs: [{ data: null, error: null }],
      },
      tracker,
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(adminClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ email: 'new@example.com' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[1].updates).toHaveLength(1);
    expect((profileCalls[1].updates[0] as any).email).toBe('new@example.com');
    expect((profileCalls[1].updates[0] as any).school).toBeUndefined();

    expect(tracker.authUpdates).toHaveLength(1);
    expect(tracker.authUpdates[0]).toEqual({
      userId: TARGET_USER_ID,
      payload: { email: 'new@example.com' },
    });
  });

  it('ED: 403 when target user is in another school', async () => {
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para editar este usuario',
    });

    // Did not proceed to update
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
  });

  it('ED: 404 when target profile is not found (data null)', async () => {
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({ error: 'Usuario no encontrado' });
  });

  it('ED: 500 when profile lookup errors (distinct from not-found)', async () => {
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando usuario' });
  });

  it('ED: 403 when target holds a global role (admin) — no profile update', async () => {
    // F1 defense-in-depth: profile.school_id matches but the target also holds
    // a global role. The read path filters such users; this guards the write.
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para editar este usuario',
    });

    // Only the lookup happened; no profile update, no audit log.
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
    expect(profileCalls[0].selects).toHaveLength(1);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
  });

  it('ED: 500 when user_roles lookup errors — no profile update', async () => {
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error verificando roles del usuario' });

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
  });

  it('ED: 400 when body contains legacy `school` field', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    // Service role client should not be touched, but provide one for safety.
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school: 'Other School' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'No se puede modificar el colegio' });

    // No profile lookup or update happened
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED: school: null in body - succeeds (treated as no-op)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [{ data: [], error: null }],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school: null }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[1].updates).toHaveLength(1);
    // ED still must not mutate the `school` text field
    expect((profileCalls[1].updates[0] as any).school).toBeUndefined();
  });

  it("ED: school: '' in body - succeeds (treated as no-op)", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          user_roles: [{ data: [], error: null }],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school: '' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[1].updates).toHaveLength(1);
    expect((profileCalls[1].updates[0] as any).school).toBeUndefined();
  });

  it('ED: 400 when body `school_id` differs from ED school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: OTHER_SCHOOL_ID }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'No se puede modificar el colegio' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED: succeeds when body `school_id` equals ED school (benign echo)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: ED_SCHOOL_ID }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[1].updates).toHaveLength(1);
    // ED still must not mutate the `school` text field
    expect((profileCalls[1].updates[0] as any).school).toBeUndefined();
  });

  it('ED: succeeds when body `school_id` is a string that coerces to ED school', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: String(ED_SCHOOL_ID) }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
  });

  it('ED: school_id=null in body — succeeds (no change intent)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { school_id: ED_SCHOOL_ID }, error: null },
            { data: null, error: null },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: null }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[1].updates).toHaveLength(1);
  });

  it('ED: school_id=-1 (negative integer) — 400 with school_id inválido', async () => {
    // F3: school ids are non-negative in the schema. Negatives must 400.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: -1 }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'school_id inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it("ED: school_id='-1' (negative string) — 400 with school_id inválido", async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: '-1' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'school_id inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED: school_id=true (boolean) — 400 with school_id inválido', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: true }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'school_id inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED: school_id="0" (string zero) — 400 with school_id inválido (positive-integer semantics)', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: '0' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'school_id inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED: school_id="abc" (non-numeric) — 400 with school_id inválido', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [] }, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ school_id: 'abc' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'school_id inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED with schoolId=null from auth helper: 403 defensive guard', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody(),
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('ED: rollback on auth-update failure uses server-fetched email, not req.body.originalEmail', async () => {
    // F3: client must not be trusted to supply the rollback target. Even when
    // `originalEmail` is omitted from the body, rollback must restore the
    // pre-mutation profile email fetched server-side during the ED lookup.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    const adminClient = buildAdminClient(
      {
        profiles: [
          { data: { school_id: ED_SCHOOL_ID, email: 'server@example.com' }, error: null },
          { data: null, error: null }, // forward profile update
          { data: null, error: null }, // rollback profile update
        ],
        user_roles: [{ data: [], error: null }],
      },
      tracker,
    );
    adminClient.auth.admin.updateUserById = vi.fn(
      async (userId: string, payload: unknown) => {
        tracker.authUpdates.push({ userId, payload });
        return { data: null, error: { message: 'auth failed' } };
      },
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(adminClient);

    const { req, res } = createMocks({
      method: 'POST',
      // No originalEmail in body — proves rollback does not depend on it.
      body: baseBody({ email: 'new@example.com' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // lookup → forward update → rollback update
    expect(profileCalls).toHaveLength(3);
    expect(profileCalls[2].updates).toHaveLength(1);
    expect((profileCalls[2].updates[0] as any).email).toBe('server@example.com');
    expect(profileCalls[2].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
  });

  it('admin: rollback on auth-update failure uses server-fetched email, not req.body.originalEmail', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const adminClient = buildAdminClient(
      {
        profiles: [
          { data: { email: 'server@example.com' }, error: null }, // admin pre-fetch
          { data: null, error: null }, // forward profile update
          { data: null, error: null }, // rollback profile update
        ],
      },
      tracker,
    );
    adminClient.auth.admin.updateUserById = vi.fn(
      async (userId: string, payload: unknown) => {
        tracker.authUpdates.push({ userId, payload });
        return { data: null, error: { message: 'auth failed' } };
      },
    );
    mockCreateServiceRoleClient.mockReturnValueOnce(adminClient);

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ email: 'new@example.com', school: 'Some School' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // pre-fetch → forward update → rollback update
    expect(profileCalls).toHaveLength(3);
    expect(profileCalls[0].selects).toHaveLength(1);
    expect(profileCalls[0].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
    expect(profileCalls[2].updates).toHaveLength(1);
    expect((profileCalls[2].updates[0] as any).email).toBe('server@example.com');
  });

  it('missing userId: 400', async () => {
    setupAdmin();

    const { req, res } = createMocks({
      method: 'POST',
      body: { first_name: 'X' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'ID de usuario requerido' });
  });
});
