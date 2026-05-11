// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockCheckIsAdminOrEquipoDirectivo,
  mockCreateServiceRoleClient,
  mockRateLimit,
  mockRateLimitCheck,
  rateLimitState,
} = vi.hoisted(() => {
  // Tracking object survives `vi.clearAllMocks()` so the module-load-time
  // `rateLimit(...)` call args can still be asserted by later tests.
  const state = { configCalls: [] as unknown[][] };
  const check = vi.fn(async () => true);
  const factory = vi.fn((...args: unknown[]) => {
    state.configCalls.push(args);
    return check;
  });
  return {
    mockCheckIsAdminOrEquipoDirectivo: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockRateLimit: factory,
    mockRateLimitCheck: check,
    rateLimitState: state,
  };
});

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdminOrEquipoDirectivo: mockCheckIsAdminOrEquipoDirectivo,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

// Bypass the auth-tier rate limiter (10 req/min) — without this the bucket
// fills up across the suite and later tests start receiving 429 instead of
// the status they actually exercise. The factory is also a spy so tests can
// prove the middleware is wired up.
vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    rateLimit: mockRateLimit,
  };
});

import handler from '../../../pages/api/admin/update-user';
import { RATE_LIMITS } from '../../../lib/rateLimit';

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
    // Some tests queue `mockReturnValueOnce` returns that the handler short-
    // circuits past (e.g., email-validation 400s). `clearAllMocks` resets call
    // history but does NOT drain the return-value queue, so without an explicit
    // reset those unconsumed returns leak into later tests and produce wrong
    // service-role clients.
    mockCheckIsAdminOrEquipoDirectivo.mockReset();
    mockCreateServiceRoleClient.mockReset();
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

  it('ED: 403 when target holds a school-scoped role in another school — no profile update', async () => {
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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: 'No autorizado para editar este usuario',
    });

    // Only the lookup happened; no profile update, no audit log, no auth update.
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
    expect(profileCalls[0].selects).toHaveLength(1);
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(0);
    expect(tracker.authUpdates).toHaveLength(0);
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

  it('ED: rollback on auth-update failure restores ALL server-fetched fields, not just email', async () => {
    // F2: client must not be trusted to supply the rollback target. The
    // forward profile update writes first_name/last_name/external_school_affiliation
    // alongside email — if the subsequent auth.admin.updateUserById fails, ALL
    // fields must roll back to the server-fetched prior values, not stay at the
    // newly written payload values.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    const adminClient = buildAdminClient(
      {
        profiles: [
          {
            data: {
              school_id: ED_SCHOOL_ID,
              email: 'server@example.com',
              first_name: 'OldFirst',
              last_name: 'OldLast',
              school: null,
              external_school_affiliation: 'OldExternal',
            },
            error: null,
          },
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
      body: baseBody({
        email: 'new@example.com',
        first_name: 'NewFirst',
        last_name: 'NewLast',
        external_school_affiliation: 'NewExternal',
      }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // lookup → forward update → rollback update
    expect(profileCalls).toHaveLength(3);
    const rollback = profileCalls[2].updates[0] as any;
    expect(rollback.email).toBe('server@example.com');
    expect(rollback.first_name).toBe('OldFirst');
    expect(rollback.last_name).toBe('OldLast');
    expect(rollback.external_school_affiliation).toBe('OldExternal');
    // ED rollback never restores the legacy `school` text field — that field
    // is admin-only on the forward path too.
    expect(rollback.school).toBeUndefined();
    expect(profileCalls[2].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
  });

  it('admin: rollback on auth-update failure restores ALL server-fetched fields, including school', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const adminClient = buildAdminClient(
      {
        profiles: [
          {
            data: {
              email: 'server@example.com',
              first_name: 'OldFirst',
              last_name: 'OldLast',
              school: 'OldSchool',
              external_school_affiliation: 'OldExternal',
            },
            error: null,
          },
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
      body: baseBody({
        email: 'new@example.com',
        first_name: 'NewFirst',
        last_name: 'NewLast',
        school: 'NewSchool',
        external_school_affiliation: 'NewExternal',
      }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    // pre-fetch → forward update → rollback update
    expect(profileCalls).toHaveLength(3);
    expect(profileCalls[0].selects).toHaveLength(1);
    expect(profileCalls[0].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);

    const rollback = profileCalls[2].updates[0] as any;
    expect(rollback.email).toBe('server@example.com');
    expect(rollback.first_name).toBe('OldFirst');
    expect(rollback.last_name).toBe('OldLast');
    expect(rollback.school).toBe('OldSchool');
    expect(rollback.external_school_affiliation).toBe('OldExternal');
  });

  it('admin: omitted fields are preserved — update payload only contains provided keys', async () => {
    // F1: body with only email; first_name/last_name/external_school_affiliation/school
    // must NOT appear in the profiles update payload (so they cannot be nulled).
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: {
                email: 'server@example.com',
                first_name: 'KeepFirst',
                last_name: 'KeepLast',
                school: 'KeepSchool',
                external_school_affiliation: 'KeepExternal',
              },
              error: null,
            },
            { data: null, error: null },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, email: 'new@example.com' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    const payload = profileCalls[1].updates[0] as any;
    expect(payload.email).toBe('new@example.com');
    expect('first_name' in payload).toBe(false);
    expect('last_name' in payload).toBe(false);
    expect('school' in payload).toBe(false);
    expect('external_school_affiliation' in payload).toBe(false);
  });

  it("admin: explicit '' nulls the field (and only that field)", async () => {
    // F1: explicit empty string is an intentional clear, distinct from omission.
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
      body: { userId: TARGET_USER_ID, first_name: '' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    const payload = profileCalls[0].updates[0] as any;
    expect(payload.first_name).toBeNull();
    expect('last_name' in payload).toBe(false);
    expect('email' in payload).toBe(false);
    expect('external_school_affiliation' in payload).toBe(false);
    expect('school' in payload).toBe(false);
  });

  it('admin: rollback on auth-update failure restores ONLY fields the forward path mutated', async () => {
    // F1 follow-up: rollback must mirror updateData. If the body only set email,
    // first_name/last_name/school/external_school_affiliation must not appear in
    // the rollback payload — even though previousProfile captured them.
    setupAdmin();
    const tracker = makeTracker();
    const adminClient = buildAdminClient(
      {
        profiles: [
          {
            data: {
              email: 'server@example.com',
              first_name: 'OldFirst',
              last_name: 'OldLast',
              school: 'OldSchool',
              external_school_affiliation: 'OldExternal',
            },
            error: null,
          },
          { data: null, error: null }, // forward update
          { data: null, error: null }, // rollback update
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
      body: { userId: TARGET_USER_ID, email: 'new@example.com' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(3);
    const rollback = profileCalls[2].updates[0] as any;
    expect(rollback.email).toBe('server@example.com');
    expect('first_name' in rollback).toBe(false);
    expect('last_name' in rollback).toBe(false);
    expect('school' in rollback).toBe(false);
    expect('external_school_affiliation' in rollback).toBe(false);
  });

  it("admin: email: '' returns 400 and performs no profile or auth update", async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({}, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ email: '' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Email no puede estar vacío' });
    expect(tracker.fromCalls).toHaveLength(0);
    expect(tracker.authUpdates).toHaveLength(0);
  });

  it("admin: email: '   ' (whitespace) returns 400", async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({}, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ email: '   ' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Email no puede estar vacío' });
    expect(tracker.fromCalls).toHaveLength(0);
    expect(tracker.authUpdates).toHaveLength(0);
  });

  it("admin: email: 'not-an-email' returns 400 Email inválido", async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({}, tracker),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ email: 'not-an-email' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Email inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
    expect(tracker.authUpdates).toHaveLength(0);
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

  it('rate limiter: factory wired with auth tier + named key, middleware invoked per request', async () => {
    // Module-load-time wiring: the handler must construct its limiter with
    // RATE_LIMITS.auth and a distinct name so admin-update-user shares no
    // bucket with admin-reset-password.
    expect(rateLimitState.configCalls.length).toBeGreaterThan(0);
    expect(rateLimitState.configCalls[0]).toEqual([
      RATE_LIMITS.auth,
      'admin-update-user',
    ]);

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
      body: baseBody(),
    });
    await handler(req as never, res as never);

    expect(mockRateLimitCheck).toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
  });

  it('admin: email change writes both update_user and email_change audit rows with from/to', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: {
                email: 'old@example.com',
                first_name: 'Old',
                last_name: 'User',
                school: null,
                external_school_affiliation: null,
              },
              error: null,
            },
            { data: null, error: null },
          ],
          audit_logs: [
            { data: null, error: null },
            { data: null, error: null },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, email: '  new@example.com  ' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(2);

    const first = auditCalls[0].inserts[0] as any;
    expect(first.action).toBe('update_user');
    expect(first.record_id).toBe(TARGET_USER_ID);

    const second = auditCalls[1].inserts[0] as any;
    expect(second.action).toBe('email_change');
    expect(second.table_name).toBe('profiles');
    expect(second.record_id).toBe(TARGET_USER_ID);
    expect(second.user_id).toBe(ADMIN_ID);
    expect(second.details).toMatchObject({
      requester_role: 'admin',
      requester_user_id: ADMIN_ID,
      from: 'old@example.com',
      to: 'new@example.com',
    });
    expect(typeof second.details.timestamp).toBe('string');
  });

  it('admin: unchanged email (post-normalization) writes only update_user, no email_change', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: {
                email: 'same@example.com',
                first_name: 'Same',
                last_name: 'User',
                school: null,
                external_school_affiliation: null,
              },
              error: null,
            },
            { data: null, error: null },
          ],
          audit_logs: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      // Whitespace around an otherwise identical address must still count as
      // unchanged once trimmed — proves normalization runs before the diff.
      body: { userId: TARGET_USER_ID, email: '  same@example.com  ' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(1);
    expect((auditCalls[0].inserts[0] as any).action).toBe('update_user');
  });

  it('update-user: email_change audit insert failure is logged but does not fail the request', async () => {
    // F2: audit_logs insert failures must not roll back a committed user
    // update, but they MUST be surfaced via console.error so an operator can
    // reconcile manually. Supabase inserts may return `{ error }` instead of
    // throwing — this covers the returned-error path for the email_change row.
    setupAdmin();
    const tracker = makeTracker();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: {
                email: 'old@example.com',
                first_name: 'Old',
                last_name: 'User',
                school: null,
                external_school_affiliation: null,
              },
              error: null,
            },
            { data: null, error: null }, // forward profile update
          ],
          audit_logs: [
            { data: null, error: null }, // update_user audit succeeds
            { data: null, error: { message: 'audit insert failed' } }, // email_change audit fails
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: { userId: TARGET_USER_ID, email: 'new@example.com' },
    });
    await handler(req as never, res as never);

    // Request still succeeds — user update already committed upstream.
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      success: true,
      message: 'Usuario actualizado exitosamente',
    });

    // Both audit attempts happened.
    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(2);

    // The email_change failure was logged with the expected label and
    // reconciliation context (action, record_id, requester, from/to, error).
    const matching = consoleError.mock.calls.find(
      ([label, ctx]) =>
        label === 'audit_log_insert_failed' &&
        (ctx as any)?.action === 'email_change',
    );
    expect(matching).toBeDefined();
    const ctx = matching![1] as any;
    expect(ctx).toMatchObject({
      action: 'email_change',
      record_id: TARGET_USER_ID,
      requester_user_id: ADMIN_ID,
      requester_role: 'admin',
      from: 'old@example.com',
      to: 'new@example.com',
      error: { message: 'audit insert failed' },
    });

    consoleError.mockRestore();
  });

  it('ED: email change writes update_user + email_change audit rows', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: {
                school_id: ED_SCHOOL_ID,
                email: 'ed-old@example.com',
                first_name: 'F',
                last_name: 'L',
                school: null,
                external_school_affiliation: null,
              },
              error: null,
            },
            { data: null, error: null },
          ],
          user_roles: [{ data: [], error: null }],
          audit_logs: [
            { data: null, error: null },
            { data: null, error: null },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = createMocks({
      method: 'POST',
      body: baseBody({ email: 'ed-new@example.com' }),
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const auditCalls = tracker.fromCalls.filter((c) => c.table === 'audit_logs');
    expect(auditCalls).toHaveLength(2);
    const second = auditCalls[1].inserts[0] as any;
    expect(second.action).toBe('email_change');
    expect(second.record_id).toBe(TARGET_USER_ID);
    expect(second.user_id).toBe(ED_ID);
    expect(second.details).toMatchObject({
      requester_role: 'equipo_directivo',
      requester_user_id: ED_ID,
      from: 'ed-old@example.com',
      to: 'ed-new@example.com',
    });
  });
});
