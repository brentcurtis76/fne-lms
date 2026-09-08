// @vitest-environment node
/**
 * GET /api/school/transversal-context/schools
 *
 * PR 2 (Procesos de Cambio) tenancy: admin -> every school; consultor -> only
 * the schools in their ACTIVE consultant_assignments; everyone else 403.
 * Response shape stays { schools: [{ id, name }] } for the two page consumers.
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

type Call = { method: string; args: unknown[] };
type Row = Record<string, unknown>;

function filterRows(rows: Row[], calls: Call[]) {
  let out = [...rows];
  for (const c of calls) {
    if (c.method === 'eq') out = out.filter(r => r[c.args[0] as string] === c.args[1]);
    if (c.method === 'in') out = out.filter(r => (c.args[1] as unknown[]).includes(r[c.args[0] as string]));
  }
  return out;
}

function table(rows: Row[] = [], readError: unknown = null) {
  const chains: Call[][] = [];
  const open = () => {
    const calls: Call[] = [];
    chains.push(calls);
    const h: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') {
          const outcome = readError ? { data: null, error: readError } : { data: filterRows(rows, calls), error: null };
          return (resolve: (v: unknown) => void) => resolve(outcome);
        }
        return (...args: unknown[]) => { calls.push({ method: String(prop), args }); return new Proxy({}, h); };
      },
    };
    return new Proxy({}, h) as any;
  };
  return { open, chains };
}

const SCHOOLS = [
  { id: 1, name: 'Escuela Alfa' },
  { id: 2, name: 'Escuela Beta' },
  { id: 3, name: 'Escuela Gamma' },
];

function arrange(opts: { roles: string[]; assignments?: Row[]; rolesError?: unknown; assignmentsError?: unknown; schoolsError?: unknown }) {
  const tables = {
    user_roles: table(opts.roles.map(role_type => ({ user_id: USER_ID, role_type, is_active: true })), opts.rolesError),
    consultant_assignments: table(opts.assignments ?? [], opts.assignmentsError),
    schools: table(SCHOOLS, opts.schoolsError),
  };
  const service = { from: vi.fn((t: string) => (tables as any)[t].open()), tables };
  mockCreateServiceRoleClient.mockReturnValue(service);
  return service;
}

async function get() {
  const { req, res } = createMocks({ method: 'GET' });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
});

describe('GET /api/school/transversal-context/schools', () => {
  it('401 unauthenticated, 405 other methods', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'nope' });
    expect((await get()).status).toBe(401);
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('admin: every school, ordered by name, without consulting consultant_assignments', async () => {
    const service = arrange({ roles: ['admin'] });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ schools: SCHOOLS });
    expect(service.from).not.toHaveBeenCalledWith('consultant_assignments');
    const schoolsRead = service.tables.schools.chains[0];
    expect(schoolsRead.find(c => c.method === 'order')?.args).toEqual(['name', { ascending: true }]);
    expect(schoolsRead.find(c => c.method === 'in')).toBeUndefined();
  });

  it('consultor: only the schools of their ACTIVE assignments', async () => {
    const service = arrange({
      roles: ['consultor'],
      assignments: [
        { consultant_id: USER_ID, school_id: 1, is_active: true },
        { consultant_id: USER_ID, school_id: 3, is_active: true },
        { consultant_id: USER_ID, school_id: 2, is_active: false },       // inactive: excluded
        { consultant_id: 'someone-else', school_id: 2, is_active: true }, // another consultor: excluded
        { consultant_id: USER_ID, school_id: null, is_active: true },     // student-only assignment: ignored
      ],
    });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ schools: [{ id: 1, name: 'Escuela Alfa' }, { id: 3, name: 'Escuela Gamma' }] });

    const assignmentsRead = service.tables.consultant_assignments.chains[0];
    expect(assignmentsRead.find(c => c.method === 'eq' && c.args[0] === 'consultant_id')?.args).toEqual(['consultant_id', USER_ID]);
    expect(assignmentsRead.find(c => c.method === 'eq' && c.args[0] === 'is_active')?.args).toEqual(['is_active', true]);
    expect(service.tables.schools.chains[0].find(c => c.method === 'in')?.args).toEqual(['id', [1, 3]]);
  });

  it('consultor without active assignments: empty list, schools never queried', async () => {
    const service = arrange({ roles: ['consultor'], assignments: [{ consultant_id: USER_ID, school_id: 1, is_active: false }] });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ schools: [] });
    expect(service.from).not.toHaveBeenCalledWith('schools');
  });

  it('a user who is both admin and consultor gets the admin view', async () => {
    const service = arrange({ roles: ['consultor', 'admin'] });
    const r = await get();
    expect(r.json.schools).toHaveLength(3);
    expect(service.from).not.toHaveBeenCalledWith('consultant_assignments');
  });

  it.each([['equipo_directivo'], ['docente'], ['supervisor_de_red']])('%s: 403 and no schools read', async role => {
    const service = arrange({ roles: [role] });
    const r = await get();
    expect(r.status).toBe(403);
    expect(service.from).not.toHaveBeenCalledWith('schools');
  });

  it('no active roles: 403', async () => {
    arrange({ roles: [] });
    expect((await get()).status).toBe(403);
  });

  it('500 on role / assignment / school read errors', async () => {
    arrange({ roles: ['admin'], rolesError: { code: 'XX000' } });
    expect((await get()).status).toBe(500);
    arrange({ roles: ['consultor'], assignmentsError: { code: 'XX000' } });
    expect((await get()).status).toBe(500);
    arrange({ roles: ['admin'], schoolsError: { code: 'XX000' } });
    expect((await get()).status).toBe(500);
  });
});
