// @vitest-environment node
/**
 * Tests for per-year weight distribution in the Assessment Builder.
 *
 * DOD: at least 6 test cases covering save, independence, validation, and copy-from-year.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  TEMPLATE_DRAFT_1,
  OBJECTIVE_A,
  OBJECTIVE_B,
  MODULE_A,
  MODULE_B,
  IND_COBERTURA_1,
  IND_FRECUENCIA_1,
  IND_PROFUNDIDAD_1,
  buildChainableQuery,
} from './_helpers';

// --- Hoisted mocks ---
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

import expectationsHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/expectations/index';

// ============================================================
// Test helper: builds a Supabase client mock for year-weight PUT scenarios
// ============================================================
const buildYearWeightClient = (options: {
  upsertError?: { message: string } | null;
  indicators?: Array<{ id: string; module_id: string; weight: number; category: string }>;
  modules?: Array<{ id: string; objective_id: string; weight: number }>;
  objectives?: Array<{ id: string; weight: number }>;
} = {}) => {
  const objectives = options.objectives ?? [{ id: OBJECTIVE_A, weight: 1 }];
  const modules = options.modules ?? [{ id: MODULE_A, objective_id: OBJECTIVE_A, weight: 1 }];
  const indicators = options.indicators ?? [
    { id: IND_COBERTURA_1, module_id: MODULE_A, weight: 30, category: 'cobertura' },
    { id: IND_FRECUENCIA_1, module_id: MODULE_A, weight: 70, category: 'frecuencia' },
  ];

  const upsertResult = { error: options.upsertError ?? null };

  return {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') {
        return buildChainableQuery({
          id: TEMPLATE_DRAFT_1,
          status: 'draft',
          is_archived: false,
          grade_id: null,
          grade: { id: 1, name: 'Grade 1', is_always_gt: true },
        });
      }
      if (table === 'assessment_indicators') {
        // Used for initial template-level indicator validation
        return buildChainableQuery(
          indicators.map((i) => ({
            id: i.id,
            module_id: i.module_id,
            category: i.category,
            assessment_modules: { template_id: TEMPLATE_DRAFT_1 },
          }))
        );
      }
      if (table === 'assessment_objectives') {
        return buildChainableQuery(objectives);
      }
      if (table === 'assessment_modules') {
        return buildChainableQuery(modules);
      }
      if (table === 'assessment_entity_year_weights') {
        // Return a chainable mock that ends in the upsert result
        const handler: ProxyHandler<Record<string, unknown>> = {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => resolve(upsertResult);
            }
            return vi.fn(() => new Proxy({}, handler));
          },
        };
        return new Proxy({}, handler);
      }
      return buildChainableQuery(null);
    }),
  };
};

// ============================================================
// Auth setup helper
// ============================================================
const setupAuth = () => {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockHasReadPerm.mockResolvedValue(true);
  mockHasWritePerm.mockResolvedValue(true);
};

// ============================================================
// Tests
// ============================================================

describe('Per-year weight distribution — PUT /api/admin/assessment-builder/templates/[id]/expectations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
  });

  // Test 1: Save weights for Year 1 → HTTP 200 success
  it('Test 1: saves per-year weights for Year 1 and returns 200', async () => {
    const mockClient = buildYearWeightClient();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [
          {
            year: 1,
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [
              { id: IND_COBERTURA_1, weight: 30 },
              { id: IND_FRECUENCIA_1, weight: 70 },
            ],
          },
        ],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
    expect(data.yearWeightsSaved).toBeGreaterThan(0);
  });

  // Test 2: Save weights for Year 1 and Year 3 independently → both succeed
  it('Test 2: saves per-year weights for Year 1 and Year 3 in one request', async () => {
    const mockClient = buildYearWeightClient();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [
          {
            year: 1,
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [
              { id: IND_COBERTURA_1, weight: 40 },
              { id: IND_FRECUENCIA_1, weight: 60 },
            ],
          },
          {
            year: 3,
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [
              { id: IND_COBERTURA_1, weight: 10 },
              { id: IND_FRECUENCIA_1, weight: 90 },
            ],
          },
        ],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.success).toBe(true);
  });

  // Test 3: Invalid year (0) → 400
  it('Test 3: year 0 is rejected with 400', async () => {
    const mockClient = buildYearWeightClient();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [
          {
            year: 0, // invalid
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [{ id: IND_COBERTURA_1, weight: 100 }],
          },
        ],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toMatch(/[Aa]ño|year/i);
  });

  // Test 4: Weights not summing to 100 → 400
  it('Test 4: indicator weights not summing to 100 returns 400', async () => {
    const mockClient = buildYearWeightClient();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [
          {
            year: 1,
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [
              { id: IND_COBERTURA_1, weight: 30 },
              { id: IND_FRECUENCIA_1, weight: 30 }, // sum = 60, not 100
            ],
          },
        ],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toMatch(/100/);
  });

  // Test 5: Partial entity payload (only one of two indicators) → 400
  it('Test 5: partial indicator payload for a module returns 400', async () => {
    // Two indicators in DB but only one submitted
    const mockClient = buildYearWeightClient({
      indicators: [
        { id: IND_COBERTURA_1, module_id: MODULE_A, weight: 1, category: 'cobertura' },
        { id: IND_FRECUENCIA_1, module_id: MODULE_A, weight: 1, category: 'frecuencia' },
      ],
    });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [
          {
            year: 2,
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [
              { id: IND_COBERTURA_1, weight: 100 }, // missing IND_FRECUENCIA_1
            ],
          },
        ],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = res._getJSONData();
    expect(data.error).toBeTruthy();
  });

  // Test 6: No yearWeights field (missing body key) → 400
  it('Test 6: missing body (no expectations, weights, or yearWeights) returns 400', async () => {
    const mockClient = buildYearWeightClient();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {}, // Empty body
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  // Test 7: Unauthenticated request → 401
  it('Test 7: unauthenticated request returns 401', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [{ year: 1, indicators: [] }],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  // Test 8: Non-admin user cannot save year weights → 403
  it('Test 8: non-admin user (consultor) cannot save year weights — returns 403', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false); // consultor — no write access

    const mockClient = buildYearWeightClient();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: {
        yearWeights: [
          {
            year: 1,
            objectives: [{ id: OBJECTIVE_A, weight: 100 }],
            modules: [{ id: MODULE_A, weight: 100 }],
            indicators: [
              { id: IND_COBERTURA_1, weight: 50 },
              { id: IND_FRECUENCIA_1, weight: 50 },
            ],
          },
        ],
      },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });
});

// ============================================================
// GET tests: yearWeights included in response
// ============================================================

const buildGetClient = (yearWeightRows: Array<{
  entity_type: string;
  entity_id: string;
  year: number;
  weight: number;
}> = []) => ({
  from: vi.fn((table: string) => {
    if (table === 'assessment_templates') {
      return buildChainableQuery({
        id: TEMPLATE_DRAFT_1,
        name: 'Test Template',
        area: 'personalizacion',
        status: 'draft',
        grade_id: null,
        grade: { id: 1, name: 'Grade', is_always_gt: true },
      });
    }
    if (table === 'assessment_objectives') {
      return buildChainableQuery([{ id: OBJECTIVE_A, name: 'Obj A', display_order: 1, weight: 1 }]);
    }
    if (table === 'assessment_modules') {
      return buildChainableQuery([{
        id: MODULE_A,
        name: 'Mod A',
        display_order: 1,
        weight: 1,
        objective_id: OBJECTIVE_A,
        assessment_indicators: [
          {
            id: IND_COBERTURA_1,
            code: 'C1',
            name: 'Cobertura 1',
            category: 'cobertura',
            display_order: 1,
            weight: 1,
            frequency_unit_options: null,
            level_0_descriptor: null,
            level_1_descriptor: null,
            level_2_descriptor: null,
            level_3_descriptor: null,
            level_4_descriptor: null,
            detalle_options: null,
          },
        ],
      }]);
    }
    if (table === 'assessment_year_expectations') {
      return buildChainableQuery([]);
    }
    if (table === 'assessment_entity_year_weights') {
      return buildChainableQuery(yearWeightRows);
    }
    return buildChainableQuery(null);
  }),
});

describe('Per-year weight distribution — GET /api/admin/assessment-builder/templates/[id]/expectations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
    mockHasWritePerm.mockResolvedValue(true);
  });

  it('GET returns no yearWeights field when no per-year weights configured', async () => {
    const mockClient = buildGetClient([]); // no rows
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.yearWeights).toBeUndefined();
  });

  it('GET returns yearWeights grouped by year when rows exist', async () => {
    const yearWeightRows = [
      { entity_type: 'indicator', entity_id: IND_COBERTURA_1, year: 1, weight: 40 },
      { entity_type: 'objective', entity_id: OBJECTIVE_A, year: 1, weight: 100 },
    ];
    const mockClient = buildGetClient(yearWeightRows);
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });

    await expectationsHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.yearWeights).toBeDefined();
    expect(data.yearWeights[1]).toBeDefined();
    expect(data.yearWeights[1].indicators).toHaveLength(1);
    expect(data.yearWeights[1].indicators[0].id).toBe(IND_COBERTURA_1);
    expect(data.yearWeights[1].indicators[0].weight).toBe(40);
    expect(data.yearWeights[1].objectives[0].weight).toBe(100);
    // Year 2 not in rows → not in response
    expect(data.yearWeights[2]).toBeUndefined();
  });
});
