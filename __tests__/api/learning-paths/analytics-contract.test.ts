// @vitest-environment node
/**
 * RLS closure C3 (2026-09-07, decision D2) — GET /api/learning-paths/analytics reads the
 * LIVE summary views of migration 20260907120600 and honours the metric contract
 * (docs/reviews/rls-learning-path-reporting-contract-2026-09-07.md):
 *   * literal-admin-only (the 403 half is pinned by governance-boundary.test.ts);
 *   * a failed query is an error response (502 naming the relation), never a silent zero;
 *   * metrics with no governing definition are null and listed under `unavailable`;
 *   * rates over an empty population are null, not 0;
 *   * the four relations are the migrated views, no `learning_paths!inner` embed on a view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PATH = '66666666-6666-4666-8666-666666666666';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockFrom, mockHasManagePermission } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockFrom: vi.fn(),
  mockHasManagePermission: vi.fn(),
}));
vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getApiUser: mockGetApiUser, createApiSupabaseClient: mockCreateApiSupabaseClient };
});
vi.mock('../../../lib/services/learningPathsService', () => ({
  LearningPathsService: { hasManagePermission: mockHasManagePermission },
}));

import handler from '../../../pages/api/learning-paths/analytics';

type Call = { table: string; ops: Array<{ method: string; args: unknown[] }> };
function installQueryDouble(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Call[] = [];
  mockFrom.mockImplementation((table: string) => {
    const entry: Call = { table, ops: [] };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'single', 'maybeSingle']) {
      chain[method] = (...args: unknown[]) => {
        entry.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  });
  return calls;
}

async function call(query: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue({ from: mockFrom });
  mockHasManagePermission.mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('overview', () => {
  it('reads the two migrated views and reports null (not 0) for unavailable metrics and empty rates', async () => {
    const calls = installQueryDouble({
      learning_path_performance_summary: {
        data: [
          { path_id: PATH, path_name: 'A', total_enrolled_users: 4, total_completed_users: 1, total_in_progress_users: 2, total_time_spent_hours: '5.42', overall_completion_rate: '25.00', avg_completion_time_days: '11.13', engagement_score: null, total_courses: 2, recent_enrollments: 1, recent_completions: 0, recent_session_time_hours: '1.00' },
          { path_id: 'p2', path_name: 'B (empty)', total_enrolled_users: 0, total_completed_users: 0, total_in_progress_users: 0, total_time_spent_hours: '0', overall_completion_rate: null, avg_completion_time_days: null, engagement_score: null, total_courses: 0, recent_enrollments: 0, recent_completions: 0, recent_session_time_hours: '0' },
        ],
      },
      learning_path_daily_summary: {
        data: [
          { path_id: PATH, summary_date: '2026-09-01', total_active_users: 2, total_sessions_count: 3, total_session_time_minutes: 70, course_completions: 1, new_enrollments: 0 },
          { path_id: 'p2', summary_date: '2026-09-01', total_active_users: 1, total_sessions_count: 1, total_session_time_minutes: 10, course_completions: 0, new_enrollments: 2 },
        ],
      },
    });
    const res = await call({ dateRange: '7' });
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.summary).toEqual({ totalPaths: 2, totalAssignedUsers: 4, totalCompletedUsers: 1, averageCompletionRate: 25, totalTimeSpentHours: 5.42 });
    expect(body.recentActivity).toEqual({ timeframe: '7 days', totalSessions: 4, activeUserDays: 3 });
    expect(body.completionTrends).toEqual([{ date: '2026-09-01', completions: 1, enrollments: 2 }]);
    expect(body.pathPerformance[0]).toMatchObject({ pathId: PATH, completionRate: 25, engagementScore: null, avgCompletionTimeDays: 11.13 });
    expect(body.pathPerformance[1]).toMatchObject({ pathId: 'p2', completionRate: null, engagementScore: null });
    expect(body.lowPerformingPaths.map((p: any) => p.pathId)).toEqual([PATH]); // null rate is not "low"
    expect(body.unavailable).toEqual(['engagementScore', 'atRiskUsers', 'completionRate(daily)', 'avgCompletionRate(monthly)']);
    expect(calls.map((c) => c.table)).toEqual(['learning_path_performance_summary', 'learning_path_daily_summary']);
    expect(String(calls[0].ops[0].args[0])).not.toContain('learning_paths!inner');
    expect(calls[1].ops.find((op) => op.method === 'gte')?.args[0]).toBe('summary_date');
  });

  it('an empty population yields null averages, not 0', async () => {
    installQueryDouble({ learning_path_performance_summary: { data: [] }, learning_path_daily_summary: { data: [] } });
    const res = await call();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().summary).toEqual({ totalPaths: 0, totalAssignedUsers: 0, totalCompletedUsers: 0, averageCompletionRate: null, totalTimeSpentHours: 0 });
  });

  it('a failed view query is a 502 naming the relation, never a zeroed 200', async () => {
    installQueryDouble({ learning_path_performance_summary: { data: null, error: { message: 'relation unavailable' } } });
    const res = await call();
    expect(res._getStatusCode()).toBe(502);
    expect(res._getJSONData()).toEqual({ error: 'Learning path analytics are temporarily unavailable', relation: 'learning_path_performance_summary' });
  });
});

describe('path-specific', () => {
  it('reads the four relations and reports unavailable metrics as null', async () => {
    const calls = installQueryDouble({
      learning_path_performance_summary: { data: [{ path_id: PATH, path_name: 'A', path_description: 'd', total_enrolled_users: 2, total_completed_users: 1, overall_completion_rate: '50.00', avg_completion_time_days: '3.00', engagement_score: null, total_time_spent_hours: '2.00', recent_enrollments: 0, recent_completions: 1 }] },
      learning_path_daily_summary: { data: [{ summary_date: '2026-09-01', total_sessions_count: 2, total_active_users: 1, total_session_time_minutes: 30 }] },
      user_learning_path_summary: {
        data: [
          { user_id: 'u1', status: 'completed', current_course_sequence: 2, total_time_spent_minutes: 90, overall_progress_percentage: '100.00' },
          { user_id: 'u2', status: 'in_progress', current_course_sequence: 1, total_time_spent_minutes: 30, overall_progress_percentage: '50.00' },
        ],
      },
      learning_path_courses: { data: [{ course_id: 'c1', sequence_order: 1, courses: { title: 'K1' } }, { course_id: 'c2', sequence_order: 2, courses: { title: 'K2' } }] },
    });
    const res = await call({ pathId: PATH, dateRange: '30' });
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.pathInfo).toMatchObject({ pathId: PATH, completionRate: 50, engagementScore: null, avgCompletionTimeDays: 3 });
    expect(body.userAnalytics).toEqual({ totalUsers: 2, completedUsers: 1, inProgressUsers: 1, notStartedUsers: 0, atRiskUsers: null, avgProgressPercentage: 75 });
    expect(body.courseProgression).toEqual([
      { courseId: 'c1', courseName: 'K1', sequenceOrder: 1, usersReached: 2, dropoffRate: 0, reachRate: 100 },
      { courseId: 'c2', courseName: 'K2', sequenceOrder: 2, usersReached: 1, dropoffRate: 50, reachRate: 50 },
    ]);
    expect(body.timeAnalytics).toEqual({ avgCompletionTimeMinutes: 90, avgCompletionTimeHours: 1.5, totalTimeSpentHours: 2 });
    expect(body.activityHeatmap).toEqual({ '2026-09-01': { sessions: 2, activeUsers: 1, timeSpent: 30 } });
    expect(calls.map((c) => c.table)).toEqual(['learning_path_performance_summary', 'learning_path_daily_summary', 'user_learning_path_summary', 'learning_path_courses']);
    expect(calls[2].ops.find((op) => op.method === 'eq')?.args).toEqual(['path_id', PATH]);
  });

  it('an unknown path is 404; a failed user-summary query is 502', async () => {
    installQueryDouble({ learning_path_performance_summary: { data: [] } });
    expect((await call({ pathId: PATH }))._getStatusCode()).toBe(404);
    installQueryDouble({
      learning_path_performance_summary: { data: [{ path_id: PATH, path_name: 'A' }] },
      user_learning_path_summary: { data: null, error: { message: 'boom' } },
    });
    const res = await call({ pathId: PATH });
    expect(res._getStatusCode()).toBe(502);
    expect(res._getJSONData().relation).toBe('user_learning_path_summary');
  });
});
