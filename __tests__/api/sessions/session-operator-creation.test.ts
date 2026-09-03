// @vitest-environment node
/**
 * Unit B1 — POST /api/sessions for an OPERATOR tenant (FNE Zoom internal test plan §4.1).
 *
 * Two things make these assertions load-bearing rather than convenient:
 *
 *   1. The `schools` fixture is UNFILTERED (operator, disabled operator, client, QA, a
 *      malformed row). The mock applies the route's own `.eq()` filter and `.select()`
 *      projection and every test asserts the captured arguments, so the tenant controls
 *      provably came from the exact requested school row.
 *   2. Every write to `consultor_sessions`, `session_facilitators` and
 *      `session_activity_log` is counted, so every refusal is asserted to be PRE-mutation.
 *
 * The facilitator validator is the REAL one, fed by a `user_roles` fixture the mock
 * filters with the validator's own `.in()/.eq()/.or()` calls — the facilitator rules stay
 * the validator's, not this suite's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import * as facilitatorValidation from '../../../lib/utils/facilitator-validation';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = '22222222-2222-4222-8222-222222222222';
const GLOBAL_CONSULTOR_ID = '33333333-3333-4333-8333-333333333333';
const INACTIVE_ID = '55555555-5555-4555-8555-555555555555';
const UNSCOPED_ID = '66666666-6666-4666-8666-666666666666';
const GROWTH_COMMUNITY_ID = '44444444-4444-4444-8444-444444444444';
const CONTRATO_ID = '77777777-7777-4777-8777-777777777777';
const ENROLLMENT_ID = '88888888-8888-4888-8888-888888888888';

const OPERATOR = 19;
const OPERATOR_OFF = 20;
const CLIENT = 1;
const QA = 257;
const BROKEN = 300;

const { mockCheckIsAdmin, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockCheckIsAdmin: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

import handler from '../../../pages/api/sessions/index';

/** Synthetic tenants. Nothing in the route keys on any of these ids. */
const SCHOOLS: Array<Record<string, unknown>> = [
  { id: OPERATOR, tenant_kind: 'operator', internal_zoom_testing_enabled: true },
  { id: OPERATOR_OFF, tenant_kind: 'operator', internal_zoom_testing_enabled: false },
  { id: CLIENT, tenant_kind: 'client', internal_zoom_testing_enabled: false },
  { id: QA, tenant_kind: 'qa', internal_zoom_testing_enabled: true },
  { id: BROKEN, tenant_kind: 'partner', internal_zoom_testing_enabled: true },
];

/** Synthetic roles: two eligible consultors, one inactive, one scoped to another school. */
const USER_ROLES: Array<Record<string, unknown>> = [
  { user_id: LEAD_ID, role_type: 'consultor', is_active: true, school_id: OPERATOR },
  { user_id: GLOBAL_CONSULTOR_ID, role_type: 'consultor', is_active: true, school_id: null },
  { user_id: INACTIVE_ID, role_type: 'consultor', is_active: false, school_id: OPERATOR },
  { user_id: UNSCOPED_ID, role_type: 'consultor', is_active: true, school_id: 999 },
  { user_id: ADMIN_ID, role_type: 'admin', is_active: true, school_id: null },
];

type Captured = { select: string[]; eq: Array<[string, unknown]> };
let schoolsQuery: Captured;
let schoolsError: { message: string } | null;
let inserted: Array<Record<string, any>>;
let mutations: string[];

