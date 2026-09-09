// @vitest-environment node
/**
 * R2-04 (2026-09-07) — POST /api/learning-paths/session/activity delegates every
 * write to `record_learning_path_activity` (SECURITY DEFINER, actor = auth.uid()):
 * the route no longer updates learning_path_progress_sessions or
 * learning_path_assignments itself, so a group-only assignee's progress (course
 * sequence, completion) lands in their own progress row instead of an assignment
 * UPDATE that matched nothing. The database half is proved by pgTAP 073 §4.
 * R3-01 (2026-09-07): the RPC refuses (42501) once the caller has lost
 * assignment authority; the route answers 403 (pgTAP 074 §2 proves the RPC).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const DOCENTE = '44444444-4444-4444-8444-444444444444';
const SESSION = '77777777-7777-4777-8777-777777777777';
const COURSE = '88888888-8888-4888-8888-888888888888';

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

import handler from '../../../pages/api/learning-paths/session/activity';

async function post(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue({ rpc: mockRpc, from: mockFrom });
  mockRpc.mockResolvedValue({ data: { ok: true, sessionId: SESSION, activityType: 'course_start', courseId: COURSE }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/learning-paths/session/activity', () => {
  it('records the activity through the RPC and never touches a table directly', async () => {
    const res = await post({ sessionId: SESSION, activityType: 'course_start', courseId: COURSE });
    expect(res._getStatusCode()).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_learning_path_activity', {
      p_session_id: SESSION,
      p_activity_type: 'course_start',
      p_course_id: COURSE,
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(res._getJSONData()).toMatchObject({ sessionId: SESSION, activityType: 'course_start', courseId: COURSE });
  });

  it('path_complete without a course passes a NULL course', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, courseId: null }, error: null });
    const res = await post({ sessionId: SESSION, activityType: 'path_complete' });
    expect(res._getStatusCode()).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith('record_learning_path_activity', expect.objectContaining({ p_course_id: null }));
  });

  it("someone else's (or a missing) session is 404 — indistinguishable", async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'not_found' }, error: null });
    expect((await post({ sessionId: SESSION, activityType: 'path_view' }))._getStatusCode()).toBe(404);
  });

  it('an ended session is 400', async () => {
    mockRpc.mockResolvedValue({ data: { ok: false, reason: 'ended' }, error: null });
    expect((await post({ sessionId: SESSION, activityType: 'path_view' }))._getStatusCode()).toBe(400);
  });

  it('a course outside the path (22023 from the database) is 400', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Course is not part of this learning path' } });
    const res = await post({ sessionId: SESSION, activityType: 'course_start', courseId: COURSE });
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/not part of this learning path/);
  });

  it('R3-01: lost assignment authority (42501 from the RPC) is a 403 denial, not a 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'User is not assigned to this learning path' } });
    const res = await post({ sessionId: SESSION, activityType: 'path_complete' });
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toMatch(/do not have access/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('any other database error is 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'internal' } });
    expect((await post({ sessionId: SESSION, activityType: 'path_view' }))._getStatusCode()).toBe(500);
  });

  it('validates before calling the database', async () => {
    expect((await post({ sessionId: SESSION }))._getStatusCode()).toBe(400);
    expect((await post({ sessionId: SESSION, activityType: 'nonsense' }))._getStatusCode()).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('unauthenticated is 401', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('no session') });
    expect((await post({ sessionId: SESSION, activityType: 'path_view' }))._getStatusCode()).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
