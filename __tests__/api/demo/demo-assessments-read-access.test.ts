// @vitest-environment node
/**
 * N1, part 1 — the demo keeps working exactly as today once the caller can no
 * longer read the instrument's tables: the existing check (demo access or
 * admin, caller's session) stays first; after it the content is read with the
 * service client. The caller's client below behaves as the second build's read
 * rules will: rows of the instrument tables are filtered out (an empty list,
 * or "no row" for .single()). Synthetic data only.
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

import demoTemplateHandler from '@/pages/api/demo/assessments/[templateId]';
import demoListHandler from '@/pages/api/demo/assessments/index';

const USER = 'persona-demo-sintetica';
const TEMPLATE = 'tpl-demo-1';
const INSTRUMENT_TABLES = ['assessment_templates', 'assessment_template_snapshots', 'assessment_year_expectations'];

type Answer = { data: unknown; error: unknown };

/** Chain that resolves to the answer; .single() turns a list into one row (or PGRST116), .maybeSingle() into a row or null. */
function query(rows: unknown, error: unknown = null) {
  let mode: 'list' | 'single' | 'maybe' = 'list';
  const chain: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: Answer) => void) => {
          if (error) return resolve({ data: null, error });
          const list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
          if (mode === 'single') return resolve(list.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116' } });
          if (mode === 'maybe') return resolve({ data: list[0] ?? null, error: null });
          return resolve({ data: list, error: null });
        };
      }
      if (prop === 'single') return () => ((mode = 'single'), chain);
      if (prop === 'maybeSingle') return () => ((mode = 'maybe'), chain);
      return () => chain;
    },
  });
  return chain;
}

function client(tables: Record<string, unknown>) {
  const reads: string[] = [];
  return {
    reads,
    from: vi.fn((table: string) => {
      reads.push(table);
      return query(tables[table] ?? []);
    }),
  };
}

const SNAPSHOT_DATA = {
  template: { name: 'Demo sintética', area: 'evaluacion', description: 'Solo para probar', scoring_config: { level_thresholds: {} } },
  objectives: [{ id: 'obj-1', name: 'Proceso', display_order: 1, weight: 1, modules: [
    { id: 'mod-1', name: 'Práctica', display_order: 1, weight: 1, objective_id: 'obj-1', indicators: [
      { id: 'ind-a', code: 'A', name: 'Indicador A', category: 'profundidad', display_order: 1, weight: 1, expectations_gt: { year_2_expected: 3 } },
      { id: 'ind-b', code: 'B', name: 'Indicador B', category: 'cobertura', display_order: 2, weight: 1, expectations_gt: { year_2_expected: null } },
    ] },
  ] }],
  modules: [{ id: 'mod-1', name: 'Práctica', display_order: 1, weight: 1, objective_id: 'obj-1', indicators: [
    { id: 'ind-a', code: 'A', name: 'Indicador A', category: 'profundidad', display_order: 1, weight: 1 },
    { id: 'ind-b', code: 'B', name: 'Indicador B', category: 'cobertura', display_order: 2, weight: 1 },
  ] }],
};
const SNAPSHOT_ROW = { id: 'snap-demo-1', template_id: TEMPLATE, version: '1.2.0', snapshot_data: SNAPSHOT_DATA, created_at: '2026-03-01' };
const EXPECTATION_ROWS = [
  { id: 'e-1', template_id: TEMPLATE, indicator_id: 'ind-a', generation_type: 'GT', year_2_expected: 3, tolerance: 1 },
  { id: 'e-2', template_id: TEMPLATE, indicator_id: 'ind-b', generation_type: 'GT', year_2_expected: null, tolerance: 1 },
];
const TEMPLATES = [
  { id: TEMPLATE, name: 'Demo sintética', area: 'evaluacion', version: '1.2.0', description: 'Solo para probar', created_at: '2026-03-01', status: 'published' },
  { id: 'tpl-demo-2', name: 'Otra demo', area: 'liderazgo', version: '2.0.0', description: null, created_at: '2026-04-01', status: 'published' },
];

/** The caller: own roles and own demo-access rows readable; instrument tables filtered out. */
function caller(opts: { admin?: boolean; access?: boolean }) {
  return client({
    user_roles: opts.admin ? [{ role_type: 'admin' }] : [{ role_type: 'docente' }],
    assessment_demo_access: opts.access ? [{ id: 'da-1', template_id: TEMPLATE, granted_at: '2026-05-01' }] : [],
    ...Object.fromEntries(INSTRUMENT_TABLES.map((t) => [t, []])),
  });
}

function service(templates: unknown[] = TEMPLATES) {
  return client({
    assessment_template_snapshots: [SNAPSHOT_ROW],
    assessment_year_expectations: EXPECTATION_ROWS,
    assessment_templates: templates,
  });
}

