// @vitest-environment node
/**
 * F1: changing a frecuencia indicator's rules (min/max/step) when year
 * expectations already exist. Draft template: the change is saved and the
 * conflicts come back as warnings (publish refuses them later). Published
 * template: there is no later gate, so the change is refused and nothing is
 * written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { ADMIN_UUID, TEMPLATE_DRAFT_1, MODULE_A, buildChainableQuery } from './_helpers';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
  mockHasReadPerm,
  mockHasWritePerm,
  mockUpdateSnapshot,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockHasReadPerm: vi.fn(),
  mockHasWritePerm: vi.fn(),
  mockUpdateSnapshot: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
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

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: mockUpdateSnapshot,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]';

const IND_FREQ = 'ab000004-0000-0000-0000-0000000000f1';
const OLD_CONFIG = { min: 0, max: 10, step: 1, unit: 'semana', allowed_units: ['semana'] };
const NEW_CONFIG = { min: 0, max: 5, step: 1, unit: 'semana', allowed_units: ['semana'] };

const row = {
  id: IND_FREQ,
  module_id: MODULE_A,
  code: 'FREC-1',
  name: 'Frecuencia sintética',
  description: null,
  category: 'frecuencia',
  frequency_config: OLD_CONFIG,
  frequency_unit_options: ['semana'],
  level_0_descriptor: null,
  level_1_descriptor: null,
  level_2_descriptor: null,
  level_3_descriptor: null,
  level_4_descriptor: null,
  detalle_options: null,
  evaluation_guidance: null,
  display_order: 2,
  weight: 1,
  visibility_condition: null,
};

const expectationRows = [
  { generation_type: 'GT', year_1_expected: 2, year_2_expected: 4, year_3_expected: 8, year_4_expected: null, year_5_expected: 10 },
];

function buildClient(
  templateStatus: string,
  rows = expectationRows,
  rowsAfterWrite: typeof expectationRows | 'error' = rows,
  restoreFails = false
) {
  const updates: Record<string, unknown>[] = [];
  let expectationReads = 0;
  const indicatorsHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        const failing = restoreFails && updates.length === 2;
        return (resolve: (value: unknown) => void) =>
          resolve(failing ? { data: null, error: { message: 'restore failed' } } : { data: row, error: null });
      }
      if (prop === 'update') {
        return (data: Record<string, unknown>) => {
          updates.push(data);
          return new Proxy({}, indicatorsHandler);
        };
      }
      return vi.fn(() => new Proxy({}, indicatorsHandler));
    },
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') {
        return buildChainableQuery({ id: TEMPLATE_DRAFT_1, status: templateStatus, is_archived: false });
      }
      if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
      if (table === 'assessment_indicators') return new Proxy({}, indicatorsHandler);
      if (table === 'assessment_year_expectations') {
        expectationReads += 1;
        if (expectationReads === 1) return buildChainableQuery(rows);
        return rowsAfterWrite === 'error' ? buildChainableQuery(null, { message: 'boom' }) : buildChainableQuery(rowsAfterWrite);
      }
      return buildChainableQuery([]);
    }),
  };
  return { client, updates };
}

async function put(client: unknown, body: Record<string, unknown>) {
  mockCreateApiSupabaseClient.mockResolvedValue(client);
  mockCreateServiceRoleClient.mockReturnValue(client);
  const { req, res } = createMocks({
    method: 'PUT',
    query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_FREQ },
    body,
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

describe('PUT indicator — F1 year expectations against new frequency rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
    mockUpdateSnapshot.mockResolvedValue({ success: true });
  });

  it('draft: saves the narrower rules and returns every expectation that no longer fits as a warning', async () => {
    const { client, updates } = buildClient('draft');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: NEW_CONFIG });

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].frequency_config).toEqual(NEW_CONFIG);
    expect(res.json.expectationWarnings).toEqual([
      'FREC-1 (GT, Año 3): 8 es mayor que el máximo (5)',
      'FREC-1 (GT, Año 5): 10 es mayor que el máximo (5)',
    ]);
  });

  it('draft: no warnings when every expectation still fits', async () => {
    const { client, updates } = buildClient('draft');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: { ...OLD_CONFIG, max: 12 } });

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(res.json.expectationWarnings).toBeUndefined();
  });

  it('published: refuses rules that would strand expectations, with 409, details, and no write or snapshot update', async () => {
    const { client, updates } = buildClient('published');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: NEW_CONFIG });

    expect(res.status).toBe(409);
    expect(res.json.code).toBe('expectations_out_of_range');
    expect(res.json.details).toEqual([
      'FREC-1 (GT, Año 3): 8 es mayor que el máximo (5)',
      'FREC-1 (GT, Año 5): 10 es mayor que el máximo (5)',
    ]);
    expect(updates).toEqual([]);
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });

  it('published: a compatible change is still saved', async () => {
    const { client, updates } = buildClient('published');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: { ...OLD_CONFIG, step: 2 } });

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(res.json.expectationWarnings).toBeUndefined();
  });

  it.each([
    ['missing allowed_units', { min: 0, max: 5, step: 1, unit: 'semana' }],
    ['legacy unit only', { unit: 'veces' }],
    ['min not below max', { min: 5, max: 5, step: 1, unit: 'semana', allowed_units: ['semana'] }],
  ])('published: refuses an unusable config (%s) with 400 and writes nothing', async (_label, config) => {
    const { client, updates } = buildClient('published');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: config });

    expect(res.status).toBe(400);
    expect(res.json.code).toBe('invalid_frequency_config');
    expect(res.json.details.length).toBeGreaterThan(0);
    expect(updates).toEqual([]);
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });

  it('draft: an incomplete config is still saved (publish refuses it later)', async () => {
    const { client, updates } = buildClient('draft');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: { min: 0, max: 5, step: 1, unit: 'semana' } });

    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
  });

  it('published: undoes the rule change when expectations changed concurrently (409, previous values restored, no snapshot)', async () => {
    const stranded = [{ ...expectationRows[0], year_3_expected: 4, year_5_expected: 5 }, { generation_type: 'GI', year_1_expected: 9, year_2_expected: null, year_3_expected: null, year_4_expected: null, year_5_expected: null }];
    const { client, updates } = buildClient('published', [{ ...expectationRows[0], year_3_expected: 4, year_5_expected: 5 }], stranded);
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: NEW_CONFIG });

    expect(res.status).toBe(409);
    expect(res.json.code).toBe('concurrent_expectation_change');
    expect(res.json.details).toEqual(['FREC-1 (GI, Año 1): 9 es mayor que el máximo (5)']);
    expect(updates).toHaveLength(2);
    expect(updates[0].frequency_config).toEqual(NEW_CONFIG);
    expect(updates[1]).toEqual({ name: 'Frecuencia sintética', frequency_config: OLD_CONFIG });
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });

  it('published: fails closed when expectations cannot be re-read after the write', async () => {
    const fitting = [{ ...expectationRows[0], year_3_expected: 4, year_5_expected: 5 }];
    const { client, updates } = buildClient('published', fitting, 'error');
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: NEW_CONFIG });

    expect(res.status).toBe(409);
    expect(updates).toHaveLength(2);
    expect(updates[1].frequency_config).toEqual(OLD_CONFIG);
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });

  it('published: reports a failed undo as such (500 undo_incomplete), not as a clean refusal', async () => {
    const fitting = [{ ...expectationRows[0], year_3_expected: 4, year_5_expected: 5 }];
    const { client, updates } = buildClient('published', fitting, 'error', true);
    const res = await put(client, { name: 'Frecuencia sintética', frequencyConfig: NEW_CONFIG });

    expect(res.status).toBe(500);
    expect(res.json.code).toBe('undo_incomplete');
    expect(updates).toHaveLength(2);
    expect(mockUpdateSnapshot).not.toHaveBeenCalled();
  });

  it('a change that does not touch the frequency rules does not consult expectations', async () => {
    const { client } = buildClient('published');
    const res = await put(client, { name: 'Nuevo nombre' });

    expect(res.status).toBe(200);
    expect(client.from).not.toHaveBeenCalledWith('assessment_year_expectations');
  });
});
