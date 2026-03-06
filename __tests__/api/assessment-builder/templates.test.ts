// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  buildChainableQuery,
} from './_helpers';

// Hoisted mocks
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

import handler from '../../../pages/api/admin/assessment-builder/templates/index';

describe('GET /api/admin/assessment-builder/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks read permission', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({});
    mockHasReadPerm.mockResolvedValue(false);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 200 with templates list for admin', async () => {
    const templates = [
      { id: TEMPLATE_DRAFT_1, area: 'evaluacion', name: 'Test', status: 'draft' },
    ];
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') {
          return buildChainableQuery(templates);
        }
        if (table === 'assessment_modules') {
          return buildChainableQuery([{ template_id: TEMPLATE_DRAFT_1 }]);
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);

    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.templates).toBeDefined();
  });
});

describe('POST /api/admin/assessment-builder/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'New Template', grade_id: 7 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user lacks write permission', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({});
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'New Template', grade_id: 7 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when area or name is missing', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery([])),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion' }, // missing name and grade_id
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when grade_id is missing', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery([])),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'Test' }, // missing grade_id
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 201 when creating a template successfully', async () => {
    const newTemplate = {
      id: 'new-id',
      area: 'evaluacion',
      name: 'New Template',
      status: 'draft',
      grade_id: 7,
    };

    // Track call count to distinguish version query from insert query
    let callCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        callCount++;
        if (table === 'assessment_templates' && callCount === 1) {
          // First call: getNextVersion → select().eq().order().limit()
          return buildChainableQuery([{ version: '1.0.0' }]);
        }
        // Second call: insert().select().single()
        return buildChainableQuery(newTemplate);
      }),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      body: { area: 'evaluacion', name: 'New Template', grade_id: 7 },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.template).toBeDefined();
  });
});
