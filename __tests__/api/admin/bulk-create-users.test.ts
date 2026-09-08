// @vitest-environment node
/**
 * S10, S11, S13 — the bulk user importer.
 *
 * Three defects that compounded into one:
 *
 *   S13  `utils/bulkUserParser` filled a missing password with
 *        `Math.random().toString(36).slice(-8)`. Base-36 emits lowercase letters
 *        and digits only, so the generated value could NEVER contain an
 *        uppercase character and therefore ALWAYS failed the policy check.
 *   S11  …so the API's fallback fired for every such row, substituting one
 *        hardcoded constant, committed in the repository, as the initial
 *        password for the entire import. The UI additionally offered "usar la
 *        misma contraseña para todos", checked by default.
 *   S10  …and the resulting plaintext passwords were stashed in a module-level
 *        `Map` for a second request to fetch by session id. On a serverless
 *        platform that request routinely lands on a different instance, so the
 *        credentials were simply lost — and when it did not, any admin who
 *        learned a batch id could fetch another admin's credentials.
 *
 * The parser tests live alongside because the batch behaviour cannot be
 * asserted without them: "fail the batch up front" is a property of the two
 * together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { parseBulkUserData } from '../../../utils/bulkUserParser';
import { validatePasswordPolicy } from '../../../lib/auth/password-policy';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const NEW_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCHOOL_ID = 42;

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import handler from '../../../pages/api/admin/bulk-create-users';

interface FromCall {
  table: string;
  inserts: unknown[];
  updates: unknown[];
  deletes: number;
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
  createdPasswords: string[];
  createdEmails: string[];
  deletedAuthIds: string[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], createdPasswords: [], createdEmails: [], deletedAuthIds: [] };
}

/**
 * A Supabase double good enough for the whole import path. Every table read
 * resolves to a benign value; the interesting assertions are on what is written
 * and what `auth.admin.createUser` is handed. B2a r3 adds targeted failure
 * injection (role insert, cleanup deletes) so the 23514 fail-closed path and
 * its cleanup VERIFICATION are drivable.
 */
function buildClient(
  tracker: Tracker,
  opts: {
    adminRole?: boolean;
    createUserError?: { message: string } | null;
    auditError?: { message: string } | null;
    /** Injected as the resolution of the user_roles INSERT chain only. */
    roleInsertError?: { code?: string; message: string } | null;
    /** Injected as the resolution of a profiles DELETE chain (cleanup). */
    profileDeleteError?: { message: string } | null;
    /** Returned by auth.admin.deleteUser (cleanup). */
    authDeleteError?: { message: string } | null;
  } = {}
) {
  const adminRole = opts.adminRole ?? true;
  let createdCount = 0;

  const makeChain = (table: string, resolved: { data: unknown; error: unknown }) => {
    const call: FromCall = { table, inserts: [], updates: [], deletes: 0, eqs: [] };
    tracker.fromCalls.push(call);
    // insert/delete swap the chain's resolution so injected failures land on
    // exactly the operation under test, never on the reads sharing the table.
    let currentResolved = resolved;
    const handlerObj: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(currentResolved);
        }
        if (prop === 'insert') {
          return vi.fn((vals: unknown) => {
            call.inserts.push(vals);
            if (table === 'user_roles' && opts.roleInsertError) {
              currentResolved = { data: null, error: opts.roleInsertError };
            }
            return new Proxy({}, handlerObj);
          });
        }
        if (prop === 'update') {
          return vi.fn((vals: unknown) => {
            call.updates.push(vals);
            return new Proxy({}, handlerObj);
          });
        }
        if (prop === 'delete') {
          return vi.fn(() => {
            call.deletes += 1;
            currentResolved =
              table === 'profiles' && opts.profileDeleteError
                ? { data: null, error: opts.profileDeleteError }
                : { data: null, error: null };
            return new Proxy({}, handlerObj);
          });
        }
        if (prop === 'eq') {
          return vi.fn((col: string, val: unknown) => {
            call.eqs.push({ col, val });
            return new Proxy({}, handlerObj);
          });
        }
        return vi.fn(() => new Proxy({}, handlerObj));
      },
    };
    return new Proxy({}, handlerObj);
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: ADMIN_ID } }, error: null })),
      admin: {
        createUser: vi.fn(async (params: { email: string; password: string }) => {
          tracker.createdEmails.push(params.email);
          tracker.createdPasswords.push(params.password);
          if (opts.createUserError) {
            return { data: null, error: opts.createUserError };
          }
          createdCount += 1;
          return {
            data: { user: { id: `${NEW_USER_ID.slice(0, -1)}${createdCount}` } },
            error: null,
          };
        }),
        deleteUser: vi.fn(async (id: string) => {
          tracker.deletedAuthIds.push(id);
          if (opts.authDeleteError) {
            return { data: null, error: opts.authDeleteError };
          }
          return { error: null };
        }),
      },
    },
    rpc: vi.fn(async () => ({ error: null })),
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        // The admin authorization probe wants a non-empty array.
        return makeChain(table, { data: adminRole ? [{ role_type: 'admin' }] : [], error: null });
      }
      if (table === 'schools') {
        return makeChain(table, { data: { id: SCHOOL_ID, name: 'Colegio Sintetico' }, error: null });
      }
      if (table === 'security_audit_events') {
        return makeChain(table, { data: null, error: opts.auditError ?? null });
      }
      // profiles: the "does a profile already exist" probe answers null.
      return makeChain(table, { data: null, error: null });
    }),
  };
}

