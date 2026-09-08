// @vitest-environment node
/**
 * RLS closure C2 (2026-09-07) — DELETE /api/learning-paths/unassign removes ONLY the
 * selected assignment sources.
 *
 * Reproduces the audit finding: the previous route, after deleting a group assignment,
 * selected the community's current members and deleted their DIRECT assignments for the
 * same path with no provenance predicate — an independent direct assignment was lost.
 * This suite pins that a group removal issues exactly ONE delete (the group row, `user_id
 * IS NULL`), never reads members, never deletes a direct row; that a user removal deletes
 * only the direct rows named (`group_id IS NULL`); that the reported counts are the rows
 * the database actually deleted (a retry reports 0 and lists what was not found); that the
 * audit trail records only removed sources; and that course enrolments are never written
 * (decision D1 is enforced live by the database).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const DOCENTE = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const PATH = '66666666-6666-4666-8666-666666666666';
const GROUP = '77777777-7777-4777-8777-777777777777';
const GROUP2 = '88888888-8888-4888-8888-888888888888';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockFrom, mockHasManagePermission, mockLogAudit } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockFrom: vi.fn(),
  mockHasManagePermission: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getApiUser: mockGetApiUser, createApiSupabaseClient: mockCreateApiSupabaseClient };
});
vi.mock('../../../lib/services/learningPathsService', () => ({
  LearningPathsService: { hasManagePermission: mockHasManagePermission },
}));
vi.mock('../../../lib/auditLog', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logBatchAssignmentAudit: mockLogAudit };
});

import handler from '../../../pages/api/learning-paths/unassign';

type Call = { table: string; ops: Array<{ method: string; args: unknown[] }> };

/** Resolves each chain to the result registered for `table:firstMethod`, or `table:firstMethod#n` for the n-th call. */
function installQueryDouble(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  const seen: Record<string, number> = {};
  mockFrom.mockImplementation((table: string) => {
    const entry: Call = { table, ops: [] };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'single', 'maybeSingle', 'delete', 'insert', 'update', 'upsert']) {
      chain[method] = (...args: unknown[]) => {
        entry.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const base = `${table}:${entry.ops[0]?.method ?? ''}`;
      seen[base] = (seen[base] ?? 0) + 1;
      const value = results[`${base}#${seen[base]}`] ?? results[base] ?? { data: [], error: null };
      return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
  });
  return calls;
}

async function call(body: unknown, method = 'DELETE') {
  const { req, res } = createMocks({ method: method as never, body });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue({ from: mockFrom });
  mockHasManagePermission.mockResolvedValue(true);
  mockLogAudit.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

const PATH_ROW = { 'learning_paths:select': { data: { id: PATH, name: 'Ruta' }, error: null } };

describe('group removal removes only the group source', () => {
  it('issues exactly one delete for the group row and never touches members or their direct rows', async () => {
    const calls = installQueryDouble({
      ...PATH_ROW,
      'learning_path_assignments:delete': { data: [{ group_id: GROUP }], error: null },
    });
    const res = await call({ pathId: PATH, groupIds: [GROUP] });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      success: true,
      unassigned_count: 1,
      removed: { directUserIds: [], groupIds: [GROUP], notFound: { userIds: [], groupIds: [] } },
    });
    const deletes = calls.filter((c) => c.ops[0]?.method === 'delete');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].table).toBe('learning_path_assignments');
    expect(deletes[0].ops.map((op) => op.method)).toEqual(['delete', 'eq', 'in', 'is', 'select']);
    expect(deletes[0].ops[1].args).toEqual(['path_id', PATH]);
    expect(deletes[0].ops[2].args).toEqual(['group_id', [GROUP]]);
    expect(deletes[0].ops[3].args).toEqual(['user_id', null]); // the group row only
    // the regression: no membership read, no second delete of member direct rows
    expect(calls.some((c) => c.table === 'user_roles')).toBe(false);
    expect(calls.some((c) => c.table === 'community_workspaces')).toBe(false);
    expect(calls.some((c) => c.table === 'course_enrollments')).toBe(false);
  });

  it('two groups: one delete naming both, counts what the database removed', async () => {
    installQueryDouble({
      ...PATH_ROW,
      'learning_path_assignments:delete': { data: [{ group_id: GROUP }, { group_id: GROUP2 }], error: null },
    });
    const res = await call({ pathId: PATH, groupIds: [GROUP, GROUP2, GROUP] });
    expect(res._getJSONData()).toMatchObject({ unassigned_count: 2, removed: { groupIds: [GROUP, GROUP2] } });
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    const entries = mockLogAudit.mock.calls[0][1] as Array<{ entityType: string; entityId: string; metadata: Record<string, unknown> }>;
    expect(entries.map((e) => e.entityId)).toEqual([GROUP, GROUP2]);
    expect(entries.every((e) => e.entityType === 'community_workspace' && e.metadata.source === 'group')).toBe(true);
  });
});

