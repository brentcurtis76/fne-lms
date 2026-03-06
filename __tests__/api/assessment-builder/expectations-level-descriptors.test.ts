// @vitest-environment node
/**
 * Task-specific tests for:
 * - FIX 2a: Expectations API returns levelDescriptors for profundidad indicators
 * - Traspaso indicators do NOT get levelDescriptors (they get undefined)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  buildChainableQuery,
} from './_helpers';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockHasReadPerm,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockHasReadPerm: vi.fn(),
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
  hasAssessmentWritePermission: vi.fn().mockResolvedValue(false),
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/expectations/index';

const IND_PROFUNDIDAD = 'ab000004-test-prof-0000-000000000001';
const IND_TRASPASO = 'ab000004-test-tras-0000-000000000002';
const IND_COBERTURA = 'ab000004-test-cob-0000-000000000003';

function buildMockClientWithIndicators() {
  const template = {
    id: TEMPLATE_DRAFT_1,
    name: 'Test Template',
    area: 'convivencia',
    status: 'draft',
    grade_id: 1,
    grade: { id: 1, name: 'Tractor', sort_order: 1, is_always_gt: true },
  };

  const modules = [
    {
      id: MODULE_A,
      name: 'Práctica Test',
      display_order: 1,
      assessment_indicators: [
        {
          id: IND_PROFUNDIDAD,
          code: 'P1.1',
          name: 'Indicador Profundidad',
          category: 'profundidad',
          display_order: 1,
          frequency_unit_options: null,
          level_0_descriptor: 'Sin implementación',
          level_1_descriptor: 'Inicio',
          level_2_descriptor: 'En desarrollo',
          level_3_descriptor: 'Consolidado',
          level_4_descriptor: 'Ejemplar',
        },
        {
          id: IND_TRASPASO,
          code: 'T1.1',
          name: 'Indicador Traspaso',
          category: 'traspaso',
          display_order: 2,
          frequency_unit_options: null,
          level_0_descriptor: null,
          level_1_descriptor: null,
          level_2_descriptor: null,
          level_3_descriptor: null,
          level_4_descriptor: null,
        },
        {
          id: IND_COBERTURA,
          code: 'C1.1',
          name: 'Indicador Cobertura',
          category: 'cobertura',
          display_order: 3,
          frequency_unit_options: null,
          level_0_descriptor: null,
          level_1_descriptor: null,
          level_2_descriptor: null,
          level_3_descriptor: null,
          level_4_descriptor: null,
        },
      ],
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') return buildChainableQuery(template);
      if (table === 'assessment_modules') return buildChainableQuery(modules);
      if (table === 'assessment_year_expectations') return buildChainableQuery([]);
      return buildChainableQuery([]);
    }),
  };
}

describe('Expectations API — levelDescriptors (FIX 2a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
  });

  it('returns levelDescriptors with custom text for profundidad indicators', async () => {
    const mockClient = buildMockClientWithIndicators();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    const indicators = body.modules[0].indicators;

    const profInd = indicators.find((i: any) => i.indicatorCategory === 'profundidad');
    expect(profInd).toBeDefined();
    expect(profInd.levelDescriptors).toBeDefined();
    expect(profInd.levelDescriptors.level0).toBe('Sin implementación');
    expect(profInd.levelDescriptors.level1).toBe('Inicio');
    expect(profInd.levelDescriptors.level2).toBe('En desarrollo');
    expect(profInd.levelDescriptors.level3).toBe('Consolidado');
    expect(profInd.levelDescriptors.level4).toBe('Ejemplar');
  });

  it('does NOT return levelDescriptors for traspaso indicators', async () => {
    const mockClient = buildMockClientWithIndicators();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);

    const body = JSON.parse(res._getData());
    const indicators = body.modules[0].indicators;

    const trasInd = indicators.find((i: any) => i.indicatorCategory === 'traspaso');
    expect(trasInd).toBeDefined();
    expect(trasInd.levelDescriptors).toBeUndefined();
  });

  it('does NOT return levelDescriptors for cobertura indicators', async () => {
    const mockClient = buildMockClientWithIndicators();
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);

    const body = JSON.parse(res._getData());
    const indicators = body.modules[0].indicators;

    const cobInd = indicators.find((i: any) => i.indicatorCategory === 'cobertura');
    expect(cobInd).toBeDefined();
    expect(cobInd.levelDescriptors).toBeUndefined();
  });
});
