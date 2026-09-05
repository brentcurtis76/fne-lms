// @vitest-environment node
/**
 * B-01: GET /api/docente/assessments/[instanceId] progress must filter by
 * year-active status BEFORE applying the cobertura gate, and must never
 * count year-inactive or gated-out indicators in the denominator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const INSTANCE_ID = 'inst-progress-01';
const TEMPLATE_ID = 'tmpl-progress-01';
const IND_COB = 'ind-cob';
const IND_FREC = 'ind-frec';
const IND_INACTIVE = 'ind-inactive';

const {
  mockGetApiUser,
  mockCreateApiSupabaseClient,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
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

import getHandler from '@/pages/api/docente/assessments/[instanceId]/index';

const SNAPSHOT_DATA = {
  template: { name: 'Test', area: 'evaluacion' },
  modules: [
    {
      id: 'mod-1',
      display_order: 1,
      weight: 1,
      indicators: [
        { id: IND_COB, name: 'Cobertura', category: 'cobertura', display_order: 1, weight: 1 },
        { id: IND_FREC, name: 'Frecuencia', category: 'frecuencia', display_order: 2, weight: 1 },
        { id: IND_INACTIVE, name: 'Inactiva', category: 'profundidad', display_order: 0, weight: 1 },
      ],
    },
  ],
};

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

function buildGetClient(options: {
  responsesData?: unknown[];
  yearExpData?: unknown[];
}) {
  const responses = options.responsesData ?? [];
  const yearExp = options.yearExpData;

  return {
    from: vi.fn((table: string) => {
      if (table === 'assessment_instance_assignees') {
        return buildChainableQuery({
          can_edit: true,
          can_submit: true,
          has_started: false,
          has_submitted: false,
        });
      }
      if (table === 'assessment_instances') {
        return buildChainableQuery({
          id: INSTANCE_ID,
          template_snapshot_id: 'snap-1',
          transformation_year: 1,
          generation_type: 'GT',
          status: 'in_progress',
          assessment_template_snapshots: {
            id: 'snap-1',
            template_id: TEMPLATE_ID,
            version: '1',
            snapshot_data: SNAPSHOT_DATA,
            created_at: '2026-01-01',
          },
          school_course_structure: null,
        });
      }
      if (table === 'assessment_year_expectations') {
        return buildChainableQuery(yearExp ?? []);
      }
      if (table === 'assessment_responses') {
        return buildChainableQuery(responses);
      }
      return buildChainableQuery(null);
    }),
  };
}

describe('GET /api/docente/assessments/[instanceId] — progress (B-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiUser.mockResolvedValue({ user: { id: 'docente-01' }, error: null });
  });

  it('year-active filtering runs before the gate: an inactive nominal-first indicator never becomes the gate, and never counts', async () => {
    // IND_INACTIVE has display_order 0 (would sort first) but no active expectation
    // for year 1 — it must be excluded before gate/order resolution.
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildGetClient({
        yearExpData: [
          { indicator_id: IND_COB, year_1_expected: 1 },
          { indicator_id: IND_FREC, year_1_expected: 3 },
          { indicator_id: IND_INACTIVE, year_1_expected: null },
        ],
        responsesData: [
          { indicator_id: IND_COB, coverage_value: false },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'GET', query: { instanceId: INSTANCE_ID } });
    await getHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // Only IND_COB is active+applicable (gate closed via coverage_value=false),
    // IND_FREC is gated out, IND_INACTIVE was never active at all.
    expect(data.progress.total).toBe(1);
    expect(data.progress.answered).toBe(1);
  });

  it('cobertura gate open (Sí): active downstream indicator counts toward total', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildGetClient({
        yearExpData: [
          { indicator_id: IND_COB, year_1_expected: 1 },
          { indicator_id: IND_FREC, year_1_expected: 3 },
        ],
        responsesData: [
          { indicator_id: IND_COB, coverage_value: true },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'GET', query: { instanceId: INSTANCE_ID } });
    await getHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.progress.total).toBe(2);
    expect(data.progress.answered).toBe(1); // only cobertura answered
  });

  it('legacy (no expectations data): a non-cobertura-first ordering has no gate — every default-active indicator counts', async () => {
    // display_order 0 for IND_INACTIVE puts it first once every indicator is
    // treated as active (legacy mode) — its category (profundidad) means no
    // gate applies at all, so nothing is excluded from the denominator.
    mockCreateApiSupabaseClient.mockResolvedValue(
      buildGetClient({
        yearExpData: [],
        responsesData: [
          { indicator_id: IND_COB, coverage_value: false },
        ],
      })
    );

    const { req, res } = createMocks({ method: 'GET', query: { instanceId: INSTANCE_ID } });
    await getHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.progress.total).toBe(3);
    expect(data.progress.answered).toBe(1);
  });

  it('legacy (no expectations data), cobertura genuinely first: gate still resolves and restricts the denominator', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'assessment_instance_assignees') {
          return buildChainableQuery({ can_edit: true, can_submit: true, has_started: false, has_submitted: false });
        }
        if (table === 'assessment_instances') {
          return buildChainableQuery({
            id: INSTANCE_ID,
            template_snapshot_id: 'snap-1',
            transformation_year: 1,
            generation_type: 'GT',
            status: 'in_progress',
            assessment_template_snapshots: {
              id: 'snap-1',
              template_id: TEMPLATE_ID,
              version: '1',
              snapshot_data: {
                template: { name: 'Test', area: 'evaluacion' },
                modules: [
                  {
                    id: 'mod-1',
                    display_order: 1,
                    weight: 1,
                    indicators: [
                      { id: IND_COB, name: 'Cobertura', category: 'cobertura', display_order: 1, weight: 1 },
                      { id: IND_FREC, name: 'Frecuencia', category: 'frecuencia', display_order: 2, weight: 1 },
                    ],
                  },
                ],
              },
              created_at: '2026-01-01',
            },
            school_course_structure: null,
          });
        }
        if (table === 'assessment_year_expectations') return buildChainableQuery([]);
        if (table === 'assessment_responses') {
          return buildChainableQuery([{ indicator_id: IND_COB, coverage_value: false }]);
        }
        return buildChainableQuery(null);
      }),
    });

    const { req, res } = createMocks({ method: 'GET', query: { instanceId: INSTANCE_ID } });
    await getHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.progress.total).toBe(1);
    expect(data.progress.answered).toBe(1);
  });
});
