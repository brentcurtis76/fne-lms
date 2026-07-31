// @vitest-environment node
/**
 * Focused regression tests for the indicator PUT case-mapping fix
 * (branch: fix/ind-put-case).
 *
 * The handler accepts camelCase (client) or snake_case (legacy) request bodies
 * and must persist snake_case columns; the response must return camelCase via
 * mapIndicatorRow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { ADMIN_UUID, TEMPLATE_DRAFT_1, MODULE_A, buildChainableQuery } from './_helpers';

// --- Shared mocks (hoisted, same pattern as detalle.test.ts) ---
const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCreateServiceRoleClient,
  mockHasReadPerm,
  mockHasWritePerm,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockHasReadPerm: vi.fn(),
  mockHasWritePerm: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
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

import indicatorIdHandler from '../../../pages/api/admin/assessment-builder/templates/[templateId]/modules/[moduleId]/indicators/[indicatorId]';

const IND_TEST = 'ab000004-0000-0000-0000-000000000099';

/**
 * Capture-update Supabase proxy — mirrors the "clears detalle_options" pattern
 * in detalle.test.ts. Returns the same `returnRow` for every awaited chain,
 * captures the object passed to `.update(...)`, and exposes an accessor.
 *
 * Note: because every assessment_indicators query resolves to the same object
 * (not an array), the cobertura-lock branch (`indicators?.[0]?.id`) always
 * no-ops here — that gate is exercised in cobertura-gate.test.ts, not this file.
 */
function buildCaptureClient(returnRow: Record<string, unknown>) {
  let capturedUpdateData: Record<string, unknown> | null = null;
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'assessment_templates') {
        return buildChainableQuery({ id: TEMPLATE_DRAFT_1, status: 'draft', is_archived: false });
      }
      if (table === 'assessment_modules') {
        return buildChainableQuery({ id: MODULE_A, template_id: TEMPLATE_DRAFT_1 });
      }
      if (table === 'assessment_indicators') {
        const handler: ProxyHandler<Record<string, unknown>> = {
          get(_target, prop) {
            if (prop === 'then') {
              return (resolve: (value: unknown) => void) =>
                resolve({ data: returnRow, error: null });
            }
            if (prop === 'update') {
              return (data: Record<string, unknown>) => {
                capturedUpdateData = data;
                return new Proxy({}, handler);
              };
            }
            return vi.fn(() => new Proxy({}, handler));
          },
        };
        return new Proxy({}, handler);
      }
      return buildChainableQuery([]);
    }),
  };
  return { client, getCaptured: () => capturedUpdateData };
}

const MOCK_VISIBILITY_CONDITION = {
  field: 'ctx.grade',
  operator: 'equals' as const,
  value: '3',
};

