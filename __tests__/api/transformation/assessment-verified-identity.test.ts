// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * SM-B015: evaluate-objective and finalize used to take the caller from the
 * cookie (`session.user`, client-controlled) and accepted `user_metadata`
 * roles (user-writable) as admin. They now resolve the caller with
 * auth.getUser(token) and grant admin only from an active user_roles row.
 * A cookie that names an admin while carrying a lower-role token must not
 * evaluate or finalize anything.
 */
const ASSESSMENT_ID = '11111111-1111-4111-8111-111111111111';
const st = vi.hoisted(() => ({
  cookieUser: null as any,
  verifiedUser: null as any,
  rolesByUser: {} as Record<string, Array<Record<string, unknown>>>,
  roleLookups: [] as string[],
  writes: 0,
}));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: st.cookieUser ? { access_token: 'tok', user: st.cookieUser } : null } }),
      getUser: async () => ({ data: { user: st.verifiedUser }, error: st.verifiedUser ? null : { message: 'bad' } }),
    },
    from: () => {
      const c: any = {
        select: () => c,
        eq: () => c,
        update: () => {
          st.writes += 1;
          return c;
        },
        single: async () => ({
          data: { id: ASSESSMENT_ID, status: 'in_progress', growth_community_id: 'gc-1', school_id: 9, area: 'personalizacion', context_metadata: {}, responses: {} },
          error: null,
        }),
      };
      return c;
    },
    rpc: async () => {
      st.writes += 1;
      return { data: null, error: null };
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      let userId = '';
      const filters: Record<string, unknown> = {};
      const result = () => {
        const rows = (st.rolesByUser[userId] ?? []).filter((r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v)
        );
        return rows;
      };
      const c: any = {
        select: () => c,
        eq: (col: string, val: unknown) => {
          if (col === 'user_id') {
            userId = val as string;
            st.roleLookups.push(userId);
          } else filters[col] = val;
          return c;
        },
        limit: async () => ({ data: result(), error: null }),
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        update: () => {
          st.writes += 1;
          return c;
        },
      };
      return c;
    },
  }),
}));

vi.mock('@/lib/transformation/evaluator', () => ({
  RubricEvaluator: class {
    constructor() {
      st.writes += 1;
      throw new Error('evaluator must not run for an unauthorized caller');
    }
  },
}));

import evaluateObjective from '../../../pages/api/transformation/assessments/[id]/evaluate-objective';
import finalize from '../../../pages/api/transformation/assessments/[id]/finalize';

async function call(handler: any) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = () => res;
  await handler(
    { method: 'POST', query: { id: ASSESSMENT_ID }, body: { objectiveNumber: 1 }, headers: {} } as unknown as NextApiRequest,
    res as NextApiResponse
  );
  return res;
}

beforeEach(() => {
  st.cookieUser = { id: 'admin-claimed', user_metadata: { roles: ['admin'] } };
  st.verifiedUser = { id: 'docente-real', user_metadata: { roles: ['admin'] } };
  st.rolesByUser = {
    'admin-claimed': [{ role_type: 'admin', is_active: true }],
    'docente-real': [{ role_type: 'docente', is_active: true, community_id: 'other', school_id: 1 }],
  };
  st.roleLookups = [];
  st.writes = 0;
});

describe.each([
  ['evaluate-objective', evaluateObjective],
  ['finalize', finalize],
])('%s', (_name, handler) => {
  it('a cookie naming an admin over a lower-role token (and metadata claiming admin) is refused, with no evaluation or write', async () => {
    const res = await call(handler);
    expect(res.statusCode).toBe(403);
    expect(st.roleLookups.length).toBeGreaterThan(0);
    expect(st.roleLookups.every((id) => id === 'docente-real')).toBe(true);
    expect(st.writes).toBe(0);
  });

  it('an unverifiable token is 401 before anything else', async () => {
    st.verifiedUser = null;
    const res = await call(handler);
    expect(res.statusCode).toBe(401);
    expect(st.roleLookups).toEqual([]);
    expect(st.writes).toBe(0);
  });
});
