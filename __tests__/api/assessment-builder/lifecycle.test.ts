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

  const VIA_RULES = [
    { area: 'personalizacion', target: 'course_docente' },
    { area: 'liderazgo', target: 'school_responsible' },
  ];
  const adminWith = (from: (table: string) => unknown) => {
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({ from: vi.fn(from) });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
  };

  it('20261008120000: a school-level vía copy without grade is accepted past validation', async () => {
    let templateCalls = 0;
    adminWith((table) => {
      if (table === 'ab_via_assignment_rules') return buildChainableQuery(VIA_RULES);
      if (table === 'assessment_templates') {
        templateCalls++;
        if (templateCalls === 1) return buildChainableQuery({ id: TEMPLATE_PUBLISHED, area: 'liderazgo', grade_id: null });
        if (templateCalls === 2) return buildChainableQuery([]);
        return buildChainableQuery({ id: 'copy', area: 'liderazgo', grade_id: null });
      }
      return buildChainableQuery([]);
    });
    const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_PUBLISHED }, body: { name: 'LID copia', grade_id: null } });
    await duplicateHandler(req as any, res as any);
    expect(res._getStatusCode()).not.toBe(400);
  });

  it('20261008120000: a grade on a school-level vía copy is refused', async () => {
    adminWith((table) => {
      if (table === 'ab_via_assignment_rules') return buildChainableQuery(VIA_RULES);
      return buildChainableQuery({ id: TEMPLATE_PUBLISHED, area: 'liderazgo', grade_id: null });
    });
    const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_PUBLISHED }, body: { name: 'LID copia', grade_id: 7 } });
    await duplicateHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getData()).toContain('no lleva nivel');
  });

  it('20261008120000: a course-vía copy still needs a grade', async () => {
    adminWith((table) => {
      if (table === 'ab_via_assignment_rules') return buildChainableQuery(VIA_RULES);
      return buildChainableQuery({ id: TEMPLATE_PUBLISHED, area: 'personalizacion', grade_id: 7 });
    });
    const { req, res } = createMocks({ method: 'POST', query: { templateId: TEMPLATE_PUBLISHED }, body: { name: 'CRE copia' } });
    await duplicateHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getData()).toContain('nivel es requerido');
  });

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