describe('PUT indicator — case mapping (fix/ind-put-case)', () => {
  const baseRow = {
    id: IND_TEST,
    module_id: MODULE_A,
    code: 'IND-1',
    name: 'Test',
    description: null,
    category: 'profundidad',
    frequency_config: null,
    frequency_unit_options: null,
    level_0_descriptor: 'lvl0',
    level_1_descriptor: null,
    level_2_descriptor: null,
    level_3_descriptor: null,
    level_4_descriptor: null,
    detalle_options: null,
    evaluation_guidance: 'guide',
    display_order: 3,
    weight: 1,
    visibility_condition: MOCK_VISIBILITY_CONDITION,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: ADMIN_UUID }, error: null });
    mockHasReadPerm.mockResolvedValue(true);
    mockHasWritePerm.mockResolvedValue(true);
  });

  it('maps camelCase descriptors, evaluationGuidance, frequencyConfig, and frequencyUnitOptions into snake_case updateData', async () => {
    const { client, getCaptured } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const freqCfg = { min: 1, max: 10, unit: 'week' };
    const freqUnits = ['day', 'week', 'month'];

    // No `category` in body → skips category-transition hygiene block that
    // would otherwise null the frequency/descriptor columns. Lets us verify
    // all seven camelCase → snake_case mappings in a single captured payload.
    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: {
        level0Descriptor: 'nivel 0 texto',
        level1Descriptor: 'nivel 1 texto',
        level2Descriptor: 'nivel 2 texto',
        level3Descriptor: 'nivel 3 texto',
        level4Descriptor: 'nivel 4 texto',
        evaluationGuidance: 'guía de evaluación',
        frequencyConfig: freqCfg,
        frequencyUnitOptions: freqUnits,
      },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const captured = getCaptured();
    expect(captured).toBeTruthy();
    expect(captured!.level_0_descriptor).toBe('nivel 0 texto');
    expect(captured!.level_1_descriptor).toBe('nivel 1 texto');
    expect(captured!.level_2_descriptor).toBe('nivel 2 texto');
    expect(captured!.level_3_descriptor).toBe('nivel 3 texto');
    expect(captured!.level_4_descriptor).toBe('nivel 4 texto');
    expect(captured!.evaluation_guidance).toBe('guía de evaluación');
    expect(captured!.frequency_config).toEqual(freqCfg);
    expect(captured!.frequency_unit_options).toEqual(freqUnits);
    // No camelCase keys should leak into updateData
    expect(captured).not.toHaveProperty('level0Descriptor');
    expect(captured).not.toHaveProperty('evaluationGuidance');
    expect(captured).not.toHaveProperty('frequencyConfig');
    expect(captured).not.toHaveProperty('frequencyUnitOptions');
  });

  it('still accepts legacy snake_case body keys', async () => {
    const { client, getCaptured } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: {
        category: 'profundidad',
        level_0_descriptor: 'legacy 0',
        level_1_descriptor: 'legacy 1',
        evaluation_guidance: 'legacy guidance',
      },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const captured = getCaptured();
    expect(captured).toBeTruthy();
    expect(captured!.level_0_descriptor).toBe('legacy 0');
    expect(captured!.level_1_descriptor).toBe('legacy 1');
    expect(captured!.evaluation_guidance).toBe('legacy guidance');
  });

  it('returns camelCase fields in the PUT response and no snake_case keys', async () => {
    const { client } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { name: 'Updated name' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const payload = JSON.parse(res._getData());
    expect(payload.success).toBe(true);
    expect(payload.indicator).toBeTruthy();
    expect(payload.indicator.level0Descriptor).toBe('lvl0');
    expect(payload.indicator.evaluationGuidance).toBe('guide');
    expect(payload.indicator.displayOrder).toBe(3);
    expect(payload.indicator.visibilityCondition).toEqual(MOCK_VISIBILITY_CONDITION);
    expect(payload.indicator).not.toHaveProperty('level_0_descriptor');
    expect(payload.indicator).not.toHaveProperty('evaluation_guidance');
    expect(payload.indicator).not.toHaveProperty('display_order');
    expect(payload.indicator).not.toHaveProperty('visibility_condition');
  });

  it('rejects profundidad with no non-empty descriptor (400 + Spanish message)', async () => {
    const { client } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: {
        category: 'profundidad',
        level0Descriptor: '',
        level1Descriptor: '   ',
        level2Descriptor: null,
      },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Los indicadores de profundidad requieren al menos un descriptor de nivel');
  });

  it('preserves descriptor/frequency columns on category → cobertura (preserve + hide)', async () => {
    // Preserve + hide: a category change must NOT destroy the off-category
    // columns. The snapshot builders hide them by category instead, so the data
    // survives and reappears if the category is switched back.
    const { client, getCaptured } = buildCaptureClient({ ...baseRow, category: 'cobertura' });
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { category: 'cobertura' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const captured = getCaptured();
    expect(captured).toBeTruthy();
    expect(captured!.category).toBe('cobertura');
    // The switch does not touch the descriptor/frequency columns at all.
    expect(captured).not.toHaveProperty('level_0_descriptor');
    expect(captured).not.toHaveProperty('level_1_descriptor');
    expect(captured).not.toHaveProperty('level_2_descriptor');
    expect(captured).not.toHaveProperty('level_3_descriptor');
    expect(captured).not.toHaveProperty('level_4_descriptor');
    expect(captured).not.toHaveProperty('frequency_config');
    expect(captured).not.toHaveProperty('frequency_unit_options');
  });

  it('allows a rename-only PUT on a descriptor-less profundidad row (does not brick legacy rows)', async () => {
    // Legacy stuck row: profundidad with all-null descriptors. A rename that
    // touches neither category nor descriptors must not trigger the descriptor
    // check (it can't worsen the invariant).
    const stuckRow = {
      ...baseRow,
      category: 'profundidad',
      level_0_descriptor: null,
      level_1_descriptor: null,
      level_2_descriptor: null,
      level_3_descriptor: null,
      level_4_descriptor: null,
    };
    const { client, getCaptured } = buildCaptureClient(stuckRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { name: 'Nuevo nombre' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(getCaptured()!.name).toBe('Nuevo nombre');
  });

  it('returns 400 (not 500) for a non-object JSON body', async () => {
    const { client } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: 'hello' as any,
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('rejects an out-of-range weight with 400 (not a 500 from the DB)', async () => {
    const { client } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { weight: 99 },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('rejects a non-object frequencyConfig with 400', async () => {
    const { client } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { frequencyConfig: 'garbage' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('rejects an explicitly-provided empty name', async () => {
    const { client } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { name: '   ' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it('trims descriptor text before persisting', async () => {
    const { client, getCaptured } = buildCaptureClient(baseRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { level0Descriptor: '  con espacios  ' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(getCaptured()!.level_0_descriptor).toBe('con espacios');
  });

  it('re-affirms category detalle without resending options (falls back to stored options)', async () => {
    const detalleRow = {
      ...baseRow,
      category: 'detalle',
      level_0_descriptor: null,
      detalle_options: ['ABP', 'Gamificación'],
    };
    const { client, getCaptured } = buildCaptureClient(detalleRow);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { category: 'detalle', name: 'Renombrado' },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(getCaptured()!.detalle_options).toEqual(['ABP', 'Gamificación']);
  });

  it('propagates explicit camelCase null (level0Descriptor: null) into updateData as null', async () => {
    // Effective-state validation reads the same mock row for the current-state
    // fetch as for the update chain. Give it a second non-empty descriptor so
    // nulling level_0 still leaves the profundidad row with a valid descriptor.
    const rowWithLevel1 = {
      id: IND_TEST,
      module_id: MODULE_A,
      category: 'profundidad',
      level_0_descriptor: 'lvl0',
      level_1_descriptor: 'algo',
      level_2_descriptor: null,
      level_3_descriptor: null,
      level_4_descriptor: null,
    };
    const { client, getCaptured } = buildCaptureClient(rowWithLevel1);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      // No category change → skips category-hygiene. Effective state keeps
      // level_1_descriptor='algo', so profundidad validation passes.
      body: { level0Descriptor: null },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const captured = getCaptured();
    expect(captured).toBeTruthy();
    expect(captured).toHaveProperty('level_0_descriptor');
    expect(captured!.level_0_descriptor).toBeNull();
  });

  it('rejects null of the only remaining profundidad descriptor (effective post-update is empty)', async () => {
    // Current profundidad row has only level_0_descriptor populated.
    // Body clears it → effective state has no non-empty descriptor → 400.
    const rowOnlyLevel0 = {
      id: IND_TEST,
      module_id: MODULE_A,
      category: 'profundidad',
      level_0_descriptor: 'lvl0',
      level_1_descriptor: null,
      level_2_descriptor: null,
      level_3_descriptor: null,
      level_4_descriptor: null,
    };
    const { client, getCaptured } = buildCaptureClient(rowOnlyLevel0);
    mockCreateApiSupabaseClient.mockResolvedValue(client);
    mockCreateServiceRoleClient.mockReturnValue(client);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { templateId: TEMPLATE_DRAFT_1, moduleId: MODULE_A, indicatorId: IND_TEST },
      body: { level0Descriptor: null },
    });
    await indicatorIdHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Los indicadores de profundidad requieren al menos un descriptor de nivel');
    expect(getCaptured()).toBeNull();
  });
});
