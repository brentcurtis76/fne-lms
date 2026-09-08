// @vitest-environment node
// Database access outcomes are proved in pgTAP 080 and the real-token E2E.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
const mocks = vi.hoisted(() => ({ user: vi.fn(), client: vi.fn(), rpc: vi.fn(), from: vi.fn(), notify: vi.fn(), audit: vi.fn() }));
vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mocks.user, createApiSupabaseClient: mocks.client,
  sendAuthError: (res: any, error: string) => res.status(401).json({ error }),
  handleMethodNotAllowed: (res: any) => res.status(405).end(),
}));
vi.mock('../../../lib/notificationService', () => ({ default: { triggerNotification: mocks.notify } }));
vi.mock('../../../lib/auditLog', () => ({ logBatchAssignmentAudit: mocks.audit, createCourseAssignmentAuditEntries: vi.fn(() => []) }));
import handler from '../../../pages/api/courses/batch-assign';
const grant = { success: true, assignments_created: 1, assignments_skipped: 1, enrollments_created: 0, enrollments_promoted: 1, enrollments_unchanged: 1, assignment_ids: ['new-assignment'], message: 'result' };
let roles: { data: unknown; error?: unknown };
let filters: unknown[][];
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  roles = { data: [{ role_type: 'admin' }] };
  filters = [];
  mocks.user.mockResolvedValue({ user: { id: 'actor', user_metadata: { role: 'admin' } } });
  mocks.client.mockResolvedValue({ from: mocks.from, rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: grant });
  mocks.from.mockImplementation((table: string) => {
    const q: any = {};
    for (const m of ['select', 'eq', 'single', 'in']) q[m] = (...args: unknown[]) => { if (m === 'in') filters.push(args); return q; };
    q.then = (resolve: (r: unknown) => unknown) => Promise.resolve(table === 'user_roles' ? roles : table === 'courses' ? { data: { id: 'course', title: 'Synthetic course' } } : { data: [{ teacher_id: 'new-user' }] }).then(resolve);
    return q;
  });
});
afterEach(() => vi.restoreAllMocks());
async function post() {
  const { req, res } = createMocks({ method: 'POST', body: { courseId: 'course', userIds: ['new-user', 'existing-user'] } });
  await handler(req as never, res as never);
  return res;
}
describe('batch independent grant response and authority', () => {
  it.each(['admin', 'consultor'])('preserves the active %s contract and reports actual created/promoted/unchanged counts', async role => {
    roles = { data: [{ role_type: role }] };
    const res = await post();
    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData()).toMatchObject({ enrollments_created: 0, enrollments_promoted: 1, enrollments_unchanged: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith('batch_assign_courses', { p_course_id: 'course', p_user_ids: ['new-user', 'existing-user'] });
    expect(filters).toContainEqual(['id', ['new-assignment']]);
    expect(mocks.notify.mock.calls[0][1].assigned_users).toEqual(['new-user']);
  });
  it('retry reports no creations and sends no duplicate notification', async () => {
    mocks.rpc.mockResolvedValue({ data: { ...grant, assignments_created: 0, assignments_skipped: 2, enrollments_promoted: 0, enrollments_unchanged: 2 } });
    const res = await post();
    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData()).toMatchObject({ assignments_created: 0, enrollments_unchanged: 2 });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each([{ data: [], error: null }, { data: [{ role_type: 'docente' }] }, { data: [{ role_type: 'admin' }], error: { message: 'unavailable' } }])('metadata cannot override absent authority or a role query error: %j', async value => {
    roles = value;
    expect((await post())._getStatusCode()).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: 'enrollment failure' } }, { data: { success: false } }, { data: null }])('a refused/failed RPC cannot become a successful grant: %j', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect((await post())._getStatusCode()).toBe(500);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('keeps compatibility with the old database response shape', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: true, assignments_created: 0, assignments_skipped: 2, enrollments_created: 0, assignment_ids: [], message: 'existing' } });
    expect((await post())._getJSONData()).toMatchObject({ enrollments_promoted: 0, enrollments_unchanged: 0 });
  });
});
