// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { ADMIN_UUID, DOCENTE_UUID, TEMPLATE_DRAFT_1 } from './_helpers';

// GC-3c: how many courses (or schools) a publication would reach, asked by
// the editor before «Sí, publicar».
const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockHasWritePerm,
  mockCreateServiceRoleClient,
  mockRpc,
} = vi.hoisted(() => {
  const mockRpc = vi.fn();
  return {
    mockGetApiUser: vi.fn(),
    mockCreateApiSupabaseClient: vi.fn(),
    mockHasWritePerm: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
    mockRpc,
  };
});

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any, _methods: string[]) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: vi.fn(),
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/delivery-preview';

function session(userId: string, canWrite: boolean) {
  mockGetApiUser.mockResolvedValue({ user: { id: userId }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue({ from: vi.fn() });
  mockHasWritePerm.mockResolvedValue(canWrite);
}

async function call(method: string = 'GET', templateId: string | null = TEMPLATE_DRAFT_1) {
  const { req, res } = createMocks({ method: method as any, query: templateId ? { templateId } : {} });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData()) };
}

describe('GET /api/admin/assessment-builder/templates/[templateId]/delivery-preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers 401 to a visitor', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });
    const r = await call();
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Autenticación requerida');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers 403 to a person without the permission', async () => {
    session(DOCENTE_UUID, false);
    const r = await call();
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('No tienes permiso para publicar templates');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers 405 to another method', async () => {
    session(ADMIN_UUID, true);
    const r = await call('POST');
    expect(r.status).toBe(405);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers 400 without a template id', async () => {
    session(ADMIN_UUID, true);
    const r = await call('GET', null);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('templateId es requerido');
  });

  it('answers 400 to an admin whose template id is not a uuid, without asking the database', async () => {
    session(ADMIN_UUID, true);
    const r = await call('GET', 'bad-id');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('templateId no es válido');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('still answers 401 and 403 before looking at a malformed template id', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });
    expect((await call('GET', 'bad-id')).status).toBe(401);
    session(DOCENTE_UUID, false);
    expect((await call('GET', 'bad-id')).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('answers 200 with zeros for a well-formed id of an instrument that does not exist', async () => {
    session(ADMIN_UUID, true);
    mockRpc.mockResolvedValueOnce({ data: { target: null, courses: 0, schools: 0 }, error: null });
    const r = await call('GET', '13100000-0000-4000-8000-00000000ffff');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ target: null, courses: 0, schools: 0 });
  });

  it('answers 200 to an admin with the function numbers', async () => {
    session(ADMIN_UUID, true);
    mockRpc.mockResolvedValueOnce({ data: { target: 'course_docente', courses: 7, schools: 2 }, error: null });
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ target: 'course_docente', courses: 7, schools: 2 });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('preview_template_delivery', { p_template_id: TEMPLATE_DRAFT_1 });
    expect(mockCreateServiceRoleClient).toHaveBeenCalledTimes(1);
  });

  it('answers 500 when the database refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    session(ADMIN_UUID, true);
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const r = await call();
    expect(r.status).toBe(500);
    expect(r.body.error).toBe('No se pudo calcular el envío');
  });
});
