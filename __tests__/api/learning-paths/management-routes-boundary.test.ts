// @vitest-environment node
/**
 * W-B2c-01 gap G2 — the remaining learning-path MANAGEMENT routes are literal-admin-only
 * at the API boundary:
 *
 *   PUT/DELETE  /api/learning-paths/[id]
 *   POST        /api/learning-paths/batch-assign
 *   DELETE      /api/learning-paths/unassign
 *   GET/DELETE  /api/learning-paths/assignments/[id]
 *   POST        /api/learning-paths/search-assignees
 *
 * For every one: no verified user → 401 with no database access; equipo_directivo,
 * consultor and docente → 403 with NO write reached (no RPC, no insert / update /
 * upsert / delete, no audit row, no service-role client); admin → the success status,
 * and wherever an actor id reaches an RPC or the audit trail it is the AUTHENTICATED
 * user's id, never a body-supplied one.
 *
 * Unlike governance-boundary.test.ts, LearningPathsService is NOT mocked: the real
 * hasManagePermission / canManagePath run against a recording Supabase double whose
 * user_roles rows are filtered by the predicates the service actually applies
 * (user_id, is_active, role_type). So a role verdict here is the service's own verdict.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const DIRECTIVO = '22222222-2222-4222-8222-222222222222';
const CONSULTOR = '33333333-3333-4333-8333-333333333333';
const DOCENTE = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const PATH = '66666666-6666-4666-8666-666666666666';
const GROUP = '77777777-7777-4777-8777-777777777777';
const ASSIGNMENT = '88888888-8888-4888-8888-888888888888';

/** The roles table as the database would hold it. DIRECTIVO's former admin row is inactive. */
const USER_ROLES = [
  { user_id: ADMIN, role_type: 'admin', is_active: true },
  { user_id: DIRECTIVO, role_type: 'equipo_directivo', is_active: true },
  { user_id: DIRECTIVO, role_type: 'admin', is_active: false },
  { user_id: CONSULTOR, role_type: 'consultor', is_active: true },
  { user_id: DOCENTE, role_type: 'docente', is_active: true },
];

const NON_ADMINS: Array<[string, string]> = [
  ['equipo_directivo', DIRECTIVO],
  ['consultor', CONSULTOR],
  ['docente', DOCENTE],
];

const { mockGetApiUser, mockCreateApiSupabaseClient, mockCreateServiceRoleClient, mockLogAudit } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createApiSupabaseClient: mockCreateApiSupabaseClient,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});
vi.mock('../../../lib/auditLog', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logBatchAssignmentAudit: mockLogAudit };
});

import pathHandler from '../../../pages/api/learning-paths/[id]';
import batchAssignHandler from '../../../pages/api/learning-paths/batch-assign';
import unassignHandler from '../../../pages/api/learning-paths/unassign';
import assignmentsHandler from '../../../pages/api/learning-paths/assignments/[id]';
import searchAssigneesHandler from '../../../pages/api/learning-paths/search-assignees';

type Op = { method: string; args: unknown[] };
type Call = { client: 'user' | 'service'; table: string; ops: Op[] };
type Result = { data?: unknown; error?: unknown; count?: number };

const WRITE_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);
const CHAIN_METHODS = ['select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'order', 'range', 'single', 'maybeSingle', ...WRITE_METHODS];

let calls: Call[] = [];
let rpcCalls: Array<{ client: 'user' | 'service'; fn: string; args: unknown }> = [];
let results: Record<string, Result> = {};
let rpcResults: Record<string, Result> = {};

/** user_roles reads are answered from USER_ROLES, filtered by every .eq() the caller applied. */
function resolveUserRoles(ops: Op[]): Result {
  const eqs = ops.filter((op) => op.method === 'eq').map((op) => op.args as [string, unknown]);
  const rows = USER_ROLES.filter((row) => eqs.every(([col, val]) => (row as Record<string, unknown>)[col] === val));
  return { data: rows, error: null };
}

/** A recording Supabase client: every from() chain and rpc() is logged; results by `table:firstMethod[#n]`. */
function makeClient(client: 'user' | 'service') {
  const seen: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      const entry: Call = { client, table, ops: [] };
      calls.push(entry);
      const chain: Record<string, unknown> = {};
      for (const method of CHAIN_METHODS) {
        chain[method] = (...args: unknown[]) => {
          entry.ops.push({ method, args });
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let value: Result;
        if (table === 'user_roles' && entry.ops[0]?.method === 'select' && client === 'user') {
          value = resolveUserRoles(entry.ops);
        } else {
          const base = `${table}:${entry.ops[0]?.method ?? ''}`;
          seen[base] = (seen[base] ?? 0) + 1;
          value = results[`${base}#${seen[base]}`] ?? results[base] ?? { data: [], error: null };
        }
        return Promise.resolve(value).then(resolve, reject);
      };
      return chain;
    }),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcCalls.push({ client, fn, args });
      return rpcResults[fn] ?? { data: null, error: null };
    }),
  };
}

