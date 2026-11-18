// @vitest-environment node
/**
 * N1, part 2, send-back 1 (item 2) — GET /api/school/transversal-context/via-responsibles
 * for a consultor lists, in `vias[].templates`, only the instruments the
 * database lets them read (public.auth_readable_template_ids(), asked with the
 * consultor's own session). Admins and the school's Equipo Directivo keep
 * seeing every eligible instrument there (they manage delivery). Synthetic data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockHasDirectivoPermission,
  mockGetSchoolViaOverview,
  mockListResponsibleCandidates,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasDirectivoPermission: vi.fn(),
  mockGetSchoolViaOverview: vi.fn(),
  mockListResponsibleCandidates: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: () => ({ service: true }),
  sendAuthError: (res: any) => res.status(401).json({ error: 'auth' }),
  handleMethodNotAllowed: (res: any) => res.status(405).json({ error: 'method' }),
}));

vi.mock('../../../lib/permissions/directivo', async () => {
  const actual = await vi.importActual<any>('../../../lib/permissions/directivo');
  return { ...actual, hasDirectivoPermissionForSchool: mockHasDirectivoPermission };
});

vi.mock('../../../lib/services/assessment-builder/schoolViaAssignmentService', () => ({
  getSchoolViaOverview: mockGetSchoolViaOverview,
  listResponsibleCandidates: mockListResponsibleCandidates,
  writeSchoolViaResponsible: vi.fn(),
}));

import handler from '../../../pages/api/school/transversal-context/via-responsibles';

const SCHOOL = 101;
const DELIVERED = { id: 'tpl-entregado-101', name: 'Instrumento entregado a 101' };
const NOT_DELIVERED = { id: 'tpl-no-entregado-101', name: 'Instrumento publicado, no entregado a 101' };
const RESPONSIBLE = { id: 'dir-sintetico-1', name: 'Directiva Inventada', email: null, assignedAt: '2026-10-01T00:00:00Z' };

const overview = () => ({
  kind: 'ok',
  vias: [
    {
      area: 'liderazgo',
      label: 'Liderazgo',
      templates: [DELIVERED, NOT_DELIVERED],
      responsible: RESPONSIBLE,
      pendingTemplates: [NOT_DELIVERED],
    },
    { area: 'evaluacion', label: 'Evaluación', templates: [], responsible: null, pendingTemplates: [] },
  ],
});

const CONSULTOR = { hasPermission: true, schoolId: SCHOOL, isAdmin: false, via: 'consultor' };
// A person who is both directivo of the school and consultor is admitted as directivo.
const DIRECTIVO = { hasPermission: true, schoolId: SCHOOL, isAdmin: false, via: 'equipo_directivo' };
const ADMIN = { hasPermission: true, schoolId: SCHOOL, isAdmin: true, via: 'admin' };

function sessionClient(readable: string[] | { error: unknown }) {
  return {
    rpc: vi.fn(async (fn: string) => {
      if (fn !== 'auth_readable_template_ids') return { data: null, error: { message: 'unexpected rpc' } };
      if (!Array.isArray(readable)) return { data: null, error: readable.error };
      return { data: readable, error: null };
    }),
    from: vi.fn(() => {
      throw new Error('the route reads no table with the session client');
    }),
  };
}

async function get() {
  const { req, res } = createMocks({ method: 'GET', query: { school_id: String(SCHOOL) } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || 'null') };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetApiUser.mockResolvedValue({ user: { id: 'persona-sintetica' }, error: null });
  mockGetSchoolViaOverview.mockResolvedValue(overview());
  mockListResponsibleCandidates.mockResolvedValue({ kind: 'ok', people: [{ id: RESPONSIBLE.id, name: RESPONSIBLE.name, email: null }] });
});

describe('via-responsibles overview by who may read the instrument (N1, part 2, send-back 1)', () => {
  it('an assigned consultor of school 101 sees only the instrument delivered there', async () => {
    mockHasDirectivoPermission.mockResolvedValue(CONSULTOR);
    const session = sessionClient([DELIVERED.id, 'tpl-de-otra-escuela']);
    mockCreateApiSupabaseClient.mockResolvedValue(session);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.vias[0].templates).toEqual([DELIVERED]);
    expect(session.rpc).toHaveBeenCalledWith('auth_readable_template_ids');
    // The pending list is a subset of the templates: it is filtered the same way.
    expect(body.vias[0].pendingTemplates).toEqual([]);
    // Everything else unchanged.
    expect(body.vias[0].area).toBe('liderazgo');
    expect(body.vias[0].label).toBe('Liderazgo');
    expect(body.vias[0].responsible).toEqual(RESPONSIBLE);
    expect(body.vias[1]).toEqual(overview().vias[1]);
    expect(body.candidates).toEqual([]);
    expect(body.canWrite).toBe(false);
    expect(mockGetSchoolViaOverview).toHaveBeenCalledWith(SCHOOL);
  });

  it('a consultor whose readable instruments cannot be read gets the overview error (fails closed)', async () => {
    mockHasDirectivoPermission.mockResolvedValue(CONSULTOR);
    mockCreateApiSupabaseClient.mockResolvedValue(sessionClient({ error: { message: 'permission denied for function' } }));
    const { status, body } = await get();
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'No se pudo leer el estado de los registros del equipo directivo.' });
  });

  it.each([
    ['a directivo of 101 (also when they are a consultor too)', DIRECTIVO],
    ['an admin', ADMIN],
  ])('%s sees both instruments, as today', async (_label, permission) => {
    mockHasDirectivoPermission.mockResolvedValue(permission);
    const session = sessionClient([]);
    mockCreateApiSupabaseClient.mockResolvedValue(session);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body).toEqual({
      vias: overview().vias,
      candidates: [{ id: RESPONSIBLE.id, name: RESPONSIBLE.name, email: null }],
      canWrite: true,
    });
    expect(session.rpc).not.toHaveBeenCalled();
  });
});
