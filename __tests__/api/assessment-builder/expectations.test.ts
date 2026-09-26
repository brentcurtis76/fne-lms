// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  IND_COBERTURA_1,
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
  handleMethodNotAllowed: vi.fn((res: any, methods: string[]) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/expectations/index';

describe('GET /api/.../templates/[id]/expectations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks read permission', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({});
    mockHasReadPerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with expectations data', async () => {
    const template = { id: TEMPLATE_DRAFT_1, grade_id: 7, grade: { id: 7, is_always_gt: false } };
    const expectations = [
      { id: 'exp1', indicator_id: IND_PROFUNDIDAD_1, generation_type: 'GT', year_1_expected: 1 },
    ];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_year_expectations') return buildChainableQuery(expectations);
        if (table === 'ab_grades') return buildChainableQuery({ id: 7, is_always_gt: false });
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });
});

// Stateful fake: upserted expectation rows are stored and returned by the next GET;
// every write (update/upsert/insert/delete) on any table is recorded in `writes`
function buildPutClient(templateOverrides: Record<string, unknown> = {}) {
  const store: any[] = [];
  const writes: Array<{ table: string; op: string; payload: any }> = [];
  const recordWrites = (table: string, query: any) =>
    new Proxy(query, {
      get(target, prop) {
        if (prop === 'update' || prop === 'upsert' || prop === 'insert' || prop === 'delete') {
          return (payload: unknown) => {
            writes.push({ table, op: prop, payload });
            return buildChainableQuery(null);
          };
        }
        return target[prop];
      },
    });
  const template = {
    id: TEMPLATE_DRAFT_1,
    name: 'Plantilla sintética',
    status: 'draft',
    is_archived: false,
    grade_id: 7,
    grade: { id: 7, name: '1° medio', is_always_gt: true },
    ...templateOverrides,
  };
  const indicators = [
    { id: IND_COBERTURA_1, module_id: MODULE_A, category: 'cobertura' },
    { id: IND_FRECUENCIA_1, module_id: MODULE_A, category: 'frecuencia' },
    { id: IND_PROFUNDIDAD_1, module_id: MODULE_A, category: 'profundidad' },
  ];
  const modules = [
    {
      id: MODULE_A,
      name: 'Módulo A',
      display_order: 1,
      weight: 100,
      objective_id: null,
      assessment_indicators: indicators.map((ind, i) => ({ id: ind.id, category: ind.category, display_order: i + 1 })),
    },
  ];
  const expectationsTable = {
    upsert: vi.fn((rows: any[]) => {
      writes.push({ table: 'assessment_year_expectations', op: 'upsert', payload: rows });
      const saved = rows.map((row, i) => ({ id: `exp-${store.length + i}`, ...row }));
      store.push(...saved);
      return buildChainableQuery(saved);
    }),
    select: vi.fn(() => buildChainableQuery(store)),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') return buildChainableQuery(template);
      if (table === 'assessment_indicators') return recordWrites(table, buildChainableQuery(indicators));
      if (table === 'assessment_modules') return recordWrites(table, buildChainableQuery(modules));
      if (table === 'assessment_year_expectations') return expectationsTable;
      return recordWrites(table, buildChainableQuery([]));
    }),
  };
  return { client, upsert: expectationsTable.upsert, writes };
}

function asAdmin(client: unknown) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  mockHasReadPerm.mockResolvedValue(true);
  mockHasWritePerm.mockResolvedValue(true);
}

async function put(expectations: unknown[], extraBody: Record<string, unknown> = {}) {
  const { req, res } = createMocks({
    method: 'PUT',
    query: { templateId: TEMPLATE_DRAFT_1 },
    body: { expectations, ...extraBody },
  });
  await handler(req as any, res as any);
  return res;
}

