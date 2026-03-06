// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  IND_COBERTURA_1,
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
    res.status(405).json({ error: `Method not allowed` });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/index';

describe('POST /api/.../modules/[mid]/indicators', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Test Indicator', category: 'cobertura' },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks write permission', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(template)),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Test Indicator', category: 'cobertura' },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 201 when creating a cobertura indicator', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const newIndicator = { id: IND_COBERTURA_1, name: 'Test', category: 'cobertura', module_id: MODULE_A };

    let indicatorCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
        if (table === 'assessment_indicators') {
          indicatorCallCount++;
          if (indicatorCallCount === 1) return buildChainableQuery([{ display_order: 1 }]);
          return buildChainableQuery(newIndicator);
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Test Indicator', category: 'cobertura' },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(201);
  });

  it('returns 400 when category is missing', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Test Indicator' }, // missing category
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });
});
