// @vitest-environment node
/**
 * W-B2c-01 — the API boundary of the learning-path access model
 * (docs/reviews/w-b2c-01-learning-path-governance-correction-2026-08-29.md §5):
 *
 *   * management (create / assign) and cross-user reporting (analytics, another
 *     user's paths, the assignment matrix) are literal-admin-only — equipo_directivo
 *     and consultor are refused with 403 BEFORE any write or privileged read;
 *   * consumption is own-data: a user reads their own paths, and a session may only
 *     be started on a path the database's auth.uid()-derived helper says is assigned;
 *   * the actor passed to the SECURITY DEFINER RPCs is always the authenticated user.
 *
 * Every route's authentication is a mock of lib/api-auth (the same helpers the routes
 * import), the service is a mock where the route delegates, and the Supabase client is
 * a recording double. What this proves is the routing of authority; the database half
 * is proved by supabase/tests/070-learning-path-governance.sql.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const DIRECTIVO = '22222222-2222-4222-8222-222222222222';
const CONSULTOR = '33333333-3333-4333-8333-333333333333';
const DOCENTE = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const PATH = '66666666-6666-4666-8666-666666666666';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

const { mockHasManagePermission, mockCreateLearningPath, mockGetUserAssignedPaths, mockBatchAssign } = vi.hoisted(() => ({
  mockHasManagePermission: vi.fn(),
  mockCreateLearningPath: vi.fn(),
  mockGetUserAssignedPaths: vi.fn(),
  mockBatchAssign: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createApiSupabaseClient: mockCreateApiSupabaseClient,
  };
});

vi.mock('../../../lib/services/learningPathsService', () => ({
  LearningPathsService: {
    hasManagePermission: mockHasManagePermission,
    canManagePath: mockHasManagePermission,
    createLearningPath: mockCreateLearningPath,
    getUserAssignedPaths: mockGetUserAssignedPaths,
    batchAssignLearningPath: mockBatchAssign,
  },
}));

import indexHandler from '../../../pages/api/learning-paths/index';
import assignHandler from '../../../pages/api/learning-paths/assign';
import analyticsHandler from '../../../pages/api/learning-paths/analytics';
import userPathsHandler from '../../../pages/api/learning-paths/user/[userId]';
import startSessionHandler from '../../../pages/api/learning-paths/session/start';
import userAssignmentsHandler from '../../../pages/api/admin/assignment-matrix/user-assignments';

/** Records every from(table) chain; resolves each to the result registered for `table:firstMethod`. */
function installQueryDouble(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Array<{ table: string; ops: Array<{ method: string; args: unknown[] }> }> = [];
  mockFrom.mockImplementation((table: string) => {
    const entry = { table, ops: [] as Array<{ method: string; args: unknown[] }> };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'or', 'not', 'is', 'single', 'maybeSingle', 'order', 'insert', 'update', 'delete']) {
      chain[method] = (...args: unknown[]) => {
        entry.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const key = `${table}:${entry.ops[0]?.method ?? ''}`;
      return Promise.resolve(results[key] ?? { data: [], error: null }).then(resolve, reject);
    };
    return chain;
  });
  return calls;
}

function authenticatedAs(id: string) {
  mockGetApiUser.mockResolvedValue({ user: { id, email: `${id}@example.com` }, error: null });
}

async function call(handler: (req: unknown, res: unknown) => Promise<unknown> | unknown, opts: Record<string, unknown>) {
  const { req, res } = createMocks(opts as never);
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateApiSupabaseClient.mockResolvedValue({ from: mockFrom, rpc: mockRpc });
  mockRpc.mockResolvedValue({ data: null, error: null });
  installQueryDouble({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/learning-paths — create is literal-admin-only', () => {
  it.each([
    ['equipo_directivo', DIRECTIVO],
    ['consultor', CONSULTOR],
    ['docente', DOCENTE],
  ])('%s: 403 and no template is created', async (_role, id) => {
    authenticatedAs(id);
    mockHasManagePermission.mockResolvedValue(false);
    const res = await call(indexHandler, {
      method: 'POST',
      body: { name: 'Synthetic', description: 'Synthetic', courseIds: [] },
    });
    expect(res._getStatusCode()).toBe(403);
    expect(mockHasManagePermission).toHaveBeenCalledWith(expect.anything(), id);
    expect(mockCreateLearningPath).not.toHaveBeenCalled();
  });

  it('admin: created with the AUTHENTICATED user as actor, never a body-supplied one', async () => {
    authenticatedAs(ADMIN);
    mockHasManagePermission.mockResolvedValue(true);
    mockCreateLearningPath.mockResolvedValue({ id: PATH, name: 'Synthetic' });
    const res = await call(indexHandler, {
      method: 'POST',
      body: { name: 'Synthetic', description: 'Synthetic', courseIds: [], createdBy: OTHER, created_by: OTHER },
    });
    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateLearningPath).toHaveBeenCalledWith(expect.anything(), 'Synthetic', 'Synthetic', [], ADMIN);
  });
});