function csvFor(emails: string[], withPassword?: string) {
  const header = withPassword === undefined
    ? 'email,firstName,lastName,role'
    : 'email,firstName,lastName,role,password';
  const rows = emails.map((email, i) =>
    withPassword === undefined
      ? `${email},Nombre${i},Apellido${i},docente`
      : `${email},Nombre${i},Apellido${i},docente,${withPassword}`
  );
  return [header, ...rows].join('\n');
}

function post(body: Record<string, unknown>) {
  return createMocks({
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-token' },
    body,
  });
}

const BASE_OPTIONS = {
  validateRut: false,
  organizationalScope: { globalSchoolId: SCHOOL_ID },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// S13 — the parser
// ---------------------------------------------------------------------------

describe('S13 — the parser no longer mints credentials', () => {
  it('leaves the password empty when the CSV does not supply one', () => {
    const result = parseBulkUserData(csvFor(['a@example.com']), BASE_OPTIONS);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].password).toBe('');
    expect(result.valid[0].warnings).toContain('Se generará una contraseña segura automáticamente');
  });

  it('never produces the base-36 shape that could not satisfy the policy', () => {
    const result = parseBulkUserData(
      csvFor(Array.from({ length: 50 }, (_, i) => `u${i}@example.com`)),
      BASE_OPTIONS
    );
    for (const row of result.valid) {
      // The old parser filled this with 8 lowercase-and-digit characters.
      expect(row.password).not.toMatch(/^[a-z0-9]{8}$/);
    }
  });

  it('keeps a CSV-supplied password that satisfies the policy', () => {
    const result = parseBulkUserData(csvFor(['a@example.com'], 'Sintetica2026'), BASE_OPTIONS);
    expect(result.valid[0].password).toBe('Sintetica2026');
    expect(result.valid[0].errors ?? []).toEqual([]);
  });

  it('rejects a CSV-supplied password that does not, at PREVIEW time', () => {
    // The operator sees this before anything is created, rather than as N
    // identical failures halfway through an import.
    const result = parseBulkUserData(csvFor(['a@example.com'], 'corta'), BASE_OPTIONS);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].errors?.[0]).toMatch(/^La contraseña/);
  });
});

// ---------------------------------------------------------------------------
// S13 / S11 — the batch
// ---------------------------------------------------------------------------

