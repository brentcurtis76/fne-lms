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
}

interface Tracker {
  fromCalls: FromCall[];
  createdPasswords: string[];
  createdEmails: string[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], createdPasswords: [], createdEmails: [] };
}

/**
 * A Supabase double good enough for the whole import path. Every table read
 * resolves to a benign value; the interesting assertions are on what is written
 * and what `auth.admin.createUser` is handed.
 */
function buildClient(
  tracker: Tracker,
  opts: {
    adminRole?: boolean;
    createUserError?: { message: string } | null;
    auditError?: { message: string } | null;
  } = {}
) {
  const adminRole = opts.adminRole ?? true;
  let createdCount = 0;

  const makeChain = (table: string, resolved: { data: unknown; error: unknown }) => {
    const call: FromCall = { table, inserts: [], updates: [] };
    tracker.fromCalls.push(call);
    const handlerObj: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(resolved);
        }
        if (prop === 'insert') {
          return vi.fn((vals: unknown) => {
            call.inserts.push(vals);
            return new Proxy({}, handlerObj);
          });
        }
        if (prop === 'update') {
          return vi.fn((vals: unknown) => {
            call.updates.push(vals);
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
        deleteUser: vi.fn(async () => ({ error: null })),
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
