// @vitest-environment node
/**
 * S2 — the administrative password reset.
 *
 * Three defects, and this suite is written around the first one because it is
 * the one that made every reset in production ineffective:
 *
 *   1. The handler wrote `profiles.password_change_required`. That column does
 *      not exist; the platform reads `must_change_password`. Supabase answers an
 *      UPDATE naming an unknown column with an error, the handler logged it and
 *      returned success — so the temporary password an administrator issued
 *      simply became the account's password, with nothing forcing a change.
 *   2. `temporaryPassword` had no server-side policy check at all.
 *   3. A failed flag write still produced "Password reset successfully".
 *
 * Ordering is now load-bearing: the flag is written BEFORE the password, so the
 * two failure points are `nothing changed` and `flagged but password unchanged`
 * — never `live temporary password that nobody must change`. Both are covered.
 *
 * The prior version of this suite asserted on inserts into `audit_logs`, a table
 * that does not exist, and on a `password_change_required` update that could
 * never apply. Those assertions passed against a stubbed client while the real
 * endpoint did neither thing — which is why the row shape is now asserted by
 * column against `security_audit_events`.
 */
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

/** Satisfies the shared policy: 8+, upper, lower, digit. */
const TEMP_PASSWORD = 'Temp-Password-1234';

const AUDIT_TABLE = 'security_audit_events';

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

/**
 * Result tables for a successful reset.
 *
 * `profiles` is now touched TWICE on the happy path for BOTH requester roles —
 * the lookup used to be ED-only, but admin needs it too: to 404 on a missing
 * account, and to learn the prior `must_change_password` value so a failed
 * password write can be undone.
 *
 *   profiles[0]  the lookup
 *   profiles[1]  the must_change_password flag write
 *
 * For ED, `user_roles` also carries the target-role gate (empty array → no
 * global or cross-school role → passes).
 */
function successTables(opts: {
  lookupSchoolId?: number | null;
  previousMustChange?: boolean;
  targetRoles?: Array<{ role_type: string; school_id?: number | null }>;
  isEd?: boolean;
}) {
  const tables: Record<string, TableResult[]> = {
    profiles: [
      {
        data: {
          id: TARGET_USER_ID,
          school_id: opts.lookupSchoolId ?? ED_SCHOOL_ID,
          must_change_password: opts.previousMustChange ?? false,
        },
        error: null,
      },
      { data: null, error: null },
    ],
    [AUDIT_TABLE]: [{ data: null, error: null }],
  };
  if (opts.isEd) {
    tables.user_roles = [{ data: opts.targetRoles ?? [], error: null }];
  }
  return tables;
}

/**
 * Asserts the temporary password never escaped the auth.admin.updateUserById
 * call: it must not appear in audit inserts, profile updates, or the response.
 */
function assertTempPasswordNotLeaked(tracker: Tracker, res?: { _getData: () => string }) {
  const stringify = (v: unknown) => JSON.stringify(v ?? null);
  for (const call of tracker.fromCalls) {
    for (const ins of call.inserts) {
      expect(stringify(ins)).not.toContain(TEMP_PASSWORD);
    }
    for (const upd of call.updates) {
      expect(stringify(upd)).not.toContain(TEMP_PASSWORD);
    }
  }
  if (res) {
    expect(res._getData()).not.toContain(TEMP_PASSWORD);
  }
}

function post(body: Record<string, unknown>) {
  return createMocks({ method: 'POST', body });
}

