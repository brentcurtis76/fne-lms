// @vitest-environment node
/**
 * /api/admin/tractor-signups/grant — grant/dismiss/delete for public signups.
 *
 * Focus: the widened source gate (tractor + registro_general) and the
 * generation contract — generation is only ever applied to
 * profiles.generation_id (user_roles.generation_id is reserved for
 * lider_generacion and must stay untouched), fail-soft with warnings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', () => ({
  isGlobalAdmin: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../lib/userTeardown', () => ({
  teardownPlatformUser: vi.fn().mockResolvedValue({
    profileDeleted: true,
    profileRowsDeleted: 1,
    authUserDeleted: true,
    rolesDeleted: 0,
  }),
}));

vi.mock('../../../lib/securityAuditLog', () => ({
  logDataAccessEvent: vi.fn(),
}));

import handler from '../../../pages/api/admin/tractor-signups/grant';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SIGNUP_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const CREATED_USER_ID = '44444444-4444-4444-8444-444444444444';
const GEN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_GEN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SCHOOL_ID = 55;
const OTHER_SCHOOL_ID = 77;

interface TableResult {
  data?: unknown;
  error?: unknown;
}

interface FromCall {
  table: string;
  index: number;
  inserts: unknown[];
  updates: unknown[];
  upserts: unknown[];
  deletes: number;
  eqs: Array<{ col: string; val: unknown }>;
}

interface Tracker {
  fromCalls: FromCall[];
  rpcCalls: Array<{ fn: string }>;
  // Global operation log to assert ordering across from() and rpc() calls.
  ops: string[];
}

function makeTracker(): Tracker {
  return { fromCalls: [], rpcCalls: [], ops: [] };
}

function buildClient(
  resultsByTable: Record<string, TableResult[]>,
  tracker: Tracker,
  options: {
    rpcResult?: TableResult;
    createUserResult?: { data: unknown; error: unknown };
    generateLinkResult?: { data: unknown; error: unknown };
  } = {}
) {
  const indices: Record<string, number> = {};
  const rpcResult = options.rpcResult ?? { data: null, error: null };

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
        upserts: [],
        deletes: 0,
        eqs: [],
      };
      tracker.fromCalls.push(fromCall);
      tracker.ops.push(`from:${table}`);

      const resolved = { data: result.data ?? null, error: result.error ?? null };

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
          if (prop === 'upsert') {
            return vi.fn((arg: unknown) => {
              fromCall.upserts.push(arg);
              return new Proxy({}, proxyHandler);
            });
          }
          if (prop === 'delete') {
            return vi.fn(() => {
              fromCall.deletes += 1;
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
    rpc: vi.fn((fn: string) => {
      tracker.rpcCalls.push({ fn });
      tracker.ops.push(`rpc:${fn}`);
      const r = { data: rpcResult.data ?? null, error: rpcResult.error ?? null };
      return { then: (resolve: (v: unknown) => void) => resolve(r) };
    }),
    auth: {
      admin: {
        createUser: vi.fn(async () => {
          tracker.ops.push('auth:createUser');
          return (
            options.createUserResult ?? {
              data: { user: { id: CREATED_USER_ID } },
              error: null,
            }
          );
        }),
        generateLink: vi.fn(async () => {
          tracker.ops.push('auth:generateLink');
          return (
            options.generateLinkResult ?? {
              data: { properties: { action_link: 'https://example.com/recovery' } },
              error: null,
            }
          );
        }),
      },
    },
  };
}

function signupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SIGNUP_ID,
    source: 'registro_general',
    first_name: 'Ana',
    last_name: 'Pérez',
    email: 'ana@example.com',
    email_normalized: 'ana@example.com',
    school_id: SCHOOL_ID,
    generation_id: GEN_ID,
    birth_date: '1990-05-10',
    profession: 'Docente de Historia',
    role: 'docente',
    status: 'pending',
    linked_user_id: null,
    ...overrides,
  };
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    email: 'ana@example.com',
    first_name: 'Ana',
    last_name: 'Pérez',
    name: 'Ana Pérez',
    school_id: SCHOOL_ID,
    generation_id: null,
    approval_status: 'pending',
    ...overrides,
  };
}

// Case B (new user) table sequence. Generation lookup succeeds by default.
function newUserTables(overrides: Record<string, TableResult[]> = {}): Record<string, TableResult[]> {
  return {
    tractor_signups: [{ data: signupRow() }, { data: null }],
    schools: [{ data: { name: 'Colegio Uno' } }],
    generations: [{ data: { id: GEN_ID } }],
    profiles: [{ data: [] }, { data: [] }, { data: null }],
    user_roles: [{ data: [] }, { data: null }],
    ...overrides,
  };
}

// Case A (existing profile) table sequence.
function existingUserTables(
  profile: Record<string, unknown>,
  overrides: Record<string, TableResult[]> = {}
): Record<string, TableResult[]> {
  return {
    tractor_signups: [{ data: signupRow() }, { data: null }],
    schools: [{ data: { name: 'Colegio Uno' } }],
    generations: [{ data: { id: GEN_ID } }],
    profiles: [{ data: [profile] }, { data: null }],
    user_roles: [{ data: [] }, { data: null }],
    ...overrides,
  };
}

function findPayloads(tracker: Tracker, table: string, kind: 'inserts' | 'updates' | 'upserts') {
  return tracker.fromCalls
    .filter((c) => c.table === table)
    .flatMap((c) => c[kind]) as Record<string, unknown>[];
}

async function run(
  tables: Record<string, TableResult[]>,
  body: Record<string, unknown> = { signupId: SIGNUP_ID, action: 'grant' },
  options: Parameters<typeof buildClient>[2] = {}
) {
  const tracker = makeTracker();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockReturnValue(buildClient(tables, tracker, options));
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return { res, tracker };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Force the no-email fallback path so grants succeed without Resend.
  vi.stubEnv('RESEND_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('tractor-signups/grant — source gate', () => {
  it('unknown source → 404 for every action', async () => {
    for (const action of ['grant', 'dismiss', 'delete']) {
      const { res } = await run(
        { tractor_signups: [{ data: signupRow({ source: 'otra_cosa' }) }] },
        { signupId: SIGNUP_ID, action }
      );
      expect(res._getStatusCode()).toBe(404);
    }
  });

  it('grant works for a tractor-source signup (generation stays null everywhere)', async () => {
    const { res, tracker } = await run(
      newUserTables({
        tractor_signups: [
          { data: signupRow({ source: 'lideres_generacion_tractor', generation_id: null }) },
          { data: null },
        ],
      })
    );
    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.status).toBe('granted');
    expect(json.generation).toEqual({ applied: false, warning: null });
    expect(findPayloads(tracker, 'profiles', 'upserts')[0]?.generation_id).toBeNull();
  });

  it('dismiss works for a registro_general signup', async () => {
    const { res } = await run(
      { tractor_signups: [{ data: signupRow() }, { data: null }] },
      { signupId: SIGNUP_ID, action: 'dismiss' }
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe('dismissed');
  });

  it('delete (signup row only) works for a registro_general signup', async () => {
    const { res, tracker } = await run(
      { tractor_signups: [{ data: signupRow() }, { data: null }] },
      { signupId: SIGNUP_ID, action: 'delete' }
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe('deleted');
    const deletes = tracker.fromCalls
      .filter((c) => c.table === 'tractor_signups')
      .reduce((sum, c) => sum + c.deletes, 0);
    expect(deletes).toBe(1);
  });
});

describe('tractor-signups/grant — new user (Case B)', () => {
  it('persists the generation to profiles but never to user_roles', async () => {
    const { res, tracker } = await run(newUserTables());
    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.generation).toEqual({ applied: true, warning: null });

    const upsert = findPayloads(tracker, 'profiles', 'upserts')[0];
    expect(upsert).toMatchObject({
      id: CREATED_USER_ID,
      school_id: SCHOOL_ID,
      generation_id: GEN_ID,
      approval_status: 'approved',
      must_change_password: true,
    });

    // user_roles.generation_id is reserved for lider_generacion: the role
    // insert must not carry the column at all.
    const roleInsert = findPayloads(tracker, 'user_roles', 'inserts')[0];
    expect(roleInsert).toMatchObject({
      user_id: CREATED_USER_ID,
      role_type: 'docente',
      school_id: SCHOOL_ID,
      is_active: true,
    });
    expect(Object.keys(roleInsert)).not.toContain('generation_id');
  });

  it('stale generation (no longer matches the school) → grant proceeds without it, warning returned', async () => {
    const { res, tracker } = await run(newUserTables({ generations: [{ data: null }] }));
    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.status).toBe('granted');
    expect(json.generation.applied).toBe(false);
    expect(json.generation.warning).toBe(
      'La generación del registro ya no corresponde al colegio; se otorgó sin generación.'
    );
    expect(findPayloads(tracker, 'profiles', 'upserts')[0]?.generation_id).toBeNull();
  });

  it('refreshes the roles cache exactly once, after role writes and before marking granted', async () => {
    const { tracker } = await run(newUserTables());
    expect(tracker.rpcCalls).toEqual([{ fn: 'refresh_user_roles_cache' }]);

    const rpcIndex = tracker.ops.indexOf('rpc:refresh_user_roles_cache');
    const roleWriteIndex = tracker.ops.lastIndexOf('from:user_roles');
    const markGrantedIndex = tracker.ops.lastIndexOf('from:tractor_signups');
    expect(rpcIndex).toBeGreaterThan(roleWriteIndex);
    expect(rpcIndex).toBeLessThan(markGrantedIndex);
  });

  it('cache refresh failure is non-fatal', async () => {
    const { res } = await run(newUserTables(), undefined, {
      rpcResult: { error: { message: 'cache boom' } },
    });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().status).toBe('granted');
  });
});

describe('tractor-signups/grant — existing profile (Case A)', () => {
  it('same school + profile generation null → backfilled, applied true', async () => {
    const { res, tracker } = await run(existingUserTables(profileRow()));
    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.existingUser).toBe(true);
    expect(json.generation).toEqual({ applied: true, warning: null });

    const update = findPayloads(tracker, 'profiles', 'updates')[0];
    expect(update.generation_id).toBe(GEN_ID);
    expect(update.approval_status).toBe('approved');
  });

  it('profile school null → school and generation both backfilled', async () => {
    const { res, tracker } = await run(existingUserTables(profileRow({ school_id: null })));
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().generation).toEqual({ applied: true, warning: null });
    const update = findPayloads(tracker, 'profiles', 'updates')[0];
    expect(update.school_id).toBe(SCHOOL_ID);
    expect(update.generation_id).toBe(GEN_ID);
  });

  it('profile already has the same generation → applied true, nothing written', async () => {
    const { res, tracker } = await run(existingUserTables(profileRow({ generation_id: GEN_ID })));
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().generation).toEqual({ applied: true, warning: null });
    const update = findPayloads(tracker, 'profiles', 'updates')[0];
    expect(Object.keys(update)).not.toContain('generation_id');
  });

  it('profile has a different generation → applied false with warning, profile untouched', async () => {
    const { res, tracker } = await run(
      existingUserTables(profileRow({ generation_id: OTHER_GEN_ID }))
    );
    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.generation.applied).toBe(false);
    expect(json.generation.warning).toBe('El perfil ya tiene otra generación asignada; no se modificó.');
    const update = findPayloads(tracker, 'profiles', 'updates')[0];
    expect(Object.keys(update)).not.toContain('generation_id');
  });

  it('profile belongs to another school → generation not applied, role still granted, warning returned', async () => {
    const { res, tracker } = await run(
      existingUserTables(profileRow({ school_id: OTHER_SCHOOL_ID }))
    );
    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.status).toBe('granted');
    expect(json.generation.applied).toBe(false);
    expect(json.generation.warning).toBe(
      'La generación no se aplicó porque el perfil pertenece a otro colegio.'
    );

    // The school-scoped role is still created, as before this feature.
    const roleInsert = findPayloads(tracker, 'user_roles', 'inserts')[0];
    expect(roleInsert).toMatchObject({ user_id: PROFILE_ID, role_type: 'docente', school_id: SCHOOL_ID });
    expect(Object.keys(roleInsert)).not.toContain('generation_id');

    // Neither generation nor school is rewritten on the cross-school profile.
    const update = findPayloads(tracker, 'profiles', 'updates')[0];
    expect(Object.keys(update)).not.toContain('generation_id');
    expect(Object.keys(update)).not.toContain('school_id');
  });

  it('signup without generation → { applied: false, warning: null }', async () => {
    const { res, tracker } = await run(
      existingUserTables(profileRow(), {
        tractor_signups: [{ data: signupRow({ generation_id: null }) }, { data: null }],
      })
    );
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().generation).toEqual({ applied: false, warning: null });
    // No ownership lookup needed when the signup carries no generation.
    expect(tracker.fromCalls.filter((c) => c.table === 'generations')).toHaveLength(0);
  });
});
