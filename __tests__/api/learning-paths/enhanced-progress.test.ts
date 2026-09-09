// @vitest-environment node
/**
 * R2-04 (2026-09-07) — GET /api/learning-paths/[id]/enhanced-progress for a
 * GROUP-ONLY assignee: no own assignment row exists, authority is the
 * auth.uid()-derived helper, and the figures come from the caller's own
 * progress row (learning_path_user_progress). A caller who is neither directly
 * assigned nor a valid group member still gets 404, and admins are unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const DOCENTE = '44444444-4444-4444-8444-444444444444';
const PATH = '66666666-6666-4666-8666-666666666666';
const GROUP = '99999999-9999-4999-8999-999999999999';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getApiUser: mockGetApiUser, createApiSupabaseClient: mockCreateApiSupabaseClient };
});

import handler from '../../../pages/api/learning-paths/[id]/enhanced-progress';

type Result = { data?: unknown; error?: unknown };

/** Query double keyed by `${table}#${n}` (n-th from() on that table) or `${table}`. */
function installQueryDouble(results: Record<string, Result>) {
  const seen: Record<string, number> = {};
  const calls: Array<{ table: string; ops: Array<{ method: string; args: unknown[] }> }> = [];
  mockFrom.mockImplementation((table: string) => {
    seen[table] = (seen[table] ?? 0) + 1;
    const key = `${table}#${seen[table]}`;
    const entry = { table, ops: [] as Array<{ method: string; args: unknown[] }> };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) {
      chain[m] = (...args: unknown[]) => { entry.ops.push({ method: m, args }); return chain; };
    }
    const resolve = () => results[key] ?? results[table] ?? { data: null, error: null };
    chain.single = async () => resolve();
    chain.maybeSingle = async () => resolve();
    chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(res, rej);
    return chain;
  });
  return calls;
}

async function get() {
  const { req, res } = createMocks({ method: 'GET', query: { id: PATH } });
  await handler(req as never, res as never);
  return res;
}

const LP = { id: PATH, name: 'Synthetic', description: 'd', created_at: '2026-01-01T00:00:00Z' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue({ rpc: mockRpc, from: mockFrom });
});
afterEach(() => vi.restoreAllMocks());