function writes() {
  return {
    rpc: rpcCalls.map((c) => c.fn),
    tables: calls.filter((c) => c.ops.some((op) => WRITE_METHODS.has(op.method))).map((c) => c.table),
    audit: mockLogAudit.mock.calls.length,
  };
}
const NO_WRITES = { rpc: [], tables: [], audit: 0 };

function authenticatedAs(id: string) {
  mockGetApiUser.mockResolvedValue({ user: { id, email: `${id}@example.com` }, error: null });
}
function anonymous() {
  mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });
}

type Handler = (req: never, res: never) => unknown;
async function call(handler: Handler, opts: Record<string, unknown>) {
  const { req, res } = createMocks(opts as never);
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  calls = [];
  rpcCalls = [];
  results = {};
  rpcResults = {};
  mockCreateApiSupabaseClient.mockImplementation(async () => makeClient('user'));
  mockCreateServiceRoleClient.mockImplementation(() => makeClient('service'));
  mockLogAudit.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

/**
 * The shared shape of every route's boundary: 401 for anonymous, 403 + no writes for
 * each non-admin role. `request` is the exact request a client would send.
 */
function refusesAllButAdmin(handler: Handler, request: Record<string, unknown>) {
  it('anonymous: 401, no database access', async () => {
    anonymous();
    const res = await call(handler, request);
    expect(res._getStatusCode()).toBe(401);
    expect(calls).toEqual([]);
    expect(rpcCalls).toEqual([]);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it.each(NON_ADMINS)('%s: 403 and no write reached', async (_role, id) => {
    authenticatedAs(id);
    const res = await call(handler, request);
    expect(res._getStatusCode()).toBe(403);
    expect(writes()).toEqual(NO_WRITES);
    // Refused on the role check alone: nothing but the caller's own user_roles read.
    expect(calls.map((c) => `${c.client}:${c.table}`)).toEqual(['user:user_roles']);
    expect(calls[0].ops).toContainEqual({ method: 'eq', args: ['user_id', id] });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });
}

describe('PUT /api/learning-paths/[id] — edit is literal-admin-only', () => {
  const request = {
    method: 'PUT',
    query: { id: PATH },
    body: { name: 'Ruta', description: 'Desc', courseIds: ['c1'], userId: OTHER, updatedBy: OTHER, p_updated_by: OTHER },
  };
  refusesAllButAdmin(pathHandler as Handler, request);

  it('admin: 200, update RPC carries the AUTHENTICATED user as p_updated_by', async () => {
    authenticatedAs(ADMIN);
    results = { 'learning_paths:select': { data: { created_by: OTHER }, error: null } };
    rpcResults = { update_full_learning_path: { data: { id: PATH, name: 'Ruta' }, error: null } };
    const res = await call(pathHandler as Handler, request);
    expect(res._getStatusCode()).toBe(200);
    expect(rpcCalls).toEqual([{
      client: 'user',
      fn: 'update_full_learning_path',
      args: { p_path_id: PATH, p_name: 'Ruta', p_description: 'Desc', p_course_ids: ['c1'], p_updated_by: ADMIN },
    }]);
  });
});

describe('DELETE /api/learning-paths/[id] — delete is literal-admin-only', () => {
  const request = { method: 'DELETE', query: { id: PATH }, body: { userId: OTHER } };
  refusesAllButAdmin(pathHandler as Handler, request);

  it('admin: 204, the path row is deleted by id', async () => {
    authenticatedAs(ADMIN);
    results = {
      'learning_paths:select': { data: { created_by: OTHER }, error: null },
      'learning_paths:delete': { data: null, error: null },
    };
    const res = await call(pathHandler as Handler, request);
    expect(res._getStatusCode()).toBe(204);
    const del = calls.filter((c) => c.ops[0]?.method === 'delete');
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ client: 'user', table: 'learning_paths' });
    expect(del[0].ops[1]).toEqual({ method: 'eq', args: ['id', PATH] });
  });
});

describe('POST /api/learning-paths/batch-assign — assign is literal-admin-only', () => {
  const request = {
    method: 'POST',
    body: { pathId: PATH, userIds: [DOCENTE], groupIds: [GROUP], assignedBy: OTHER, assigned_by: OTHER, p_assigned_by: OTHER },
  };
  refusesAllButAdmin(batchAssignHandler as Handler, request);

  it('admin: 201, RPC and audit carry the AUTHENTICATED user as assigner', async () => {
    authenticatedAs(ADMIN);
    results = { 'learning_paths:select': { data: { id: PATH, name: 'Ruta' }, error: null } };
    rpcResults = { batch_assign_learning_path: { data: { assignments_created: 2 }, error: null } };
    const res = await call(batchAssignHandler as Handler, request);
    expect(res._getStatusCode()).toBe(201);
    expect(rpcCalls).toEqual([{
      client: 'user',
      fn: 'batch_assign_learning_path',
      args: { p_path_id: PATH, p_user_ids: [DOCENTE], p_group_ids: [GROUP], p_assigned_by: ADMIN },
    }]);
    const entries = mockLogAudit.mock.calls[0][1] as Array<{ performedBy: string }>;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.performedBy === ADMIN)).toBe(true);
  });
});

