// @vitest-environment node
/**
 * Tests for POST /api/docente/assessments/[instanceId]/submit
 *
 * T9: Submit with responses only for active indicators returns 200
 * T10: Submit with missing response for an active indicator returns 400
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// ============================================================
// Synthetic test data (no real student data)
// ============================================================
const DOCENTE_UUID = 'doc00001-0000-0000-0000-000000000001';
const INSTANCE_ID = 'inst0001-0000-0000-0000-000000000001';
const TEMPLATE_ID = 'tmpl0001-0000-0000-0000-000000000001';
const IND_COB = 'ind00001-0000-0000-0000-000000000001'; // cobertura — active year 1
const IND_FREC = 'ind00002-0000-0000-0000-000000000002'; // frecuencia — active year 1
const IND_TRAS = 'ind00003-0000-0000-0000-000000000003'; // traspaso — inactive year 1
const IND_DET = 'ind00004-0000-0000-0000-000000000004'; // detalle

// ============================================================
// Mocks
// ============================================================
const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
  mockCalculateAndSaveScores,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCalculateAndSaveScores: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  sendAuthError: vi.fn((res: any, msg?: string) => {
    res.status(401).json({ error: msg || 'Autenticación requerida' });
  }),
  handleMethodNotAllowed: vi.fn((res: any) => {
    res.status(405).json({ error: 'Método no permitido' });
  }),
}));

vi.mock('@/lib/services/assessment-builder/scoringService', () => ({
  calculateAndSaveScores: mockCalculateAndSaveScores,
}));

import submitHandler from '@/pages/api/docente/assessments/[instanceId]/submit';

// ============================================================
// Snapshot and data helpers
// ============================================================
const SNAPSHOT_DATA = {
  modules: [
    {
      id: 'mod-1',
      indicators: [
        { id: IND_COB, name: 'Indicador cobertura', category: 'cobertura' },
        { id: IND_FREC, name: 'Indicador frecuencia', category: 'frecuencia' },
        { id: IND_TRAS, name: 'Indicador traspaso', category: 'traspaso' },
      ],
    },
  ],
};

const INSTANCE_DATA = {
  id: INSTANCE_ID,
  status: 'in_progress',
  transformation_year: 1,
  generation_type: 'GT',
  template_snapshot_id: 'snap-1',
  assessment_template_snapshots: {
    template_id: TEMPLATE_ID,
    snapshot_data: SNAPSHOT_DATA,
  },
};

const ASSIGNEE_DATA = {
  id: 'asgn-1',
  can_submit: true,
  has_submitted: false,
  user_id: DOCENTE_UUID,
};

// Year expectations: IND_COB and IND_FREC active, IND_TRAS inactive (null)
const YEAR_EXP_ACTIVE = [
  { indicator_id: IND_COB, year_1_expected: 1 },
  { indicator_id: IND_FREC, year_1_expected: 3 },
  { indicator_id: IND_TRAS, year_1_expected: null }, // inactive
];

/**
 * Build a chainable Supabase query proxy that resolves with given data/error.
 * Uses the same Proxy pattern as the shared _helpers.ts.
 */
function buildChainableQuery(data: unknown = null, error: unknown = null) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve({ data, error });
      }
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

/**
 * Build a mock Supabase client for submit tests.
 *
 * The submit handler calls `from()` in this order:
 * 1. assessment_instance_assignees (SELECT + later UPDATE)
 * 2. assessment_instances (SELECT)
 * 3. assessment_responses (SELECT)
 * 4. assessment_year_expectations (SELECT)
 * 5. assessment_instances (UPDATE)
 * 6. assessment_instance_assignees (UPDATE has_submitted)
 */
