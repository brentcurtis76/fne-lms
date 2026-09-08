// @vitest-environment node
/**
 * C-R1-03 (closure review 2026-09-08): POST /api/admin/course-assignments is the
 * designated INDEPENDENT-entitlement writer (C2 / D1), so its authority must come
 * from the authoritative role row, never from caller-editable user metadata.
 *
 *   * a verified ordinary user whose user_metadata claims admin is refused (403)
 *     before any write — the reproduction Codex ran against the previous route;
 *   * an inactive admin, an absent role, a malformed role result and a role-query
 *     error are all refused (403 / 500); nothing is written;
 *   * the established forced-password-change boundary is enforced at the API
 *     (403 PASSWORD_CHANGE_REQUIRED / 503 PASSWORD_STATE_UNAVAILABLE);
 *   * a valid active literal admin grants through the atomic RPC
 *     admin_grant_course_access on the CALLER's client (auth.uid() is the actor);
 *     an RPC failure is an error response, never a claimed grant; retries are
 *     idempotent and reported truthfully; notifications go only to newly assigned
 *     recipients.
 *
 * The first run of this file (before the route was corrected) is the fail-before
 * proof: the metadata-only user got 200 with an assignment INSERT and an
 * enrolment UPSERT. lib/api-auth and @supabase/supabase-js are mocks; the database
 * half (the RPC's own admin + password gate) is proved by supabase/tests/078.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const DOCENTE = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const COURSE = '77777777-7777-4777-8777-777777777777';

type Op = { method: string; args: unknown[] };
type Call = { table: string; ops: Op[] };
type Result = { data?: unknown; error?: unknown };

const { mockGetApiUser, mockCreateApiSupabaseClient, mockCreateServiceRoleClient, mockCallerRpc, mockCallerFrom, mockServiceFrom, mockSupabaseJsClient, mockTrigger } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCallerRpc: vi.fn(),
  mockCallerFrom: vi.fn(),
  mockServiceFrom: vi.fn(),
  mockSupabaseJsClient: { auth: { getUser: vi.fn() }, from: vi.fn(), rpc: vi.fn() },
  mockTrigger: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSupabaseJsClient }));
vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getApiUser: mockGetApiUser, createApiSupabaseClient: mockCreateApiSupabaseClient, createServiceRoleClient: mockCreateServiceRoleClient };
});
vi.mock('../../../lib/notificationService', () => ({ default: { triggerNotification: mockTrigger } }));

import handler from '../../../pages/api/admin/course-assignments';

function queryDouble(target: ReturnType<typeof vi.fn>, results: Record<string, Result>) {
  const calls: Call[] = [];
  target.mockImplementation((table: string) => {
    const entry: Call = { table, ops: [] };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'not', 'is', 'limit', 'order', 'single', 'maybeSingle', 'insert', 'upsert', 'update', 'delete']) {
      chain[method] = (...args: unknown[]) => {
        entry.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const key = `${table}:${entry.ops[0]?.method ?? ''}`;
      return Promise.resolve(results[key] ?? { data: null, error: null }).then(resolve, reject);
    };
    return chain;
  });
  return calls;
}

const GRANT_OK = { success: true, assignments_created: 1, assignments_existing: 0, enrollments_created: 1, enrollments_promoted: 0, enrollments_unchanged: 0, newly_assigned_user_ids: [DOCENTE] };

function serviceState(opts: { roles?: Result; profile?: Result } = {}) {
  return queryDouble(mockServiceFrom, {
    'user_roles:select': opts.roles ?? { data: [{ id: 'r1', role_type: 'admin', is_active: true }], error: null },
    'profiles:select': opts.profile ?? { data: { must_change_password: false }, error: null },
    'courses:select': { data: { title: 'Synthetic course' }, error: null },
    'course_assignments:delete': { data: null, error: null },
    'course_assignments:select': { data: [], error: null },
  });
}

function verifiedUser(id: string, user_metadata: Record<string, unknown> = {}) {
  const user = { id, email: `${id}@example.com`, user_metadata, app_metadata: {} };
  mockGetApiUser.mockResolvedValue({ user, error: null });
  mockSupabaseJsClient.auth.getUser.mockResolvedValue({ data: { user }, error: null });
}

async function post(body: unknown, headers: Record<string, string> = { authorization: 'Bearer synthetic' }) {
  const { req, res } = createMocks({ method: 'POST', headers, body } as never);
  await handler(req as never, res as never);
  return res;
}

let serviceCalls: Call[];
let legacyCalls: Call[];
let callerCalls: Call[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mockCreateApiSupabaseClient.mockResolvedValue({ from: mockCallerFrom, rpc: mockCallerRpc });
  mockCreateServiceRoleClient.mockReturnValue({ from: mockServiceFrom });
  mockCallerRpc.mockResolvedValue({ data: GRANT_OK, error: null });
  callerCalls = queryDouble(mockCallerFrom, {});
  serviceCalls = serviceState();
  // The legacy route built its own supabase-js clients; feed them the same shapes so the
  // fail-before run reproduces Codex's probe (metadata admin, no role row -> writes).
  legacyCalls = queryDouble(mockSupabaseJsClient.from, {
    'user_roles:select': { data: null, error: null },
    'course_assignments:insert': { data: [{ id: 'a1' }], error: null },
    'course_enrollments:upsert': { data: null, error: null },
    'courses:select': { data: { title: 'Synthetic course' }, error: null },
  });
  mockTrigger.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

function writesAttempted() {
  const all = [...serviceCalls, ...legacyCalls, ...callerCalls];
  const wrote = all.some((c) => ['course_assignments', 'course_enrollments'].includes(c.table) && c.ops.some((o) => ['insert', 'upsert', 'update', 'delete'].includes(o.method)));
  return wrote || mockCallerRpc.mock.calls.length > 0 || mockSupabaseJsClient.rpc.mock.calls.length > 0;
}

describe('authority: an active literal admin role row, never editable metadata', () => {
  it('a verified ordinary user with user_metadata.role = admin and no role row is refused (403) and nothing is written', async () => {
    verifiedUser(DOCENTE, { role: 'admin' });
    serviceCalls = serviceState({ roles: { data: [], error: null } });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(403);
    expect(writesAttempted()).toBe(false);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('user_metadata.roles = [admin] is equally worthless', async () => {
    verifiedUser(DOCENTE, { roles: ['admin'] });
    serviceCalls = serviceState({ roles: { data: [], error: null } });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(403);
    expect(writesAttempted()).toBe(false);
  });

  it('an ordinary user cannot grant a course to themselves either', async () => {
    verifiedUser(DOCENTE, { role: 'admin' });
    serviceCalls = serviceState({ roles: { data: [], error: null } });
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(403);
    expect(writesAttempted()).toBe(false);
  });

  it('the role query asks for role_type = admin AND is_active = true (an inactive admin row is not returned, so it is refused)', async () => {
    verifiedUser(ADMIN);
    serviceCalls = serviceState({ roles: { data: [], error: null } });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(403);
    const roleQuery = serviceCalls.find((c) => c.table === 'user_roles');
    expect(roleQuery).toBeTruthy();
    const eqs = roleQuery!.ops.filter((o) => o.method === 'eq').map((o) => o.args);
    expect(eqs).toEqual(expect.arrayContaining([[ 'user_id', ADMIN ], [ 'role_type', 'admin' ], [ 'is_active', true ]]));
    expect(writesAttempted()).toBe(false);
  });

  it('a role-query error is a denial (500), not a pass', async () => {
    verifiedUser(ADMIN);
    serviceCalls = serviceState({ roles: { data: null, error: { message: 'connection reset' } } });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(500);
    expect(writesAttempted()).toBe(false);
  });

  it.each([
    ['null data', { data: null, error: null }],
    ['a non-array', { data: { role_type: 'admin' }, error: null }],
    ['a row whose role_type is not admin', { data: [{ role_type: 'consultor', is_active: true }], error: null }],
  ])('a malformed role result (%s) is refused', async (_label, roles) => {
    verifiedUser(ADMIN);
    serviceCalls = serviceState({ roles: roles as Result });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(403);
    expect(writesAttempted()).toBe(false);
  });

  it('no verified user: 401', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('nope') });
    mockSupabaseJsClient.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('nope') });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(401);
    expect(writesAttempted()).toBe(false);
  });
});

describe('the forced-password-change boundary holds at the API', () => {
  it('a flagged admin is held (403 PASSWORD_CHANGE_REQUIRED) before any authority check or write', async () => {
    verifiedUser(ADMIN);
    serviceCalls = serviceState({ profile: { data: { must_change_password: true }, error: null } });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(writesAttempted()).toBe(false);
  });

  it('an unreadable flag is 503 PASSWORD_STATE_UNAVAILABLE, never allowed', async () => {
    verifiedUser(ADMIN);
    serviceCalls = serviceState({ profile: { data: null, error: { message: 'boom' } } });
    const res = await post({ courseId: COURSE, teacherIds: [OTHER] });
    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData().code).toBe('PASSWORD_STATE_UNAVAILABLE');
    expect(writesAttempted()).toBe(false);
  });
});

describe('a valid active admin grants through the atomic RPC on the caller client', () => {
  it('grants to another user: RPC called with the course and the recipients; counts reported; notification to the newly assigned', async () => {
    verifiedUser(ADMIN);
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(200);
    expect(mockCallerRpc).toHaveBeenCalledWith('admin_grant_course_access', { p_course_id: COURSE, p_user_ids: [DOCENTE] });
    const body = res._getJSONData();
    expect(body.success).toBe(true);
    expect(body.grant).toMatchObject({ assignments_created: 1, enrollments_created: 1 });
    expect(mockTrigger).toHaveBeenCalledWith('course_assigned', expect.objectContaining({ assigned_users: [DOCENTE], assigned_by: ADMIN }));
    // No service-role write to either table: the RPC is the only writer.
    expect(serviceCalls.some((c) => ['course_assignments', 'course_enrollments'].includes(c.table) && c.ops.some((o) => ['insert', 'upsert'].includes(o.method)))).toBe(false);
  });

  it('grants to themselves (own recipient) through the same path', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValue({ data: { ...GRANT_OK, newly_assigned_user_ids: [ADMIN] }, error: null });
    const res = await post({ courseId: COURSE, teacherIds: [ADMIN] });
    expect(res._getStatusCode()).toBe(200);
    expect(mockCallerRpc).toHaveBeenCalledWith('admin_grant_course_access', { p_course_id: COURSE, p_user_ids: [ADMIN] });
  });

  it('duplicates in the request are collapsed before the RPC', async () => {
    verifiedUser(ADMIN);
    await post({ courseId: COURSE, teacherIds: [DOCENTE, DOCENTE, OTHER] });
    expect(mockCallerRpc).toHaveBeenCalledWith('admin_grant_course_access', { p_course_id: COURSE, p_user_ids: [DOCENTE, OTHER] });
  });

  it('a retry is idempotent and truthful: 0 created / 1 existing, no notification, still 200', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValue({ data: { ...GRANT_OK, assignments_created: 0, assignments_existing: 1, enrollments_created: 0, enrollments_unchanged: 1, newly_assigned_user_ids: [] }, error: null });
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().grant).toMatchObject({ assignments_created: 0, assignments_existing: 1 });
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('an existing path-derived row is reported as promoted (the RPC promotes; progress is untouched — pgTAP 078)', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValue({ data: { ...GRANT_OK, enrollments_created: 0, enrollments_promoted: 1 }, error: null });
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getJSONData().grant.enrollments_promoted).toBe(1);
  });

  it('an RPC failure after assignment work is an error response, never a claimed grant, and no notification', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'enrollment provenance could not be recorded' } });
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().success).toBeUndefined();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('the database refusing the actor (42501) is 403 — the DB is the second authority layer', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Admin only' } });
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(403);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('an unknown course is 404, an unknown recipient is 400', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Course not found' } });
    expect((await post({ courseId: COURSE, teacherIds: [DOCENTE] }))._getStatusCode()).toBe(404);
    mockCallerRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: '1 recipient(s) do not exist' } });
    expect((await post({ courseId: COURSE, teacherIds: [DOCENTE] }))._getStatusCode()).toBe(400);
  });

  it('a malformed RPC result is 500 (no success claim)', async () => {
    verifiedUser(ADMIN);
    mockCallerRpc.mockResolvedValue({ data: 'ok', error: null });
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(500);
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('a failed notification does not fail the grant', async () => {
    verifiedUser(ADMIN);
    mockTrigger.mockRejectedValue(new Error('smtp down'));
    const res = await post({ courseId: COURSE, teacherIds: [DOCENTE] });
    expect(res._getStatusCode()).toBe(200);
  });
});

describe('validation', () => {
  it.each([
    ['missing courseId', { teacherIds: [DOCENTE] }],
    ['non-uuid courseId', { courseId: 'not-a-uuid', teacherIds: [DOCENTE] }],
    ['teacherIds missing', { courseId: COURSE }],
    ['teacherIds not an array', { courseId: COURSE, teacherIds: DOCENTE }],
    ['teacherIds empty', { courseId: COURSE, teacherIds: [] }],
    ['teacherIds with a non-uuid', { courseId: COURSE, teacherIds: [DOCENTE, 'x'] }],
    ['more than 200 recipients', { courseId: COURSE, teacherIds: Array.from({ length: 201 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`) }],
  ])('%s: 400 and no RPC', async (_label, body) => {
    verifiedUser(ADMIN);
    const res = await post(body);
    expect(res._getStatusCode()).toBe(400);
    expect(mockCallerRpc).not.toHaveBeenCalled();
  });
});

describe('GET and DELETE keep the same authority', () => {
  it('DELETE by a metadata-only user is refused', async () => {
    verifiedUser(DOCENTE, { role: 'admin' });
    serviceCalls = serviceState({ roles: { data: [], error: null } });
    const { req, res } = createMocks({ method: 'DELETE', headers: { authorization: 'Bearer synthetic' }, body: { courseId: COURSE, teacherId: OTHER } } as never);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
    expect(writesAttempted()).toBe(false);
  });

  it('DELETE by an active admin removes the assignment', async () => {
    verifiedUser(ADMIN);
    const { req, res } = createMocks({ method: 'DELETE', headers: { authorization: 'Bearer synthetic' }, body: { courseId: COURSE, teacherId: OTHER } } as never);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(200);
    expect(serviceCalls.some((c) => c.table === 'course_assignments' && c.ops.some((o) => o.method === 'delete'))).toBe(true);
  });

  it('GET by a metadata-only user is refused', async () => {
    verifiedUser(DOCENTE, { role: 'admin' });
    serviceCalls = serviceState({ roles: { data: [], error: null } });
    const { req, res } = createMocks({ method: 'GET', headers: { authorization: 'Bearer synthetic' }, query: { courseId: COURSE } } as never);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(403);
  });

  it('unsupported method: 405', async () => {
    verifiedUser(ADMIN);
    const { req, res } = createMocks({ method: 'PUT', headers: { authorization: 'Bearer synthetic' } } as never);
    await handler(req as never, res as never);
    expect(res._getStatusCode()).toBe(405);
  });
});
