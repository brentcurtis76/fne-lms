// @vitest-environment node
/**
 * GET/POST /api/school/transversal-context/custom-responses — R5 / Codex
 * round 1 finding 2: the custom context responses belong to the
 * transversal-context surface, so an assigned consultor is DENIED on both
 * methods (403 consultor_access_pending_decision) before any read or write,
 * exactly like /api/school/transversal-context. Admin and equipo_directivo
 * keep their access (controls).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { buildChainableQuery } from '../assessment-builder/_helpers';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
  mockSendAuthError,
  mockHandleMethodNotAllowed,
  mockHasDirectivoPermission,
  mockHasContextWriteRole,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
  mockHasContextWriteRole: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: mockSendAuthError,
  handleMethodNotAllowed: mockHandleMethodNotAllowed,
}));

vi.mock('../../../lib/permissions/directivo', () => ({
  hasDirectivoPermission: mockHasDirectivoPermission,
  hasContextWriteRole: mockHasContextWriteRole,
}));

import handler from '../../../pages/api/school/transversal-context/custom-responses';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const QUESTION_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_ID = 42;

function clients() {
  const user = { from: vi.fn(() => buildChainableQuery([], null)) };
  const service = { from: vi.fn(() => buildChainableQuery([], null)) };
  mockCreateApiSupabaseClient.mockResolvedValue(user);
  mockCreateServiceRoleClient.mockReturnValue(service);
  return { user, service };
}

describe('custom-responses — consultor denial (R5 pending decision)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
    mockSendAuthError.mockImplementation((res: any, msg: string) => res.status(401).json({ error: msg }));
    mockHandleMethodNotAllowed.mockImplementation((res: any, methods: string[]) => res.status(405).json({ error: methods.join(',') }));
  });

  function consultor() {
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false, via: 'consultor' });
    mockHasContextWriteRole.mockResolvedValue(false);
  }

  it('GET: an assigned consultor is refused with 403 and no table is read on either client', async () => {
    consultor();
    const { user, service } = clients();

    const { req, res } = createMocks({ method: 'GET', query: { school_id: String(SCHOOL_ID) } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).code).toBe('consultor_access_pending_decision');
    expect(mockHasContextWriteRole).toHaveBeenCalledWith(user, USER_ID);
    expect(user.from).not.toHaveBeenCalled();
    expect(service.from).not.toHaveBeenCalled();
  });

  it('POST: an assigned consultor is refused with 403 before validation, history, completion or any write', async () => {
    consultor();
    const { user, service } = clients();

    const { req, res } = createMocks({
      method: 'POST',
      body: { school_id: SCHOOL_ID, responses: [{ question_id: QUESTION_ID, response: 'x' }] },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).code).toBe('consultor_access_pending_decision');
    expect(user.from).not.toHaveBeenCalled();
    expect(service.from).not.toHaveBeenCalled();
  });

  it('a write-role read failure fails closed (hasContextWriteRole false → 403)', async () => {
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false, via: 'equipo_directivo' });
    mockHasContextWriteRole.mockResolvedValue(false);
    const { user } = clients();

    const { req, res } = createMocks({ method: 'GET', query: {} });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(user.from).not.toHaveBeenCalled();
  });

  it('control: a directivo reads own-school responses through the USER client', async () => {
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false, via: 'equipo_directivo' });
    mockHasContextWriteRole.mockResolvedValue(true);
    const { user } = clients();

    const { req, res } = createMocks({ method: 'GET', query: {} });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(user.from).toHaveBeenCalledWith('context_general_responses');
  });

  it('control: an admin skips the write-role lookup and reads with the school in the query', async () => {
    mockHasDirectivoPermission.mockResolvedValue({ hasPermission: true, schoolId: SCHOOL_ID, isAdmin: true, via: 'admin' });
    const { user } = clients();

    const { req, res } = createMocks({ method: 'GET', query: { school_id: String(SCHOOL_ID) } });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockHasContextWriteRole).not.toHaveBeenCalled();
    expect(user.from).toHaveBeenCalledWith('context_general_responses');
  });
});
