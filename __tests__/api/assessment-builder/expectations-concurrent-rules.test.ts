// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
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


/**
 * F1 on a PUBLISHED template: the expectations save re-reads the indicator's
 * rules after writing. When the rules changed in that instant (another admin's
 * indicator save) and no longer accept the saved values, the save is undone —
 * replaced rows restored, created rows removed — and the admin is asked to retry.
 */
const WIDE = { min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana'] };
const NARROW = { min: 0, max: 5, step: 1, unit: 'semana', allowed_units: ['semana'] };
const OLD_GT_ROW = {
  id: 'exp-old', template_id: TEMPLATE_DRAFT_1, indicator_id: IND_FRECUENCIA_1, generation_type: 'GT',
  year_1_expected: 4, year_1_expected_unit: 'semana', year_2_expected: null, year_2_expected_unit: null,
  year_3_expected: null, year_3_expected_unit: null, year_4_expected: null, year_4_expected_unit: null,
  year_5_expected: null, year_5_expected_unit: null, tolerance: 1,
};

function buildClient(opts: {
  status: string;
  rulesAfterWrite: unknown;
  rulesReadFails?: boolean;
  rulesBefore?: unknown;
  frequencyGoneAfterWrite?: boolean;
  restoreFails?: boolean;
}) {
  const ops: Array<{ table: string; op: string; payload?: unknown; filters?: unknown[] }> = [];
  let indicatorReads = 0;
  const template = {
    id: TEMPLATE_DRAFT_1, status: opts.status, is_archived: false, grade_id: 7,
    grade: { id: 7, name: '1° medio', is_always_gt: false },
  };
  const indicatorsAt = (config: unknown) => [
    { id: IND_FRECUENCIA_1, module_id: MODULE_A, code: 'FREC-1', name: 'Frecuencia', category: 'frecuencia', frequency_config: config },
    { id: IND_PROFUNDIDAD_1, module_id: MODULE_A, code: 'PROF-1', name: 'Profundidad', category: 'profundidad', frequency_config: null },
  ];
  const recording = (table: string, data: unknown, error: unknown = null) => {
    const filters: unknown[] = [];
    let opError = error;
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data, error: opError });
        if (prop === 'upsert' || prop === 'delete' || prop === 'update' || prop === 'insert') {
          return (payload?: unknown) => {
            const isRestore = ops.some((o) => o.table === table && o.op === 'upsert');
            ops.push({ table, op: String(prop), payload, filters });
            if (opts.restoreFails && isRestore && prop === 'delete') opError = { message: 'restore failed' };
            return new Proxy({}, handler);
          };
        }
        if (prop === 'eq' || prop === 'in') {
          return (...args: unknown[]) => {
            filters.push([prop, ...args]);
            return new Proxy({}, handler);
          };
        }
        return vi.fn(() => new Proxy({}, handler));
      },
    };
    return new Proxy({}, handler);
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') return buildChainableQuery(template);
      if (table === 'assessment_indicators') {
        indicatorReads += 1;
        if (indicatorReads === 1) return recording(table, indicatorsAt(opts.rulesBefore ?? WIDE));
        if (opts.rulesReadFails) return recording(table, null, { message: 'boom' });
        const after = indicatorsAt(opts.rulesAfterWrite);
        return recording(table, opts.frequencyGoneAfterWrite ? after.filter((i) => i.category !== 'frecuencia') : after);
      }
      if (table === 'assessment_year_expectations') return recording(table, [OLD_GT_ROW]);
      return recording(table, []);
    }),
  };
  return { client, ops };
}

function asAdmin(client: unknown) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  mockHasReadPerm.mockResolvedValue(true);
  mockHasWritePerm.mockResolvedValue(true);
}

