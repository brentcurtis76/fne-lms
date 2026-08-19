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
import {
  StubOptions,
  TableResult,
  Tracker,
  buildClient,
  findPayloads,
  makeTracker,
} from '../../helpers/supabaseStub';

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

async function run(
  tables: Record<string, TableResult[]>,
  body: Record<string, unknown> = { signupId: SIGNUP_ID, action: 'grant' },
  options: StubOptions = {}
) {
  const tracker: Tracker = makeTracker();
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockReturnValue(
    buildClient(tables, tracker, {
      createUserResult: { data: { user: { id: CREATED_USER_ID } }, error: null },
      ...options,
    })
  );
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

/**
 * S8 — granting access to an EXISTING profile used to notify nobody.
 *
 * The branch attached the role, updated the profile, marked the signup granted
 * and returned. The person now had access to a platform they had asked to join
 * and no message said so: the grant existed only inside the admin panel.
 *
 * And S7: a failed invitation e-mail is no longer terminal. The response tells
 * the panel that a retry exists, for BOTH branches.
 */
describe('tractor-signups/grant — delivery status (S7, S8)', () => {
  it('existing profile: an access-granted e-mail is attempted and its result reported', async () => {
    const { res } = await run(existingUserTables(profileRow()));

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.existingUser).toBe(true);
    // RESEND_API_KEY is stubbed empty by the suite's beforeEach, so the honest
    // answer here is "not configured" — which is exactly the production state
    // this remediation documents.
    expect(json.email).toEqual({ sent: false, reason: 'not_configured' });
    expect(json.emailMessage).toContain('el servicio de correo no está configurado');
    expect(json.canResend).toBe(true);
  });

  it('existing profile: the grant is audited with the delivery outcome', async () => {
    const { tracker } = await run(existingUserTables(profileRow()));

    const audit = tracker.fromCalls
      .filter((c) => c.table === 'security_audit_events')
      .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;

    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'access_granted_existing_user',
      outcome: 'success',
      actor_user_id: ADMIN_ID,
      target_user_id: PROFILE_ID,
    });
    expect((audit[0].metadata as Record<string, unknown>).email_sent).toBe(false);
  });

  it('new account: delivery status and the retry affordance are reported', async () => {
    const { res } = await run(newUserTables());

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.existingUser).toBe(false);
    expect(json.email).toEqual({ sent: false, reason: 'not_configured' });
    // S7: the signup stays `granted` — the account exists and must not be
    // created twice — but the panel now has an action that mints a fresh link.
    expect(json.status).toBe('granted');
    expect(json.canResend).toBe(true);
  });

  it('new account: the grant is audited', async () => {
    const { tracker } = await run(newUserTables());

    const audit = tracker.fromCalls
      .filter((c) => c.table === 'security_audit_events')
      .flatMap((c) => c.inserts) as Array<Record<string, unknown>>;

    expect(audit[0]).toMatchObject({
      action: 'access_granted_new_user',
      outcome: 'success',
      target_user_id: CREATED_USER_ID,
    });
  });

  it('neither branch returns the recovery link or the address', async () => {
    for (const tables of [newUserTables(), existingUserTables(profileRow())]) {
      const { res } = await run(tables);
      expect(res._getData()).not.toContain('action_link');
      expect(res._getData()).not.toContain('token_hash');
      expect(res._getData()).not.toContain('ana@example.com');
    }
  });
});

/**
 * The canonical URL. `getBaseUrl` used to fall back to `req.headers.host` in
 * production too — so a crafted request could mint an invitation whose
 * "Establecer contraseña" button pointed anywhere, baked into an e-mail that
 * outlives the request.
 */
describe('tractor-signups/grant — canonical origin', () => {
  it('uses the configured origin for the recovery redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://genera.example.org');
    const { tracker } = await run(newUserTables());
    expect(tracker.ops.join(',')).toContain('auth:generateLink');
    expect(tracker.generateLinkArgs).toMatchObject({
      options: { redirectTo: 'https://genera.example.org/reset-password' },
    });
  });

  it('recognises NEXT_PUBLIC_APP_URL, which the old helper ignored', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.org');
    const { tracker } = await run(newUserTables());
    expect(tracker.generateLinkArgs).toMatchObject({
      options: { redirectTo: 'https://app.example.org/reset-password' },
    });
  });

  it('FAILS in production rather than trusting the request Host', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');

    const { res } = await run(newUserTables());

    // A grant that cannot produce a trustworthy link must not send one.
    expect(res._getStatusCode()).toBe(500);
  });
});
