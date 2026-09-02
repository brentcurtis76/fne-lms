// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  OBJECTIVE_A,
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
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPerm,
  hasAssessmentWritePermission: mockHasWritePerm,
}));

import handler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/publish';

/** Draft template + one objective/module/indicator: the minimal publishable fixture. */
function publishableFixture() {
  const template = {
    id: TEMPLATE_DRAFT_1,
    area: 'evaluacion',
    status: 'draft',
    is_archived: false,
    grade_id: 7,
    version: '1.0.0',
    name: 'Test Template',
    description: null,
    scoring_config: { level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 }, default_weights: { objective: 1, module: 1, indicator: 1 } },
    created_at: new Date().toISOString(),
    grade: { id: 7, name: '1° Básico', is_always_gt: true },
  };
  const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
  const module = { id: MODULE_A, name: 'Módulo A', display_order: 1, weight: 1.0, objective_id: OBJECTIVE_A };
  const indicator = { id: IND_COBERTURA_1, name: 'Ind 1', category: 'cobertura', weight: 1, module_id: MODULE_A, display_order: 1 };
  const snapshot = { id: 'snap1', version: '1.1.0', created_at: new Date().toISOString() };

  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') return buildChainableQuery(template);
      if (table === 'assessment_objectives') return buildChainableQuery([objective]);
      if (table === 'assessment_modules') return buildChainableQuery([module]);
      if (table === 'assessment_indicators') return buildChainableQuery([indicator]);
      if (table === 'assessment_year_expectations') return buildChainableQuery([]);
      if (table === 'assessment_template_snapshots') return buildChainableQuery(snapshot);
      return buildChainableQuery([]);
    }),
  };
  return { template, mockClient };
}

function adminSession(mockClient: { from: unknown }) {
  mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
  mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
  mockHasReadPerm.mockResolvedValue(true);
  mockHasWritePerm.mockResolvedValue(true);
}

describe('POST /api/.../templates/[id]/publish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn(() => buildChainableQuery(template)),
    });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(false);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1 },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 400 when template has no modules', async () => {
    const template = { id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false, grade_id: 7 };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([]);
        if (table === 'assessment_modules') return buildChainableQuery([]); // no modules
        if (table === 'ab_grades') return buildChainableQuery({ id: 7, is_always_gt: false });
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
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 when modules have no objective_id', async () => {
    const template = {
      id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false,
      grade_id: 7, grade: { id: 7, name: '1° Básico', is_always_gt: true },
    };
    const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
    const moduleNoObj = { id: MODULE_A, name: 'Módulo sin objetivo', display_order: 1, weight: 1.0, objective_id: null };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([objective]);
        if (table === 'assessment_modules') return buildChainableQuery([moduleNoObj]);
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
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('sin objetivo');
  });

  it('returns 400 when modules reference objectives from another template', async () => {
    const template = {
      id: TEMPLATE_DRAFT_1, area: 'evaluacion', status: 'draft', is_archived: false,
      grade_id: 7, grade: { id: 7, name: '1° Básico', is_always_gt: true },
    };
    const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
    // Module references an objective NOT in the template's objective list
    const moduleBadRef = { id: MODULE_A, name: 'Módulo con ref inválida', display_order: 1, weight: 1.0, objective_id: 'foreign-objective-id' };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([objective]);
        if (table === 'assessment_modules') return buildChainableQuery([moduleBadRef]);
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
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('no pertenecen a este template');
  });

  it('snapshot includes objectives hierarchy when template has objectives', async () => {
    const template = {
      id: TEMPLATE_DRAFT_1,
      area: 'evaluacion',
      status: 'draft',
      is_archived: false,
      grade_id: 7,
      version: '1.0.0',
      name: 'Test Template',
      description: null,
      scoring_config: { level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 }, default_weights: { objective: 1, module: 1, indicator: 1 } },
      created_at: new Date().toISOString(),
      grade: { id: 7, name: '1° Básico', is_always_gt: true },
    };

    const objective = { id: OBJECTIVE_A, name: 'Objetivo A', display_order: 1, weight: 1.0 };
    const module = { id: MODULE_A, name: 'Módulo A', display_order: 1, weight: 1.0, objective_id: OBJECTIVE_A };
    const indicator = { id: IND_COBERTURA_1, name: 'Ind 1', category: 'cobertura', weight: 1, module_id: MODULE_A, display_order: 1 };
    const snapshot = { id: 'snap1', version: '1.1.0', created_at: new Date().toISOString() };

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_objectives') return buildChainableQuery([objective]);
        if (table === 'assessment_modules') return buildChainableQuery([module]);
        if (table === 'assessment_indicators') return buildChainableQuery([indicator]);
        if (table === 'assessment_year_expectations') return buildChainableQuery([]);
        if (table === 'assessment_template_snapshots') return buildChainableQuery(snapshot);
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
    });
    await handler(req as any, res as any);

    // Should succeed (200) and include objectives in snapshot
    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    // The removed upgrade path never reports anything
    expect(body).not.toHaveProperty('upgrade');
  });

  // ── PROC-CONTAIN-01 (A-01): upgradeExisting containment ──────────
  describe('upgradeExisting containment', () => {
    it('rejects upgradeExisting:true with 409 before any read or publication write', async () => {
      const { mockClient } = publishableFixture();
      adminSession(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: true },
      });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      const body = JSON.parse(res._getData());
      expect(body.code).toBe('upgrade_existing_disabled');
      expect(body.error).toContain('deshabilitada');
      // Zero database access: no template read, no snapshot insert, no status update
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('rejects any truthy upgradeExisting value (e.g. the string "true")', async () => {
      const { mockClient } = publishableFixture();
      adminSession(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: 'true' },
      });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(409);
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('still publishes when upgradeExisting is false (older clients) and reports no upgrade', async () => {
      const { mockClient } = publishableFixture();
      adminSession(mockClient);

      const { req, res } = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: false },
      });
      await handler(req as any, res as any);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body).not.toHaveProperty('upgrade');
      expect(mockClient.from).toHaveBeenCalledWith('assessment_template_snapshots');
    });

    it('keeps the auth → permission ordering ahead of the 409', async () => {
      mockGetApiUser.mockResolvedValue({ user: null, error: 'No session' });
      const unauth = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: true },
      });
      await handler(unauth.req as any, unauth.res as any);
      expect(unauth.res._getStatusCode()).toBe(401);

      const { mockClient } = publishableFixture();
      mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
      mockCreateApiSupabaseClient.mockResolvedValue(mockClient);
      mockHasReadPerm.mockResolvedValue(true);
      mockHasWritePerm.mockResolvedValue(false);
      const forbidden = createMocks({
        method: 'POST',
        query: { templateId: TEMPLATE_DRAFT_1 },
        body: { upgradeExisting: true },
      });
      await handler(forbidden.req as any, forbidden.res as any);
      expect(forbidden.res._getStatusCode()).toBe(403);
    });
  });
});