// The answer the demo gives today for this content, year 2, GT.
const DEMO_ANSWER = {
  success: true,
  template: { id: TEMPLATE, version: '1.2.0', name: 'Demo sintética', area: 'evaluacion', description: 'Solo para probar', scoringConfig: { level_thresholds: {} } },
  objectives: [{ id: 'obj-1', name: 'Proceso', displayOrder: 1, weight: 1, modules: [{
    id: 'mod-1', name: 'Práctica', displayOrder: 1, weight: 1, objectiveId: 'obj-1', indicators: [
      { id: 'ind-a', code: 'A', name: 'Indicador A', category: 'profundidad', detalle_options: null, displayOrder: 1, weight: 1, isActiveThisYear: true },
      { id: 'ind-b', code: 'B', name: 'Indicador B', category: 'cobertura', detalle_options: null, displayOrder: 2, weight: 1, isActiveThisYear: false },
    ],
  }] }],
  modules: [{ id: 'mod-1', name: 'Práctica', displayOrder: 1, weight: 1, objectiveId: 'obj-1', indicators: [
    { id: 'ind-a', code: 'A', name: 'Indicador A', category: 'profundidad', detalle_options: null, displayOrder: 1, weight: 1, isActiveThisYear: true },
    { id: 'ind-b', code: 'B', name: 'Indicador B', category: 'cobertura', detalle_options: null, displayOrder: 2, weight: 1, isActiveThisYear: false },
  ] }],
  expectations: EXPECTATION_ROWS,
};

async function getDemo() {
  const { req, res } = createMocks({ method: 'GET', query: { templateId: TEMPLATE, year: '2', generationType: 'GT' } });
  await demoTemplateHandler(req as any, res as any);
  return res;
}

async function getList() {
  const { req, res } = createMocks({ method: 'GET' });
  await demoListHandler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockGetApiUser.mockResolvedValue({ user: { id: USER }, error: null });
});

describe('GET /api/demo/assessments/[templateId] with the caller unable to read the instrument', () => {
  it('DEMO_ANSWER is the answer a person with demo access gets while the caller can read everything (today\'s rules)', async () => {
    const open = client({ ...{ user_roles: [{ role_type: 'docente' }], assessment_demo_access: [{ id: 'da-1' }] }, assessment_template_snapshots: [SNAPSHOT_ROW], assessment_year_expectations: EXPECTATION_ROWS });
    mockCreateApiSupabaseClient.mockResolvedValue(open);
    mockCreateServiceRoleClient.mockReturnValue(open);
    const res = await getDemo();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual(DEMO_ANSWER);
  });

  for (const who of [{ label: 'a person with demo access', admin: false, access: true }, { label: 'an admin', admin: true, access: false }]) {
    it(`${who.label} still gets the demo exactly as today (expected levels included)`, async () => {
      const c = caller(who);
      const svc = service();
      mockCreateApiSupabaseClient.mockResolvedValue(c);
      mockCreateServiceRoleClient.mockReturnValue(svc);
      const res = await getDemo();
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual(DEMO_ANSWER);
      expect(c.reads.filter((t) => INSTRUMENT_TABLES.includes(t))).toEqual([]);
      expect(svc.reads).toEqual(['assessment_template_snapshots', 'assessment_year_expectations']);
    });
  }

  it('a signed-in person without demo access is refused exactly as today; nothing is read with the service client', async () => {
    const c = caller({});
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(c);
    mockCreateServiceRoleClient.mockReturnValue(svc);
    const res = await getDemo();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes acceso demo a este template' });
    expect(svc.reads).toEqual([]);
    expect(c.reads.sort()).toEqual(['assessment_demo_access', 'user_roles']);
  });
});

describe('GET /api/demo/assessments with the caller unable to read the instruments', () => {
  it('a person with demo access still gets the list of their demos as today', async () => {
    const c = caller({ access: true });
    const svc = service([TEMPLATES[0]]);
    mockCreateApiSupabaseClient.mockResolvedValue(c);
    mockCreateServiceRoleClient.mockReturnValue(svc);
    const res = await getList();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ demos: [
      { templateId: TEMPLATE, name: 'Demo sintética', area: 'evaluacion', areaLabel: 'Evaluación', version: '1.2.0', description: 'Solo para probar', grantedAt: '2026-05-01' },
    ] });
    expect(c.reads.filter((t) => INSTRUMENT_TABLES.includes(t))).toEqual([]);
    expect(svc.reads).toEqual(['assessment_templates']);
  });

  it('an admin still gets every published template as today', async () => {
    const c = caller({ admin: true });
    mockCreateApiSupabaseClient.mockResolvedValue(c);
    mockCreateServiceRoleClient.mockReturnValue(service());
    const res = await getList();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().demos.map((d: any) => [d.templateId, d.name, d.version, d.description, d.grantedAt])).toEqual([
      [TEMPLATE, 'Demo sintética', '1.2.0', 'Solo para probar', '2026-03-01'],
      ['tpl-demo-2', 'Otra demo', '2.0.0', '', '2026-04-01'],
    ]);
    expect(c.reads.filter((t) => INSTRUMENT_TABLES.includes(t))).toEqual([]);
  });

  it('a signed-in person without demo access gets an empty list, as today; nothing is read with the service client', async () => {
    const c = caller({});
    const svc = service();
    mockCreateApiSupabaseClient.mockResolvedValue(c);
    mockCreateServiceRoleClient.mockReturnValue(svc);
    const res = await getList();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ demos: [] });
    expect(svc.reads).toEqual([]);
  });
});
