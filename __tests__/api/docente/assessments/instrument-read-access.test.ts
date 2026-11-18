// @vitest-environment node
/**
 * N1, part 1 — the teacher's list and form no longer depend on the teacher's
 * own right to read the stored version (assessment_template_snapshots) or the
 * expected levels (assessment_year_expectations), and send no expected level
 * before the registro is sent. The caller's client below REFUSES both tables
 * (as the second build's read rules will): an embedded stored version comes
 * back null, a direct read is a permission error. Synthetic data only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateApiSupabaseClient, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg || 'Autenticación requerida' })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Método no permitido' })),
}));

import listHandler from '@/pages/api/docente/assessments/index';
import formHandler from '@/pages/api/docente/assessments/[instanceId]/index';

const USER = 'docente-sintetico-1';
const INSTANCE = 'inst-sintetica-1';
const SNAPSHOT = 'snap-sintetico-1';
const TEMPLATE = 'tpl-sintetico-1';
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

function client(routes: Record<string, Answer>) {
  const reads: string[] = [];
  return {
    reads,
    from: vi.fn((table: string) => {
      reads.push(table);
      return query(routes[table] ?? { data: null, error: null });
    }),
  };
}

// The stored content as publishTemplate builds it: expected levels under
// expectations_gt / expectations_gi / expectations on every indicator.
const EXP_GT = { year_1_expected: 31, year_1_expected_unit: null, year_2_expected: 37, year_2_expected_unit: 'semana', year_3_expected: null, year_3_expected_unit: null, year_4_expected: 41, year_4_expected_unit: null, year_5_expected: 43, year_5_expected_unit: null, tolerance: 1 };
const EXP_GI = { ...EXP_GT, year_2_expected: 47 };
const indicator = (id: string, category: string, order: number) => ({
  id, code: id.toUpperCase(), name: `Indicador ${id}`, category, display_order: order, weight: 1,
  frequency_config: null, frequency_unit_options: null, sub_questions: [],
  expectations_gt: EXP_GT, expectations_gi: EXP_GI, expectations: EXP_GT,
});
const MODULE = {
  id: 'mod-1', name: 'Práctica sintética', display_order: 1, weight: 1, objective_id: 'obj-1',
  indicators: [indicator('ind-a', 'profundidad', 1), indicator('ind-b', 'profundidad', 2), indicator('ind-c', 'profundidad', 3)],
};
const SNAPSHOT_DATA = {
  template: { id: TEMPLATE, name: 'Instrumento sintético', area: 'evaluacion', requires_dual_expectations: true, scoring_config: {} },
  objectives: [{ id: 'obj-1', name: 'Proceso sintético', display_order: 1, weight: 1, modules: [MODULE] }],
  modules: [MODULE],
};
const SNAPSHOT_ROW = { id: SNAPSHOT, template_id: TEMPLATE, version: '1.0.0', snapshot_data: SNAPSHOT_DATA, created_at: '2026-01-01' };
// Year 2, GT: ind-a has an expected level, ind-b has a row with null, ind-c has no row.
const YEAR_ROWS = [
  { indicator_id: 'ind-a', year_2_expected: 37 },
  { indicator_id: 'ind-b', year_2_expected: null },
];

function instanceRow(status: string) {
  return {
    id: INSTANCE, template_snapshot_id: SNAPSHOT, school_id: 1, course_structure_id: null,
    transformation_year: 2, generation_type: 'GT', status, context_responses: null,
    assigned_at: '2026-01-01', started_at: null, completed_at: status === 'completed' ? '2026-02-01' : null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    assessment_template_snapshots: null, // refused embed
    school_course_structure: null,
  };
}

function refusingCaller(status: string, assignee: unknown = { id: 'as-1', can_edit: true, can_submit: true, has_started: false, has_submitted: false }) {
  return client({
    assessment_instance_assignees: { data: assignee, error: assignee ? null : { code: 'PGRST116' } },
    assessment_instances: { data: instanceRow(status), error: null },
    assessment_responses: { data: [{ indicator_id: 'ind-a', profundity_level: 2 }], error: null },
    assessment_template_snapshots: { data: null, error: REFUSED },
    assessment_year_expectations: { data: null, error: REFUSED },
  });
}

function service(yearRows: unknown[] = YEAR_ROWS) {
  return client({
    assessment_template_snapshots: { data: SNAPSHOT_ROW, error: null },
    assessment_year_expectations: { data: yearRows, error: null },
  });
}

/** No trace of an expected level anywhere in a JSON answer. */
function expectNoExpectedLevel(body: unknown) {
  const json = JSON.stringify(body);
  for (const key of ['"expectations"', '"expectations_gt"', '"expectations_gi"', '"tolerance"', 'year_1_expected', 'year_2_expected', 'year_3_expected', 'year_4_expected', 'year_5_expected']) {
    expect(json).not.toContain(key);
  }
  for (const value of [31, 37, 41, 43, 47]) expect(json).not.toMatch(new RegExp(`[:\\[,]${value}[,\\]}]`));
}

