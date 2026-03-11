/**
 * Phase 3 — API route tests.
 * Tests CRUD routes and generation endpoint with mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  getApiUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
  sendAuthError: vi.fn((res: MockRes, msg: string, status: number) => {
    res._status = status;
    res._body = { error: msg };
  }),
  sendApiResponse: vi.fn((res: MockRes, data: unknown, status = 200) => {
    res._status = status;
    res._body = { data };
  }),
  logApiRequest: vi.fn(),
  handleMethodNotAllowed: vi.fn((res: MockRes) => {
    res._status = 405;
    res._body = { error: 'Method not allowed' };
  }),
}));

vi.mock('@/utils/roleUtils', () => ({
  getUserRoles: vi.fn(),
}));

vi.mock('@/lib/propuestas/generator', () => ({
  generateProposal: vi.fn(),
}));

vi.mock('@/lib/propuestas/storage', () => ({
  getSignedUrl: vi.fn(),
  uploadFile: vi.fn(),
}));

import { getApiUser, createServiceRoleClient, sendAuthError, sendApiResponse } from '@/lib/api-auth';
import { getUserRoles } from '@/utils/roleUtils';
import { generateProposal } from '@/lib/propuestas/generator';
import { getSignedUrl, uploadFile } from '@/lib/propuestas/storage';

const mockGetApiUser = vi.mocked(getApiUser);
const mockCreateServiceRoleClient = vi.mocked(createServiceRoleClient);
const mockGetUserRoles = vi.mocked(getUserRoles);
const mockGenerateProposal = vi.mocked(generateProposal);
const mockGetSignedUrl = vi.mocked(getSignedUrl);
const mockUploadFile = vi.mocked(uploadFile);
const mockSendAuthError = vi.mocked(sendAuthError);
const mockSendApiResponse = vi.mocked(sendApiResponse);

// ── Test helpers ───────────────────────────────────────────────────────────────

interface MockRes {
  _status: number;
  _body: unknown;
}

function mockReq(
  method: string,
  body: unknown = {},
  query: Record<string, string> = {}
): NextApiRequest {
  return { method, body, query } as unknown as NextApiRequest;
}

function mockRes(): NextApiResponse & MockRes {
  const res = { _status: 0, _body: {} } as unknown as NextApiResponse & MockRes;
  return res;
}

const ADMIN_USER = { id: 'user-admin-uuid', email: 'admin@fne.cl' };
const NON_ADMIN_USER = { id: 'user-other-uuid', email: 'other@fne.cl' };
const ADMIN_ROLES = [{ role_type: 'admin' }];
const NON_ADMIN_ROLES = [{ role_type: 'consultor' }];

function setupAdmin() {
  mockGetApiUser.mockResolvedValue({ user: ADMIN_USER as never, error: null });
  const mockClient = makeMockSupabaseClient();
  mockCreateServiceRoleClient.mockReturnValue(mockClient as never);
  mockGetUserRoles.mockResolvedValue(ADMIN_ROLES as never);
  return mockClient;
}

function setupUnauthenticated() {
  mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No session') });
}

function setupNonAdmin() {
  mockGetApiUser.mockResolvedValue({ user: NON_ADMIN_USER as never, error: null });
  const mockClient = makeMockSupabaseClient();
  mockCreateServiceRoleClient.mockReturnValue(mockClient as never);
  mockGetUserRoles.mockResolvedValue(NON_ADMIN_ROLES as never);
  return mockClient;
}

function makeMockSupabaseClient() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    data: null,
    error: null,
  };
  chain.single.mockResolvedValue({ data: null, error: null });
  chain.maybeSingle.mockResolvedValue({ data: null, error: null });
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// fichas.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/propuestas/fichas', () => {
  it('returns 401 when unauthenticated', async () => {
    setupUnauthenticated();
    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(expect.anything(), 'No autorizado', 401);
  });

  it('returns 403 when non-admin', async () => {
    setupNonAdmin();
    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'Solo administradores pueden acceder',
      403
    );
  });

  it('returns fichas list for admin', async () => {
    const mockClient = setupAdmin();
    const fichas = [{ id: 'f1', nombre_servicio: 'Programa A', activo: true }];
    mockClient._chain.single.mockResolvedValue({ data: fichas, error: null });
    // Override the chain to return data directly (list query, no .single())
    mockClient._chain.order.mockResolvedValue({ data: fichas, error: null });

    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);
    expect(mockSendApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      { fichas: fichas }
    );
  });
});

describe('POST /api/propuestas/fichas', () => {
  it('returns 401 when unauthenticated', async () => {
    setupUnauthenticated();
    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('POST', {});
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(expect.anything(), 'No autorizado', 401);
  });

  it('returns 403 when non-admin', async () => {
    setupNonAdmin();
    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('POST', {});
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'Solo administradores pueden crear fichas',
      403
    );
  });

  it('returns 400 on invalid body', async () => {
    setupAdmin();
    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('POST', { folio: 'not-a-number' });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Datos inválidos'),
      400
    );
  });

  it('creates ficha and returns 201 for admin', async () => {
    const mockClient = setupAdmin();
    const newFicha = { id: 'f-new', folio: 99999, nombre_servicio: 'Nuevo', activo: true };
    mockClient._chain.single.mockResolvedValue({ data: newFicha, error: null });

    const { default: handler } = await import('../../../pages/api/propuestas/fichas');
    const req = mockReq('POST', {
      folio: 99999,
      nombre_servicio: 'Nuevo',
      dimension: 'Liderazgo',
      categoria: 'Asesoría',
      horas_presenciales: 48,
      horas_no_presenciales: 0,
      total_horas: 48,
      destinatarios: ['Docentes'],
    });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      { ficha: newFicha },
      201
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// fichas/[id].ts — soft delete
// ══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/propuestas/fichas/[id] (soft delete)', () => {
  it('sets activo=false instead of deleting row', async () => {
    const mockClient = setupAdmin();
    mockClient._chain.single.mockResolvedValue({
      data: { id: 'f-uuid' },
      error: null,
    });

    const { default: handler } = await import('../../../pages/api/propuestas/fichas/[id]');
    const req = mockReq('DELETE', {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);

    // update should have been called with activo: false
    expect(mockClient._chain.update).toHaveBeenCalledWith({ activo: false });
    expect(mockSendApiResponse).toHaveBeenCalledWith(expect.anything(), { success: true });
  });

  it('returns 404 if ficha does not exist', async () => {
    const mockClient = setupAdmin();
    mockClient._chain.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

    const { default: handler } = await import('../../../pages/api/propuestas/fichas/[id]');
    const req = mockReq('DELETE', {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'Ficha no encontrada',
      404
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// documentos.ts — expired boolean
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/propuestas/documentos — expired boolean', () => {
  it('computes expired=true for past fecha_vencimiento using date-only comparison', async () => {
    const mockClient = setupAdmin();
    const todayStr = new Date().toISOString().split('T')[0];
    const docs = [
      { id: 'd1', nombre: 'Cert', fecha_vencimiento: '2020-01-01', activo: true },
      { id: 'd2', nombre: 'Eval', fecha_vencimiento: '2099-12-31', activo: true },
      { id: 'd3', nombre: 'Otro', fecha_vencimiento: null, activo: true },
      { id: 'd4', nombre: 'Hoy', fecha_vencimiento: todayStr, activo: true },
    ];
    mockClient._chain.order.mockResolvedValue({ data: docs, error: null });

    const { default: handler } = await import('../../../pages/api/propuestas/documentos');
    const req = mockReq('GET');
    const res = mockRes();
    await handler(req, res);

    expect(mockSendApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      {
        documentos: expect.arrayContaining([
          expect.objectContaining({ id: 'd1', expired: true }),
          expect.objectContaining({ id: 'd2', expired: false }),
          expect.objectContaining({ id: 'd3', expired: false }),
          expect.objectContaining({ id: 'd4', expired: false }), // today is NOT expired
        ]),
      }
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// consultores/[id].ts — soft delete
// ══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/propuestas/consultores/[id] (soft delete)', () => {
  it('sets activo=false', async () => {
    const mockClient = setupAdmin();
    mockClient._chain.single.mockResolvedValue({
      data: { id: 'c-uuid' },
      error: null,
    });

    const { default: handler } = await import('../../../pages/api/propuestas/consultores/[id]');
    const req = mockReq('DELETE', {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);

    expect(mockClient._chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ activo: false })
    );
    expect(mockSendApiResponse).toHaveBeenCalledWith(expect.anything(), { success: true });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// generate-propuesta.ts
// ══════════════════════════════════════════════════════════════════════════════

const VALID_GENERATE_BODY = {
  plantilla_id: '223e4567-e89b-12d3-a456-426614174001',
  config: {
    type: 'evoluciona' as const,
    schoolName: 'Colegio Test',
    programYear: 2026,
    serviceName: 'Programa Evoluciona',
    consultants: [
      { nombre: 'Ana García', titulo: 'Directora', bio: 'Bio A' },
      { nombre: 'Carlos López', titulo: 'Asesor', bio: 'Bio C' },
    ],
    modules: [
      { nombre: 'M1', horas_presenciales: 100, horas_sincronicas: 48, horas_asincronicas: 40 },
    ],
    horasPresenciales: 100,
    horasSincronicas: 48,
    horasAsincronicas: 40,
    pricing: { mode: 'fixed' as const, precioUf: 888, totalHours: 188, formaPago: '3 cuotas' },
    contentBlocks: [],
  },
};

function setupGenerateHappyPath(mockClient: ReturnType<typeof makeMockSupabaseClient>) {
  const fichaData = {
    id: 'ficha-uuid',
    nombre_servicio: 'Programa Evoluciona',
    horas_presenciales: 148,
    horas_no_presenciales: 0,
    total_horas: 148,
    destinatarios: ['Docentes', 'Directores'],
    equipo_trabajo: [
      { nombre: 'Ana García', formacion: 'PhD', anos_experiencia: 15 },
      { nombre: 'Carlos López', formacion: 'Mg', anos_experiencia: 10 },
    ],
    objetivo_general: null,
    activo: true,
  };

  // Mock sequential .single() calls: licitacion, plantilla, propuesta insert
  let callCount = 0;
  mockClient._chain.single
    .mockImplementationOnce(async () => ({ data: { id: 'lic-uuid' }, error: null })) // licitacion check
    .mockImplementationOnce(async () => ({
      data: { id: 'plan-uuid', ficha_id: 'ficha-uuid', ficha: fichaData },
      error: null,
    })) // plantilla + ficha
    .mockImplementationOnce(async () => ({ data: { id: 'prop-uuid' }, error: null })); // insert propuesta

  mockClient._chain.maybeSingle.mockResolvedValue({ data: null, error: null }); // version query

  // For the docs query (in query), return empty
  mockClient._chain.in = vi.fn().mockReturnValue({
    ...mockClient._chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
    catch: vi.fn(),
    finally: vi.fn(),
  });
  void callCount;
}

describe('POST /api/licitaciones/[id]/generate-propuesta', () => {
  it('returns 401 when unauthenticated', async () => {
    setupUnauthenticated();
    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );
    const req = mockReq('POST', VALID_GENERATE_BODY, {
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(expect.anything(), 'No autorizado', 401);
  });

  it('returns 403 when non-admin', async () => {
    setupNonAdmin();
    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );
    const req = mockReq('POST', VALID_GENERATE_BODY, {
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'Solo administradores pueden generar propuestas',
      403
    );
  });

  it('returns 400 on invalid body', async () => {
    setupAdmin();
    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );
    const req = mockReq('POST', { plantilla_id: 'not-uuid' }, {
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Datos inválidos'),
      400
    );
  });

  it('returns 400 when MINEDUC validation fails (wrong service name)', async () => {
    const mockClient = setupAdmin();
    const fichaData = {
      id: 'ficha-uuid',
      nombre_servicio: 'Programa Correcto',
      horas_presenciales: 148,
      horas_no_presenciales: 0,
      total_horas: 148,
      destinatarios: ['Docentes'],
      equipo_trabajo: [
        { nombre: 'Ana García', formacion: 'PhD', anos_experiencia: 10 },
        { nombre: 'Carlos López', formacion: 'Mg', anos_experiencia: 8 },
      ],
      objetivo_general: null,
      activo: true,
    };

    mockClient._chain.single
      .mockResolvedValueOnce({ data: { id: 'lic-uuid' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'plan-uuid', ficha_id: 'ficha-uuid', ficha: fichaData },
        error: null,
      });

    mockClient._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );

    // config has wrong serviceName → Rule 1 fails
    const body = {
      ...VALID_GENERATE_BODY,
      config: { ...VALID_GENERATE_BODY.config, serviceName: 'Nombre Incorrecto' },
    };
    const req = mockReq('POST', body, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);

    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'La propuesta no cumple con los requisitos MINEDUC',
      400,
      expect.any(String)
    );
  });

  it('returns 400 when an expired certificate is selected', async () => {
    const mockClient = setupAdmin();
    const fichaData = {
      id: 'ficha-uuid',
      nombre_servicio: 'Programa Evoluciona',
      horas_presenciales: 148,
      horas_no_presenciales: 0,
      total_horas: 148,
      destinatarios: ['Docentes'],
      equipo_trabajo: [
        { nombre: 'Ana García', formacion: 'PhD', anos_experiencia: 10 },
        { nombre: 'Carlos López', formacion: 'Mg', anos_experiencia: 8 },
      ],
      objetivo_general: null,
      activo: true,
    };

    mockClient._chain.single
      .mockResolvedValueOnce({ data: { id: 'lic-uuid' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'plan-uuid', ficha_id: 'ficha-uuid', ficha: fichaData },
        error: null,
      });

    // Docs query returns an expired document
    const expiredDocs = [{ id: 'doc-exp', nombre: 'Cert Vencido', fecha_vencimiento: '2020-01-01' }];
    mockClient._chain.in = vi.fn().mockReturnValue({
      ...mockClient._chain,
      then: (resolve: (v: { data: typeof expiredDocs; error: null }) => void) =>
        resolve({ data: expiredDocs, error: null }),
      catch: vi.fn(),
      finally: vi.fn(),
    });

    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );

    const body = {
      ...VALID_GENERATE_BODY,
      documentos_ids: ['123e4567-e89b-12d3-a456-426614174099'],
    };
    const req = mockReq('POST', body, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);

    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'La propuesta no cumple con los requisitos MINEDUC',
      400,
      expect.any(String)
    );
  });

  it('returns 409 on unique constraint violation (race condition)', async () => {
    const mockClient = setupAdmin();
    const fichaData = {
      id: 'ficha-uuid',
      nombre_servicio: 'Programa Evoluciona',
      horas_presenciales: 148,
      horas_no_presenciales: 0,
      total_horas: 148,
      destinatarios: ['Docentes'],
      equipo_trabajo: [
        { nombre: 'Ana García', formacion: 'PhD', anos_experiencia: 10 },
        { nombre: 'Carlos López', formacion: 'Mg', anos_experiencia: 8 },
      ],
      objetivo_general: null,
      activo: true,
    };

    mockClient._chain.single
      .mockResolvedValueOnce({ data: { id: 'lic-uuid' }, error: null }) // licitacion check
      .mockResolvedValueOnce({
        data: { id: 'plan-uuid', ficha_id: 'ficha-uuid', ficha: fichaData },
        error: null,
      }) // plantilla + ficha
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      }); // insert fails with unique violation

    mockClient._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );
    const req = mockReq('POST', VALID_GENERATE_BODY, {
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
    const res = mockRes();
    await handler(req, res);

    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'Conflicto de versión: otra generación se completó simultáneamente. Intente nuevamente.',
      409
    );
  });

  it('generates propuesta and returns 200 for valid config', async () => {
    const mockClient = setupAdmin();
    setupGenerateHappyPath(mockClient);

    const pdfBuffer = Buffer.from('%PDF-1.4 test');
    mockGenerateProposal.mockResolvedValue(pdfBuffer);
    mockUploadFile.mockResolvedValue('generadas/lic-uuid/prop-uuid.pdf');

    // Final update
    mockClient._chain.single.mockResolvedValue({ data: { id: 'prop-uuid' }, error: null });

    const { default: handler } = await import(
      '../../../pages/api/licitaciones/[id]/generate-propuesta'
    );
    const req = mockReq('POST', VALID_GENERATE_BODY, {
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
    const res = mockRes();
    await handler(req, res);

    expect(mockGenerateProposal).toHaveBeenCalled();
    expect(mockUploadFile).toHaveBeenCalled();
    expect(mockSendApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estado: 'completada' })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// download/[id].ts — signed URL generation
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/propuestas/download/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    setupUnauthenticated();
    const { default: handler } = await import('../../../pages/api/propuestas/download/[id]');
    const req = mockReq('GET', {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);
    expect(mockSendAuthError).toHaveBeenCalledWith(expect.anything(), 'No autorizado', 401);
  });

  it('returns signed URL for a completada propuesta', async () => {
    const mockClient = setupAdmin();
    mockClient._chain.single.mockResolvedValue({
      data: {
        id: 'prop-uuid',
        estado: 'completada',
        archivo_path: 'generadas/lic/prop.pdf',
        version: 1,
      },
      error: null,
    });
    mockGetSignedUrl.mockResolvedValue('https://storage.supabase.co/signed/prop.pdf');

    const { default: handler } = await import('../../../pages/api/propuestas/download/[id]');
    const req = mockReq('GET', {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);

    expect(mockGetSignedUrl).toHaveBeenCalledWith('generadas/lic/prop.pdf');
    expect(mockSendApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ download_url: 'https://storage.supabase.co/signed/prop.pdf' })
    );
  });

  it('returns 422 when propuesta is not completada', async () => {
    const mockClient = setupAdmin();
    mockClient._chain.single.mockResolvedValue({
      data: { id: 'prop-uuid', estado: 'error', archivo_path: null, version: 1 },
      error: null,
    });

    const { default: handler } = await import('../../../pages/api/propuestas/download/[id]');
    const req = mockReq('GET', {}, { id: '123e4567-e89b-12d3-a456-426614174000' });
    const res = mockRes();
    await handler(req, res);

    expect(mockSendAuthError).toHaveBeenCalledWith(
      expect.anything(),
      'La propuesta no está disponible para descarga',
      422
    );
  });
});