async function put(expectations: unknown[]) {
  const { req, res } = createMocks({ method: 'PUT', query: { templateId: TEMPLATE_DRAFT_1 }, body: { expectations } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

const SAVE = [
  { indicatorId: IND_FRECUENCIA_1, generationType: 'GT', year1: 8, year1Unit: 'semana' },
  { indicatorId: IND_FRECUENCIA_1, generationType: 'GI', year2: 9, year2Unit: 'semana' },
];

describe('PUT expectations — F1 re-check after the write (published template)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('undoes the save when the rules narrowed concurrently: restores the replaced GT row, removes the new GI row, 409', async () => {
    const { client, ops } = buildClient({ status: 'published', rulesAfterWrite: NARROW });
    asAdmin(client);

    const res = await put(SAVE);

    expect(res.status).toBe(409);
    expect(res.json.code).toBe('concurrent_rule_change');
    expect(res.json.details).toEqual([
      'FREC-1 (GT, Año 1): 8 es mayor que el máximo (5)',
      'FREC-1 (GI, Año 2): 9 es mayor que el máximo (5)',
    ]);
    const writes = ops.filter((o) => o.table === 'assessment_year_expectations');
    expect(writes.map((o) => o.op)).toEqual(['upsert', 'upsert', 'delete']);
    expect(writes[1].payload).toEqual(OLD_GT_ROW);
    expect(writes[2].filters).toEqual(expect.arrayContaining([
      ['eq', 'indicator_id', IND_FRECUENCIA_1],
      ['eq', 'generation_type', 'GI'],
    ]));
  });

  it('fails closed when the rules cannot be re-read: undoes the save, 409', async () => {
    const { client, ops } = buildClient({ status: 'published', rulesAfterWrite: WIDE, rulesReadFails: true });
    asAdmin(client);

    const res = await put(SAVE);

    expect(res.status).toBe(409);
    expect(ops.filter((o) => o.table === 'assessment_year_expectations').map((o) => o.op)).toEqual(['upsert', 'upsert', 'delete']);
  });

  it('keeps the save when the rules still accept the values', async () => {
    const { client, ops } = buildClient({ status: 'published', rulesAfterWrite: WIDE });
    asAdmin(client);

    const res = await put(SAVE);

    expect(res.status).toBe(200);
    expect(ops.filter((o) => o.table === 'assessment_year_expectations').map((o) => o.op)).toEqual(['upsert']);
  });

  it('draft template: no re-check (publish is the gate), the save stands', async () => {
    const { client, ops } = buildClient({ status: 'draft', rulesAfterWrite: NARROW });
    asAdmin(client);

    const res = await put(SAVE);

    expect(res.status).toBe(200);
    expect(ops.filter((o) => o.table === 'assessment_year_expectations').map((o) => o.op)).toEqual(['upsert']);
  });
});

describe('PUT expectations — F1 re-check edge cases (published template)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('undoes the WHOLE batch, including a non-frecuencia row saved with it', async () => {
    const { client, ops } = buildClient({ status: 'published', rulesAfterWrite: NARROW });
    asAdmin(client);

    const res = await put([...SAVE, { indicatorId: IND_PROFUNDIDAD_1, generationType: 'GT', year1: 3 }]);

    expect(res.status).toBe(409);
    const writes = ops.filter((o) => o.table === 'assessment_year_expectations');
    expect(writes.map((o) => o.op)).toEqual(['upsert', 'upsert', 'delete', 'delete']);
    expect(writes[3].filters).toEqual(expect.arrayContaining([['eq', 'indicator_id', IND_PROFUNDIDAD_1]]));
  });

  it('fails closed when the frecuencia indicator is gone after the write', async () => {
    const { client, ops } = buildClient({ status: 'published', rulesAfterWrite: WIDE, frequencyGoneAfterWrite: true });
    asAdmin(client);

    const res = await put(SAVE);

    expect(res.status).toBe(409);
    expect(ops.filter((o) => o.table === 'assessment_year_expectations').map((o) => o.op)).toEqual(['upsert', 'upsert', 'delete']);
  });

  it('fails closed when usable rules became unusable after the write', async () => {
    const { client } = buildClient({ status: 'published', rulesAfterWrite: { min: 0, max: 10, step: 1, unit: 'semana' } });
    asAdmin(client);

    expect((await put(SAVE)).status).toBe(409);
  });

  it('leaves legacy rules (unusable before and after) unjudged, as at validation time', async () => {
    const { client, ops } = buildClient({ status: 'published', rulesBefore: { unit: 'veces' }, rulesAfterWrite: { unit: 'veces' } });
    asAdmin(client);

    expect((await put(SAVE)).status).toBe(200);
    expect(ops.filter((o) => o.table === 'assessment_year_expectations').map((o) => o.op)).toEqual(['upsert']);
  });

  it('reports an incomplete undo as such (500 undo_incomplete), never as "nothing was saved"', async () => {
    const { client } = buildClient({ status: 'published', rulesAfterWrite: NARROW, restoreFails: true });
    asAdmin(client);

    const res = await put(SAVE);

    expect(res.status).toBe(500);
    expect(res.json.code).toBe('undo_incomplete');
    expect(res.json.error).toContain('no se pudo deshacer por completo');
  });
});
