// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  OBJECTIVE_A,
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
    res.status(405).json({ error: `Method not allowed. Use: ${methods.join(', ')}` });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/index';
import moduleIdHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]';

describe('POST /api/admin/assessment-builder/templates/[id]/modules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks write permission', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(draftTemplate)),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 201 when creating a module successfully', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const newModule = { id: MODULE_A, name: 'New Module', template_id: TEMPLATE_DRAFT_1 };
    const validObjective = { id: OBJECTIVE_A };

    let moduleCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') {
          return buildChainableQuery(draftTemplate);
        }
        if (table === 'assessment_objectives') {
          return buildChainableQuery(validObjective);
        }
        if (table === 'assessment_modules') {
          moduleCallCount++;
          if (moduleCallCount === 1) {
            // getNextDisplayOrder: select().eq().order().limit()
            return buildChainableQuery([{ display_order: 1 }]);
          }
          // insert().select().single()
          return buildChainableQuery(newModule);
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
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module', objective_id: OBJECTIVE_A },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
  });

  it('returns 400 when objective_id is missing', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('objetivo');
  });

  it('returns 400 when objective_id does not belong to template', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') return buildChainableQuery(null, { message: 'Not found' });
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module', objective_id: 'non-existent-id' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('objetivo');
  });

  it('returns 400 when weight is not a number', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module', weight: 'abc', objective_id: OBJECTIVE_A },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('peso');
  });

  it('returns 400 when weight is zero', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module', weight: 0, objective_id: OBJECTIVE_A },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('peso');
  });

  it('returns 400 when weight exceeds 100', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module', weight: 101, objective_id: OBJECTIVE_A },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('peso');
  });

  it('returns 400 when template is archived', async () => {
    const archivedTemplate = { id: TEMPLATE_DRAFT_1, status: 'published', is_archived: true };

    const mockClient = {
      from: vi.fn(() => buildChainableQuery(archivedTemplate)),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'New Module' },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });
});

// ============================================================
// PUT /modules/[moduleId] — validation tests
// ============================================================
describe('PUT /api/admin/assessment-builder/templates/[id]/modules/[moduleId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when objective_id is invalid on update', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const existingModule = { id: MODULE_A, template_id: TEMPLATE_DRAFT_1 };

    let objectiveCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_modules') return buildChainableQuery(existingModule);
        if (table === 'assessment_objectives') {
          objectiveCallCount++;
          return buildChainableQuery(null, { message: 'Not found' });
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { objective_id: 'non-existent-id' },
    });
    await moduleIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('objetivo');
  });

  it('returns 400 when weight is invalid on update', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const existingModule = { id: MODULE_A, template_id: TEMPLATE_DRAFT_1 };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_modules') return buildChainableQuery(existingModule);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { weight: -5 },
    });
    await moduleIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('peso');
  });
});
