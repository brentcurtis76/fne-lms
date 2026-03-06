// @vitest-environment node
/**
 * Tests for the "detalle" indicator category.
 *
 * DOD-1:  IndicatorCategory includes 'detalle'
 * DOD-3:  Builder indicator modal with detalle options
 * DOD-4:  Indicator POST validates detalle_options
 * DOD-5:  Indicator PUT validates detalle_options updates
 * DOD-6:  Indicator GET returns detalle_options
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  IND_COBERTURA_1,
  buildChainableQuery,
} from './_helpers';

// --- Shared mocks ---
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

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

import indicatorHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/index';
import indicatorIdHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]';

// ============================================================
// TYPE SYSTEM TESTS (DOD-1)
// ============================================================

describe('Detalle type system (DOD-1)', () => {
  it('CATEGORY_LABELS includes detalle', async () => {
    const { CATEGORY_LABELS } = await import('../../../types/assessment-builder');
    expect(CATEGORY_LABELS.detalle).toBe('Detalle');
  });

  it('CATEGORY_DESCRIPTIONS includes detalle', async () => {
    const { CATEGORY_DESCRIPTIONS } = await import('../../../types/assessment-builder');
    expect(CATEGORY_DESCRIPTIONS.detalle).toContain('múltiple');
  });

  it('IndicatorCategory union includes detalle (type check via runtime)', async () => {
    // If detalle is in CATEGORY_LABELS, it's part of the type
    const { CATEGORY_LABELS } = await import('../../../types/assessment-builder');
    const categories = Object.keys(CATEGORY_LABELS);
    expect(categories).toContain('detalle');
    expect(categories).toContain('cobertura');
    expect(categories).toContain('frecuencia');
    expect(categories).toContain('profundidad');
    expect(categories).toContain('traspaso');
  });
});

// ============================================================
// POST INDICATOR — DETALLE VALIDATION (DOD-4)
// ============================================================

describe('POST indicator — detalle category (DOD-4)', () => {
  const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

  const buildPostClient = (existingCount: number, newIndicator: Record<string, unknown>) => {
    let indicatorCallCount = 0;
    return {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
        if (table === 'assessment_indicators') {
          indicatorCallCount++;
          if (indicatorCallCount === 1) {
            // max display_order query
            return buildChainableQuery(existingCount > 0 ? [{ display_order: existingCount }] : []);
          }
          return buildChainableQuery(newIndicator);
        }
        return buildChainableQuery([]);
      }),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
  });

  it('accepts valid detalle options with 2+ items (DOD-4)', async () => {
    const newInd = { id: IND_COBERTURA_1, name: 'Detalle test', category: 'detalle', module_id: MODULE_A, detalle_options: ['ABP', 'Gamificación'] };
    mockCreateApiSupabaseClient.mockResolvedValue(buildPostClient(1, newInd));

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Detalle test', category: 'detalle', detalleOptions: ['ABP', 'Gamificación'] },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(201);
  });

  it('rejects detalle with fewer than 2 options (DOD-4)', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(buildPostClient(1, {}));

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Detalle test', category: 'detalle', detalleOptions: ['Solo una'] },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('2');
  });

  it('rejects detalle with more than 15 options (DOD-4)', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(buildPostClient(1, {}));
    const tooMany = Array.from({ length: 16 }, (_, i) => `Opción ${i + 1}`);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Detalle test', category: 'detalle', detalleOptions: tooMany },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('15');
  });

  it('rejects detalle with duplicate options (DOD-4)', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(buildPostClient(1, {}));

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Detalle test', category: 'detalle', detalleOptions: ['ABP', 'abp'] }, // case-insensitive duplicate
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('repetirse');
  });

  it('rejects detalle as the first indicator (display_order 1) (DOD-4)', async () => {
    // existingCount=0 means nextOrder=1, first indicator
    mockCreateApiSupabaseClient.mockResolvedValue(buildPostClient(0, {}));

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Detalle first', category: 'detalle', detalleOptions: ['Opt A', 'Opt B'] },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toContain('Cobertura');
  });

  it('returns detalle_options in GET response (DOD-6)', async () => {
    const indicators = [
      {
        id: IND_COBERTURA_1,
        module_id: MODULE_A,
        name: 'Detalle Test',
        category: 'detalle',
        detalle_options: ['ABP', 'Gamificación'],
        display_order: 2,
        weight: 1,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
        if (table === 'assessment_indicators') return buildChainableQuery(indicators);
        return buildChainableQuery([]);
      }),
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.indicators[0].detalleOptions).toEqual(['ABP', 'Gamificación']);
  });
});

// ============================================================
// PUT INDICATOR — DETALLE VALIDATION (DOD-5)
// ============================================================

describe('PUT indicator — detalle category (DOD-5)', () => {
  const IND_DETALLE = 'ab000004-0000-0000-0000-000000000099';

  const buildPutClient = (updatedData: Record<string, unknown>) => ({
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') return buildChainableQuery({ id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false });
      if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
      if (table === 'assessment_indicators') return buildChainableQuery({ id: IND_DETALLE, module_id: MODULE_A, ...updatedData });
      return buildChainableQuery([]);
    }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
  });

  it('accepts valid detalleOptions update (DOD-5)', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildPutClient({ name: 'Updated', category: 'detalle', detalle_options: ['Nueva A', 'Nueva B', 'Nueva C'] })
    );

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_DETALLE },
      body: { name: 'Updated', detalleOptions: ['Nueva A', 'Nueva B', 'Nueva C'] },
    });
    await indicatorIdHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('rejects detalleOptions update with 1 item (DOD-5)', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(buildPutClient({}));

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_DETALLE },
      body: { detalleOptions: ['Solo una'] },
    });
    await indicatorIdHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });
});

// ============================================================
// SCORING: DETALLE EXCLUDED FROM MODULE SCORE (DOD-12, DOD-13)
// ============================================================

// Mock supabaseAdmin to prevent module-level createClient error
vi.mock('../../../lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('Scoring service — detalle excluded from weighted average (DOD-12, DOD-13)', () => {
  it('scoreIndicator returns 0 for detalle category (DOD-13)', async () => {
    const { scoreIndicator } = await import('../../../lib/services/assessment-builder/scoringService');
    const score = scoreIndicator(
      { coverage_value: true, frequency_value: 10, profundity_level: 4 },
      'detalle'
    );
    expect(score).toBe(0);
  });

  it('scoreIndicator returns 0 for traspaso category (DOD-13)', async () => {
    const { scoreIndicator } = await import('../../../lib/services/assessment-builder/scoringService');
    const score = scoreIndicator(
      { coverage_value: true, frequency_value: 10, profundity_level: 4 },
      'traspaso'
    );
    expect(score).toBe(0);
  });

  it('calculateModuleScore excludes detalle from weighted average (DOD-12)', async () => {
    const { calculateModuleScore } = await import('../../../lib/services/assessment-builder/scoringService');

    // Module with cobertura (100%), profundidad (75%), detalle (not scored)
    const indicators = [
      { id: 'ind-1', name: 'Cobertura', category: 'cobertura' as const, weight: 1 },
      { id: 'ind-2', name: 'Profundidad', category: 'profundidad' as const, weight: 1 },
      { id: 'ind-3', name: 'Detalle', category: 'detalle' as const, weight: 1 },
    ];

    const responses = new Map([
      ['ind-1', { coverage_value: true, frequency_value: undefined, profundity_level: undefined, indicator_id: 'ind-1' } as any],
      ['ind-2', { coverage_value: undefined, frequency_value: undefined, profundity_level: 3, indicator_id: 'ind-2' } as any],
      // ind-3 detalle has no meaningful response for scoring
    ]);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);

    // Expected: (100 * 1 + 75 * 1) / (1 + 1) = 87.5
    // NOT (100 + 75 + 0) / 3 = 58.33 (which was the bug)
    expect(result.moduleScore).toBe(87.5);
    // But all 3 indicators still appear in the result
    expect(result.indicators).toHaveLength(3);
  });

  it('calculateModuleScore excludes traspaso from weighted average (DOD-12)', async () => {
    const { calculateModuleScore } = await import('../../../lib/services/assessment-builder/scoringService');

    const indicators = [
      { id: 'ind-1', name: 'Cobertura', category: 'cobertura' as const, weight: 1 },
      { id: 'ind-t', name: 'Traspaso', category: 'traspaso' as const, weight: 1 },
    ];

    const responses = new Map([
      ['ind-1', { coverage_value: true, frequency_value: undefined, profundity_level: undefined, indicator_id: 'ind-1' } as any],
    ]);

    const result = calculateModuleScore(indicators, responses, 'Test Module', 1);

    // Expected: 100 (only cobertura counts)
    expect(result.moduleScore).toBe(100);
    expect(result.indicators).toHaveLength(2);
  });
});