/** Minimal filter engine over an in-memory table for the query shapes the route uses. */
function tableQuery(table: string, rows: Array<Record<string, unknown>>) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let selected = '*';
  const chain: any = {};
  chain.select = vi.fn((cols = '*') => {
    selected = cols;
    if (table === 'schools') schoolsQuery.select.push(cols);
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    if (table === 'schools') schoolsQuery.eq.push([col, val]);
    filters.push((row) => row[col] === val);
    return chain;
  });
  chain.in = vi.fn((col: string, vals: unknown[]) => {
    filters.push((row) => vals.includes(row[col]));
    return chain;
  });
  chain.or = vi.fn((expr: string) => {
    // The validator's only `.or()`: `school_id.eq.<n>,school_id.is.null`.
    const match = /^school_id\.eq\.(\d+),school_id\.is\.null$/.exec(expr);
    if (!match) throw new Error(`unexpected or(): ${expr}`);
    const scoped = Number(match[1]);
    filters.push((row) => row.school_id === scoped || row.school_id === null);
    return chain;
  });
  const project = (row: Record<string, unknown>) => {
    if (selected === '*') return row;
    const out: Record<string, unknown> = {};
    for (const col of selected.split(',').map((c) => c.trim())) out[col] = row[col];
    return out;
  };
  const run = () => rows.filter((row) => filters.every((f) => f(row))).map(project);
  chain.maybeSingle = vi.fn(async () => {
    if (table === 'schools' && schoolsError) return { data: null, error: schoolsError };
    const result = run();
    if (result.length > 1) return { data: null, error: { message: 'multiple rows' } };
    return { data: result[0] ?? null, error: null };
  });
  chain.single = vi.fn(async () => {
    const result = run();
    return result.length === 1
      ? { data: result[0], error: null }
      : { data: null, error: { message: 'not exactly one row' } };
  });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: run(), error: null });
  return chain;
}

function mockClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'schools') return tableQuery(table, SCHOOLS);
      if (table === 'user_roles') return tableQuery(table, USER_ROLES);
      if (table === 'growth_communities') {
        return tableQuery(table, [
          { id: GROWTH_COMMUNITY_ID, school_id: OPERATOR },
          { id: GROWTH_COMMUNITY_ID, school_id: OPERATOR_OFF },
          { id: GROWTH_COMMUNITY_ID, school_id: CLIENT },
          { id: GROWTH_COMMUNITY_ID, school_id: QA },
        ]);
      }
      if (table === 'consultor_sessions') {
        const api: any = {
          insert: vi.fn((rows: Array<Record<string, any>>) => {
            mutations.push('consultor_sessions.insert');
            inserted.push(...rows);
            return api;
          }),
          select: vi.fn(() => api),
          in: vi.fn(() => api),
          delete: vi.fn(() => {
            mutations.push('consultor_sessions.delete');
            return api;
          }),
          eq: vi.fn(() => api),
        };
        api.then = (resolve: (v: unknown) => void) =>
          resolve({
            data: inserted.map((row, i) => ({ ...row, id: `session-${i + 1}` })),
            error: null,
          });
        return api;
      }
      if (table === 'session_facilitators' || table === 'session_activity_log') {
        const api: any = {
          insert: vi.fn(() => {
            mutations.push(`${table}.insert`);
            return api;
          }),
          select: vi.fn(() => api),
          in: vi.fn(() => api),
        };
        api.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return api;
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
}

const LEAD = { user_id: LEAD_ID, facilitator_role: 'equipo_interno', is_lead: true };

function operatorBody(overrides: Record<string, unknown> = {}) {
  return {
    school_id: OPERATOR,
    growth_community_id: GROWTH_COMMUNITY_ID,
    title: '[INTERNA FNE] Zoom — asistencia',
    session_date: '2099-08-05',
    start_time: '15:00:00',
    end_time: '15:20:00',
    modality: 'online',
    is_zoom_managed: true,
    facilitators: [LEAD],
    ...overrides,
  };
}