function buildSubmitClient(options: {
  responsesData?: unknown[];
  yearExpData?: unknown[];
  assigneeData?: unknown;
  instanceData?: unknown;
}) {
  const responses = options.responsesData ?? [];
  const yearExp = options.yearExpData ?? YEAR_EXP_ACTIVE;
  const assignee = options.assigneeData ?? ASSIGNEE_DATA;
  const instance = options.instanceData ?? INSTANCE_DATA;

  const tableCallCount: Record<string, number> = {};

  return {
    from: vi.fn((table: string) => {
      tableCallCount[table] = (tableCallCount[table] || 0) + 1;
      const callN = tableCallCount[table];

      if (table === 'assessment_instance_assignees') {
        if (callN === 1) {
          // First call: SELECT
          return buildChainableQuery(assignee, null);
        }
        // Second call: UPDATE has_submitted
        return buildChainableQuery(null, null);
      }

      if (table === 'assessment_instances') {
        if (callN === 1) {
          // First call: SELECT instance
          return buildChainableQuery(instance, null);
        }
        // Second call: UPDATE status
        return buildChainableQuery(null, null);
      }

      if (table === 'assessment_responses') {
        return buildChainableQuery(responses, null);
      }

      if (table === 'assessment_year_expectations') {
        return buildChainableQuery(yearExp, null);
      }

      return buildChainableQuery(null, null);
    }),
  };
}

// ============================================================
// Tests
// ============================================================