async function getForm() {
  const { req, res } = createMocks({ method: 'GET', query: { instanceId: INSTANCE } });
  await formHandler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetApiUser.mockResolvedValue({ user: { id: USER }, error: null });
});

describe('GET /api/docente/assessments/[instanceId] with the caller refused the stored version and the expected levels', () => {
  for (const status of ['pending', 'in_progress', 'archived']) {
    it(`${status}: the form answers as today for an assignee, with no expected level anywhere`, async () => {
      const caller = refusingCaller(status);
      const svc = service();
      mockCreateApiSupabaseClient.mockResolvedValue(caller);
      mockCreateServiceRoleClient.mockReturnValue(svc);

      const res = await getForm();
      expect(res._getStatusCode()).toBe(200);
      const body = res._getJSONData();
      expect(body.template).toMatchObject({ id: TEMPLATE, version: '1.0.0', name: 'Instrumento sintético', area: 'evaluacion' });
      expect(body.objectives).toHaveLength(1);
      expect(body.modules).toHaveLength(1);
      expect(body.modules[0].indicators.map((i: any) => i.id)).toEqual(['ind-a', 'ind-b', 'ind-c']);
      // (c) isActiveThisYear as today: expected level → true; null or no row → false.
      expect(body.modules[0].indicators.map((i: any) => i.isActiveThisYear)).toEqual([true, false, false]);
      expect(body.objectives[0].modules[0].indicators.map((i: any) => i.isActiveThisYear)).toEqual([true, false, false]);
      expect(body.progress).toEqual({ total: 1, answered: 1, percentage: 100 });
      // (b) nothing from which an expected level can be worked out.
      expectNoExpectedLevel(body);
      // The caller's client never touched the two protected tables; the service client did, after the gate.
      expect(caller.reads.filter((t) => PROTECTED.includes(t))).toEqual([]);
      expect(svc.reads).toEqual(['assessment_template_snapshots', 'assessment_year_expectations']);
      expect(caller.reads[0]).toBe('assessment_instance_assignees');
    });
  }

  it('(b) even while the caller can still read both tables (today\'s rules), a not-sent registro carries no expected level', async () => {
    const open = client({
      assessment_instance_assignees: { data: { id: 'as-1', can_edit: true, can_submit: true }, error: null },
      assessment_instances: { data: { ...instanceRow('in_progress'), assessment_template_snapshots: SNAPSHOT_ROW }, error: null },
      assessment_responses: { data: [], error: null },
      assessment_template_snapshots: { data: SNAPSHOT_ROW, error: null },
      assessment_year_expectations: { data: YEAR_ROWS, error: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(open);
    mockCreateServiceRoleClient.mockReturnValue(service());
    const res = await getForm();
    expect(res._getStatusCode()).toBe(200);
    expectNoExpectedLevel(res._getJSONData());
  });

  it('legacy instrument (no expected-level rows): every indicator active, as today', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(refusingCaller('in_progress'));
    mockCreateServiceRoleClient.mockReturnValue(service([]));
    const body = (await getForm())._getJSONData();
    expect(body.modules[0].indicators.map((i: any) => i.isActiveThisYear)).toEqual([true, true, true]);
    expect(body.progress.total).toBe(3);
    expectNoExpectedLevel(body);
  });

  it('completed: the answer keeps the expectations field it sends today', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(refusingCaller('completed'));
    mockCreateServiceRoleClient.mockReturnValue(service());
    const body = (await getForm())._getJSONData();
    expect(body.instance.status).toBe('completed');
    expect(body.modules[0].indicators[0].expectations).toEqual(EXP_GT);
  });

  it('(d) a caller who is not an assignee gets the same 403 as today, and nothing is read with the service client', async () => {
    const caller = refusingCaller('in_progress', null);
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(svc);
    const res = await getForm();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes permiso para acceder a este registro' });
    expect(svc.reads).toEqual([]);
    expect(caller.reads).toEqual(['assessment_instance_assignees']);
  });
});

describe('GET /api/docente/assessments with the caller refused the stored versions', () => {
  function listCaller(rows: unknown[]) {
    return client({ assessment_instance_assignees: { data: rows, error: null }, ...Object.fromEntries(PROTECTED.map((t) => [t, { data: null, error: REFUSED }])) });
  }
  const assigneeRow = (status: string, id: string, snapshotId: string) => ({
    id: `as-${id}`, instance_id: id, can_edit: true, can_submit: true, has_started: status !== 'pending', has_submitted: status === 'completed', assigned_at: '2026-01-0' + (id.length % 9 + 1),
    assessment_instances: { ...instanceRow(status), id, template_snapshot_id: snapshotId },
  });

  it('the list answers as today for an assignee (names, versions, states, order) with no expected level anywhere', async () => {
    const caller = listCaller([assigneeRow('completed', 'inst-3', SNAPSHOT), assigneeRow('pending', 'inst-1', SNAPSHOT), assigneeRow('in_progress', 'inst-22', 'snap-2')]);
    const svc = client({
      assessment_template_snapshots: { data: [SNAPSHOT_ROW, { ...SNAPSHOT_ROW, id: 'snap-2', template_id: 'tpl-2', version: '2.0.0', snapshot_data: { ...SNAPSHOT_DATA, template: { name: 'Otro sintético', area: 'liderazgo' } } }], error: null },
    });
    mockCreateApiSupabaseClient.mockResolvedValue(caller);
    mockCreateServiceRoleClient.mockReturnValue(svc);

    const { req, res } = createMocks({ method: 'GET' });
    await listHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.total).toBe(3);
    expect(body.assessments.map((a: any) => [a.id, a.status, a.templateId, a.templateName, a.templateArea, a.templateVersion])).toEqual([
      ['inst-1', 'pending', TEMPLATE, 'Instrumento sintético', 'evaluacion', '1.0.0'],
      ['inst-22', 'in_progress', 'tpl-2', 'Otro sintético', 'liderazgo', '2.0.0'],
      ['inst-3', 'completed', TEMPLATE, 'Instrumento sintético', 'evaluacion', '1.0.0'],
    ]);
    expectNoExpectedLevel(body);
    expect(caller.reads).toEqual(['assessment_instance_assignees']);
    expect(svc.reads).toEqual(['assessment_template_snapshots']);
  });

  it('a person with no registro gets an empty list, as today', async () => {
    mockCreateApiSupabaseClient.mockResolvedValue(listCaller([]));
    mockCreateServiceRoleClient.mockReturnValue(client({}));
    const { req, res } = createMocks({ method: 'GET' });
    await listHandler(req as any, res as any);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true, assessments: [], total: 0 });
  });
});