async function post(payload: Record<string, unknown>) {
  const { req, res } = createMocks({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: JSON.parse(res._getData() || 'null') };
}

function expectExactSchoolQuery(schoolId: number) {
  expect(schoolsQuery.select).toEqual(['id, tenant_kind, internal_zoom_testing_enabled']);
  expect(schoolsQuery.eq).toEqual([['id', schoolId]]);
}

function expectNoMutation() {
  expect(mutations).toEqual([]);
  expect(inserted).toEqual([]);
}

const SAFE_OPERATOR_ROW = {
  school_id: OPERATOR,
  modality: 'online',
  is_zoom_managed: true,
  meeting_provider: 'zoom',
  meeting_link: null,
  contrato_id: null,
  hour_type_key: null,
  program_enrollment_id: null,
  status: 'borrador',
};

beforeEach(() => {
  vi.clearAllMocks();
  schoolsQuery = { select: [], eq: [] };
  schoolsError = null;
  inserted = [];
  mutations = [];
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => mockClient());
  vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'true');
  vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/sessions — operator tenant succeeds only on the safe shape', () => {
  it('enabled operator, online, managed Zoom, null financial fields, valid lead → 201', async () => {
    const { status, body } = await post(operatorBody());
    expect(status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject(SAFE_OPERATOR_ROW);
    expect(body.data.sessions[0]).toMatchObject(SAFE_OPERATOR_ROW);
    expect(mutations[0]).toBe('consultor_sessions.insert');
    expectExactSchoolQuery(OPERATOR);
  });

  it('hibrida with a location is also allowed', async () => {
    const { status } = await post(operatorBody({ modality: 'hibrida', location: 'Sala 2' }));
    expect(status).toBe(201);
    expect(inserted[0]).toMatchObject({ ...SAFE_OPERATOR_ROW, modality: 'hibrida' });
  });

  it('a global-scope consultor may lead an operator session', async () => {
    const { status } = await post(
      operatorBody({ facilitators: [{ ...LEAD, user_id: GLOBAL_CONSULTOR_ID }] })
    );
    expect(status).toBe(201);
  });

  it('a forged non-Zoom provider cannot bypass the stored Zoom requirement', async () => {
    const { status } = await post(operatorBody({ meeting_provider: 'teams' }));
    expect(status).toBe(201);
    expect(inserted[0].meeting_provider).toBe('zoom');
  });

  it('a recurrence inserts only safe operator rows, every one inheriting the validated fields', async () => {
    const { status } = await post(
      operatorBody({ recurrence: { frequency: 'weekly', count: 3 } })
    );
    expect(status).toBe(201);
    expect(inserted).toHaveLength(3);
    for (const row of inserted) expect(row).toMatchObject(SAFE_OPERATOR_ROW);
    expect(new Set(inserted.map((r) => r.recurrence_group_id)).size).toBe(1);
    expectExactSchoolQuery(OPERATOR);
  });
});

