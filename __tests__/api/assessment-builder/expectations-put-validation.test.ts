// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  IND_FRECUENCIA_1,
  IND_PROFUNDIDAD_1,
  buildChainableQuery,
} from './_helpers';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockHasReadPerm,
  mockHasWritePerm,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasReadPerm: vi.fn(),
  mockHasWritePerm: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/expectations/[indicatorId]';

const CATEGORY_BY_INDICATOR: Record<string, string> = {
  [IND_FRECUENCIA_1]: 'frecuencia',
  [IND_PROFUNDIDAD_1]: 'profundidad',
};

// Stateful fake: an upserted expectation row is stored and returned by the next GET
function buildClient(
  indicatorId: string,
  { indicatorInTemplate = true, template = { status: 'draft', is_archived: false } as unknown } = {}
) {
  let stored: any = null;
  const expectationsTable = {
    upsert: vi.fn((row: any) => {
      stored = { id: 'exp-1', ...row };
      return buildChainableQuery(stored);
    }),
    select: vi.fn(() => buildChainableQuery(stored, stored ? null : { code: 'PGRST116' })),
  };
  const indicator = { id: indicatorId, name: 'Indicador sintético', category: CATEGORY_BY_INDICATOR[indicatorId] };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_indicators') {
        return indicatorInTemplate
          ? buildChainableQuery(indicator)
          : buildChainableQuery(null, { code: 'PGRST116' });
      }
      if (table === 'assessment_templates') {
        return template ? buildChainableQuery(template) : buildChainableQuery(null, { code: 'PGRST116' });
      }
      if (table === 'assessment_year_expectations') return expectationsTable;
      return buildChainableQuery(null);
    }),
  };
  return { client, upsert: expectationsTable.upsert };
}

function asAdmin(client: unknown) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  mockHasReadPerm.mockResolvedValue(true);
  mockHasWritePerm.mockResolvedValue(true);
}

async function call(method: 'GET' | 'PUT', indicatorId: string, body?: Record<string, unknown>) {
  const { req, res } = createMocks({
    method,
    query: { templateId: TEMPLATE_DRAFT_1, indicatorId },
    body,
  });
  await handler(req as any, res as any);
  return res;
}

describe('PUT /api/.../templates/[id]/expectations/[indicatorId] — category value rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('D4: refuses a frequency 5/semana write with 400, no upsert, and nothing to read back', async () => {
    const { client, upsert } = buildClient(IND_FRECUENCIA_1);
    asAdmin(client);

    const res = await call('PUT', IND_FRECUENCIA_1, { year1: 5, year1Unit: 'semana' });

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe(
      'Las expectativas de frecuencia requieren unidad y deben guardarse desde el editor de expectativas'
    );
    expect(upsert).not.toHaveBeenCalled();

    const getRes = await call('GET', IND_FRECUENCIA_1);
    expect(getRes._getStatusCode()).toBe(200);
    expect(JSON.parse(getRes._getData()).expectation).toBeNull();
  });

  it('D4: accepts depth 4, saves it and reads it back', async () => {
    const { client, upsert } = buildClient(IND_PROFUNDIDAD_1);
    asAdmin(client);

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year1: 4, year2: 0, year3: null });

    expect(res._getStatusCode()).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      indicator_id: IND_PROFUNDIDAD_1,
      year_1_expected: 4,
      year_2_expected: 0,
      year_3_expected: null,
    });

    const getRes = await call('GET', IND_PROFUNDIDAD_1);
    expect(getRes._getStatusCode()).toBe(200);
    expect(JSON.parse(getRes._getData()).expectation).toMatchObject({ year1: 4, year2: 0, year3: null });
  });

  it.each([
    ['above range', 5],
    ['fraction', 2.5],
    ['negative', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['non-numeric string', 'alto'],
    ['numeric string', '3'],
  ])('D5: rejects depth %s with 400 and no upsert', async (_label, value) => {
    const { client, upsert } = buildClient(IND_PROFUNDIDAD_1);
    asAdmin(client);

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year4: value });

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('Los valores de año deben ser 0-4 o null');
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['fraction', 1.5],
    ['negative', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['non-numeric string', 'cinco'],
  ])('D5: rejects an invalid frequency count (%s) with 400 and no upsert', async (_label, value) => {
    const { client, upsert } = buildClient(IND_FRECUENCIA_1);
    asAdmin(client);

    const res = await call('PUT', IND_FRECUENCIA_1, { year1: value });

    expect(res._getStatusCode()).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D5: unauthenticated request gets 401', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year1: 4 });

    expect(res._getStatusCode()).toBe(401);
  });

  it('D5: role without read permission gets 403 and no upsert', async () => {
    const { client, upsert } = buildClient(IND_PROFUNDIDAD_1);
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockHasReadPerm.mockResolvedValue(false);

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year1: 4 });

    expect(res._getStatusCode()).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D5: role without write permission gets 403 and no upsert', async () => {
    const { client, upsert } = buildClient(IND_PROFUNDIDAD_1);
    asAdmin(client);
    mockHasWritePerm.mockResolvedValue(false);

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year1: 4 });

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toBe('Solo administradores pueden modificar expectativas');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D5: indicator outside the template gets 404 and no upsert', async () => {
    const { client, upsert } = buildClient(IND_PROFUNDIDAD_1, { indicatorInTemplate: false });
    asAdmin(client);

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year1: 4 });

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData()).error).toBe('Indicador no encontrado en este template');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D5: missing template gets 404 and no upsert', async () => {
    const { client, upsert } = buildClient(IND_PROFUNDIDAD_1, { template: null });
    asAdmin(client);

    const res = await call('PUT', IND_PROFUNDIDAD_1, { year1: 4 });

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData()).error).toBe('Template no encontrado');
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['depth', IND_PROFUNDIDAD_1, { year1: 4 }],
    ['frequency', IND_FRECUENCIA_1, { year1: 5, year1Unit: 'semana' }],
  ])('D5: archived template refuses a %s write with 400 and no upsert', async (_label, indicatorId, body) => {
    const { client, upsert } = buildClient(indicatorId, { template: { status: 'published', is_archived: true } });
    asAdmin(client);

    const res = await call('PUT', indicatorId, body);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('Los templates archivados no pueden ser modificados');
    expect(upsert).not.toHaveBeenCalled();
  });
});
