// @vitest-environment node
/**
 * Unit B1 — GET /api/sessions/capabilities (FNE Zoom internal test plan §4.4).
 *
 * The `schools` fixture is UNFILTERED: five rows of every tenant kind plus one malformed
 * row. The mock applies the route's own `.eq()` filters and `.select()` projection, and
 * every test asserts the captured query arguments, so a passing test proves the route
 * asked for exactly the requested school with exactly the three authoritative columns —
 * not that a convenient fixture happened to come back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

const { mockCheckIsAdmin, mockCreateServiceRoleClient, spyCheckProvisionGate, spyCheckSessionEligibility } =
  vi.hoisted(() => ({
    mockCheckIsAdmin: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    spyCheckProvisionGate: vi.fn(),
    spyCheckSessionEligibility: vi.fn(),
  }));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    checkIsAdmin: mockCheckIsAdmin,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../lib/zoom/jobs/meeting-provision', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = actual.checkSessionEligibility as (session: unknown) => unknown;
  return { ...actual, checkSessionEligibility: spyCheckSessionEligibility.mockImplementation(real) };
});

vi.mock('../../../lib/zoom/provisioning-intent', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const real = actual.checkProvisionGate as (...args: unknown[]) => unknown;
  return { ...actual, checkProvisionGate: spyCheckProvisionGate.mockImplementation(real) };
});

import handler from '../../../pages/api/sessions/capabilities';

/** Synthetic tenants. No row is special-cased by id anywhere in the route. */
const SCHOOLS: Array<Record<string, unknown>> = [
  { id: 19, name: 'Operador', tenant_kind: 'operator', internal_zoom_testing_enabled: true },
  { id: 20, name: 'Operador apagado', tenant_kind: 'operator', internal_zoom_testing_enabled: false },
  { id: 1, name: 'Cliente', tenant_kind: 'client', internal_zoom_testing_enabled: false },
  { id: 257, name: 'QA', tenant_kind: 'qa', internal_zoom_testing_enabled: true },
  { id: 300, name: 'Roto', tenant_kind: 'partner', internal_zoom_testing_enabled: true },
];

type Captured = { from: string[]; select: string[]; eq: Array<[string, unknown]> };
let captured: Captured;
let schoolsError: { message: string } | null;

/** One chain per `.from()` call: filters are scoped to that query, captures accumulate. */
function tableQuery(table: string) {
  const filters: Array<[string, unknown]> = [];
  let selected = '*';
  const chain: any = {};
  chain.select = vi.fn((cols: string) => {
    selected = cols;
    captured.select.push(cols);
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    filters.push([col, val]);
    captured.eq.push([col, val]);
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => {
    if (table !== 'schools') return { data: null, error: null };
    if (schoolsError) return { data: null, error: schoolsError };
    const rows = SCHOOLS.filter((row) => filters.every(([col, val]) => row[col] === val));
    if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } };
    if (rows.length === 0) return { data: null, error: null };
    const projected: Record<string, unknown> = {};
    for (const col of selected.split(',').map((c) => c.trim())) projected[col] = rows[0][col];
    return { data: projected, error: null };
  });
  return chain;
}

function mockClient() {
  return {
    from: vi.fn((name: string) => {
      captured.from.push(name);
      return tableQuery(name);
    }),
  };
}

function get(query: Record<string, unknown> | undefined, method = 'GET') {
  return createMocks({ method: method as any, query: (query ?? {}) as any });
}

async function call(query: Record<string, unknown> | undefined, method = 'GET') {
  const { req, res } = get(query, method);
  await handler(req as any, res as any);
  return { res, status: res._getStatusCode(), body: JSON.parse(res._getData() || 'null') };
}

function expectExactSchoolQuery(schoolId: number) {
  expect(captured.from).toEqual(['schools']);
  expect(captured.select).toEqual(['id, tenant_kind, internal_zoom_testing_enabled']);
  expect(captured.eq).toEqual([['id', schoolId]]);
}

beforeEach(() => {
  vi.clearAllMocks();
  captured = { from: [], select: [], eq: [] };
  schoolsError = null;
  mockCheckIsAdmin.mockResolvedValue({ isAdmin: true, user: { id: ADMIN_ID }, error: null });
  mockCreateServiceRoleClient.mockImplementation(() => mockClient());
  vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'true');
  vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/sessions/capabilities — gate order', () => {
  it('unsupported method → 405 with Allow: GET, before auth', async () => {
    const { res, status } = await call({ school_id: '19' }, 'POST');
    expect(status).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET');
    expect(mockCheckIsAdmin).not.toHaveBeenCalled();
  });

  it('unauthenticated → 401 and no school read', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: null, error: null });
    const { status } = await call({ school_id: '19' });
    expect(status).toBe(401);
    expect(captured.from).toEqual([]);
  });

  it('non-admin → 403 and no school read', async () => {
    mockCheckIsAdmin.mockResolvedValue({ isAdmin: false, user: { id: ADMIN_ID }, error: null });
    const { status } = await call({ school_id: '19' });
    expect(status).toBe(403);
    expect(captured.from).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['repeated', { school_id: ['19', '20'] }],
    ['fractional', { school_id: '19.5' }],
    ['nonnumeric', { school_id: 'diecinueve' }],
    ['zero', { school_id: '0' }],
    ['negative', { school_id: '-19' }],
    ['signed', { school_id: '+19' }],
    ['blank', { school_id: ' ' }],
  ])('%s school_id → 400 and no school read', async (_name, query) => {
    const { status, body } = await call(query as Record<string, unknown>);
    expect(status).toBe(400);
    expect(body.error).toBe('school_id debe ser un entero positivo');
    expect(captured.from).toEqual([]);
  });
});

