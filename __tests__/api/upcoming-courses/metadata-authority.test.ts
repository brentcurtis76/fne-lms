// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Before this fix, upcoming-courses and course-proposals treated
 * `session.user.user_metadata.roles` as authority. A signed-in user can write
 * their own metadata (`supabase.auth.updateUser({ data: { roles: ['admin'] } })`),
 * so any docente could create, edit or delete upcoming courses and proposals
 * through the service-role client. Every protected path now goes through
 * requireVerifiedRole (verified identity, forced-password gate, active
 * user_roles row) and uses only the verified id.
 */
const requireVerifiedRole = vi.fn();
vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedRole: (...args: unknown[]) => requireVerifiedRole(...args),
}));

/**
 * A recording fake of the service-role client. Each `from(table)` chain logs
 * its operations; `single()` / `await` resolve through `answer`.
 */
type Op = [string, ...unknown[]];
const log: Array<{ table: string; ops: Op[] }> = [];
let answer: (table: string, ops: Op[]) => { data: unknown; error: unknown } = () => ({ data: null, error: null });
const serviceFrom = vi.fn((table: string) => {
  const entry = { table, ops: [] as Op[] };
  log.push(entry);
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const result = answer(table, entry.ops);
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => answer(table, entry.ops);
        }
        return (...args: unknown[]) => {
          entry.ops.push([prop, ...args]);
          return chain;
        };
      },
    }
  );
  return chain;
});
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: serviceFrom }),
}));

import upcomingIndex from '../../../pages/api/upcoming-courses/index';
import upcomingById from '../../../pages/api/upcoming-courses/[id]';
import upcomingAdmin from '../../../pages/api/upcoming-courses/admin';
import proposalsIndex from '../../../pages/api/course-proposals/index';
import proposalsById from '../../../pages/api/course-proposals/[id]';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, method: string, query: Record<string, string> = {}, body: unknown = {}) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = () => res;
  await handler({ method, query, headers: {}, body } as unknown as NextApiRequest, res);
  return res;
}

const CALLER = { id: 'verified-caller' };
const allow = () => requireVerifiedRole.mockResolvedValue({ user: CALLER, status: null, body: null });
const ops = (table: string, name: string) =>
  log.filter((l) => l.table === table).flatMap((l) => l.ops.filter(([op]) => op === name));

const CASES: Array<[string, Handler, string, Record<string, string>, string[]]> = [
  ['POST /api/upcoming-courses', upcomingIndex, 'POST', {}, ['admin']],
  ['PUT /api/upcoming-courses/[id]', upcomingById, 'PUT', { id: 'c-1' }, ['admin']],
  ['DELETE /api/upcoming-courses/[id]', upcomingById, 'DELETE', { id: 'c-1' }, ['admin']],
  ['GET /api/upcoming-courses/admin', upcomingAdmin, 'GET', {}, ['admin']],
  ['GET /api/course-proposals', proposalsIndex, 'GET', {}, ['admin', 'consultor']],
  ['POST /api/course-proposals', proposalsIndex, 'POST', {}, ['admin', 'consultor']],
  ['PUT /api/course-proposals/[id]', proposalsById, 'PUT', { id: 'p-1' }, ['admin', 'consultor']],
  ['DELETE /api/course-proposals/[id]', proposalsById, 'DELETE', { id: 'p-1' }, ['admin', 'consultor']],
];

beforeEach(() => {
  requireVerifiedRole.mockReset();
  serviceFrom.mockClear();
  log.length = 0;
  answer = () => ({ data: null, error: null });
});

