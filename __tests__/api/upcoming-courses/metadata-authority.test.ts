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
 * through the service-role client. Every write path now goes through
 * requireVerifiedRole (verified identity + an active user_roles row).
 */
const requireVerifiedRole = vi.fn();
vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedRole: (...args: unknown[]) => requireVerifiedRole(...args),
}));

// Any service-role use after a denial would show up here.
const serviceFrom = vi.fn(() => {
  throw new Error('service-role client used after authorization');
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

async function call(handler: Handler, method: string, query: Record<string, string> = {}) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (body: unknown) => ((res.body = body), res);
  await handler({ method, query, headers: {}, body: { title: 'x' } } as unknown as NextApiRequest, res);
  return res;
}

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
});

describe('upcoming-courses / course-proposals authority', () => {
  it.each(CASES)('%s: 403 without a verified role, and no service-role access', async (_name, handler, method, query, roles) => {
    requireVerifiedRole.mockResolvedValue({ user: null, status: 403 });
    const res = await call(handler, method, query);
    expect(res.statusCode).toBe(403);
    expect(requireVerifiedRole).toHaveBeenCalledWith(expect.anything(), expect.anything(), roles);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it.each(CASES)('%s: 401 without a verified caller', async (_name, handler, method, query) => {
    requireVerifiedRole.mockResolvedValue({ user: null, status: 401 });
    const res = await call(handler, method, query);
    expect(res.statusCode).toBe(401);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  it.each(CASES)('%s: 500 when the role lookup fails (fail closed)', async (_name, handler, method, query) => {
    requireVerifiedRole.mockResolvedValue({ user: null, status: 500 });
    const res = await call(handler, method, query);
    expect(res.statusCode).toBe(500);
    expect(serviceFrom).not.toHaveBeenCalled();
  });
});

describe('repository guard', () => {
  function apiFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? apiFiles(path) : /\.(t|j)sx?$/.test(name) ? [path] : [];
    });
  }

  it('no API route reads roles out of user_metadata (it is user-writable)', () => {
    const root = join(__dirname, '..', '..', '..');
    const offenders = apiFiles(join(root, 'pages', 'api')).filter((file) =>
      /user_metadata\??\.roles?\b/.test(
        readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
          .join('\n')
      )
    );
    expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
  });
});