describe('DELETE /api/learning-paths/unassign — unassign is literal-admin-only', () => {
  const request = {
    method: 'DELETE',
    body: { pathId: PATH, userIds: [DOCENTE], performedBy: OTHER, unassignedBy: OTHER },
  };
  refusesAllButAdmin(unassignHandler as Handler, request);

  it('admin: 200, the direct row is deleted and the audit actor is the AUTHENTICATED user', async () => {
    authenticatedAs(ADMIN);
    results = {
      'learning_paths:select': { data: { id: PATH, name: 'Ruta' }, error: null },
      'learning_path_assignments:delete': { data: [{ user_id: DOCENTE }], error: null },
    };
    const res = await call(unassignHandler as Handler, request);
    expect(res._getStatusCode()).toBe(200);
    expect(writes().tables).toEqual(['learning_path_assignments']);
    const entries = mockLogAudit.mock.calls[0][1] as Array<{ performedBy: string; entityId: string }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ performedBy: ADMIN, entityId: DOCENTE });
  });
});

describe('GET /api/learning-paths/assignments/[id] — assignment list is literal-admin-only', () => {
  const request = { method: 'GET', query: { id: PATH } };
  refusesAllButAdmin(assignmentsHandler as Handler, request);

  it('admin: 200 with the path assignments, read-only', async () => {
    authenticatedAs(ADMIN);
    const rows = [{ id: ASSIGNMENT, path_id: PATH, user_id: DOCENTE }];
    results = { 'learning_path_assignments:select': { data: rows, error: null } };
    const res = await call(assignmentsHandler as Handler, request);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual(rows);
    expect(writes()).toEqual(NO_WRITES);
  });
});

describe('DELETE /api/learning-paths/assignments/[id] — assignment removal is literal-admin-only', () => {
  const request = { method: 'DELETE', query: { id: PATH }, body: { assignmentId: ASSIGNMENT, userId: OTHER } };
  refusesAllButAdmin(assignmentsHandler as Handler, request);

  it('admin: 204, exactly the named assignment is deleted', async () => {
    authenticatedAs(ADMIN);
    results = {
      'learning_path_assignments:select': { data: { id: ASSIGNMENT, path_id: PATH }, error: null },
      'learning_path_assignments:delete': { data: null, error: null },
    };
    const res = await call(assignmentsHandler as Handler, request);
    expect(res._getStatusCode()).toBe(204);
    const del = calls.filter((c) => c.ops[0]?.method === 'delete');
    expect(del).toHaveLength(1);
    expect(del[0].ops[1]).toEqual({ method: 'eq', args: ['id', ASSIGNMENT] });
  });
});

describe('POST /api/learning-paths/search-assignees — assignee search is literal-admin-only', () => {
  const request = { method: 'POST', body: { pathId: PATH, searchType: 'users', query: 'ana', userId: OTHER } };
  refusesAllButAdmin(searchAssigneesHandler as Handler, request);

  it('admin: 200, profiles searched through the service-role client, nothing written', async () => {
    authenticatedAs(ADMIN);
    results = {
      'learning_paths:select': { data: { id: PATH }, error: null },
      'profiles:select': { data: [{ id: DOCENTE, first_name: 'Ana', last_name: 'Sintética', email: 'ana@example.com' }], error: null, count: 1 },
      'learning_path_assignments:select': { data: [{ user_id: DOCENTE }], error: null },
    };
    const res = await call(searchAssigneesHandler as Handler, request);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      totalCount: 1,
      results: [{ id: DOCENTE, name: 'Ana Sintética', isAlreadyAssigned: true }],
    });
    expect(calls.find((c) => c.table === 'profiles')?.client).toBe('service');
    expect(writes()).toEqual(NO_WRITES);
  });
});