describe('PUT /api/.../templates/[id]/expectations — category value rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('D1: accepts frequency 5/semana and depth 4, saves count and unit, and reads them back', async () => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([
      { indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 5, year1Unit: 'semana' },
      { indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year1: 4 },
    ]);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).saved).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ indicator_id: IND_FRECUENCIA_1, year_1_expected: 5, year_1_expected_unit: 'semana' });
    expect(rows[1]).toMatchObject({ indicator_id: IND_PROFUNDIDAD_1, year_1_expected: 4, year_1_expected_unit: null });

    const { req, res: getRes } = createMocks({ method: 'GET', query: { templateId: TEMPLATE_DRAFT_1 } });
    await handler(req as any, getRes as any);
    expect(getRes._getStatusCode()).toBe(200);
    const byId = new Map(
      JSON.parse(getRes._getData()).modules[0].indicators.map((i: any) => [i.indicatorId, i.expectationsGT])
    );
    expect(byId.get(IND_FRECUENCIA_1)).toMatchObject({ year1: 5, year1Unit: 'semana' });
    expect(byId.get(IND_PROFUNDIDAD_1)).toMatchObject({ year1: 4 });
  });

  it('D1: frequency counts have no upper bound', async () => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([{ indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 0, year2: 200, year2Unit: 'año' }]);

    expect(res._getStatusCode()).toBe(200);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ year_1_expected: 0, year_2_expected: 200, year_2_expected_unit: 'año' });
  });

  it('D1: the write-permission guard still refuses a valid frequency save', async () => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);
    mockHasWritePerm.mockResolvedValue(false);

    const res = await put([{ indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 5, year1Unit: 'semana' }]);

    expect(res._getStatusCode()).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D1: the archived-template guard still refuses a valid frequency save', async () => {
    const { client, upsert } = buildPutClient({ is_archived: true });
    asAdmin(client);

    const res = await put([{ indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 5, year1Unit: 'semana' }]);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe('Los templates archivados no pueden ser modificados');
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['fraction', 1.5],
    ['NaN', NaN],
    ['NaN string', 'NaN'],
    ['Infinity', Infinity],
    ['Infinity string', 'Infinity'],
    ['negative', -1],
    ['non-numeric string', 'cinco'],
    ['numeric string', '5'],
    ['boolean', true],
    ['object', {}],
  ])('D2: rejects frequency %s with 400 and upserts nothing', async (_label, value) => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([{ indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year3: value, year3Unit: 'semana' }]);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).details).toEqual([
      `Indicador ${IND_FRECUENCIA_1}: year3 debe ser un número entero >= 0 o null`,
    ]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D2: an invalid frequency row rejects the whole batch, including valid rows', async () => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([
      { indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year1: 3 },
      { indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 1.5, year1Unit: 'semana' },
    ]);

    expect(res._getStatusCode()).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['above range', 5],
    ['fraction', 2.5],
    ['negative', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['non-numeric string', 'alto'],
    ['numeric string', '3'],
  ])('D3: rejects depth %s with 400 and upserts nothing', async (_label, value) => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([{ indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year2: value }]);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).details).toEqual([
      `Indicador ${IND_PROFUNDIDAD_1}: year2 debe ser un nivel entero entre 0 y 4 o null`,
    ]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('D3: accepts every integer depth level 0-4 and null', async () => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([{ indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year1: 0, year2: 1, year3: 2, year4: 3, year5: 4 }]);

    expect(res._getStatusCode()).toBe(200);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({
      year_1_expected: 0,
      year_2_expected: 1,
      year_3_expected: 2,
      year_4_expected: 3,
      year_5_expected: 4,
    });
  });

  it('keeps the existing rule for other categories', async () => {
    const { client, upsert } = buildPutClient();
    asAdmin(client);

    const res = await put([{ indicatorId: IND_COBERTURA_1, generationType: 'GT', year1: 1, year2: null }]);

    expect(res._getStatusCode()).toBe(200);
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ year_1_expected: 1, year_2_expected: null });
  });
});

describe('PUT /api/.../templates/[id]/expectations — mixed weights and expectations', () => {
  beforeEach(() => vi.clearAllMocks());

  const indicatorWeights = [
    { id: IND_COBERTURA_1, weight: 40 },
    { id: IND_FRECUENCIA_1, weight: 30 },
    { id: IND_PROFUNDIDAD_1, weight: 30 },
  ];
  const validWeights = { indicators: indicatorWeights, modules: [{ id: MODULE_A, weight: 100 }] };
  const validYearWeights = [{ year: 1, indicators: indicatorWeights }];

  it.each([
    ['weights', { weights: validWeights }],
    ['year weights', { yearWeights: validYearWeights }],
    ['weights and year weights', { weights: validWeights, yearWeights: validYearWeights }],
  ])('R1-D1: valid %s plus an invalid frequency returns 400 with no write of any kind', async (_label, extraBody) => {
    const { client, writes } = buildPutClient();
    asAdmin(client);

    const res = await put(
      [
        { indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year1: 4 },
        { indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 1.5, year1Unit: 'semana' },
      ],
      extraBody
    );

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Valores de expectativa inválidos',
      details: [`Indicador ${IND_FRECUENCIA_1}: year1 debe ser un número entero >= 0 o null`],
    });
    expect(writes).toEqual([]);
  });

  it('R1-D2: valid weights, year weights, frequency 5/semana and depth 4 save as before and read back', async () => {
    const { client, writes } = buildPutClient();
    asAdmin(client);

    const res = await put(
      [
        { indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 5, year1Unit: 'semana' },
        { indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year1: 4 },
      ],
      { weights: validWeights, yearWeights: validYearWeights }
    );

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toMatchObject({ success: true, saved: 2, weightsSaved: 4, yearWeightsSaved: 3 });
    expect(writes.map((w) => `${w.op} ${w.table}`)).toEqual([
      'update assessment_modules',
      'update assessment_indicators',
      'update assessment_indicators',
      'update assessment_indicators',
      'upsert assessment_entity_year_weights',
      'upsert assessment_year_expectations',
    ]);
    expect(writes.slice(0, 4).map((w) => w.payload)).toEqual([{ weight: 100 }, { weight: 40 }, { weight: 30 }, { weight: 30 }]);
    expect(writes[4].payload).toEqual(
      indicatorWeights.map((w) => ({
        template_id: TEMPLATE_DRAFT_1,
        entity_type: 'indicator',
        entity_id: w.id,
        year: 1,
        weight: w.weight,
      }))
    );
    expect(writes[5].payload[0]).toMatchObject({ indicator_id: IND_FRECUENCIA_1, year_1_expected: 5, year_1_expected_unit: 'semana' });
    expect(writes[5].payload[1]).toMatchObject({ indicator_id: IND_PROFUNDIDAD_1, year_1_expected: 4, year_1_expected_unit: null });

    const { req, res: getRes } = createMocks({ method: 'GET', query: { templateId: TEMPLATE_DRAFT_1 } });
    await handler(req as any, getRes as any);
    const byId = new Map(
      JSON.parse(getRes._getData()).modules[0].indicators.map((i: any) => [i.indicatorId, i.expectationsGT])
    );
    expect(byId.get(IND_FRECUENCIA_1)).toMatchObject({ year1: 5, year1Unit: 'semana' });
    expect(byId.get(IND_PROFUNDIDAD_1)).toMatchObject({ year1: 4 });
  });
});
