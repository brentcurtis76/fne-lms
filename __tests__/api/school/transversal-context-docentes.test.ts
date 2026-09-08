// @vitest-environment node
/**
 * GET /api/school/transversal-context/docentes
 *
 * PR 2 (Procesos de Cambio) tenancy: the local permission helper that treated
 * every consultor as an admin is gone. The real `lib/permissions/directivo`
 * runs here (only `lib/api-auth` is mocked): admin needs school_id, an
 * equipo_directivo is pinned to its own school, and consultores — assigned or
 * not — get 403 because the directory exists only to assign docentes.
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
  sendAuthError: vi.fn((res: any, msg?: string) => res.status(401).json({ error: msg })),
  handleMethodNotAllowed: vi.fn((res: any) => res.status(405).json({ error: 'Método no permitido' })),
}));

import handler from '@/pages/api/school/transversal-context/docentes';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DOCENTE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCENTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SCHOOL_ID = 42;
const OTHER_SCHOOL_ID = 99;

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

function client(tables: Record<string, ReturnType<typeof table>>) {
  const fallback = table();
  return { from: vi.fn((t: string) => (tables[t] ?? fallback).open()), tables };
}

const roleRow = (userId: string, roleType: string, schoolId: number | null): Row => ({
  user_id: userId, role_type: roleType, school_id: schoolId, is_active: true,
});

function arrange(opts: { roles: Row[]; consultantAssignments?: Row[]; schoolRoles?: Row[]; rolesError?: unknown }) {
  const user = client({
    user_roles: table(opts.roles),
    consultant_assignments: table(opts.consultantAssignments ?? []),
  });
  const service = client({
    user_roles: table(opts.schoolRoles ?? [
      roleRow(DOCENTE_A, 'docente', SCHOOL_ID),
      roleRow(DOCENTE_B, 'lider_generacion', SCHOOL_ID),
      roleRow('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'docente', OTHER_SCHOOL_ID),
    ], opts.rolesError),
    profiles: table([
      { id: DOCENTE_A, name: 'Docente A', first_name: null, last_name: null, email: 'a@example.test' },
      { id: DOCENTE_B, name: null, first_name: 'Líder', last_name: 'B', email: 'b@example.test' },
    ]),
  });
  mockCreateApiSupabaseClient.mockResolvedValue(user);
  mockCreateServiceRoleClient.mockReturnValue(service);
  return { user, service };
}

async function get(query: Record<string, string> = {}) {
  const { req, res } = createMocks({ method: 'GET', query });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: JSON.parse(res._getData()) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ user: { id: USER_ID }, error: null });
});

describe('GET /api/school/transversal-context/docentes', () => {
  it('answers 401 unauthenticated and 405 for other methods', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: 'nope' });
    expect((await get({ school_id: '42' })).status).toBe(401);
    const { req, res } = createMocks({ method: 'POST' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('directivo: lists the teaching-eligible users of its own school only', async () => {
    const { service } = arrange({ roles: [roleRow(USER_ID, 'equipo_directivo', SCHOOL_ID)] });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.docentes).toEqual([
      { id: DOCENTE_A, name: 'Docente A', email: 'a@example.test', roles: ['docente'] },
      { id: DOCENTE_B, name: 'Líder B', email: 'b@example.test', roles: ['lider_generacion'] },
    ]);
    const rolesRead = service.tables.user_roles.chains[0];
    expect(rolesRead.find(c => c.method === 'eq' && c.args[0] === 'school_id')?.args).toEqual(['school_id', SCHOOL_ID]);
  });

  it('directivo: cannot read another school (403, no directory read)', async () => {
    const { service } = arrange({ roles: [roleRow(USER_ID, 'equipo_directivo', SCHOOL_ID)] });
    const r = await get({ school_id: String(OTHER_SCHOOL_ID) });
    expect(r.status).toBe(403);
    expect(service.from).not.toHaveBeenCalled();
  });

  it('admin: must pass school_id (400) and then reads that school', async () => {
    arrange({ roles: [roleRow(USER_ID, 'admin', null)] });
    expect((await get()).status).toBe(400);

    const { service } = arrange({ roles: [roleRow(USER_ID, 'admin', null)] });
    const r = await get({ school_id: String(OTHER_SCHOOL_ID) });
    expect(r.status).toBe(200);
    expect(service.tables.user_roles.chains[0].find(c => c.method === 'eq' && c.args[0] === 'school_id')?.args)
      .toEqual(['school_id', OTHER_SCHOOL_ID]);
  });

  it('assigned consultor: 403, the directory is assignment-only', async () => {
    const { service } = arrange({
      roles: [roleRow(USER_ID, 'consultor', null)],
      consultantAssignments: [{ consultant_id: USER_ID, school_id: SCHOOL_ID, is_active: true }],
    });
    const r = await get({ school_id: String(SCHOOL_ID) });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('directory_forbidden');
    expect(service.from).not.toHaveBeenCalled();
  });

  it('unassigned consultor: 403', async () => {
    const { service } = arrange({ roles: [roleRow(USER_ID, 'consultor', null)] });
    const r = await get({ school_id: String(SCHOOL_ID) });
    expect(r.status).toBe(403);
    expect(service.from).not.toHaveBeenCalled();
  });

  it('docente / no roles: 403', async () => {
    arrange({ roles: [roleRow(USER_ID, 'docente', SCHOOL_ID)] });
    expect((await get()).status).toBe(403);
    arrange({ roles: [] });
    expect((await get()).status).toBe(403);
  });

  it('answers 500 when the directory read fails', async () => {
    arrange({ roles: [roleRow(USER_ID, 'equipo_directivo', SCHOOL_ID)], rolesError: { code: 'XX000', message: 'boom' } });
    expect((await get()).status).toBe(500);
  });

  it('answers an empty list when the school has no teaching-eligible users', async () => {
    arrange({ roles: [roleRow(USER_ID, 'equipo_directivo', SCHOOL_ID)], schoolRoles: [] });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.json.docentes).toEqual([]);
  });
});