describe('POST /api/learning-paths/assign — assign is literal-admin-only', () => {
  it.each([
    ['equipo_directivo', DIRECTIVO],
    ['consultor', CONSULTOR],
  ])('%s: 403 before any lookup or assignment', async (_role, id) => {
    authenticatedAs(id);
    mockHasManagePermission.mockResolvedValue(false);
    const res = await call(assignHandler, { method: 'POST', body: { pathId: PATH, userId: DOCENTE } });
    expect(res._getStatusCode()).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockBatchAssign).not.toHaveBeenCalled();
  });
});

describe('GET /api/learning-paths/analytics — cross-user reporting is literal-admin-only', () => {
  it.each([
    ['equipo_directivo', DIRECTIVO],
    ['consultor', CONSULTOR],
  ])('%s: 403 before any query', async (_role, id) => {
    authenticatedAs(id);
    mockHasManagePermission.mockResolvedValue(false);
    const res = await call(analyticsHandler, { method: 'GET', query: {} });
    expect(res._getStatusCode()).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('GET /api/learning-paths/user/[userId] — own paths, or admin for another user', () => {
  it('a docente asking for ANOTHER user is refused (403) with no data read', async () => {
    authenticatedAs(DOCENTE);
    mockHasManagePermission.mockResolvedValue(false);
    const res = await call(userPathsHandler, { method: 'GET', query: { userId: OTHER } });
    expect(res._getStatusCode()).toBe(403);
    expect(mockGetUserAssignedPaths).not.toHaveBeenCalled();
  });

  it('a docente asking for THEMSELVES gets their assigned paths with course counts', async () => {
    authenticatedAs(DOCENTE);
    mockGetUserAssignedPaths.mockResolvedValue([{ id: PATH, name: 'Synthetic' }]);
    const calls = installQueryDouble({
      'learning_path_courses:select': { data: [{ learning_path_id: PATH }, { learning_path_id: PATH }], error: null },
    });
    const res = await call(userPathsHandler, { method: 'GET', query: { userId: DOCENTE } });
    expect(res._getStatusCode()).toBe(200);
    expect(mockHasManagePermission).not.toHaveBeenCalled();
    expect(mockGetUserAssignedPaths).toHaveBeenCalledWith(expect.anything(), DOCENTE);
    expect(res._getJSONData()).toEqual([{ id: PATH, name: 'Synthetic', course_count: 2 }]);
    // The count uses the real column (learning_path_id), not the absent path_id.
    expect(calls[0].ops[1]).toEqual({ method: 'in', args: ['learning_path_id', [PATH]] });
    // No RPC: the former get_user_learning_paths call exists in no migration.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('an admin may read another user', async () => {
    authenticatedAs(ADMIN);
    mockHasManagePermission.mockResolvedValue(true);
    mockGetUserAssignedPaths.mockResolvedValue([]);
    const res = await call(userPathsHandler, { method: 'GET', query: { userId: OTHER } });
    expect(res._getStatusCode()).toBe(200);
    expect(mockGetUserAssignedPaths).toHaveBeenCalledWith(expect.anything(), OTHER);
  });
});

describe('POST /api/learning-paths/session/start — assignment decided by the database helper', () => {
  it('a non-admin the helper does not recognise as assignee is refused, nothing starts', async () => {
    authenticatedAs(CONSULTOR);
    installQueryDouble({ 'user_roles:select': { data: [{ role_type: 'consultor' }], error: null } });
    mockRpc.mockImplementation(async (fn: string) =>
      fn === 'auth_is_learning_path_assignee' ? { data: false, error: null } : { data: null, error: null }
    );
    const res = await call(startSessionHandler, { method: 'POST', body: { pathId: PATH } });
    expect(res._getStatusCode()).toBe(403);
    expect(mockRpc).toHaveBeenCalledWith('auth_is_learning_path_assignee', { p_path_id: PATH });
    expect(mockRpc).not.toHaveBeenCalledWith('start_learning_path_session', expect.anything());
  });

  it('an assignee starts a session with p_user_id = the authenticated user, whatever the body says', async () => {
    authenticatedAs(DOCENTE);
    installQueryDouble({ 'user_roles:select': { data: [{ role_type: 'docente' }], error: null } });
    mockRpc.mockImplementation(async (fn: string) => {
      if (fn === 'auth_is_learning_path_assignee') return { data: true, error: null };
      if (fn === 'start_learning_path_session') return { data: '77777777-7777-4777-8777-777777777777', error: null };
      return { data: null, error: null };
    });
    const res = await call(startSessionHandler, {
      method: 'POST',
      body: { pathId: PATH, userId: OTHER, p_user_id: OTHER },
    });
    expect(res._getStatusCode()).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('start_learning_path_session', expect.objectContaining({
      p_user_id: DOCENTE,
      p_path_id: PATH,
    }));
  });
});

describe('GET /api/admin/assignment-matrix/user-assignments — course half for consultor, learning paths admin-only', () => {
  const target = { data: { id: DOCENTE, first_name: 'Docente', last_name: 'Sintética', email: 'docente@example.com' }, error: null };

  it('docente: 403 (never in the matrix audience)', async () => {
    authenticatedAs(DOCENTE);
    installQueryDouble({ 'user_roles:select': { data: [{ role_type: 'docente' }], error: null } });
    const res = await call(userAssignmentsHandler, { method: 'GET', query: { userId: OTHER } });
    expect(res._getStatusCode()).toBe(403);
  });

  it('consultor: 200 with the course assignments, but NO learning-path query and NO learning-path data', async () => {
    authenticatedAs(CONSULTOR);
    const calls = installQueryDouble({
      'user_roles:select': { data: [{ role_type: 'consultor' }], error: null },
      'profiles:select': target,
      'course_enrollments:select': {
        data: [{
          id: 'enr-1', course_id: 'course-1', enrolled_by: null, enrolled_at: '2026-09-01T00:00:00.000Z',
          status: 'active', lessons_completed: 1, total_lessons: 4,
          courses: { id: 'course-1', title: 'Curso sintético', description: null, thumbnail_url: null },
        }],
        error: null,
      },
    });
    const res = await call(userAssignmentsHandler, { method: 'GET', query: { userId: DOCENTE } });
    expect(res._getStatusCode(), JSON.stringify(res._getJSONData())).toBe(200);
    const body = res._getJSONData() as { assignments: Array<Record<string, unknown>>; stats: Record<string, number> };
    expect(body.assignments.map((a) => a.type)).toEqual(['course']);
    expect(body.assignments[0]).toMatchObject({ contentId: 'course-1', sourceLPIds: [], sourceLPNames: [] });
    expect(body.stats).toMatchObject({ totalCourses: 1, totalLPs: 0, overlappingCourses: 0 });
    expect(calls.map((c) => c.table)).not.toContain('learning_path_assignments');
    expect(calls.map((c) => c.table)).not.toContain('learning_path_courses');
  });

  it('admin: the learning-path assignments of the user ARE read', async () => {
    authenticatedAs(ADMIN);
    const calls = installQueryDouble({
      'user_roles:select': { data: [{ role_type: 'admin' }], error: null },
      'profiles:select': target,
      'learning_path_assignments:select': {
        data: [{ id: 'lpa-1', path_id: PATH, assigned_by: null, assigned_at: '2026-09-01T00:00:00.000Z', learning_paths: { id: PATH, name: 'Ruta sintética', description: null } }],
        error: null,
      },
    });
    const res = await call(userAssignmentsHandler, { method: 'GET', query: { userId: DOCENTE } });
    expect(res._getStatusCode(), JSON.stringify(res._getJSONData())).toBe(200);
    const body = res._getJSONData() as { assignments: Array<Record<string, unknown>>; stats: Record<string, number> };
    expect(body.assignments.map((a) => a.type)).toContain('learning_path');
    expect(body.stats.totalLPs).toBe(1);
    expect(calls.map((c) => c.table)).toContain('learning_path_assignments');
  });
});
