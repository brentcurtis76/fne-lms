// @vitest-environment node
/**
 * N1, part 1 — saving answers and sending a registro no longer depend on the
 * teacher's own right to read the stored version or the expected levels; a
 * failed read of the expected levels refuses the send (it no longer makes
 * every indicator required); scoring still receives the teacher's own client.
 * The caller's client below REFUSES both tables, as the second build's read
 * rules will. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockCreateServiceRoleClient, mockCalculateAndSaveScores } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockCalculateAndSaveScores: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Autenticación requerida' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Método no permitido' })),
}));

vi.mock('@/lib/services/assessment-builder/scoringService', () => ({
  calculateAndSaveScores: mockCalculateAndSaveScores,
}));

import responsesHandler from '@/pages/api/docente/assessments/[instanceId]/responses';
import submitHandler from '@/pages/api/docente/assessments/[instanceId]/submit';

const USER = 'docente-sintetico-2';
const INSTANCE = 'inst-sintetica-2';
const SNAPSHOT = 'snap-sintetico-2';
const TEMPLATE = 'tpl-sintetico-2';
const REFUSED = { code: '42501', message: 'permission denied for table' };
const PROTECTED = ['assessment_template_snapshots', 'assessment_year_expectations'];

type Answer = { data: unknown; error: unknown };

function query(answer: Answer) {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(answer);
      return vi.fn(() => new Proxy({}, handler));
    },
  };
  return new Proxy({}, handler);
}

function client(routes: Record<string, Answer | Answer[]>) {
  const reads: string[] = [];
  const count: Record<string, number> = {};
  return {
    reads,
    from: vi.fn((table: string) => {
      reads.push(table);
      count[table] = (count[table] ?? 0) + 1;
      const route = routes[table];
      const answer = Array.isArray(route) ? (route[count[table] - 1] ?? { data: null, error: null }) : route;
      return query(answer ?? { data: null, error: null });
    }),
  };
}

const SNAPSHOT_DATA = {
  template: { name: 'Instrumento sintético', area: 'evaluacion' },
  modules: [
    {
      id: 'mod-1',
      indicators: [
        { id: 'ind-cob', name: 'Cobertura sintética', category: 'cobertura', display_order: 1, expectations_gt: { year_1_expected: 1 } },
        { id: 'ind-prof', name: 'Profundidad sintética', category: 'profundidad', display_order: 2, expectations_gt: { year_1_expected: 2 } },
        { id: 'ind-prof-off', name: 'Profundidad inactiva', category: 'profundidad', display_order: 3, expectations_gt: { year_1_expected: null } },
      ],
    },
  ],
};
const SNAPSHOT_ROW = { id: SNAPSHOT, template_id: TEMPLATE, version: '1.0.0', snapshot_data: SNAPSHOT_DATA, created_at: '2026-01-01' };
const YEAR_ROWS = [
  { indicator_id: 'ind-cob', year_1_expected: 1 },
  { indicator_id: 'ind-prof', year_1_expected: 2 },
  { indicator_id: 'ind-prof-off', year_1_expected: null },
];
const INSTANCE_ROW = {
  id: INSTANCE, status: 'in_progress', transformation_year: 1, generation_type: 'GT', template_snapshot_id: SNAPSHOT,
  assessment_template_snapshots: null, // refused embed
};
const ASSIGNEE = { id: 'as-2', user_id: USER, can_edit: true, can_submit: true, has_submitted: false };
const ALL_ANSWERED = [
  { indicator_id: 'ind-cob', coverage_value: true, frequency_value: null, profundity_level: null, sub_responses: null },
  { indicator_id: 'ind-prof', coverage_value: null, frequency_value: null, profundity_level: 3, sub_responses: null },
];

function refusingCaller(opts: { assignee?: unknown; responses?: unknown[]; instance?: unknown } = {}) {
  const assignee = 'assignee' in opts ? opts.assignee : ASSIGNEE;
  return client({
    assessment_instance_assignees: { data: assignee, error: assignee ? null : { code: 'PGRST116' } },
    assessment_instances: [{ data: opts.instance ?? INSTANCE_ROW, error: null }, { data: null, error: null }],
    assessment_responses: { data: opts.responses ?? ALL_ANSWERED, error: null },
    assessment_template_snapshots: { data: null, error: REFUSED },
    assessment_year_expectations: { data: null, error: REFUSED },
  });
}

function service(expectations: Answer = { data: YEAR_ROWS, error: null }) {
  return client({
    assessment_template_snapshots: { data: SNAPSHOT_ROW, error: null },
    assessment_year_expectations: expectations,
  });
}

async function send() {
  const { req, res } = createMocks({ method: 'POST', query: { instanceId: INSTANCE } });
  await submitHandler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetApiUser.mockResolvedValue({ user: { id: USER }, error: null });
  mockCalculateAndSaveScores.mockResolvedValue({ success: true, summary: { totalScore: 70, overallLevel: 2, expectedLevel: 1 } });
});

describe('PUT /api/docente/assessments/[instanceId]/responses with the caller refused the stored version', () => {
  it('(a) saving answers still works for an assignee; the stored version is read with the service client after the gate', async () => {
    const caller = refusingCaller({ responses: [{ id: 'r-1' }] });
    // The upsert's answer comes back on the same table.
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(svc);

    const { req, res } = createMocks({
      method: 'PUT',
      query: { instanceId: INSTANCE },
      body: { responses: [{ indicator_id: 'ind-prof', profundity_level: 3 }, { indicator_id: 'ind-desconocido', profundity_level: 1 }] },
    });
    await responsesHandler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, saved: 1, errors: ['Indicador ind-desconocido no existe en este registro'] });
    expect(caller.reads.filter((t) => PROTECTED.includes(t))).toEqual([]);
    expect(svc.reads).toEqual(['assessment_template_snapshots']);
  });

  it('a caller who is not an assignee gets the same 403 as today; nothing is read with the service client', async () => {
    const caller = refusingCaller({ assignee: null });
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(svc);
    const { req, res } = createMocks({ method: 'PUT', query: { instanceId: INSTANCE }, body: { responses: [{ indicator_id: 'ind-prof', profundity_level: 3 }] } });
    await responsesHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes permiso para completar este registro' });
    expect(svc.reads).toEqual([]);
  });

  it('a stored version that cannot be read is the same 500 as today', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(refusingCaller());
    mockCreateServiceRoleClient.mockReturnValue(client({ assessment_template_snapshots: { data: null, error: { message: 'synthetic failure' } } }));
    const { req, res } = createMocks({ method: 'PUT', query: { instanceId: INSTANCE }, body: { responses: [{ indicator_id: 'ind-prof', profundity_level: 3 }] } });
    await responsesHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'Error al obtener plantilla' });
  });
});

describe('POST /api/docente/assessments/[instanceId]/submit with the caller refused the stored version and the expected levels', () => {
  it('(a)+(d) sending still works; status becomes completed; scoring receives the teacher\'s own client, as today', async () => {
    const caller = refusingCaller();
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(svc);

    const res = await send();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ success: true, message: 'Registro enviado correctamente', scoring: { totalScore: 70, overallLevel: 2, meetsExpectations: true } });
    // select + update on the instance, both with the caller's client.
    expect(caller.reads.filter((t) => t === 'assessment_instances')).toHaveLength(2);
    expect(caller.reads.filter((t) => PROTECTED.includes(t))).toEqual([]);
    expect(svc.reads).toEqual(['assessment_template_snapshots', 'assessment_year_expectations']);
    expect(mockCalculateAndSaveScores).toHaveBeenCalledTimes(1);
    expect(mockCalculateAndSaveScores).toHaveBeenCalledWith(caller, INSTANCE, USER);
    expect(mockCalculateAndSaveScores.mock.calls[0][0]).not.toBe(svc);
  });

  it('(b) a failed read of the expected levels is a 500 with the message; the status is not changed and scoring is not called', async () => {
    const caller = refusingCaller();
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(service({ data: null, error: { message: 'synthetic service failure' } }));

    const res = await send();
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: 'No se pudo verificar los indicadores del registro. Inténtalo de nuevo.' });
    expect(caller.reads.filter((t) => t === 'assessment_instances')).toHaveLength(1); // the select only, no update
    expect(mockCalculateAndSaveScores).not.toHaveBeenCalled();
  });

  it('(c) only indicators with an expected level this year are required, as today: the inactive one is not', async () => {
    // ind-prof-off has no answer and is inactive → not required; all active are answered.
    mockCreateApiSupabaseClient.mockResolvedValue(refusingCaller());
    mockCreateServiceRoleClient.mockReturnValue(service());
    expect((await send())._getStatusCode()).toBe(200);
  });

  it('(c) an active indicator without an answer is still refused, as today', async () => {
    const caller = refusingCaller({ responses: [ALL_ANSWERED[0]] });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(service());
    const res = await send();
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Faltan respuestas para algunos indicadores', missingIndicators: ['Profundidad sintética'], missingCount: 1 });
    expect(caller.reads.filter((t) => t === 'assessment_instances')).toHaveLength(1);
    expect(mockCalculateAndSaveScores).not.toHaveBeenCalled();
  });

  it('(c) legacy instrument (no expected-level rows): every cobertura/frecuencia/profundidad indicator is required, as today', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(refusingCaller());
    mockCreateServiceRoleClient.mockReturnValue(service({ data: [], error: null }));
    const res = await send();
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toMatchObject({ missingIndicators: ['Profundidad inactiva'], missingCount: 1 });
  });

  it('a caller who is not an assignee gets the same 403 as today; nothing is read with the service client', async () => {
    const caller = refusingCaller({ assignee: null });
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(svc);
    const res = await send();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes permiso para enviar este registro' });
    expect(svc.reads).toEqual([]);
    expect(caller.reads).toEqual(['assessment_instance_assignees']);
  });
});
