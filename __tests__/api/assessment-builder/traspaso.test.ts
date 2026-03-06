// @vitest-environment node
/**
 * Tests for the "traspaso" indicator category and associated response validation.
 *
 * DOD-12: IndicatorCategory includes 'traspaso'
 * DOD-16: API validation accepts 'traspaso'
 * DOD-15: Traspaso responses save to sub_responses JSONB
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import {
  ADMIN_UUID,
  DOCENTE_UUID,
  TEMPLATE_DRAFT_1,
  MODULE_A,
  IND_COBERTURA_1,
  SNAPSHOT_ID,
  INSTANCE_PENDING,
  buildChainableQuery,
} from './_helpers';

// --- Indicator API mocks ---
const {
  mockGetApiUserInd,
  mockCreateApiSupabaseClientInd,
  mockHasReadPermInd,
  mockHasWritePermInd,
} = vi.hoisted(() => ({
  mockGetApiUserInd: vi.fn(),
  mockCreateApiSupabaseClientInd: vi.fn(),
  mockHasReadPermInd: vi.fn(),
  mockHasWritePermInd: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUserInd,
  createApiSupabaseClient: mockCreateApiSupabaseClientInd,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Authentication required' });
  }),
  handleMethodNotAllowed: vi.fn((res: any) => {
    res.status(405).json({ error: 'Method not allowed' });
  }),
}));

vi.mock('../../../lib/assessment-permissions', () => ({
  hasAssessmentReadPermission: mockHasReadPermInd,
  hasAssessmentWritePermission: mockHasWritePermInd,
}));

vi.mock('../../../lib/services/assessment-builder/autoAssignmentService', () => ({
  updatePublishedTemplateSnapshot: vi.fn().mockResolvedValue({ success: true }),
}));

import indicatorHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/index';
import responsesHandler from '../../../pages/api/docente/assessments/[instanceId]/responses';

// ============================================================
// INDICATOR CREATION TESTS
// ============================================================

describe('POST indicator — traspaso category', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts traspaso as a valid category (DOD-16)', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const newIndicator = {
      id: IND_COBERTURA_1,
      name: 'Traspaso Test',
      category: 'traspaso',
      module_id: MODULE_A,
    };

    let indicatorCallCount = 0;
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
        if (table === 'assessment_indicators') {
          indicatorCallCount++;
          // First call: get max display_order (existing indicators)
          if (indicatorCallCount === 1) return buildChainableQuery([{ display_order: 2 }]);
          // Second call: insert
          return buildChainableQuery(newIndicator);
        }
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUserInd.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClientInd.mockResolvedValue(mockClient);
    mockHasReadPermInd.mockResolvedValue(true);
    mockHasWritePermInd.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Traspaso Test', category: 'traspaso' },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(201);
  });

  it('rejects invalid category that is not one of the 4 valid ones', async () => {
    const template = { id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false };
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'assessment_templates') return buildChainableQuery(template);
        if (table === 'assessment_modules') return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
        return buildChainableQuery([]);
      }),
    };

    mockGetApiUserInd.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockCreateApiSupabaseClientInd.mockResolvedValue(mockClient);
    mockHasReadPermInd.mockResolvedValue(true);
    mockHasWritePermInd.mockResolvedValue(true);

    const { req, res } = createMocks({
      method: 'POST',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A },
      body: { name: 'Test', category: 'invalido' },
    });
    await indicatorHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });
});

// ============================================================
// RESPONSE VALIDATION TESTS (traspaso sub_responses)
// ============================================================

describe('PUT responses — traspaso validation (DOD-15)', () => {
  beforeEach(() => vi.clearAllMocks());

  const buildResponseClient = (category: string, savedData: unknown = []) => {
    const assignee = {
      id: 'a1',
      instance_id: INSTANCE_PENDING,
      user_id: DOCENTE_UUID,
      can_edit: true,
      has_started: true,
    };
    const instance = {
      id: INSTANCE_PENDING,
      status: 'in_progress',
      template_snapshot_id: SNAPSHOT_ID,
    };
    const snapshot = {
      snapshot_data: {
        modules: [{
          indicators: [{
            id: IND_COBERTURA_1,
            category,
          }],
        }],
      },
    };

    return {
      from: vi.fn((table: string) => {
        if (table === 'assessment_instance_assignees') return buildChainableQuery(assignee);
        if (table === 'assessment_instances') return buildChainableQuery(instance);
        if (table === 'assessment_template_snapshots') return buildChainableQuery(snapshot);
        if (table === 'assessment_responses') return buildChainableQuery(savedData);
        return buildChainableQuery([]);
      }),
    };
  };

  it('saves traspaso sub_responses successfully (DOD-15)', async () => {
    const mockClient = buildResponseClient('traspaso', [{ id: 'r1', indicator_id: IND_COBERTURA_1 }]);

    mockGetApiUserInd.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClientInd.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE_PENDING },
      body: {
        responses: [{
          indicator_id: IND_COBERTURA_1,
          sub_responses: {
            evidence_link: 'https://example.com/evidence',
            improvement_suggestions: 'Mejorar la práctica docente',
          },
        }],
      },
    });
    await responsesHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('rejects javascript: protocol in evidence_link', async () => {
    const mockClient = buildResponseClient('traspaso', []);

    mockGetApiUserInd.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClientInd.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE_PENDING },
      body: {
        responses: [{
          indicator_id: IND_COBERTURA_1,
          sub_responses: {
            evidence_link: 'javascript:alert(1)',
          },
        }],
      },
    });
    await responsesHandler(req as any, res as any);
    // Should reject the response (validResponses empty → 400)
    expect(res._getStatusCode()).toBe(400);
  });

  it('rejects invalid URL in evidence_link', async () => {
    const mockClient = buildResponseClient('traspaso', []);

    mockGetApiUserInd.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClientInd.mockResolvedValue(mockClient);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE_PENDING },
      body: {
        responses: [{
          indicator_id: IND_COBERTURA_1,
          sub_responses: {
            evidence_link: 'not-a-valid-url',
          },
        }],
      },
    });
    await responsesHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('rejects improvement_suggestions exceeding 5000 chars', async () => {
    const mockClient = buildResponseClient('traspaso', []);

    mockGetApiUserInd.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCreateApiSupabaseClientInd.mockResolvedValue(mockClient);

    const longText = 'A'.repeat(5001);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE_PENDING },
      body: {
        responses: [{
          indicator_id: IND_COBERTURA_1,
          sub_responses: {
            improvement_suggestions: longText,
          },
        }],
      },
    });
    await responsesHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });
});

// ============================================================
// TYPE CONSTANT TESTS (DOD-1, DOD-2, DOD-8, DOD-12)
// ============================================================

describe('Assessment Builder type constants', () => {
  it('AREA_LABELS.personalizacion reads Crecimiento (DOD-1)', async () => {
    const { AREA_LABELS } = await import('../../../types/assessment-builder');
    expect(AREA_LABELS.personalizacion).toBe('Crecimiento');
  });

  it('ENTITY_LABELS.objective reads Proceso Generativo (DOD-2)', async () => {
    const { ENTITY_LABELS } = await import('../../../types/assessment-builder');
    expect(ENTITY_LABELS.objective).toBe('Proceso Generativo');
  });

  it('ENTITY_LABELS.module reads Práctica Generativa (DOD-2)', async () => {
    const { ENTITY_LABELS } = await import('../../../types/assessment-builder');
    expect(ENTITY_LABELS.module).toBe('Práctica Generativa');
  });

  it('AREA_CODES has 7 entries (DOD-8)', async () => {
    const { AREA_CODES } = await import('../../../types/assessment-builder');
    expect(Object.keys(AREA_CODES)).toHaveLength(7);
    expect(AREA_CODES.personalizacion).toBe('CRE');
    expect(AREA_CODES.aprendizaje).toBe('APR');
    expect(AREA_CODES.trabajo_docente).toBe('TDO');
  });

  it('CATEGORY_LABELS includes traspaso (DOD-12)', async () => {
    const { CATEGORY_LABELS } = await import('../../../types/assessment-builder');
    expect(CATEGORY_LABELS.traspaso).toBeDefined();
    expect(typeof CATEGORY_LABELS.traspaso).toBe('string');
  });

  it('CATEGORY_DESCRIPTIONS includes traspaso (DOD-12)', async () => {
    const { CATEGORY_DESCRIPTIONS } = await import('../../../types/assessment-builder');
    expect(CATEGORY_DESCRIPTIONS.traspaso).toBeDefined();
  });
});
