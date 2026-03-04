// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  OBJECTIVE_A,
  OBJECTIVE_B,
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

import indexHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/objectives/index';
import objectiveHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/objectives/[objectiveId]';

// ============================================================
// GET /objectives (list)
// ============================================================
describe('GET /api/admin/assessment-builder/templates/[id]/objectives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks read permission', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(draftTemplate)),
    });
    mockHasReadPerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 404 when template does not exist', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(null, { message: 'Not found' })),
    });
    mockHasReadPerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'GET',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
  });

  it('returns 200 with objectives list', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const objectives = [
      { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 },
      { id: OBJECTIVE_B, name: 'Objetivo B', display_order: 2, weight: 1.0 },
    ];

    let callCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') {
          callCount++;
          if (callCount === 1) return buildChainableQuery(objectives); // GET list
          return buildChainableQuery([]); // module count query
        }
        if (table === 'assessment_modules') return buildChainableQuery([]);
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
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.objectives).toHaveLength(2);
  });
});

// ============================================================
// POST /objectives (create)
// ============================================================
describe('POST /api/admin/assessment-builder/templates/[id]/objectives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'Nuevo Objetivo' },
    });
    await indexHandler(req as any, res as any);

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
      body: { name: 'Nuevo Objetivo' },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when name is missing', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(draftTemplate)),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: '' },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when template is archived', async () => {
    const archivedTemplate = { id: TEMPLATE_DRAFT_1, status: 'published', is_archived: true };
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(archivedTemplate)),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
      body: { name: 'Nuevo Objetivo' },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 201 when objective is created successfully', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const newObjective = { id: OBJECTIVE_A, name: 'Nuevo Objetivo', template_id: TEMPLATE_DRAFT_1, display_order: 1, weight: 1.0 };

    let objectiveCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') {
          objectiveCallCount++;
          if (objectiveCallCount === 1) return buildChainableQuery([]); // getNextDisplayOrder
          return buildChainableQuery(newObjective); // insert
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
      body: { name: 'Nuevo Objetivo', weight: 1.0 },
    });
    await indexHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.objective).toBeDefined();
  });
});

// ============================================================
// PUT /objectives/[objectiveId] (update)
// ============================================================
describe('PUT /api/admin/assessment-builder/templates/[id]/objectives/[objectiveId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
      body: { name: 'Updated' },
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks write permission', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const objective = { id: OBJECTIVE_A, template_id: TEMPLATE_DRAFT_1 };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') return buildChainableQuery(objective);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
      body: { name: 'Updated' },
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when no fields to update', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const objective = { id: OBJECTIVE_A, template_id: TEMPLATE_DRAFT_1 };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') return buildChainableQuery(objective);
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
      body: {}, // empty body
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 200 when objective updated successfully', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const existingObjective = { id: OBJECTIVE_A, template_id: TEMPLATE_DRAFT_1 };
    const updatedObjective = { id: OBJECTIVE_A, name: 'Updated Name', template_id: TEMPLATE_DRAFT_1, weight: 2.0 };

    let objectiveCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') {
          objectiveCallCount++;
          if (objectiveCallCount === 1) return buildChainableQuery(existingObjective); // existence check
          return buildChainableQuery(updatedObjective); // update
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
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
      body: { name: 'Updated Name', weight: 2.0 },
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.objective.name).toBe('Updated Name');
  });
});

// ============================================================
// DELETE /objectives/[objectiveId]
// ============================================================
describe('DELETE /api/admin/assessment-builder/templates/[id]/objectives/[objectiveId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 404 when objective does not exist', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };

    let objectiveCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') {
          objectiveCallCount++;
          if (objectiveCallCount === 1) return buildChainableQuery(null, { message: 'Not found' }); // existence check
          return buildChainableQuery([]);
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
  });

  it('returns 200 when objective deleted successfully', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const objective = { id: OBJECTIVE_A, template_id: TEMPLATE_DRAFT_1 };

    let objectiveCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(draftTemplate);
        if (table === 'assessment_objectives') {
          objectiveCallCount++;
          if (objectiveCallCount === 1) return buildChainableQuery(objective); // existence check
          if (objectiveCallCount === 2) return buildChainableQuery(null); // delete
          return buildChainableQuery([]); // reorder query
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { templateId: TEMPLATE_DRAFT_1, objectiveId: OBJECTIVE_A },
    });
    await objectiveHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
  });
});
