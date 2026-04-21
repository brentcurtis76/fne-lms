// @vitest-environment node

/**
 * Tests for histórico licitación creation on POST /api/licitaciones.
 * Covers:
 *  - CreateHistoricoLicitacionSchema: field-validation skip for the 7
 *    historically-nullable fields.
 *  - Handler role scope: admin may create historico for any school;
 *    encargado_licitacion may create only when school_id matches.
 *  - Handler routing: body.estado='cerrada' takes the historico path.
 * Synthetic data only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { CreateHistoricoLicitacionSchema } from '../../../types/licitaciones';

// -------------------------------------------------------
// Schema validation
// -------------------------------------------------------

describe('CreateHistoricoLicitacionSchema — field validation skip', () => {
  const minimal = {
    school_id: 42,
    programa_id: 'prog-test-001',
    nombre_licitacion: 'Licitacion historica 2022',
    year: 2022,
    estado: 'cerrada' as const,
  };

  it('accepts minimal payload without any of the 7 now-nullable fields', () => {
    const result = CreateHistoricoLicitacionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('rejects when estado is not "cerrada"', () => {
    const result = CreateHistoricoLicitacionSchema.safeParse({
      ...minimal,
      estado: 'publicacion_pendiente',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when school_id is missing', () => {
    const { school_id: _, ...rest } = minimal;
    const result = CreateHistoricoLicitacionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects when programa_id is empty', () => {
    const result = CreateHistoricoLicitacionSchema.safeParse({ ...minimal, programa_id: '' });
    expect(result.success).toBe(false);
  });

  it('accepts null for email_licitacion, montos, duracion, peso_evaluacion_tecnica', () => {
    const result = CreateHistoricoLicitacionSchema.safeParse({
      ...minimal,
      email_licitacion: null,
      monto_minimo: null,
      monto_maximo: null,
      duracion_minima: null,
      duracion_maxima: null,
      peso_evaluacion_tecnica: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects malformed email when provided', () => {
    const result = CreateHistoricoLicitacionSchema.safeParse({
      ...minimal,
      email_licitacion: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('enforces monto_maximo >= monto_minimo only when both are provided', () => {
    const bad = CreateHistoricoLicitacionSchema.safeParse({
      ...minimal,
      monto_minimo: 200,
      monto_maximo: 100,
    });
    expect(bad.success).toBe(false);

    const okOneSet = CreateHistoricoLicitacionSchema.safeParse({
      ...minimal,
      monto_minimo: 200,
    });
    expect(okOneSet.success).toBe(true);
  });

  it('accepts historical year below 2024 (unlike live schema)', () => {
    const result = CreateHistoricoLicitacionSchema.safeParse({ ...minimal, year: 2019 });
    expect(result.success).toBe(true);
  });

  it('accepts an optional numero_licitacion', () => {
    const ok = CreateHistoricoLicitacionSchema.safeParse({
      ...minimal,
      numero_licitacion: 'LIC-LEGACY-2019-001',
    });
    expect(ok.success).toBe(true);

    const okWithout = CreateHistoricoLicitacionSchema.safeParse(minimal);
    expect(okWithout.success).toBe(true);
  });
});

// -------------------------------------------------------
// Handler role scope + routing
// -------------------------------------------------------

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SCHOOL_ID = 7;
const OTHER_SCHOOL_ID = 99;

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockGetUserRoles,
  mockCreateHistorico,
  mockCreateLive,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(() => ({})),
  mockGetUserRoles: vi.fn(),
  mockCreateHistorico: vi.fn(),
  mockCreateLive: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getUserRoles: mockGetUserRoles,
  };
});

vi.mock('../../../lib/licitacionService', () => ({
  createLicitacion: mockCreateLive,
  createHistoricoLicitacion: mockCreateHistorico,
}));

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: vi.fn().mockResolvedValue(undefined) },
}));

import handler from '../../../pages/api/licitaciones/index';

const historicoBody = {
  school_id: SCHOOL_ID,
  programa_id: 'prog-hist-001',
  nombre_licitacion: 'Licitacion historica sintetica',
  year: 2021,
  estado: 'cerrada',
};

describe('POST /api/licitaciones — historico route (estado="cerrada")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
    mockCreateServiceRoleClient.mockReturnValue({});
    mockCreateHistorico.mockResolvedValue({
      id: 'lic-1',
      school_id: SCHOOL_ID,
      numero_licitacion: 'LIC-2021-7-001',
    });
  });

  it('admin may create a historico for any school', async () => {
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: { ...historicoBody, school_id: OTHER_SCHOOL_ID },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateHistorico).toHaveBeenCalledTimes(1);
    expect(mockCreateLive).not.toHaveBeenCalled();
  });

  it('admin historico create skips validation for the 7 now-nullable fields', async () => {
    mockGetUserRoles.mockResolvedValue([{ role_type: 'admin', school_id: null }]);

    const { req, res } = createMocks({
      method: 'POST',
      body: historicoBody, // no email, montos, duracion, pesos
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateHistorico).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estado: 'cerrada', school_id: SCHOOL_ID }),
      USER_ID,
    );
  });

  it('encargado_licitacion may create historico when school_id matches their scope', async () => {
    mockGetUserRoles.mockResolvedValue([
      { role_type: 'encargado_licitacion', school_id: SCHOOL_ID },
    ]);

    const { req, res } = createMocks({ method: 'POST', body: historicoBody });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    expect(mockCreateHistorico).toHaveBeenCalledTimes(1);
  });

  it('encargado_licitacion is rejected when school_id does not match their scope', async () => {
    mockGetUserRoles.mockResolvedValue([
      { role_type: 'encargado_licitacion', school_id: OTHER_SCHOOL_ID },
    ]);

    const { req, res } = createMocks({ method: 'POST', body: historicoBody });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateHistorico).not.toHaveBeenCalled();
  });

  it('encargado_licitacion cannot create a live licitacion (estado != "cerrada")', async () => {
    mockGetUserRoles.mockResolvedValue([
      { role_type: 'encargado_licitacion', school_id: SCHOOL_ID },
    ]);

    const liveBody = {
      school_id: SCHOOL_ID,
      programa_id: 'prog-live-001',
      nombre_licitacion: 'Licitacion en vivo',
      email_licitacion: 'lic@escuela-sintetica.cl',
      monto_minimo: 10,
      monto_maximo: 100,
      tipo_moneda: 'UF',
      duracion_minima: '6 meses',
      duracion_maxima: '12 meses',
      peso_evaluacion_tecnica: 70,
      year: 2026,
    };

    const { req, res } = createMocks({ method: 'POST', body: liveBody });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateLive).not.toHaveBeenCalled();
    expect(mockCreateHistorico).not.toHaveBeenCalled();
  });

  it('user with no licitacion role cannot create historico', async () => {
    mockGetUserRoles.mockResolvedValue([{ role_type: 'docente', school_id: SCHOOL_ID }]);

    const { req, res } = createMocks({ method: 'POST', body: historicoBody });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
    expect(mockCreateHistorico).not.toHaveBeenCalled();
  });
});
