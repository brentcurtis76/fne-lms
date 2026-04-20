// @vitest-environment node

/**
 * Handler-level tests for the historical licitacion creation path
 * (POST /api/licitaciones with estado: 'cerrada').
 *
 * Verifies:
 *  - Admin may POST historical entries for any school
 *  - encargado_licitacion may POST only when school_id matches their scoped school
 *  - The 7 nullable fields may be omitted on the historical path
 *  - The live-workflow admin gate still applies when estado != 'cerrada'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockCreateApiSupabaseClient,
  mockSendAuthError,
  mockSendApiResponse,
  mockLogApiRequest,
  mockHandleMethodNotAllowed,
  mockGetUserRoles,
  mockCreateLicitacion,
  mockCreateHistoricalLicitacion,
  mockTriggerNotification,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockSendAuthError: vi.fn(),
  mockSendApiResponse: vi.fn(),
  mockLogApiRequest: vi.fn(),
  mockHandleMethodNotAllowed: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockCreateLicitacion: vi.fn(),
  mockCreateHistoricalLicitacion: vi.fn(),
  mockTriggerNotification: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: mockSendAuthError,
  sendApiResponse: mockSendApiResponse,
  logApiRequest: mockLogApiRequest,
  handleMethodNotAllowed: mockHandleMethodNotAllowed,
}));

vi.mock('../../../utils/roleUtils', () => ({
  getUserRoles: mockGetUserRoles,
}));

vi.mock('../../../lib/licitacionService', () => ({
  createLicitacion: mockCreateLicitacion,
  createHistoricalLicitacion: mockCreateHistoricalLicitacion,
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: mockTriggerNotification },
}));

import handler from '../../../pages/api/licitaciones/index';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;

function authed() {
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
}

function rolesAre(roles: Array<{ role_type: string; school_id?: number | null }>) {
  mockGetUserRoles.mockResolvedValue(
    roles.map(r => ({ role_type: r.role_type, school_id: r.school_id ?? null }))
  );
}

function serviceClientOk() {
  // The fire-and-forget schools fetch still runs after creation — stub it.
  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { name: 'Synthetic School' }, error: null }),
        })),
      })),
    })),
  });
}

const validHistoricalBody = {
  school_id: SCHOOL_ID,
  programa_id: 'prog-hist-001',
  nombre_licitacion: 'Licitacion historica 2022',
  year: 2022,
  estado: 'cerrada' as const,
};

describe('POST /api/licitaciones — historical (estado: cerrada) path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAuthError.mockImplementation((res: any, msg: string, status = 401) => {
      res.status(status).json({ error: msg });
    });
    mockSendApiResponse.mockImplementation((res: any, data: unknown, status = 200) => {
      res.status(status).json({ data });
    });
    mockHandleMethodNotAllowed.mockImplementation((res: any, methods: string[]) => {
      res.setHeader('Allow', methods.join(', '));
      res.status(405).json({ error: 'Method not allowed' });
    });
    serviceClientOk();
    mockCreateHistoricalLicitacion.mockResolvedValue({
      id: 'lic-hist-1',
      school_id: SCHOOL_ID,
      numero_licitacion: 'LIC-2022-42-001',
      estado: 'cerrada',
    });
    mockTriggerNotification.mockResolvedValue(undefined);
  });

  it('admin can create a historical entry for any school, with 7 nullable fields omitted', async () => {
    authed();
    rolesAre([{ role_type: 'admin', school_id: null }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: { ...validHistoricalBody, school_id: OTHER_SCHOOL_ID },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateHistoricalLicitacion).toHaveBeenCalledTimes(1);
    expect(mockCreateLicitacion).not.toHaveBeenCalled();
    // The required-field validation was not applied — the 7 nullable fields are absent.
    const passed = mockCreateHistoricalLicitacion.mock.calls[0][1];
    expect(passed.email_licitacion ?? null).toBeNull();
    expect(passed.monto_minimo ?? null).toBeNull();
    expect(passed.peso_evaluacion_tecnica ?? null).toBeNull();
    expect(passed.estado).toBe('cerrada');
    expect(passed.school_id).toBe(OTHER_SCHOOL_ID);
  });

  it('encargado_licitacion can create a historical entry for their own school', async () => {
    authed();
    rolesAre([{ role_type: 'encargado_licitacion', school_id: SCHOOL_ID }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: validHistoricalBody,
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateHistoricalLicitacion).toHaveBeenCalledTimes(1);
  });

  it('encargado_licitacion cannot create a historical entry for a different school (403)', async () => {
    authed();
    rolesAre([{ role_type: 'encargado_licitacion', school_id: SCHOOL_ID }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: { ...validHistoricalBody, school_id: OTHER_SCHOOL_ID },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateHistoricalLicitacion).not.toHaveBeenCalled();
  });

  it('non-admin non-encargado cannot create historical entries (403)', async () => {
    authed();
    rolesAre([{ role_type: 'docente', school_id: SCHOOL_ID }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: validHistoricalBody,
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateHistoricalLicitacion).not.toHaveBeenCalled();
  });

  it('live-workflow POST (no estado) still gated to admin and requires all 7 fields', async () => {
    authed();
    rolesAre([{ role_type: 'encargado_licitacion', school_id: SCHOOL_ID }]);

    // Encargado with live-workflow body — admin gate must still reject.
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        programa_id: 'prog-live-001',
        nombre_licitacion: 'Live licitacion 2026',
        email_licitacion: 'lic@example.cl',
        monto_minimo: 10,
        monto_maximo: 100,
        tipo_moneda: 'UF',
        duracion_minima: '6 meses',
        duracion_maxima: '12 meses',
        peso_evaluacion_tecnica: 70,
        year: 2026,
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateLicitacion).not.toHaveBeenCalled();
  });

  it('live-workflow POST by admin with missing required fields returns 400', async () => {
    authed();
    rolesAre([{ role_type: 'admin', school_id: null }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        school_id: SCHOOL_ID,
        programa_id: 'prog-live-001',
        nombre_licitacion: 'Live licitacion 2026',
        year: 2026,
        // missing email_licitacion, montos, duraciones, peso
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateLicitacion).not.toHaveBeenCalled();
  });
});
