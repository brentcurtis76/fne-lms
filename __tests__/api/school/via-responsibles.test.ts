// @vitest-environment node
/**
 * GET/POST /api/school/transversal-context/via-responsibles (20261008120000)
 *
 * Authorization is decided against the REQUESTED school: the permission check
 * receives the school id from the request; consultores read but never write
 * and get no candidate directory; writes pass the authenticated caller as the
 * actor the RPC re-checks; RPC refusals map to stable codes and statuses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockSendAuthError,
  mockHandleMethodNotAllowed,
  mockHasDirectivoPermission,
  mockGetSchoolViaOverview,
  mockListResponsibleCandidates,
  mockWriteSchoolViaResponsible,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
  mockGetSchoolViaOverview: vi.fn(),
  mockListResponsibleCandidates: vi.fn(),
  mockWriteSchoolViaResponsible: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: mockSendAuthError,
  handleMethodNotAllowed: mockHandleMethodNotAllowed,
}));

vi.mock('../../../lib/permissions/directivo', async () => {
  const actual = await vi.importActual<any>('../../../lib/permissions/directivo');
  return { ...actual, hasDirectivoPermissionForSchool: mockHasDirectivoPermission };
});

vi.mock('../../../lib/services/assessment-builder/schoolViaAssignmentService', () => ({
  getSchoolViaOverview: mockGetSchoolViaOverview,
  listResponsibleCandidates: mockListResponsibleCandidates,
  writeSchoolViaResponsible: mockWriteSchoolViaResponsible,
}));

import handler from '../../../pages/api/school/transversal-context/via-responsibles';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PICKED_ID = '22222222-2222-4222-8222-222222222222';
const SCHOOL_ID = 42;

const DIRECTIVO = { hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false, via: 'equipo_directivo' };
const CONSULTOR = { hasPermission: true, schoolId: SCHOOL_ID, isAdmin: false, via: 'consultor' };
const ADMIN = { hasPermission: true, schoolId: SCHOOL_ID, isAdmin: true, via: 'admin' };
const DENIED = { hasPermission: false, schoolId: null, isAdmin: false, via: null };

function call(method: 'GET' | 'POST' | 'DELETE', opts: { query?: any; body?: any } = {}) {
  const { req, res } = createMocks({ method, query: opts.query ?? {}, body: opts.body ?? {} });
  return handler(req as any, res as any).then(() => ({ status: res._getStatusCode(), json: res._getJSONData?.() }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
  mockCreateServiceRoleClient.mockReturnValue({});
  mockHandleMethodNotAllowed.mockImplementation((res: any) => res.status(405).json({ error: 'Method not allowed' }));
  mockSendAuthError.mockImplementation((res: any) => res.status(401).json({ error: 'auth' }));
  mockGetSchoolViaOverview.mockResolvedValue({ kind: 'ok', vias: [{ area: 'liderazgo' }] });
  mockListResponsibleCandidates.mockResolvedValue({ kind: 'ok', people: [{ id: PICKED_ID, name: 'Directiva', email: null }] });
  mockWriteSchoolViaResponsible.mockResolvedValue({ kind: 'ok', mode: 'assigned', details: [] });
});

describe('via-responsibles', () => {
  it('refuses other methods before authentication', async () => {
    const r = await call('DELETE');
    expect(r.status).toBe(405);
    expect(mockGetApiUser).not.toHaveBeenCalled();
  });

  it('requires a numeric school_id', async () => {
    const r = await call('GET', { query: { school_id: 'abc' } });
    expect(r.status).toBe(400);
    expect(mockHasDirectivoPermission).not.toHaveBeenCalled();
  });

  it('checks permission against the REQUESTED school', async () => {
    mockHasDirectivoPermission.mockResolvedValue(DENIED);
    const r = await call('GET', { query: { school_id: String(SCHOOL_ID) } });
    expect(r.status).toBe(403);
    expect(mockHasDirectivoPermission).toHaveBeenCalledWith({}, USER_ID, SCHOOL_ID);
    expect(mockGetSchoolViaOverview).not.toHaveBeenCalled();
  });

  it('a directivo reads the overview and the candidates', async () => {
    mockHasDirectivoPermission.mockResolvedValue(DIRECTIVO);
    const r = await call('GET', { query: { school_id: String(SCHOOL_ID) } });
    expect(r.status).toBe(200);
    expect(r.json.canWrite).toBe(true);
    expect(r.json.candidates).toHaveLength(1);
    expect(mockGetSchoolViaOverview).toHaveBeenCalledWith(SCHOOL_ID);
  });

  it('a consultor reads the overview but gets no candidate directory', async () => {
    mockHasDirectivoPermission.mockResolvedValue(CONSULTOR);
    const r = await call('GET', { query: { school_id: String(SCHOOL_ID) } });
    expect(r.status).toBe(200);
    expect(r.json.canWrite).toBe(false);
    expect(r.json.candidates).toEqual([]);
    expect(mockListResponsibleCandidates).not.toHaveBeenCalled();
  });

  it('a consultor cannot write', async () => {
    mockHasDirectivoPermission.mockResolvedValue(CONSULTOR);
    const r = await call('POST', { body: { school_id: SCHOOL_ID, area: 'liderazgo', user_id: PICKED_ID, mode: 'assign' } });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('assignment_write_forbidden');
    expect(mockWriteSchoolViaResponsible).not.toHaveBeenCalled();
  });

  it('validates the write body', async () => {
    mockHasDirectivoPermission.mockResolvedValue(DIRECTIVO);
    const r = await call('POST', { body: { school_id: SCHOOL_ID, area: 'liderazgo', user_id: PICKED_ID, mode: 'remove' } });
    expect(r.status).toBe(400);
    expect(mockWriteSchoolViaResponsible).not.toHaveBeenCalled();
  });

  it('writes with the authenticated caller as actor', async () => {
    mockHasDirectivoPermission.mockResolvedValue(ADMIN);
    const r = await call('POST', { body: { school_id: SCHOOL_ID, area: 'liderazgo', user_id: PICKED_ID, mode: 'replace' } });
    expect(r.status).toBe(200);
    expect(mockWriteSchoolViaResponsible).toHaveBeenCalledWith({
      mode: 'replace', schoolId: SCHOOL_ID, area: 'liderazgo', userId: PICKED_ID, by: USER_ID,
    });
  });

  it('passes RPC refusals through with their status and code', async () => {
    mockHasDirectivoPermission.mockResolvedValue(DIRECTIVO);
    mockWriteSchoolViaResponsible.mockResolvedValue({
      kind: 'error', code: 'registros_already_started', status: 409, message: 'No se puede reemplazar', templates: ['LID Equipo'],
    });
    const r = await call('POST', { body: { school_id: SCHOOL_ID, area: 'liderazgo', user_id: PICKED_ID, mode: 'replace' } });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ code: 'registros_already_started', error: 'No se puede reemplazar', templates: ['LID Equipo'] });
  });
});