describe('GET /api/learning-paths/[id]/enhanced-progress — group-only assignee', () => {
  it('answers from the group assignment and the OWN progress row when no direct row exists', async () => {
    installQueryDouble({
      'user_roles#1': { data: [{ role_type: 'docente' }] },
      'learning_path_assignments#1': { data: null },                     // no own row
      'learning_path_assignments#2': { data: { id: 'ga1', path_id: PATH, group_id: GROUP, assigned_at: '2026-02-01T00:00:00Z', learning_paths: LP } },
      'learning_path_user_progress#1': { data: { started_at: '2026-03-01T00:00:00Z', last_activity_at: null, completed_at: null, current_course_sequence: 2, total_time_spent_minutes: 20 } },
      'learning_path_courses#1': { data: [] },
      'learning_path_assignments#3': { data: [{ user_id: DOCENTE, assigned_at: '2026-02-01T00:00:00Z' }] },
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
    const res = await get();
    expect(res._getStatusCode()).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('auth_is_learning_path_assignee', { p_path_id: PATH });
    const body = res._getJSONData();
    expect(body.pathInfo.id).toBe(PATH);
    expect(body.userProgress.assignedAt).toBe('2026-02-01T00:00:00Z');
    // R3-04: the figures come from the own progress record
    expect(body.userProgress.totalTimeSpent).toBe(20);
    expect(body.userProgress.currentCourse).toBe(2);
    expect(body.userProgress.startDate).toBe('2026-03-01T00:00:00Z');
    expect(body.userProgress.status).toBe('in_progress');
  });

  it('a caller with no own row and no valid membership is 404 (the helper decides)', async () => {
    installQueryDouble({
      'user_roles#1': { data: [{ role_type: 'docente' }] },
      'learning_path_assignments#1': { data: null },
    });
    mockRpc.mockResolvedValue({ data: false, error: null });
    const res = await get();
    expect(res._getStatusCode()).toBe(404);
    // the group assignment row and the progress row were never read
    expect(mockFrom.mock.calls.map((c) => c[0])).not.toContain('learning_path_user_progress');
  });

  it('a direct assignee still answers from their own row without consulting the helper', async () => {
    installQueryDouble({
      'user_roles#1': { data: [{ role_type: 'docente' }] },
      'learning_path_assignments#1': { data: { id: 'a1', user_id: DOCENTE, path_id: PATH, assigned_at: '2026-02-01T00:00:00Z', learning_paths: LP } },
      'learning_path_courses#1': { data: [] },
      'learning_path_assignments#2': { data: [] },
    });
    const res = await get();
    expect(res._getStatusCode()).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('GET /api/learning-paths/[id]/enhanced-progress — R3-04 authoritative progress record', () => {
  it('a direct assignee whose NEW direct row is empty is reported from the own progress record (Codex reproduction: 20, not 0)', async () => {
    installQueryDouble({
      'user_roles#1': { data: [{ role_type: 'docente' }] },
      'learning_path_assignments#1': { data: { id: 'a1', user_id: DOCENTE, path_id: PATH, assigned_at: '2026-02-01T00:00:00Z', total_time_spent_minutes: 0, current_course_sequence: 1, started_at: null, completed_at: null, learning_paths: LP } },
      'learning_path_user_progress#1': { data: { started_at: '2026-03-01T00:00:00Z', last_activity_at: '2026-03-02T00:00:00Z', completed_at: null, current_course_sequence: 2, total_time_spent_minutes: 20 } },
      'learning_path_courses#1': { data: [] },
      'learning_path_assignments#2': { data: [] },
    });
    const res = await get();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.userProgress.totalTimeSpent).toBe(20);
    expect(body.userProgress.currentCourse).toBe(2);
    expect(body.userProgress.startDate).toBe('2026-03-01T00:00:00Z');
    expect(body.userProgress.status).toBe('in_progress');
    expect(body.userProgress.assignedAt).toBe('2026-02-01T00:00:00Z');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('a direct assignee with history but no progress row yet falls back to the direct row (never reset to zero)', async () => {
    installQueryDouble({
      'user_roles#1': { data: [{ role_type: 'docente' }] },
      'learning_path_assignments#1': { data: { id: 'a1', user_id: DOCENTE, path_id: PATH, assigned_at: '2026-02-01T00:00:00Z', total_time_spent_minutes: 120, current_course_sequence: 3, started_at: '2026-01-05T00:00:00Z', completed_at: '2026-01-20T00:00:00Z', learning_paths: LP } },
      'learning_path_user_progress#1': { data: null },
      'learning_path_courses#1': { data: [] },
      'learning_path_assignments#2': { data: [] },
    });
    const res = await get();
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.userProgress.totalTimeSpent).toBe(120);
    expect(body.userProgress.currentCourse).toBe(3);
    expect(body.userProgress.completedAt).toBe('2026-01-20T00:00:00Z');
    expect(body.userProgress.status).toBe('completed');
  });

  it('a group-only member after losing the direct row still reads their preserved progress', async () => {
    installQueryDouble({
      'user_roles#1': { data: [{ role_type: 'docente' }] },
      'learning_path_assignments#1': { data: null },
      'learning_path_assignments#2': { data: { id: 'ga1', path_id: PATH, group_id: GROUP, assigned_at: '2026-02-01T00:00:00Z', learning_paths: LP } },
      'learning_path_user_progress#1': { data: { started_at: '2026-03-01T00:00:00Z', last_activity_at: null, completed_at: null, current_course_sequence: 2, total_time_spent_minutes: 35 } },
      'learning_path_courses#1': { data: [] },
      'learning_path_assignments#3': { data: [] },
    });
    mockRpc.mockResolvedValue({ data: true, error: null });
    const res = await get();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().userProgress.totalTimeSpent).toBe(35);
  });
});