describe('S13 — generated passwords satisfy the policy and are unique', () => {
  it('every created account gets a distinct, policy-compliant password', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const emails = Array.from({ length: 25 }, (_, i) => `u${i}@example.com`);
    const { req, res } = post({ csvData: csvFor(emails), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(tracker.createdPasswords).toHaveLength(25);
    expect(new Set(tracker.createdPasswords).size).toBe(25);
    for (const password of tracker.createdPasswords) {
      expect(validatePasswordPolicy(password)).toEqual({ valid: true, errors: [] });
    }
  }, 60_000);

  it('uses the CSV password when one is supplied', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({
      csvData: csvFor(['a@example.com'], 'Sintetica2026'),
      options: BASE_OPTIONS,
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(tracker.createdPasswords).toEqual(['Sintetica2026']);
  });

  it('a row with an invalid CSV password is rejected at parse time, not mid-import', async () => {
    // Row-level, like every other validation failure (bad e-mail, bad role):
    // the operator sees it in the preview and the row is simply skipped. What
    // must NOT happen — and used to, for every generated row — is the failure
    // surfacing one account at a time once creation is already under way.
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const csv = [
      'email,firstName,lastName,role,password',
      'good@example.com,Uno,Uno,docente,Sintetica2026',
      'bad@example.com,Dos,Dos,docente,corta',
    ].join('\n');

    const { req, res } = post({ csvData: csv, options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(tracker.createdEmails).toEqual(['good@example.com']);

    const failed = res._getJSONData().results.find(
      (r: { email: string }) => r.email === 'bad@example.com'
    );
    expect(failed.success).toBe(false);
    expect(failed.error).toMatch(/^La contraseña/);
  });

  it('if any resolved password is non-compliant, the batch is refused and NOBODY is created', async () => {
    // The pre-flight is the guarantee that once creation starts, no row can
    // fail on password grounds — which is what stops a half-created batch. It
    // is unreachable through the parser (which validates first), so this drives
    // it directly: a regression upstream must fail the batch, not half of it.
    vi.resetModules();
    vi.doMock('../../../utils/bulkUserParser', () => ({
      parseBulkUserData: () => ({
        valid: [
          { email: 'a@example.com', firstName: 'A', lastName: 'A', role: 'docente', rut: '', password: 'Sintetica2026', rowNumber: 2, school_id: SCHOOL_ID },
          { email: 'b@example.com', firstName: 'B', lastName: 'B', role: 'docente', rut: '', password: 'corta', rowNumber: 3, school_id: SCHOOL_ID },
        ],
        invalid: [],
        warnings: [],
        summary: { total: 2, valid: 2, invalid: 0, hasWarnings: 0 },
      }),
      generateSampleCSV: () => '',
    }));

    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));
    const isolated = (await import('../../../pages/api/admin/bulk-create-users')).default;

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await isolated(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('No se creó ningún usuario');
    // Not even the compliant row was created.
    expect(tracker.createdEmails).toEqual([]);

    vi.doUnmock('../../../utils/bulkUserParser');
    vi.resetModules();
  });
});

describe('S11 — no shared or fallback password', () => {
  it('rejects a request carrying globalPassword, even from an older client', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({
      csvData: csvFor(['a@example.com']),
      options: { ...BASE_OPTIONS, globalPassword: 'Sintetica2026' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('contraseña compartida');
    expect(tracker.createdEmails).toEqual([]);
  });

  it('rejects it even when the value is empty — the OPTION is what is refused', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({
      csvData: csvFor(['a@example.com']),
      options: { ...BASE_OPTIONS, globalPassword: '' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
  });

  it('two accounts in one import never share a password', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({
      csvData: csvFor(['a@example.com', 'b@example.com']),
      options: BASE_OPTIONS,
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(tracker.createdPasswords[0]).not.toBe(tracker.createdPasswords[1]);
  });

  it('no created account receives a repeated constant across separate imports', async () => {
    const seen = new Set<string>();
    for (let run = 0; run < 3; run += 1) {
      const tracker = makeTracker();
      mockCreateClient.mockReturnValue(buildClient(tracker));
      const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
      await handler(req as never, res as never);
      expect(res._getStatusCode()).toBe(200);
      seen.add(tracker.createdPasswords[0]);
    }
    expect(seen.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// S10 — credential delivery
// ---------------------------------------------------------------------------

describe('S10 — one-time credentials, delivered inline', () => {
  it('returns the credentials in the creating response', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({
      csvData: csvFor(['a@example.com', 'b@example.com']),
      options: BASE_OPTIONS,
    });
    await handler(req as never, res as never);

    const body = res._getJSONData();
    expect(body.credentials).toHaveLength(2);
    expect(body.credentials.map((c: { email: string }) => c.email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    for (const credential of body.credentials) {
      expect(validatePasswordPolicy(credential.password).valid).toBe(true);
    }
  });

  it('returns no sessionId — there is no second request to make', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getJSONData()).not.toHaveProperty('sessionId');
  });

  it('omits credentials entirely when nothing was created', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(
      buildClient(tracker, { createUserError: { message: 'already registered' } })
    );

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getJSONData().credentials).toBeUndefined();
    expect(res._getJSONData().summary.succeeded).toBe(0);
  });

  it('never writes a password into any table', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    const issued = tracker.createdPasswords[0];
    expect(issued).toBeTruthy();
    for (const call of tracker.fromCalls) {
      for (const payload of [...call.inserts, ...call.updates]) {
        expect(JSON.stringify(payload ?? null)).not.toContain(issued);
      }
    }
  });

  it('per-user rows are flagged for a forced change on first sign-in', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    const profileInsert = tracker.fromCalls
      .filter((c) => c.table === 'profiles')
      .flatMap((c) => c.inserts)
      .find(Boolean) as Record<string, unknown> | undefined;
    expect(profileInsert).toMatchObject({ must_change_password: true });
  });
});

// ---------------------------------------------------------------------------
// S3 — audit
// ---------------------------------------------------------------------------

describe('S3 — the import is audited', () => {
  it('writes a per-user row and one delivery row', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({
      csvData: csvFor(['a@example.com', 'b@example.com']),
      options: BASE_OPTIONS,
    });
    await handler(req as never, res as never);

    const rows = tracker.fromCalls
      .filter((c) => c.table === 'security_audit_events')
      .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;

    expect(rows.filter((r) => r.action === 'user_created_bulk')).toHaveLength(2);
    const delivery = rows.find((r) => r.action === 'bulk_credentials_delivered')!;
    expect(delivery).toMatchObject({
      outcome: 'success',
      actor_user_id: ADMIN_ID,
    });
    expect((delivery.metadata as Record<string, unknown>).delivered_count).toBe(2);
  });

  it('the audit carries no e-mail address and no password', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    const serialised = JSON.stringify(
      tracker.fromCalls.filter((c) => c.table === 'security_audit_events').map((c) => c.inserts)
    );
    expect(serialised).not.toContain('a@example.com');
    expect(serialised).not.toContain(tracker.createdPasswords[0]);
  });

  it('a failed audit does not withhold the credentials', async () => {
    // Fail-open, deliberately: the accounts already exist, so refusing the
    // response would strand them AND destroy the only copy of their passwords.
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(
      buildClient(tracker, { auditError: { message: 'audit insert failed' } })
    );

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().audited).toBe(false);
    expect(res._getJSONData().credentials).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// B2a r3 — the supervisor channel boundary, both entry forms + defense in depth
// ---------------------------------------------------------------------------

const CHANNEL_ERROR = 'El rol Supervisor de Red debe asignarse desde Gestión de Redes.';

describe('B2a r3 — supervisor_de_red channel boundary', () => {
  it('parser: an explicit CSV supervisor_de_red role is refused with the channel guidance', () => {
    // Before r3 this row was already invalid — supervisor_de_red is not in
    // the parser's validRoles list — but with the generic "Rol '…' inválido"
    // copy. The role IS valid on the platform; the CHANNEL is wrong, so the
    // administrator now gets the actionable guidance instead.
    const csv = [
      'email,firstName,lastName,role',
      'sup@example.com,Ana,Prueba,supervisor_de_red',
    ].join('\n');
    const result = parseBulkUserData(csv, BASE_OPTIONS);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].errors).toEqual([CHANNEL_ERROR]);
  });

  it('parser: options.defaultRole=supervisor_de_red is refused per empty-role row (the previously unvalidated form)', () => {
    // THE hole this round closes at the parser: defaultRole was applied to
    // every row with an empty role column and never validated against
    // anything, so it sailed into createUser and failed only at the database
    // — AFTER the account existed.
    const csv = [
      'email,firstName,lastName,role',
      'a@example.com,Ana,Uno,',
      'b@example.com,Berta,Dos,docente',
    ].join('\n');
    const result = parseBulkUserData(csv, { ...BASE_OPTIONS, defaultRole: 'supervisor_de_red' });
    expect(result.valid.map((u) => u.email)).toEqual(['b@example.com']);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].email).toBe('a@example.com');
    expect(result.invalid[0].errors).toEqual([CHANNEL_ERROR]);
  });

  it('parser: the defaultRole check is case- and whitespace-insensitive', () => {
    // Explicit CSV values are lowercased by the parser, but defaultRole is
    // passed through verbatim — the boundary must not be smuggled past by
    // casing a direct API request differently.
    const csv = ['email,firstName,lastName,role', 'a@example.com,Ana,Uno,'].join('\n');
    const result = parseBulkUserData(csv, { ...BASE_OPTIONS, defaultRole: ' Supervisor_De_Red ' });
    expect(result.valid).toHaveLength(0);
    expect(result.invalid[0].errors).toEqual([CHANNEL_ERROR]);
  });

  it('API: an explicit CSV supervisor row creates NOTHING — no auth user, no table write, no audit', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const csv = [
      'email,firstName,lastName,role',
      'sup@example.com,Ana,Prueba,supervisor_de_red',
    ].join('\n');
    const { req, res } = post({ csvData: csv, options: BASE_OPTIONS });
    await handler(req as never, res as never);

    // Every row is invalid, so the import refuses up front.
    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.success).toBe(false);
    expect(body.results[0]).toMatchObject({
      email: 'sup@example.com',
      success: false,
      error: CHANNEL_ERROR,
    });
    expect(body.credentials).toBeUndefined();

    expect(tracker.createdEmails).toEqual([]);
    expect(tracker.deletedAuthIds).toEqual([]);
    // Zero writes to ANY table — profiles, user_roles and the audit trail
    // included. (The only from() activity is the admin authorization read.)
    expect(
      tracker.fromCalls.filter((c) => c.inserts.length > 0 || c.updates.length > 0)
    ).toEqual([]);
  });

  it('API: options.defaultRole=supervisor_de_red with an empty CSV role creates NOTHING', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const csv = ['email,firstName,lastName,role', 'a@example.com,Ana,Uno,'].join('\n');
    const { req, res } = post({
      csvData: csv,
      options: { ...BASE_OPTIONS, defaultRole: 'supervisor_de_red' },
    });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(400);
    const body = res._getJSONData();
    expect(body.success).toBe(false);
    expect(body.results[0]).toMatchObject({
      email: 'a@example.com',
      success: false,
      error: CHANNEL_ERROR,
    });
    expect(body.credentials).toBeUndefined();

    expect(tracker.createdEmails).toEqual([]);
    expect(
      tracker.fromCalls.filter((c) => c.inserts.length > 0 || c.updates.length > 0)
    ).toEqual([]);
  });

  it('API: a supervisor row fails alone — the rest of its batch still imports', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));

    const csv = [
      'email,firstName,lastName,role',
      'ok@example.com,Berta,Dos,docente',
      'sup@example.com,Ana,Prueba,supervisor_de_red',
    ].join('\n');
    const { req, res } = post({ csvData: csv, options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.success).toBe(false); // the batch honestly reports the failed row
    expect(body.summary).toMatchObject({ succeeded: 1, failed: 1 });

    expect(tracker.createdEmails).toEqual(['ok@example.com']);
    expect(body.credentials).toHaveLength(1);
    expect(body.credentials[0].email).toBe('ok@example.com');

    const supervisorRow = body.results.find(
      (r: { email: string }) => r.email === 'sup@example.com'
    );
    expect(supervisorRow).toMatchObject({ success: false, error: CHANNEL_ERROR });

    // Exactly one success audit — the docente's. The refused row wrote none.
    const auditRows = tracker.fromCalls
      .filter((c) => c.table === 'security_audit_events')
      .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;
    expect(auditRows.filter((r) => r.action === 'user_created_bulk')).toHaveLength(1);
  });

  it('defense in depth: a parser regression cannot provision supervisor_de_red', async () => {
    // Bypasses the parser entirely (the boundary's first layer) to prove the
    // per-user createUser function refuses the role BEFORE the auth account
    // exists — a mapping or parsing regression must not reopen the channel.
    vi.resetModules();
    vi.doMock('../../../utils/bulkUserParser', () => ({
      parseBulkUserData: () => ({
        valid: [
          {
            email: 'smuggled@example.com',
            firstName: 'S',
            lastName: 'S',
            role: 'supervisor_de_red',
            rut: '',
            password: 'Sintetica2026',
            rowNumber: 2,
            school_id: SCHOOL_ID,
          },
        ],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 },
      }),
      generateSampleCSV: () => '',
    }));

    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker));
    const isolated = (await import('../../../pages/api/admin/bulk-create-users')).default;

    const { req, res } = post({ csvData: 'email\nsmuggled@example.com', options: BASE_OPTIONS });
    await isolated(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.success).toBe(false);
    expect(body.results[0]).toMatchObject({
      email: 'smuggled@example.com',
      success: false,
      error: CHANNEL_ERROR,
    });
    expect(body.credentials).toBeUndefined();

    // Refused BEFORE provisioning: no auth account, no table write, no audit
    // beyond the batch-level delivery row (which reports zero delivered).
    expect(tracker.createdEmails).toEqual([]);
    const writes = tracker.fromCalls.filter(
      (c) => (c.inserts.length > 0 || c.updates.length > 0) && c.table !== 'security_audit_events'
    );
    expect(writes).toEqual([]);
    const auditRows = tracker.fromCalls
      .filter((c) => c.table === 'security_audit_events')
      .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;
    expect(auditRows.filter((r) => r.action === 'user_created_bulk')).toHaveLength(0);

    vi.doUnmock('../../../utils/bulkUserParser');
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// B2a r3 — the 23514 database backstop fails CLOSED
// ---------------------------------------------------------------------------

describe('B2a r3 — a 23514 role-insert refusal fails closed', () => {
  // Drives createUser past both boundary layers with a role the database then
  // refuses. Only reachable through a mocked parser and a mocked insert error
  // — which is the point: the backstop must hold even for writer shapes that
  // do not exist yet (any future CHECK on user_roles lands here too).
  function mockParserWithOneDocenteRow() {
    vi.doMock('../../../utils/bulkUserParser', () => ({
      parseBulkUserData: () => ({
        valid: [
          {
            email: 'row@example.com',
            firstName: 'R',
            lastName: 'R',
            role: 'docente',
            rut: '',
            password: 'Sintetica2026',
            rowNumber: 2,
            school_id: SCHOOL_ID,
          },
        ],
        invalid: [],
        warnings: [],
        summary: { total: 1, valid: 1, invalid: 0, hasWarnings: 0 },
      }),
      generateSampleCSV: () => '',
    }));
  }

  const CHECK_VIOLATION = {
    code: '23514',
    message:
      'new row for relation "user_roles" violates check constraint "chk_user_roles_active_supervisor_needs_red"',
  };

  it('never success, never credentials, never a success audit — and the account is removed, verified', async () => {
    vi.resetModules();
    mockParserWithOneDocenteRow();

    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker, { roleInsertError: CHECK_VIOLATION }));
    const isolated = (await import('../../../pages/api/admin/bulk-create-users')).default;

    const { req, res } = post({ csvData: 'email\nrow@example.com', options: BASE_OPTIONS });
    await isolated(req as never, res as never);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    // The pre-r3 handler answered success:true here, delivered the password,
    // and audited user_created_bulk/success — for an account with NO role.
    expect(body.success).toBe(false);
    expect(body.summary).toMatchObject({ succeeded: 0, failed: 1 });
    expect(body.results[0]).toMatchObject({ email: 'row@example.com', success: false });
    expect(body.results[0].error).toBe('La base de datos rechazó el rol solicitado. No se creó la cuenta.');
    expect(body.credentials).toBeUndefined();

    // No user_created_bulk row of ANY outcome; the batch-level delivery row
    // honestly reports a partial failure with zero delivered.
    const auditRows = tracker.fromCalls
      .filter((c) => c.table === 'security_audit_events')
      .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;
    expect(auditRows.filter((r) => r.action === 'user_created_bulk')).toHaveLength(0);
    const delivery = auditRows.find((r) => r.action === 'bulk_credentials_delivered')!;
    expect(delivery.outcome).toBe('partial_failure');
    expect((delivery.metadata as Record<string, unknown>).delivered_count).toBe(0);

    // Cleanup ran against exactly the account this row created — role rows
    // (defense in depth), the profile (no FK cascade exists), the auth user.
    const createdId = `${NEW_USER_ID.slice(0, -1)}1`;
    const roleDeletes = tracker.fromCalls.filter(
      (c) => c.table === 'user_roles' && c.deletes > 0
    );
    expect(roleDeletes).toHaveLength(1);
    expect(roleDeletes[0].eqs).toContainEqual({ col: 'user_id', val: createdId });
    const profileDeletes = tracker.fromCalls.filter(
      (c) => c.table === 'profiles' && c.deletes > 0
    );
    expect(profileDeletes).toHaveLength(1);
    expect(profileDeletes[0].eqs).toContainEqual({ col: 'id', val: createdId });
    expect(tracker.deletedAuthIds).toEqual([createdId]);

    vi.doUnmock('../../../utils/bulkUserParser');
    vi.resetModules();
  });

  it('a cleanup failure is verified and surfaced — never assumed away', async () => {
    vi.resetModules();
    mockParserWithOneDocenteRow();

    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(
      buildClient(tracker, {
        roleInsertError: CHECK_VIOLATION,
        authDeleteError: { message: 'auth deletion refused' },
      })
    );
    const isolated = (await import('../../../pages/api/admin/bulk-create-users')).default;

    const { req, res } = post({ csvData: 'email\nrow@example.com', options: BASE_OPTIONS });
    await isolated(req as never, res as never);

    const body = res._getJSONData();
    expect(body.success).toBe(false);
    expect(body.results[0].success).toBe(false);
    // The row's error says the partial account could NOT be fully removed —
    // the operator is told, instead of a silent roleless account surviving a
    // "successful" import.
    expect(body.results[0].error).toContain('no pudo eliminarse por completo');
    expect(body.credentials).toBeUndefined();

    // The residue is logged for the operator, naming the failing layer.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('cleanup after 23514 left residue'),
      expect.arrayContaining([expect.stringContaining('auth: auth deletion refused')])
    );

    vi.doUnmock('../../../utils/bulkUserParser');
    vi.resetModules();
  });

  it('other role-insert errors keep their pre-existing non-critical behavior (pinned, deliberately out of r3 scope)', async () => {
    vi.resetModules();
    mockParserWithOneDocenteRow();

    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(
      buildClient(tracker, { roleInsertError: { code: 'XX000', message: 'synthetic transient error' } })
    );
    const isolated = (await import('../../../pages/api/admin/bulk-create-users')).default;

    const { req, res } = post({ csvData: 'email\nrow@example.com', options: BASE_OPTIONS });
    await isolated(req as never, res as never);

    // Unchanged: a non-CHECK role error is logged and the row continues as a
    // success. r3 narrows ONLY the 23514 classification; changing this branch
    // is a separate decision.
    const body = res._getJSONData();
    expect(body.success).toBe(true);
    expect(body.summary).toMatchObject({ succeeded: 1, failed: 0 });
    expect(tracker.deletedAuthIds).toEqual([]);

    vi.doUnmock('../../../utils/bulkUserParser');
    vi.resetModules();
  });
});

// ---------------------------------------------------------------------------
// Authorization (unchanged behaviour, pinned)
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('401 without an Authorization header', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { csvData: csvFor(['a@example.com']) } });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(401);
  });

  it('403 for a non-admin', async () => {
    const tracker = makeTracker();
    mockCreateClient.mockReturnValue(buildClient(tracker, { adminRole: false }));

    const { req, res } = post({ csvData: csvFor(['a@example.com']), options: BASE_OPTIONS });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(403);
    expect(tracker.createdEmails).toEqual([]);
  });

  it('405 for a non-POST method', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });
});
