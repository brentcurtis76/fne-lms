// @vitest-environment node
// F7c N40: the route's answer when the database refuses a recipient outside the
// caller's assignments. Database access outcomes are proved in pgTAP 136.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), rpc: vi.fn(), from: vi.fn(), audit: vi.fn() }));
vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mocks.user, createApiSupabaseClient: mocks.client,
  sendAuthError: (res: any, error: string) => res.status(401).json({ error }),
  handleMethodNotAllowed: (res: any) => res.status(405).end(),
}));
vi.mock('../../../lib/auditLog', () => ({ logBatchAssignmentAudit: mocks.audit, createCourseAssignmentAuditEntries: vi.fn(() => []) }));
import handler from '../../../pages/api/courses/unassign';
let roles: { data: unknown; error?: unknown };
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  roles = { data: [{ role_type: 'consultor' }] };
  mocks.user.mockResolvedValue({ user: { id: 'actor' } });
  mocks.client.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: { success: true, unassigned_count: 2 } });
  mocks.from.mockImplementation((table: string) => {
    const q: any = {};
    for (const m of ['select', 'eq', 'single']) q[m] = () => q;
    q.then = (resolve: (r: unknown) => unknown) => Promise.resolve(table === 'user_roles' ? roles : { data: { id: 'course', title: 'Synthetic course' } }).then(resolve);
    return q;
  });
});
afterEach(() => vi.restoreAllMocks());
async function del() {
  const { req, res } = createMocks({ method: 'DELETE', body: { courseId: 'course', userIds: ['covered-user', 'other-user'] } });
  await handler(req as never, res as never);
  return res;
}
describe('course unassign answer', () => {
  it('takes the course away and reports the count', async () => {
    const res = await del();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, unassigned_count: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith('batch_unassign_courses', { p_course_id: 'course', p_user_ids: ['covered-user', 'other-user'] });
  });
  it('F7c N40: a recipient outside the caller\'s assignments (42501) is answered 403 with the coverage message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: "Recipient not covered by the caller's assignments" } });
    const res = await del();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Solo puede quitar cursos a personas de sus colegios, generaciones o comunidades asignadas' });
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('any other database error stays a 500', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Course not found' } });
    expect((await del())._getStatusCode()).toBe(500);
  });
});
