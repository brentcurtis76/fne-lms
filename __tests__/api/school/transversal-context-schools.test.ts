// @vitest-environment node
/**
 * GET /api/school/transversal-context/schools
 *
 * School picker policy: a caller with an ACTIVE admin or consultor role lists
 * every registered school, independent of consultant_assignments; everyone
 * else 403. Response shape stays { schools: [{ id, name }] } for the two page
 * consumers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { mockGetApiUser, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  getApiUser: mockGetApiUser,
  createServiceRoleClient: mockCreateServiceRoleClient,
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Método no permitido' })),
}));

import handler from '@/pages/api/school/transversal-context/schools';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const READ_METHODS = ['select', 'eq', 'in', 'order'];

type Call = { method: string; args: unknown[] };
type Row = Record<string, unknown>;

// Mimics a PostgREST read: filters, then order, then the select() projection.
function resolveRows(rows: Row[], calls: Call[]) {
  let out = [...rows];
  for (const c of calls) {
    if (c.method === 'eq') out = out.filter(r => r[c.args[0] as string] === c.args[1]);
    if (c.method === 'in') out = out.filter(r => (c.args[1] as unknown[]).includes(r[c.args[0] as string]));
  }
  const order = calls.find(c => c.method === 'order');
  if (order) {
    const col = order.args[0] as string;
    const dir = (order.args[1] as { ascending?: boolean } | undefined)?.ascending === false ? -1 : 1;
    out.sort((a, b) => String(a[col]).localeCompare(String(b[col]), 'en') * dir);
  }
  const select = calls.find(c => c.method === 'select');
  const columns = String(select?.args[0] ?? '*').split(',').map(col => col.trim());
  if (columns.includes('*')) return out;
  return out.map(r => Object.fromEntries(columns.map(col => [col, r[col]])));
}

function table(rows: Row[], opts: { error?: unknown; nullData?: boolean } = {}) {
  const chains: Call[][] = [];
  const open = () => {
    const calls: Call[] = [];
    chains.push(calls);
    const h: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') {
          const outcome = opts.error
            ? { data: null, error: opts.error }
            : { data: opts.nullData ? null : resolveRows(rows, calls), error: null };
          return (resolve: (v: unknown) => void) => resolve(outcome);
        }
        return (...args: unknown[]) => { calls.push({ method: String(prop), args }); return new Proxy({}, h); };
      },
    };
    return new Proxy({}, h) as any;
  };
  return { open, chains };
}

// Deliberately unsorted and wider than the picker contract (id, name).
const SCHOOL_ROWS: Row[] = [
  { id: 3, name: 'Escuela Gamma', region: 'Sintética Norte', created_at: '2026-01-03T00:00:00Z' },
  { id: 1, name: 'Escuela Alfa', region: 'Sintética Sur', created_at: '2026-01-01T00:00:00Z' },
  { id: 4, name: 'Escuela Delta', region: 'Sintética Centro', created_at: '2026-01-04T00:00:00Z' },
  { id: 2, name: 'Escuela Beta', region: 'Sintética Sur', created_at: '2026-01-02T00:00:00Z' },
];

const ALL_SCHOOLS = [
  { id: 1, name: 'Escuela Alfa' },
  { id: 2, name: 'Escuela Beta' },
  { id: 4, name: 'Escuela Delta' },
  { id: 3, name: 'Escuela Gamma' },
];

type ArrangeOpts = {
  roles?: string[];
  roleRows?: Row[];
  rolesError?: unknown;
  rolesNull?: boolean;
  assignments?: Row[];
  assignmentsError?: unknown;
  schools?: Row[];
  schoolsError?: unknown;
  schoolsNull?: boolean;
};

function arrange(opts: ArrangeOpts) {
  const roleRows = opts.roleRows ?? (opts.roles ?? []).map(role_type => ({ user_id: USER_ID, role_type, is_active: true }));
  const tables = {
    user_roles: table(roleRows, { error: opts.rolesError, nullData: opts.rolesNull }),
    consultant_assignments: table(opts.assignments ?? [], { error: opts.assignmentsError }),
    schools: table(opts.schools ?? SCHOOL_ROWS, { error: opts.schoolsError, nullData: opts.schoolsNull }),
  };
  const service = { from: vi.fn((t: string) => (tables as any)[t].open()), rpc: vi.fn(), tables };
  mockCreateServiceRoleClient.mockReturnValue(service);
  return service;
}

type Service = ReturnType<typeof arrange>;

async function get() {
  const { req, res } = createMocks({ method: 'GET' });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

function expectCallerRoleRead(service: Service) {
  expect(service.tables.user_roles.chains).toHaveLength(1);
  const [rolesRead] = service.tables.user_roles.chains;
  expect(rolesRead).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] });
  expect(rolesRead).toContainEqual({ method: 'eq', args: ['is_active', true] });
}

function expectOnlyPickerReads(service: Service) {
  expect(service.rpc).not.toHaveBeenCalled();
  expect(service.from).not.toHaveBeenCalledWith('consultant_assignments');
  expect(service.tables.consultant_assignments.chains).toHaveLength(0);
  const methods = Object.values(service.tables).flatMap(t => t.chains.flat().map(c => c.method));
  expect(methods.filter(m => !READ_METHODS.includes(m))).toEqual([]);
}

function expectEverySchoolListed(service: Service, r: Awaited<ReturnType<typeof get>>) {
  expect(r.status).toBe(200);
  expect(r.json).toEqual({ schools: ALL_SCHOOLS });
  expect(service.tables.schools.chains).toHaveLength(1);
  const [schoolsRead] = service.tables.schools.chains;
  expect(schoolsRead).toContainEqual({ method: 'order', args: ['name', { ascending: true }] });
  expect(schoolsRead.filter(c => c.method === 'eq' || c.method === 'in')).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
});

describe('GET /api/school/transversal-context/schools', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s: 405 before any auth or database activity', async method => {
    const { req, res } = createMocks({ method: method as any });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
    expect(mockGetApiUser).not.toHaveBeenCalled();
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  const AUTH_FAILURES: Array<[string, { user: { id: string } | null; error: string | null }]> = [
    ['no session user', { user: null, error: null }],
    ['an auth error', { user: { id: USER_ID }, error: 'invalid token' }],
  ];

  it.each(AUTH_FAILURES)('401 for %s, before any database activity', async (_label, authResult) => {
    mockGetApiUser.mockResolvedValue(authResult);
    const r = await get();
    expect(r.status).toBe(401);
    expect(r.json).toEqual({ error: 'Autenticación requerida' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  const ASSIGNMENT_STATES: Array<[string, ArrangeOpts]> = [
    ['no assignments', { assignments: [] }],
    ['an active assignment to a single school', { assignments: [{ consultant_id: USER_ID, school_id: 1, is_active: true }] }],
    ['only inactive assignments', { assignments: [{ consultant_id: USER_ID, school_id: 2, is_active: false }] }],
    ['only expired assignments', { assignments: [{ consultant_id: USER_ID, school_id: 3, is_active: true, end_date: '2020-12-31' }] }],
    ['a failing assignments read', { assignmentsError: { code: 'XX000' } }],
  ];

  it.each(ASSIGNMENT_STATES)('active pure consultor with %s: every registered school, including unassigned ones', async (_label, fixture) => {
    const service = arrange({ ...fixture, roles: ['consultor'] });
    const r = await get();
    expectEverySchoolListed(service, r);
    expectCallerRoleRead(service);
    expectOnlyPickerReads(service);
  });

  const LISTING_ROLES: Array<[string, string[]]> = [
    ['admin', ['admin']],
    ['admin + consultor', ['consultor', 'admin']],
    ['consultor + equipo_directivo', ['equipo_directivo', 'consultor']],
  ];

  it.each(LISTING_ROLES)('active %s: every registered school', async (_label, roles) => {
    const service = arrange({ roles });
    const r = await get();
    expectEverySchoolListed(service, r);
    expectCallerRoleRead(service);
    expectOnlyPickerReads(service);
  });

  // Unfiltered user_roles rows: dropping either the user_id or the is_active
  // filter would let one of these rows authorize the caller.
  const MIXED_ROLE_ROWS: Row[] = [
    { user_id: USER_ID, role_type: 'admin', is_active: false },
    { user_id: USER_ID, role_type: 'consultor', is_active: false },
    { user_id: USER_ID, role_type: 'docente', is_active: true },
    { user_id: OTHER_USER_ID, role_type: 'admin', is_active: true },
    { user_id: OTHER_USER_ID, role_type: 'consultor', is_active: true },
  ];

  it("inactive admin/consultor roles and another user's active roles do not authorize the caller", async () => {
    const service = arrange({ roleRows: MIXED_ROLE_ROWS });
    const r = await get();
    expect(r.status).toBe(403);
    expect(r.json).toEqual({ error: 'Solo administradores y consultores pueden listar escuelas' });
    expect(service.from).not.toHaveBeenCalledWith('schools');
    expectCallerRoleRead(service);
    expectOnlyPickerReads(service);
  });

  it('the same mixed roles plus an active consultor role for the caller: every registered school', async () => {
    const service = arrange({ roleRows: [...MIXED_ROLE_ROWS, { user_id: USER_ID, role_type: 'consultor', is_active: true }] });
    const r = await get();
    expectEverySchoolListed(service, r);
    expectCallerRoleRead(service);
    expectOnlyPickerReads(service);
  });

  it.each([
    'equipo_directivo',
    'lider_generacion',
    'lider_comunidad',
    'supervisor_de_red',
    'community_manager',
    'docente',
    'encargado_licitacion',
  ])('active %s only: 403 without reading schools', async role => {
    const service = arrange({ roles: [role] });
    const r = await get();
    expect(r.status).toBe(403);
    expect(service.from).not.toHaveBeenCalledWith('schools');
    expectOnlyPickerReads(service);
  });

  const NO_ROLE_STATES: Array<[string, ArrangeOpts]> = [
    ['no roles', { roles: [] }],
    ['null role data', { rolesNull: true }],
  ];

  it.each(NO_ROLE_STATES)('%s: 403 without reading schools', async (_label, fixture) => {
    const service = arrange(fixture);
    const r = await get();
    expect(r.status).toBe(403);
    expect(service.from).not.toHaveBeenCalledWith('schools');
    expectOnlyPickerReads(service);
  });

  const EMPTY_SCHOOL_STATES: Array<[string, ArrangeOpts]> = [
    ['no registered schools', { schools: [] }],
    ['null schools data', { schoolsNull: true }],
  ];

  it.each(EMPTY_SCHOOL_STATES)('active consultor with %s: empty list', async (_label, fixture) => {
    const service = arrange({ ...fixture, roles: ['consultor'] });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ schools: [] });
    expectOnlyPickerReads(service);
  });

  it('500 when the role read fails, without reading schools', async () => {
    const service = arrange({ roles: ['consultor'], rolesError: { code: 'XX000' } });
    const r = await get();
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: 'No se pudieron verificar los permisos' });
    expect(service.from).not.toHaveBeenCalledWith('schools');
    expectOnlyPickerReads(service);
  });

  it('500 when the schools read fails', async () => {
    const service = arrange({ roles: ['consultor'], schoolsError: { code: 'XX000' } });
    const r = await get();
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: 'No se pudieron obtener las escuelas' });
    expectOnlyPickerReads(service);
  });

  it('500 on an unexpected exception', async () => {
    mockCreateServiceRoleClient.mockImplementationOnce(() => { throw new Error('synthetic failure'); });
    const r = await get();
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ error: 'Error interno del servidor' });
  });
});