describe('admin/reset-password — the forced-change flag (S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('admin: writes must_change_password, NOT the non-existent password_change_required', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    const flagUpdate = profileCalls[1].updates[0] as Record<string, unknown>;

    // The whole defect, in one assertion.
    expect(flagUpdate).toMatchObject({ must_change_password: true });
    expect(flagUpdate).not.toHaveProperty('password_change_required');
  });

  it('admin: sets the flag BEFORE changing the password', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    // The flag write is recorded before updateUserById runs. Order is the
    // property: the reverse leaves a live temporary password with no
    // requirement to change it if the flag write then fails.
    const flagWriteIndex = tracker.fromCalls.findIndex(
      (c) => c.table === 'profiles' && c.updates.length > 0,
    );
    expect(flagWriteIndex).toBeGreaterThanOrEqual(0);
    expect(tracker.updateUserCalls).toHaveLength(1);
  });

  it('admin: no longer sets password_change_required in user_metadata either', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    const metadata = tracker.updateUserCalls[0].payload.user_metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('password_change_required');
    // The two keys /change-password actually reads survive.
    expect(metadata).toMatchObject({ password_reset_by_admin: true });
    expect(typeof metadata.password_reset_at).toBe('string');
  });
});

describe('admin/reset-password — server-side password policy (S5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'sintetica2026'],
    ['no lowercase', 'SINTETICA2026'],
    ['no number', 'SinteticaSegura'],
    // The exact shape the reset modal used to accept.
    ['the six-character shape the modal allowed', 'temp01'],
  ])('admin: 400 for a password that %s — nothing is mutated', async (_label, weak) => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: weak });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/^La contraseña/);
    expect(tracker.updateUserCalls).toHaveLength(0);
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('admin: 400 for a non-uuid userId — no query is issued with it', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: 'not-a-uuid', temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({ error: 'userId inválido' });
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('admin: 400 when required fields are missing', async () => {
    setupAdmin();
    mockCreateServiceRoleClient.mockReturnValueOnce(buildAdminClient({}, makeTracker()));

    const { req, res } = post({ userId: TARGET_USER_ID });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('temporaryPassword');
  });
});

describe('admin/reset-password — partial failure never reports success (S2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flag write fails: 500 RESET_NOT_STARTED and the password is never touched', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { id: TARGET_USER_ID, school_id: null, must_change_password: false }, error: null },
            { data: null, error: { message: 'column does not exist' } },
          ],
          [AUDIT_TABLE]: [{ data: null, error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ code: 'RESET_NOT_STARTED' });
    expect(res._getJSONData().error).toContain('NO fue modificada');

    // The clean no-op: the account is exactly as it was.
    expect(tracker.updateUserCalls).toHaveLength(0);

    const audit = tracker.fromCalls.find((c) => c.table === AUDIT_TABLE);
    expect((audit!.inserts[0] as any).outcome).toBe('failure');
    expect((audit!.inserts[0] as any).metadata.stage).toBe('set_flag');
  });

  it('password write fails: 500 RESET_FAILED and the prior flag is restored', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { id: TARGET_USER_ID, school_id: null, must_change_password: false }, error: null },
            { data: null, error: null }, // flag set
            { data: null, error: null }, // flag restored
          ],
          [AUDIT_TABLE]: [{ data: null, error: null }],
        },
        tracker,
        { updateUserError: { message: 'gotrue rejected the password' } },
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ code: 'RESET_FAILED' });
    expect(res._getJSONData().error).toContain('No se modificó nada');

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(3);
    expect(profileCalls[1].updates[0]).toMatchObject({ must_change_password: true });
    expect(profileCalls[2].updates[0]).toMatchObject({ must_change_password: false });

    const audit = tracker.fromCalls.find((c) => c.table === AUDIT_TABLE);
    expect((audit!.inserts[0] as any).outcome).toBe('failure');
    expect((audit!.inserts[0] as any).metadata.flag_restored).toBe(true);
  });

  it('password write fails AND the restore fails: partial_failure, and the message says so', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { id: TARGET_USER_ID, school_id: null, must_change_password: false }, error: null },
            { data: null, error: null }, // flag set
            { data: null, error: { message: 'restore failed' } },
          ],
          [AUDIT_TABLE]: [{ data: null, error: null }],
        },
        tracker,
        { updateUserError: { message: 'gotrue rejected the password' } },
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ code: 'RESET_FAILED' });
    // The honest message for the one state that survives: flagged, old password.
    expect(res._getJSONData().error).toContain('contraseña actual NO cambió');

    const audit = tracker.fromCalls.find((c) => c.table === AUDIT_TABLE);
    expect((audit!.inserts[0] as any).outcome).toBe('partial_failure');
    expect((audit!.inserts[0] as any).metadata.flag_restored).toBe(false);
  });

  it('restores the PRIOR flag value, not a hardcoded false', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            // The target was already flagged before this reset.
            { data: { id: TARGET_USER_ID, school_id: null, must_change_password: true }, error: null },
            { data: null, error: null },
            { data: null, error: null },
          ],
          [AUDIT_TABLE]: [{ data: null, error: null }],
        },
        tracker,
        { updateUserError: { message: 'gotrue rejected the password' } },
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls[2].updates[0]).toMatchObject({ must_change_password: true });
  });

  it('audit failure does NOT fail the reset — fail-open, but reported', async () => {
    setupAdmin();
    const tracker = makeTracker();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            { data: { id: TARGET_USER_ID, school_id: null, must_change_password: false }, error: null },
            { data: null, error: null },
          ],
          [AUDIT_TABLE]: [{ data: null, error: { message: 'audit insert failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    // The password IS changed and the flag IS set, so refusing the response
    // would misinform the administrator. The caller learns about the audit gap
    // from `audited: false` instead.
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().data.audited).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(
      '[security-audit] write failed',
      expect.objectContaining({ action: 'password_reset_admin' }),
    );
    errSpy.mockRestore();
  });
});