describe('denials pass through unchanged, before any service-role access', () => {
  const refusals: Array<[number, Record<string, string>]> = [
    [401, { error: 'No autorizado' }],
    [403, { error: 'denied' }],
    [403, { error: 'cambio de contraseña', code: 'PASSWORD_CHANGE_REQUIRED' }],
    [503, { error: 'no disponible', code: 'PASSWORD_STATE_UNAVAILABLE' }],
    [500, { error: 'Error del servidor' }],
  ];
  it.each(CASES)('%s', async (_name, handler, method, query, roles) => {
    for (const [status, body] of refusals) {
      requireVerifiedRole.mockResolvedValueOnce({ user: null, status, body });
      const res = await call(handler, method, query);
      expect(res.statusCode).toBe(status);
      expect(res.body).toEqual(body);
    }
    expect(requireVerifiedRole).toHaveBeenCalledWith(expect.anything(), expect.anything(), roles, expect.any(String));
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});

describe('verified callers act as themselves', () => {
  it('POST /api/upcoming-courses attributes the entry to the verified caller', async () => {
    allow();
    answer = () => ({ data: { id: 'new' }, error: null });
    const res = await call(upcomingIndex, 'POST', {}, { title: 'Curso' });
    expect(res.statusCode).toBeLessThan(300);
    expect(ops('upcoming_courses', 'insert')[0][1]).toMatchObject({ created_by: 'verified-caller' });
  });

  it('POST /api/course-proposals attributes the proposal to the verified caller', async () => {
    allow();
    answer = () => ({ data: { id: 'p-new' }, error: null });
    const res = await call(proposalsIndex, 'POST', {}, {
      titulo: 'T',
      descripcion_corta: 'D',
      competencias_desarrollar: 'C',
      tiempo_requerido_desarrollo: '1 mes',
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(ops('course_proposals', 'insert')[0][1]).toMatchObject({ created_by: 'verified-caller' });
  });

  it.each([
    ['PUT', { titulo: 'T', descripcion_corta: 'D', competencias_desarrollar: 'C', tiempo_requerido_desarrollo: '1 mes' }],
    ['DELETE', {}],
  ])("%s /api/course-proposals/[id] refuses someone else's proposal, without writing", async (method, body) => {
    allow();
    answer = (table, o) =>
      table === 'course_proposals' && o.some(([op]) => op === 'select') && !o.some(([op]) => op === 'update' || op === 'delete')
        ? { data: { created_by: 'someone-else' }, error: null }
        : { data: null, error: null };
    const res = await call(proposalsById, method, { id: 'p-1' }, body);
    expect(res.statusCode).toBe(403);
    expect(ops('course_proposals', 'update')).toHaveLength(0);
    expect(ops('course_proposals', 'delete')).toHaveLength(0);
  });

  const FULL = { titulo: 'T', descripcion_corta: 'D', competencias_desarrollar: 'C', tiempo_requerido_desarrollo: '1 mes' };
  it.each([
    ['PUT', FULL, 'update'],
    ['DELETE', {}, 'delete'],
  ])('%s /api/course-proposals/[id] lets the verified owner proceed', async (method, body, write) => {
    allow();
    answer = (table, o) =>
      table === 'course_proposals' && !o.some(([op]) => op === 'update' || op === 'delete')
        ? { data: { created_by: 'verified-caller', id: 'p-1' }, error: null }
        : { data: { id: 'p-1' }, error: null };
    const res = await call(proposalsById, method, { id: 'p-1' }, body);
    expect(res.statusCode).toBeLessThan(300);
    expect(ops('course_proposals', write)).toHaveLength(1);
  });
});

describe('public reads', () => {
  it('GET /api/upcoming-courses needs no caller and lists only active entries', async () => {
    answer = () => ({ data: [], error: null });
    const res = await call(upcomingIndex, 'GET');
    expect(res.statusCode).toBe(200);
    expect(requireVerifiedRole).not.toHaveBeenCalled();
    expect(ops('upcoming_courses', 'eq')).toContainEqual(['eq', 'is_active', true]);
  });

  it('GET /api/upcoming-courses/[id] needs no caller and never discloses an inactive entry', async () => {
    answer = () => ({ data: null, error: { code: 'PGRST116' } });
    const res = await call(upcomingById, 'GET', { id: 'inactive-id' });
    expect(res.statusCode).toBe(404);
    expect(requireVerifiedRole).not.toHaveBeenCalled();
    expect(ops('upcoming_courses', 'eq')).toContainEqual(['eq', 'is_active', true]);
  });
});

/**
 * Detects user-writable metadata used as role authority, in the forms seen in
 * this codebase and the obvious variants.
 */
export function readsMetadataRoles(source: string): boolean {
  const code = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
  return [
    /user_metadata\??\.roles?\b/,
    /user_metadata\??\.?\[\s*['"]roles?['"]\s*\]/,
    /\{[^}]*\broles?\b[^}]*\}\s*=\s*[^;\n]*user_metadata/,
    /\bmetadataHasRole\s*\(/,
    /\bextractRolesFromMetadata\s*\(/,
    /\b(isAdmin|hasRole|hasAnyRole|getUserRoles)\s*\(\s*session\b/,
  ].some((re) => re.test(code));
}

describe('repository guard', () => {
  it('detects the forms it is meant to catch', () => {
    for (const bad of [
      "const r = session.user?.user_metadata?.roles || [];",
      "const r = user.user_metadata.role;",
      "const r = user.user_metadata['roles'];",
      "const r = user.user_metadata?.['roles'];",
      "const { roles } = session.user.user_metadata;",
      "if (metadataHasRole(user.user_metadata, 'admin')) {}",
      "let a = isAdmin(session);",
    ]) {
      expect(readsMetadataRoles(bad), bad).toBe(true);
    }
    expect(readsMetadataRoles("// user_metadata.roles is user-writable")).toBe(false);
    expect(readsMetadataRoles("const m = user.user_metadata.full_name;")).toBe(false);
  });

  /** Known, reviewed exceptions: never authority. */
  const EXCEPTIONS: Record<string, string> = {
    'lib/api-auth.ts': 'extractRolesFromMetadata feeds the auth log line only',
  };

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
      return /\.(t|j)sx?$/.test(name) ? [path] : [];
    });
  }

  it('no API route or server library reads roles from user_metadata', () => {
    const root = join(__dirname, '..', '..', '..');
    const offenders = [...files(join(root, 'pages', 'api')), ...files(join(root, 'lib'))]
      .map((f) => f.slice(root.length + 1))
      .filter((f) => !(f in EXCEPTIONS))
      .filter((f) => readsMetadataRoles(readFileSync(join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
