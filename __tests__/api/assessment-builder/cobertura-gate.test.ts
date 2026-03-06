// @vitest-environment node
/**
 * Tests for the cobertura gate enforcement on indicator UPDATE (PUT).
 * The first indicator of each module must remain category 'cobertura'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  IND_COBERTURA_1,
  IND_FRECUENCIA_1,
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

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

import indicatorByIdHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]';

describe('PUT indicator — cobertura gate enforcement', () => {
  beforeEach(() => vi.clearAllMocks());

  const setupMocks = () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
  };

  it('rejects changing first indicator category from cobertura', async () => {
    setupMocks();

    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const module = { id: MODULE_A, template_id: TEMPLATE_DRAFT_1 };
    const indicator = { id: IND_COBERTURA_1, module_id: MODULE_A };

    // First indicator in the module is IND_COBERTURA_1 with display_order 1
    const firstIndicators = [{ id: IND_COBERTURA_1, display_order: 1 }];

    let indicatorCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery(module);
        if (table === 'assessment_indicators') {
          indicatorCallCount++;
          // First call: verify indicator exists (eq id + single)
          if (indicatorCallCount === 1) return buildChainableQuery(indicator);
          // Second call: cobertura gate check (eq module_id + order + limit)
          if (indicatorCallCount === 2) return buildChainableQuery(firstIndicators);
          return buildChainableQuery(null);
        }
        return buildChainableQuery(null);
      }),
    };

    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_COBERTURA_1 },
      body: { category: 'frecuencia' },
    });
    await indicatorByIdHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('Cobertura');
  });

  it('allows changing non-first indicator category', async () => {
    setupMocks();

    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const module = { id: MODULE_A, template_id: TEMPLATE_DRAFT_1 };
    const indicator = { id: IND_FRECUENCIA_1, module_id: MODULE_A };

    // First indicator is IND_COBERTURA_1 (not the one being updated)
    const firstIndicators = [{ id: IND_COBERTURA_1, display_order: 1 }];
    const updatedIndicator = { id: IND_FRECUENCIA_1, category: 'profundidad', module_id: MODULE_A };

    let indicatorCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery(module);
        if (table === 'assessment_indicators') {
          indicatorCallCount++;
          // First call: verify indicator exists
          if (indicatorCallCount === 1) return buildChainableQuery(indicator);
          // Second call: cobertura gate check — first indicator is different
          if (indicatorCallCount === 2) return buildChainableQuery(firstIndicators);
          // Third call: update
          if (indicatorCallCount === 3) return buildChainableQuery(updatedIndicator);
          return buildChainableQuery(null);
        }
        return buildChainableQuery(null);
      }),
    };

    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_FRECUENCIA_1 },
      body: { category: 'profundidad' },
    });
    await indicatorByIdHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('allows updating first indicator when keeping cobertura category', async () => {
    setupMocks();

    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const module = { id: MODULE_A, template_id: TEMPLATE_DRAFT_1 };
    const indicator = { id: IND_COBERTURA_1, module_id: MODULE_A };
    const updatedIndicator = { id: IND_COBERTURA_1, name: 'Updated Name', category: 'cobertura', module_id: MODULE_A };

    let indicatorCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery(module);
        if (table === 'assessment_indicators') {
          indicatorCallCount++;
          if (indicatorCallCount === 1) return buildChainableQuery(indicator);
          // No cobertura gate check needed — category is 'cobertura'
          if (indicatorCallCount === 2) return buildChainableQuery(updatedIndicator);
          return buildChainableQuery(null);
        }
        return buildChainableQuery(null);
      }),
    };

    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_COBERTURA_1 },
      body: { name: 'Updated Name', category: 'cobertura' },
    });
    await indicatorByIdHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });
});