describe('POST /api/docente/assessments/[instanceId]/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: DOCENTE_UUID }, error: null });
    mockCalculateAndSaveScores.mockResolvedValue({
      success: true,
      summary: { totalScore: 80, overallLevel: 3, expectedLevel: 1 },
    });
  });

  it('T9: Submit with responses only for active indicators returns 200', async () => {
    // Active: IND_COB and IND_FREC. IND_TRAS is inactive (year_1_expected = null).
    // We provide responses for IND_COB and IND_FREC only — IND_TRAS has no response.
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null },
          { indicator_id: IND_FREC, coverage_value: null, frequency_value: 5, profundity_level: null },
          // IND_TRAS deliberately missing — it is inactive and should not be required
        ],
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { instanceId: INSTANCE_ID },
    });

    await submitHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
  });

  it('T10: Submit with missing response for an active indicator returns 400', async () => {
    // Active: IND_COB and IND_FREC. We provide IND_COB only — IND_FREC is missing.
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null },
          // IND_FREC is active but has NO response → should return 400
        ],
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { instanceId: INSTANCE_ID },
    });

    await submitHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    const data = JSON.parse(res._getData());
    expect(data.missingCount).toBeGreaterThan(0);
    expect(data.error).toContain('Faltan respuestas');
  });

  it('Auth check: rejects unauthenticated requests with 401', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'not authenticated' });

    const { req, res } = createMocks({
      method: 'POST',
      query: { instanceId: INSTANCE_ID },
    });

    await submitHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(401);
  });

  it('Method check: rejects GET requests with 405', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { instanceId: INSTANCE_ID },
    });

    await submitHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
  });

  it('T-detalle: Active detalle with non-empty selected_options submits successfully', async () => {
    const snapshotWithDetalle = {
      modules: [
        {
          id: 'mod-1',
          indicators: [
            { id: IND_COB, name: 'Indicador cobertura', category: 'cobertura' },
            { id: IND_DET, name: 'Indicador detalle', category: 'detalle' },
          ],
        },
      ],
    };
    const instanceWithDetalle = {
      ...INSTANCE_DATA,
      assessment_template_snapshots: {
        template_id: TEMPLATE_ID,
        snapshot_data: snapshotWithDetalle,
      },
    };
    const yearExpWithDetalle = [
      { indicator_id: IND_COB, year_1_expected: 1 },
      { indicator_id: IND_DET, year_1_expected: 1 }, // active
    ];

    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        instanceData: instanceWithDetalle,
        yearExpData: yearExpWithDetalle,
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null, sub_responses: null },
          { indicator_id: IND_DET, coverage_value: null, frequency_value: null, profundity_level: null, sub_responses: { selected_options: ['ABP', 'Tutoría'] } },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'POST', query: { instanceId: INSTANCE_ID } });
    await submitHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('T-traspaso: Active traspaso with evidence submits successfully', async () => {
    const snapshotWithTraspaso = {
      modules: [
        {
          id: 'mod-1',
          indicators: [
            { id: IND_COB, name: 'Indicador cobertura', category: 'cobertura' },
            { id: IND_TRAS, name: 'Indicador traspaso', category: 'traspaso' },
          ],
        },
      ],
    };
    const instanceWithTraspaso = {
      ...INSTANCE_DATA,
      assessment_template_snapshots: {
        template_id: TEMPLATE_ID,
        snapshot_data: snapshotWithTraspaso,
      },
    };
    const yearExpWithTraspaso = [
      { indicator_id: IND_COB, year_1_expected: 1 },
      { indicator_id: IND_TRAS, year_1_expected: 1 }, // active
    ];

    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        instanceData: instanceWithTraspaso,
        yearExpData: yearExpWithTraspaso,
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null, sub_responses: null },
          { indicator_id: IND_TRAS, coverage_value: null, frequency_value: null, profundity_level: null, sub_responses: { evidence_link: 'https://doc.com', improvement_suggestions: '' } },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'POST', query: { instanceId: INSTANCE_ID } });
    await submitHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
  });

  it('T-detalle-missing: Active detalle without selected_options returns 400', async () => {
    const snapshotWithDetalle = {
      modules: [
        {
          id: 'mod-1',
          indicators: [
            { id: IND_COB, name: 'Indicador cobertura', category: 'cobertura' },
            { id: IND_DET, name: 'Indicador detalle', category: 'detalle' },
          ],
        },
      ],
    };
    const instanceWithDetalle = {
      ...INSTANCE_DATA,
      assessment_template_snapshots: {
        template_id: TEMPLATE_ID,
        snapshot_data: snapshotWithDetalle,
      },
    };
    const yearExpWithDetalle = [
      { indicator_id: IND_COB, year_1_expected: 1 },
      { indicator_id: IND_DET, year_1_expected: 1 }, // active
    ];

    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        instanceData: instanceWithDetalle,
        yearExpData: yearExpWithDetalle,
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null, sub_responses: null },
          { indicator_id: IND_DET, coverage_value: null, frequency_value: null, profundity_level: null, sub_responses: { selected_options: [] } },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'POST', query: { instanceId: INSTANCE_ID } });
    await submitHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).missingCount).toBeGreaterThan(0);
  });

  it('T-generation-type: Rejects invalid generation_type with 400', async () => {
    const instanceBadGen = {
      ...INSTANCE_DATA,
      generation_type: 'INVALID',
    };

    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        instanceData: instanceBadGen,
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null, sub_responses: null },
          { indicator_id: IND_FREC, coverage_value: null, frequency_value: 5, profundity_level: null, sub_responses: null },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'POST', query: { instanceId: INSTANCE_ID } });
    await submitHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain('Tipo de generación inválido');
  });

  it('T-generation-type-null: Rejects null generation_type with 400', async () => {
    const instanceNoGen = {
      ...INSTANCE_DATA,
      generation_type: null,
    };

    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        instanceData: instanceNoGen,
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null, sub_responses: null },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'POST', query: { instanceId: INSTANCE_ID } });
    await submitHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain('no definido');
  });

  it('T-legacy: No year expectations data — validates all scorable indicators', async () => {
    // When no expectations data exists (legacy instance), validate all cobertura/frecuencia/profundidad
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildSubmitClient({
        yearExpData: [], // Empty → legacy mode (activeIndicatorIds remains null)
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true, frequency_value: null, profundity_level: null },
          { indicator_id: IND_FREC, coverage_value: null, frequency_value: 5, profundity_level: null },
          // IND_TRAS is traspaso — not checked because no hasValue logic for traspaso in submit
        ],
      })
    );

    const { req, res } = createMocks({
      method: 'POST',
      query: { instanceId: INSTANCE_ID },
    });

    await submitHandler(req as any, res as any);

    // Should pass since all cobertura/frecuencia indicators have responses
    expect(res._getStatusCode()).toBe(200);
  });
});