describe('user removal removes only direct rows', () => {
  it('deletes the direct rows named and keeps group rows (group_id IS NULL predicate)', async () => {
    const calls = installQueryDouble({
      ...PATH_ROW,
      'learning_path_assignments:delete': { data: [{ user_id: DOCENTE }], error: null },
    });
    const res = await call({ pathId: PATH, userIds: [DOCENTE, OTHER] });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      unassigned_count: 1,
      removed: { directUserIds: [DOCENTE], groupIds: [], notFound: { userIds: [OTHER], groupIds: [] } },
    });
    const del = calls.find((c) => c.ops[0]?.method === 'delete')!;
    expect(del.ops.map((op) => op.method)).toEqual(['delete', 'eq', 'in', 'is', 'select']);
    expect(del.ops[2].args).toEqual(['user_id', [DOCENTE, OTHER]]);
    expect(del.ops[3].args).toEqual(['group_id', null]);
    const entries = mockLogAudit.mock.calls[0][1] as Array<{ entityId: string; metadata: Record<string, unknown> }>;
    expect(entries.map((e) => e.entityId)).toEqual([DOCENTE]); // only what was removed
    expect(entries[0].metadata.source).toBe('direct');
  });

  it('user + group in one call: two deletes, each scoped to its own source; counts are additive', async () => {
    const calls = installQueryDouble({
      ...PATH_ROW,
      'learning_path_assignments:delete#1': { data: [{ user_id: DOCENTE }], error: null },
      'learning_path_assignments:delete#2': { data: [{ group_id: GROUP }], error: null },
    });
    const res = await call({ pathId: PATH, userIds: [DOCENTE], groupIds: [GROUP] });
    expect(res._getJSONData()).toMatchObject({ unassigned_count: 2, removed: { directUserIds: [DOCENTE], groupIds: [GROUP] } });
    const deletes = calls.filter((c) => c.ops[0]?.method === 'delete');
    expect(deletes).toHaveLength(2);
    expect(deletes[0].ops[3].args).toEqual(['group_id', null]);
    expect(deletes[1].ops[3].args).toEqual(['user_id', null]);
  });
});

describe('idempotence, failures and validation', () => {
  it('a retry deletes nothing and reports 0 with the not-found sources (no inflated count)', async () => {
    installQueryDouble({ ...PATH_ROW, 'learning_path_assignments:delete': { data: [], error: null } });
    const res = await call({ pathId: PATH, userIds: [DOCENTE], groupIds: [GROUP] });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      unassigned_count: 0,
      removed: { directUserIds: [], groupIds: [], notFound: { userIds: [DOCENTE], groupIds: [GROUP] } },
    });
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('a failed group delete is a 500 with no success claim, after the direct removal was already reported to the audit trail', async () => {
    installQueryDouble({
      ...PATH_ROW,
      'learning_path_assignments:delete#1': { data: [{ user_id: DOCENTE }], error: null },
      'learning_path_assignments:delete#2': { data: null, error: { message: 'synthetic delete failure' } },
    });
    const res = await call({ pathId: PATH, userIds: [DOCENTE], groupIds: [GROUP] });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Failed to unassign groups: synthetic delete failure' });
    expect(mockLogAudit).toHaveBeenCalledTimes(1); // the direct removal that did happen
  });

  it('a failed direct delete is a 500 and the group delete is not attempted', async () => {
    const calls = installQueryDouble({
      ...PATH_ROW,
      'learning_path_assignments:delete#1': { data: null, error: { message: 'synthetic delete failure' } },
    });
    const res = await call({ pathId: PATH, userIds: [DOCENTE], groupIds: [GROUP] });
    expect(res._getStatusCode()).toBe(500);
    expect(calls.filter((c) => c.ops[0]?.method === 'delete')).toHaveLength(1);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('non-admin is refused before any query', async () => {
    mockHasManagePermission.mockResolvedValue(false);
    installQueryDouble({});
    const res = await call({ pathId: PATH, groupIds: [GROUP] });
    expect(res._getStatusCode()).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('missing pathId / empty selection are 400; unknown path is 404; a path lookup error is 500', async () => {
    installQueryDouble({ 'learning_paths:select': { data: null, error: null } });
    expect((await call({ groupIds: [GROUP] }))._getStatusCode()).toBe(400);
    expect((await call({ pathId: PATH, userIds: [], groupIds: [] }))._getStatusCode()).toBe(400);
    expect((await call({ pathId: PATH, groupIds: [GROUP] }))._getStatusCode()).toBe(404);
    installQueryDouble({ 'learning_paths:select': { data: null, error: { message: 'synthetic' } } });
    expect((await call({ pathId: PATH, groupIds: [GROUP] }))._getStatusCode()).toBe(500);
  });

  it('only DELETE is accepted', async () => {
    expect((await call({ pathId: PATH, groupIds: [GROUP] }, 'POST'))._getStatusCode()).toBe(405);
  });
});