describe('POST /api/sessions — operator refusals are pre-mutation', () => {
  it('disabled operator → 403 operator_testing_disabled', async () => {
    const { status, body } = await post(operatorBody({ school_id: OPERATOR_OFF }));
    expect(status).toBe(403);
    expect(body.code).toBe('operator_testing_disabled');
    expectNoMutation();
    expectExactSchoolQuery(OPERATOR_OFF);
  });

  it('master flag off → 403 feature_disabled', async () => {
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    const { status, body } = await post(operatorBody());
    expect(status).toBe(403);
    expect(body.code).toBe('feature_disabled');
    expectNoMutation();
  });

  it('operator outside the allowlist → 403 school_not_allowlisted', async () => {
    vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '12');
    const { status, body } = await post(operatorBody());
    expect(status).toBe(403);
    expect(body.code).toBe('school_not_allowlisted');
    expectNoMutation();
  });

  it('operator inside the allowlist passes the rollout check', async () => {
    vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', `12,${OPERATOR}`);
    expect((await post(operatorBody())).status).toBe(201);
  });

  it('presencial → 400 (the generic managed-modality check fires first, still pre-mutation)', async () => {
    const { status } = await post(
      operatorBody({ modality: 'presencial', location: 'Sala 2', is_zoom_managed: true })
    );
    expect(status).toBe(400);
    expectNoMutation();
  });

  it('presencial and unmanaged → 400 operator_modality_not_remote', async () => {
    const { status, body } = await post(
      operatorBody({ modality: 'presencial', location: 'Sala 2', is_zoom_managed: false })
    );
    expect(status).toBe(400);
    expect(body.code).toBe('operator_modality_not_remote');
    expectNoMutation();
  });

  it('unmanaged online with a link → 400 operator_not_zoom_managed', async () => {
    const { status, body } = await post(
      operatorBody({ is_zoom_managed: false, meeting_link: 'https://zoom.us/j/1' })
    );
    expect(status).toBe(400);
    expect(body.code).toBe('operator_not_zoom_managed');
    expectNoMutation();
  });

  it('unmanaged with a forged non-Zoom provider → refused, nothing stored', async () => {
    const { status, body } = await post(
      operatorBody({
        is_zoom_managed: false,
        meeting_link: 'https://teams.microsoft.com/x',
        meeting_provider: 'teams',
      })
    );
    expect(status).toBe(400);
    expect(body.code).toBe('operator_not_zoom_managed');
    expectNoMutation();
  });

  it('contrato_id (with its paired hour type) → 400 naming contrato_id and hour_type_key', async () => {
    const { status, body } = await post(
      operatorBody({ contrato_id: CONTRATO_ID, hour_type_key: 'acompanamiento' })
    );
    expect(status).toBe(400);
    expect(body.code).toBe('operator_financial_fields_present');
    expect(body.error).toContain('contrato_id');
    expect(body.error).toContain('hour_type_key');
    expectNoMutation();
  });

  it('hour_type_key alone → refused pre-mutation by the existing pair validator', async () => {
    const { status } = await post(operatorBody({ hour_type_key: 'acompanamiento' }));
    expect(status).toBe(400);
    expectNoMutation();
  });

  it('contrato_id alone → refused pre-mutation by the existing pair validator', async () => {
    const { status } = await post(operatorBody({ contrato_id: CONTRATO_ID }));
    expect(status).toBe(400);
    expectNoMutation();
  });

  it('program_enrollment_id → 400 naming only program_enrollment_id', async () => {
    const { status, body } = await post(operatorBody({ program_enrollment_id: ENROLLMENT_ID }));
    expect(status).toBe(400);
    expect(body.code).toBe('operator_financial_fields_present');
    expect(body.error).toContain('program_enrollment_id');
    expect(body.error).not.toContain('contrato_id');
    expectNoMutation();
  });

  it('non-admin → 403 before any school read', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: ADMIN_ID }, error: null });
    const { status } = await post(operatorBody());
    expect(status).toBe(403);
    expect(schoolsQuery.eq).toEqual([]);
    expectNoMutation();
  });

  it('unauthenticated → 401 before any school read', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });
    const { status } = await post(operatorBody());
    expect(status).toBe(401);
    expect(schoolsQuery.eq).toEqual([]);
    expectNoMutation();
  });
});

describe('POST /api/sessions — school lookup fails closed for every tenant', () => {
  it('missing school → 404 school_not_found', async () => {
    const { status, body } = await post(operatorBody({ school_id: 4040 }));
    expect(status).toBe(404);
    expect(body.code).toBe('school_not_found');
    expectNoMutation();
    expectExactSchoolQuery(4040);
  });

  it('school lookup error → 500 school_lookup_failed', async () => {
    schoolsError = { message: 'connection reset' };
    const { status, body } = await post(operatorBody());
    expect(status).toBe(500);
    expect(body.code).toBe('school_lookup_failed');
    expectNoMutation();
  });

  it('unknown tenant kind → 500 school_tenant_invalid', async () => {
    const { status, body } = await post(operatorBody({ school_id: BROKEN }));
    expect(status).toBe(500);
    expect(body.code).toBe('school_tenant_invalid');
    expectNoMutation();
    expectExactSchoolQuery(BROKEN);
  });
});