describe('admin/reset-password — the success response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a minimal payload, not the whole GoTrue user object', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.data).toMatchObject({
      success: true,
      userId: TARGET_USER_ID,
      mustChangePassword: true,
      audited: true,
    });
    // It used to return `updateData.user`: the entire GoTrue record, including
    // app and user metadata, identities, confirmation timestamps and last
    // sign-in, to a surface that renders a toast.
    expect(body.data).not.toHaveProperty('user');
    expect(res._getData()).not.toContain('user_metadata');
  });

  it('never leaks the temporary password into a write or the response', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    assertTempPasswordNotLeaked(tracker, res as never);
  });

  it('writes the audit row with actor, target and role as columns', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    const audit = tracker.fromCalls.filter((c) => c.table === AUDIT_TABLE);
    expect(audit).toHaveLength(1);
    expect(audit[0].inserts[0]).toMatchObject({
      action: 'password_reset_admin',
      outcome: 'success',
      actor_user_id: ADMIN_ID,
      actor_role: 'admin',
      target_user_id: TARGET_USER_ID,
    });
  });
});

describe('admin/reset-password — authorization and ED scoping (unchanged)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ED: can reset a user in their own school, and the audit records the role', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({ isEd: true, lookupSchoolId: ED_SCHOOL_ID }), tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);

    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(2);
    expect(profileCalls[0].selects).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
    expect(profileCalls[0].eqs).toEqual([{ col: 'id', val: TARGET_USER_ID }]);
    expect(profileCalls[1].updates[0]).toMatchObject({ must_change_password: true });

    const audit = tracker.fromCalls.filter((c) => c.table === AUDIT_TABLE);
    expect(audit[0].inserts[0]).toMatchObject({
      actor_user_id: ED_ID,
      actor_role: 'equipo_directivo',
      target_user_id: TARGET_USER_ID,
      school_id: ED_SCHOOL_ID,
    });
    assertTempPasswordNotLeaked(tracker, res as never);
  });

  it('admin: 404 when the target profile does not exist — nothing is mutated', async () => {
    // New in S2: admin used to skip the lookup entirely, so a reset against a
    // deleted or mistyped account "succeeded" against zero rows.
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [{ data: null, error: null }] }, tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toMatchObject({ error: 'Usuario no encontrado' });
    expect(tracker.updateUserCalls).toHaveLength(0);
  });

  it('admin: 500 when the profile lookup errors — nothing is mutated', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        { profiles: [{ data: null, error: { message: 'lookup failed' } }] },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ error: 'Error verificando usuario' });
    expect(tracker.updateUserCalls).toHaveLength(0);
  });

  it('ED: 403 when the target user is in another school — updateUserById not called', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: { id: TARGET_USER_ID, school_id: OTHER_SCHOOL_ID, must_change_password: false },
              error: null,
            },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'No autorizado para restablecer la contraseña de este usuario',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    const profileCalls = tracker.fromCalls.filter((c) => c.table === 'profiles');
    expect(profileCalls).toHaveLength(1);
    expect(profileCalls[0].updates).toHaveLength(0);
    expect(tracker.fromCalls.filter((c) => c.table === AUDIT_TABLE)).toHaveLength(0);
  });

  it('ED: 404 when the target profile is not found — updateUserById not called', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient({ profiles: [{ data: null, error: null }] }, tracker),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toMatchObject({ error: 'Usuario no encontrado' });
    expect(tracker.updateUserCalls).toHaveLength(0);
  });

  it('ED: 403 when the target holds a global role (admin) — updateUserById not called', async () => {
    // F1 defense-in-depth: profile.school_id matches but the target also holds
    // a global role. The read path filters such users out of listings; this
    // guards the write path so password reset is blocked too.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: { id: TARGET_USER_ID, school_id: ED_SCHOOL_ID, must_change_password: false },
              error: null,
            },
          ],
          user_roles: [{ data: [{ role_type: 'admin' }], error: null }],
        },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(tracker.updateUserCalls).toHaveLength(0);
    expect(tracker.fromCalls.filter((c) => c.table === AUDIT_TABLE)).toHaveLength(0);
  });

  it('ED: 403 when the target holds a school-scoped role in another school', async () => {
    // F1 extension: even if profile.school_id matches edSchoolId, an active
    // school-scoped role row tied to a different school must reject the write.
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: { id: TARGET_USER_ID, school_id: ED_SCHOOL_ID, must_change_password: false },
              error: null,
            },
          ],
          user_roles: [
            { data: [{ role_type: 'docente', school_id: OTHER_SCHOOL_ID }], error: null },
          ],
        },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(tracker.updateUserCalls).toHaveLength(0);
  });

  it('ED: 500 when the user_roles lookup errors — updateUserById not called', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(
        {
          profiles: [
            {
              data: { id: TARGET_USER_ID, school_id: ED_SCHOOL_ID, must_change_password: false },
              error: null,
            },
          ],
          user_roles: [{ data: null, error: { message: 'role lookup failed' } }],
        },
        tracker,
      ),
    );

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ error: 'Error verificando roles del usuario' });
    expect(tracker.updateUserCalls).toHaveLength(0);
  });

  it('ED with schoolId=null from the auth helper: 403 (service client never built)', async () => {
    setupEquipoDirectivo(null);

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'School context missing for equipo_directivo',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('wrong role: 403 (service client never built)', async () => {
    setupWrongRole();

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toMatchObject({
      error: 'Solo administradores o equipo directivo pueden restablecer contraseñas',
    });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('unauthenticated: 401 (service client never built)', async () => {
    setupUnauthenticated();

    const { req, res } = post({ userId: TARGET_USER_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('admin: 400 when resetting their own password — no lookup, no mutation', async () => {
    setupAdmin();
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({}), tracker),
    );

    const { req, res } = post({ userId: ADMIN_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({
      error: 'No puedes restablecer tu propia contraseña — usa el flujo normal de recuperación',
    });
    expect(tracker.updateUserCalls).toHaveLength(0);
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('ED: 400 when resetting their own password — no lookup, no mutation', async () => {
    setupEquipoDirectivo(ED_SCHOOL_ID);
    const tracker = makeTracker();
    mockCreateServiceRoleClient.mockReturnValueOnce(
      buildAdminClient(successTables({ isEd: true }), tracker),
    );

    const { req, res } = post({ userId: ED_ID, temporaryPassword: TEMP_PASSWORD });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(tracker.updateUserCalls).toHaveLength(0);
    expect(tracker.fromCalls).toHaveLength(0);
  });

  it('non-POST: 405', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });
});
