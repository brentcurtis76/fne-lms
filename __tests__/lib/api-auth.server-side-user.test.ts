// @vitest-environment node
/**
 * SM-B015 batch B7 — server-rendered pages take the viewer from the auth
 * server (getServerSideUser), never from the session cookie.
 *
 * auth-helpers accepts a legacy JSON session cookie as-is, so `getSession()`
 * returns whatever `user` the cookie claims next to a valid access token.
 * Before this batch, getServerSideProps used `session.user.id` to decide
 * admin / equipo directivo access, to pick the school or community a page
 * shows, and (pages/meet/session/[id]) whether to hand out the meeting link.
 *
 * Only the external clients are faked; lib/api-auth runs for real. The cookie
 * claims VICTIM (admin, and attendee of the meeting); the auth server
 * verifies the token as PLAIN, who holds no role. All ids are synthetic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GetServerSidePropsContext } from 'next';

const VICTIM = '11111111-1111-4111-8111-111111111111';
const PLAIN = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const COOKIE_TOKEN = 'viewer-own-valid-token';

let verifiedUser: { id: string } | null = null;
let sessionPresent = true;
let sessionFailure: 'error' | 'throw' | null = null;
const askedIds: unknown[] = [];

type Op = [string, ...unknown[]];
const ROLE_ROWS = [
  { id: 1, user_id: VICTIM, role_type: 'admin', school_id: null, community_id: null, is_active: true },
  { id: 2, user_id: ADMIN, role_type: 'admin', school_id: null, community_id: null, is_active: true },
];

function chain(table: string) {
  const ops: Op[] = [];
  const answer = (mode: 'many' | 'one') => {
    const userId = ops.find(([op, col]) => op === 'eq' && (col === 'user_id' || col === 'id'))?.[2];
    if (userId !== undefined) askedIds.push(userId);
    if (table === 'user_roles') {
      const rows = ROLE_ROWS.filter((r) =>
        ops.every(([op, col, v]) => (op === 'eq' ? (r as Record<string, unknown>)[col as string] === v : true))
      );
      return { data: mode === 'one' ? rows[0] ?? null : rows, error: null };
    }
    if (table === 'profiles') {
      return { data: { id: userId, first_name: 'N', last_name: 'S', must_change_password: false }, error: null };
    }
    return { data: mode === 'one' ? null : [], error: null };
  };
  const c: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (r: (v: unknown) => void) => r(answer('many'));
        if (prop === 'single' || prop === 'maybeSingle') return async () => answer('one');
        return (...args: unknown[]) => {
          ops.push([prop, ...args]);
          return c;
        };
      },
    }
  );
  return c;
}

const getUserTokens: unknown[] = [];
function pagesClient() {
  return {
    auth: {
      getSession: vi.fn(async () => {
        if (sessionFailure === 'throw') throw new Error('auth server unreachable');
        return {
          data: { session: sessionPresent ? { user: { id: VICTIM }, access_token: COOKIE_TOKEN } : null },
          error: sessionFailure === 'error' ? { message: 'bad cookie' } : null,
        };
      }),
      getUser: vi.fn(async (token?: string) => {
        getUserTokens.push(token);
        return token === COOKIE_TOKEN && verifiedUser
          ? { data: { user: verifiedUser }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } };
      }),
    },
    from: vi.fn(chain),
  };
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: vi.fn(() => pagesClient()),
  createServerSupabaseClient: vi.fn(() => pagesClient()),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no bearer' } })) },
    from: vi.fn(chain),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  })),
}));

const meet = vi.hoisted(() => ({ userIds: [] as unknown[] }));
vi.mock('../../lib/utils/session-meet-access', () => ({
  resolveMeetSessionAccess: vi.fn(async ({ userId }: { userId: string | null }) => {
    meet.userIds.push(userId);
    if (!userId) return { kind: 'unauthenticated' };
    // Only the attendee (VICTIM) is given the session, with its link.
    return userId === VICTIM
      ? { kind: 'ok', session: { id: 's-1', title: 'T', session_date: '2026-10-01', meeting_link: 'https://zoom.invalid/j/1' } }
      : { kind: 'denied' };
  }),
}));

// Page components are irrelevant to getServerSideProps; this one builds JSX
// at module load with the classic runtime, which needs a global React.
vi.mock('@/components/transformation/ResultsDisplay', () => ({ ResultsDisplay: () => null }));

import { getServerSideUser } from '../../lib/api-auth';
import { getServerSideProps as schoolUsers } from '../../pages/admin/school-users';
import { getServerSideProps as growthCommunities } from '../../pages/admin/growth-communities/index';
import { getServerSideProps as growthMembers } from '../../pages/admin/growth-communities/[id]/members';
import { getServerSideProps as tractorSignups } from '../../pages/admin/tractor-signups';
import { getServerSideProps as pasantiaLeads } from '../../pages/admin/pasantia-leads';
import { getServerSideProps as metrics } from '../../pages/admin/transformation/metrics';
import { getServerSideProps as meetSession } from '../../pages/meet/session/[id]';
import { getServerSideProps as meetDiag } from '../../pages/meet/diag';
import { getServerSideProps as evaluatePage } from '../../pages/community/workspace/transformation/evaluate';
import { getServerSideProps as resultsPage } from '../../pages/community/transformation/results/[assessmentId]';
import { getServerSideProps as rutaPage } from '../../pages/mi-aprendizaje/ruta/[id]';
import { getServerSideProps as myPathsPage } from '../../pages/my-paths/[id]';

function ctx(extra: Partial<GetServerSidePropsContext> = {}): GetServerSidePropsContext {
  return {
    req: { headers: {}, cookies: {} },
    res: { setHeader: () => undefined, getHeader: () => undefined },
    params: { id: 'c-1' },
    query: {},
    resolvedUrl: '/x',
    ...extra,
  } as unknown as GetServerSidePropsContext;
}

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV']) savedEnv[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  verifiedUser = null;
  sessionPresent = true;
  sessionFailure = null;
  askedIds.length = 0;
  getUserTokens.length = 0;
  meet.userIds.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
  vi.restoreAllMocks();
});

describe('getServerSideUser', () => {
  it("returns the auth server's user, not the cookie's", async () => {
    verifiedUser = { id: PLAIN };
    expect(await getServerSideUser(ctx())).toEqual({ id: PLAIN });
    expect(getUserTokens).toEqual([COOKIE_TOKEN]);
  });

  it('returns null when the token is refused', async () => {
    verifiedUser = null;
    expect(await getServerSideUser(ctx())).toBeNull();
  });

  it.each(['error', 'throw'] as const)('returns null when the session lookup reports %s', async (failure) => {
    verifiedUser = { id: PLAIN };
    sessionFailure = failure;
    expect(await getServerSideUser(ctx())).toBeNull();
    expect(getUserTokens).toEqual([]);
  });

  it('returns null without a session, without asking the auth server', async () => {
    sessionPresent = false;
    expect(await getServerSideUser(ctx())).toBeNull();
    expect(getUserTokens).toEqual([]);
  });
});

type GSSP = (c: GetServerSidePropsContext) => Promise<unknown>;
const ADMIN_PAGES: Array<[string, GSSP]> = [
  ['admin/school-users', schoolUsers as GSSP],
  ['admin/growth-communities', growthCommunities as GSSP],
  ['admin/growth-communities/[id]/members', growthMembers as GSSP],
  ['admin/tractor-signups', tractorSignups as GSSP],
  ['admin/pasantia-leads', pasantiaLeads as GSSP],
];

describe("admin pages: a cookie naming an admin does not open them", () => {
  it.each(ADMIN_PAGES)('%s: a plain verified viewer is sent away, and only they were looked up', async (_n, gssp) => {
    verifiedUser = { id: PLAIN };
    const result = (await gssp(ctx())) as { redirect?: unknown; props?: unknown };
    expect(result.redirect).toBeDefined();
    expect(result.props).toBeUndefined();
    expect(askedIds).toContain(PLAIN);
    expect(askedIds).not.toContain(VICTIM);
  });

  it.each(ADMIN_PAGES)('%s: a refused token goes to login', async (_n, gssp) => {
    verifiedUser = null;
    const result = (await gssp(ctx())) as { redirect?: { destination: string } };
    expect(result.redirect?.destination).toBe('/login');
    expect(askedIds).toEqual([]);
  });

  it('a verified admin is let in (tractor-signups)', async () => {
    verifiedUser = { id: ADMIN };
    expect(await (tractorSignups as GSSP)(ctx())).toEqual({ props: {} });
  });
});

describe('admin/transformation/metrics', () => {
  it('ignores user_metadata.roles and the cookie user in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    verifiedUser = { id: PLAIN, user_metadata: { roles: ['admin'] } } as unknown as { id: string };
    const result = (await (metrics as GSSP)(ctx())) as { redirect?: { destination: string } };
    expect(result.redirect?.destination).toBe('/403');
    expect(askedIds).not.toContain(VICTIM);
  });
});

describe('meet/session/[id]', () => {
  it("does not hand the attendee's meeting link to a viewer the cookie disguises as them", async () => {
    verifiedUser = { id: PLAIN };
    const result = (await (meetSession as GSSP)(ctx({ params: { id: 's-1' } }))) as Record<string, unknown>;
    expect(meet.userIds).toEqual([PLAIN]);
    expect(JSON.stringify(result)).not.toContain('zoom.invalid');
  });

  it('a refused token is treated as signed out', async () => {
    verifiedUser = null;
    await (meetSession as GSSP)(ctx({ params: { id: 's-1' } }));
    expect(meet.userIds).toEqual([null]);
  });
});

describe('the other converted pages', () => {
  const PAGES: Array<[string, GSSP, Partial<GetServerSidePropsContext>]> = [
    ['meet/diag', meetDiag as GSSP, {}],
    ['community/workspace/transformation/evaluate', evaluatePage as GSSP, {}],
    ['community/transformation/results/[assessmentId]', resultsPage as GSSP, { params: { assessmentId: 'a-1' } }],
    ['mi-aprendizaje/ruta/[id]', rutaPage as GSSP, { params: { id: 'p-1' } }],
    ['my-paths/[id]', myPathsPage as GSSP, { params: { id: 'p-1' } }],
  ];

  it.each(PAGES)('%s: a cookie whose token the auth server refuses is signed out', async (_n, gssp, extra) => {
    verifiedUser = null;
    const result = (await gssp(ctx(extra))) as { redirect?: unknown; props?: unknown };
    expect(result.redirect).toBeDefined();
    expect(askedIds).toEqual([]);
  });

  it.each(PAGES.slice(3))('%s: props carry the verified user, not the cookie user', async (_n, gssp, extra) => {
    verifiedUser = { id: PLAIN };
    const result = (await gssp(ctx(extra))) as { props?: { user?: { id: string } } };
    expect(result.props?.user?.id).toBe(PLAIN);
    expect(askedIds).toContain(PLAIN);
    expect(askedIds).not.toContain(VICTIM);
  });

  it('community/transformation/results looks up the verified viewer', async () => {
    verifiedUser = { id: PLAIN };
    await (resultsPage as GSSP)(ctx({ params: { assessmentId: 'a-1' } }));
    expect(askedIds).not.toContain(VICTIM);
  });
});