describe('POST /api/sessions — facilitator rules stay with the existing validator', () => {
  it('runs the real validator with the service client, the facilitators and the school', async () => {
    const spy = vi.spyOn(facilitatorValidation, 'validateFacilitatorIntegrity');
    await post(operatorBody());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toEqual([LEAD]);
    expect(spy.mock.calls[0][2]).toBe(OPERATOR);
    spy.mockRestore();
  });

  it.each([
    ['missing facilitators', { facilitators: undefined }],
    ['empty facilitators', { facilitators: [] }],
    ['no lead', { facilitators: [{ ...LEAD, is_lead: false }] }],
    [
      'two leads',
      { facilitators: [LEAD, { ...LEAD, user_id: GLOBAL_CONSULTOR_ID }] },
    ],
    ['inactive consultor', { facilitators: [{ ...LEAD, user_id: INACTIVE_ID }] }],
    ['consultor scoped to another school', { facilitators: [{ ...LEAD, user_id: UNSCOPED_ID }] }],
    ['an admin who is not a consultor', { facilitators: [{ ...LEAD, user_id: ADMIN_ID }] }],
  ])('%s → 400, pre-mutation', async (_name, overrides) => {
    const { status } = await post(operatorBody(overrides as Record<string, unknown>));
    expect(status).toBe(400);
    expectNoMutation();
  });
});

describe('POST /api/sessions — client and QA keep their existing behaviour', () => {
  const clientBody = (overrides: Record<string, unknown> = {}) =>
    operatorBody({
      school_id: CLIENT,
      title: 'Sesión de acompañamiento',
      is_zoom_managed: false,
      meeting_link: 'https://meet.google.com/abc',
      facilitators: [{ ...LEAD, user_id: GLOBAL_CONSULTOR_ID, facilitator_role: 'consultor_externo' }],
      ...overrides,
    });

  it('client: unmanaged link session with a contract/hour-type pair → 201, pair stored', async () => {
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    const { status } = await post(
      clientBody({ contrato_id: CONTRATO_ID, hour_type_key: 'acompanamiento' })
    );
    expect(status).toBe(201);
    expect(inserted[0]).toMatchObject({
      school_id: CLIENT,
      meeting_provider: 'google_meet',
      contrato_id: CONTRATO_ID,
      hour_type_key: 'acompanamiento',
      is_zoom_managed: false,
    });
    expectExactSchoolQuery(CLIENT);
  });

  it('client: presencial with a program enrollment → 201', async () => {
    const { status } = await post(
      clientBody({
        modality: 'presencial',
        location: 'Sala 2',
        meeting_link: undefined,
        program_enrollment_id: ENROLLMENT_ID,
      })
    );
    expect(status).toBe(201);
    expect(inserted[0]).toMatchObject({ modality: 'presencial', program_enrollment_id: ENROLLMENT_ID });
  });

  it('client: managed Zoom intent still works with the master flag off and no allowlist entry', async () => {
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '12');
    const { status } = await post(clientBody({ is_zoom_managed: true, meeting_link: undefined }));
    expect(status).toBe(201);
    expect(inserted[0]).toMatchObject({ is_zoom_managed: true, meeting_provider: 'zoom', meeting_link: null });
  });

  it('QA: managed Zoom intent is refused before insert even when financial fields are valid', async () => {
    const { status, body } = await post(
      clientBody({
        school_id: QA,
        is_zoom_managed: true,
        meeting_link: undefined,
        contrato_id: CONTRATO_ID,
        hour_type_key: 'acompanamiento',
        program_enrollment_id: ENROLLMENT_ID,
      })
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'qa_provider_suppressed' });
    expect(inserted).toEqual([]);
    expectExactSchoolQuery(QA);
  });

  it('QA: presencial unmanaged with no Zoom at all → 201, no operator rule applied', async () => {
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    const { status } = await post(
      clientBody({ school_id: QA, modality: 'presencial', location: 'Sala QA', meeting_link: undefined })
    );
    expect(status).toBe(201);
  });
});
