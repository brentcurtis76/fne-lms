// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  TEMPLATE_PUBLISHED,
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

// Archive handler
import archiveHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/archive';
// Duplicate handler
import duplicateHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/duplicate';

describe('POST /api/.../templates/[id]/archive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_PUBLISHED },
    });
    await archiveHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery({ id: TEMPLATE_PUBLISHED, status: 'published' })),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_PUBLISHED },
    });
    await archiveHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when trying to archive a draft template', async () => {
    const draftTemplate = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const mockClient = {
      from: vi.fn(() => buildChainableQuery(draftTemplate)),
    };

    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await archiveHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });
});

describe('POST /api/.../templates/[id]/duplicate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_PUBLISHED },
    });
    await duplicateHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery({ id: TEMPLATE_PUBLISHED, status: 'published' })),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_PUBLISHED },
    });
    await duplicateHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });
});