describe('GET /api/sessions/capabilities — fail closed on the school row', () => {
  it('missing school → 404', async () => {
    const { status } = await call({ school_id: '4040' });
    expect(status).toBe(404);
    expectExactSchoolQuery(4040);
  });

  it('database error → 500', async () => {
    schoolsError = { message: 'connection reset' };
    const { status, body } = await call({ school_id: '19' });
    expect(status).toBe(500);
    expect(body.error).toBe('Error al verificar el colegio');
    expect(body).not.toHaveProperty('managed_zoom_allowed');
    expectExactSchoolQuery(19);
  });

  it('unrecognised tenant kind → 500, no capability granted', async () => {
    const { status, body } = await call({ school_id: '300' });
    expect(status).toBe(500);
    expect(body).not.toHaveProperty('data');
    expectExactSchoolQuery(300);
  });
});

describe('GET /api/sessions/capabilities — semantics', () => {
  it('enabled operator + rollout pass → both capabilities true, no reasons', async () => {
    const { status, body } = await call({ school_id: '19' });
    expect(status).toBe(200);
    expect(body.data).toEqual({
      school_id: 19,
      managed_zoom_allowed: true,
      operator_test_creation_allowed: true,
      reasons: [],
    });
    expectExactSchoolQuery(19);
  });

  it('disabled operator → managed true, operator false, operator_testing_disabled', async () => {
    const { body } = await call({ school_id: '20' });
    expect(body.data).toEqual({
      school_id: 20,
      managed_zoom_allowed: true,
      operator_test_creation_allowed: false,
      reasons: ['operator_testing_disabled'],
    });
    expectExactSchoolQuery(20);
  });

  it('client → operator false with tenant_not_operator; managed Zoom untouched', async () => {
    const { body } = await call({ school_id: '1' });
    expect(body.data).toEqual({
      school_id: 1,
      managed_zoom_allowed: true,
      operator_test_creation_allowed: false,
      reasons: ['tenant_not_operator'],
    });
    expectExactSchoolQuery(1);
  });

  it('QA → operator false even with the enablement flag set on its row', async () => {
    const { body } = await call({ school_id: '257' });
    expect(body.data).toEqual({
      school_id: 257,
      managed_zoom_allowed: false,
      operator_test_creation_allowed: false,
      reasons: ['qa_provider_suppressed', 'tenant_not_operator'],
    });
    expectExactSchoolQuery(257);
  });

  it('master flag off → both false with feature_disabled, for an enabled operator', async () => {
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    const { body } = await call({ school_id: '19' });
    expect(body.data).toEqual({
      school_id: 19,
      managed_zoom_allowed: false,
      operator_test_creation_allowed: false,
      reasons: ['feature_disabled'],
    });
  });

  it('school outside the allowlist → both false with school_not_allowlisted', async () => {
    vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '12');
    const { body } = await call({ school_id: '19' });
    expect(body.data).toEqual({
      school_id: 19,
      managed_zoom_allowed: false,
      operator_test_creation_allowed: false,
      reasons: ['school_not_allowlisted'],
    });
  });

  it('school inside the allowlist passes; a client there still gets no operator capability', async () => {
    vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '1, 19');
    expect((await call({ school_id: '19' })).body.data.operator_test_creation_allowed).toBe(true);
    const client = (await call({ school_id: '1' })).body.data;
    expect(client.managed_zoom_allowed).toBe(true);
    expect(client.operator_test_creation_allowed).toBe(false);
  });

  it('rollout refusal and tenant refusal are reported together, consistently', async () => {
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    const { body } = await call({ school_id: '20' });
    expect(body.data.managed_zoom_allowed).toBe(false);
    expect(body.data.operator_test_creation_allowed).toBe(false);
    expect(body.data.reasons).toEqual(['feature_disabled', 'operator_testing_disabled']);
  });

  it('exposes no configuration, allowlist, tenant or user data beyond the contract', async () => {
    vi.stubEnv('ZOOM_SCHOOL_ALLOWLIST', '12');
    const { body } = await call({ school_id: '19' });
    expect(Object.keys(body.data).sort()).toEqual(
      ['managed_zoom_allowed', 'operator_test_creation_allowed', 'reasons', 'school_id'].sort()
    );
    expect(JSON.stringify(body)).not.toMatch(/\b12\b|ZOOM_SCHOOL|FEATURE_|tenant_kind|Operador/);
  });

  it('never calls the full provision gate or session eligibility — a draft is not programada', async () => {
    await call({ school_id: '19' });
    await call({ school_id: '1' });
    vi.stubEnv('FEATURE_ZOOM_MEETINGS', 'false');
    await call({ school_id: '19' });
    expect(spyCheckProvisionGate).not.toHaveBeenCalled();
    expect(spyCheckSessionEligibility).not.toHaveBeenCalled();
  });
});
