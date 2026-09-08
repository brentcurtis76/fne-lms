// @vitest-environment node
/**
 * S4 — the forced-password-change gate, per role and per path.
 *
 * `must_change_password` used to be advisory: read by `pages/login.tsx` on the
 * sign-in it handled, and by `pages/change-password.tsx` to decide whether to
 * bounce you away. Nothing else looked at it. So a flagged user could reach any
 * page by typing its URL, call any API directly, or simply already have a
 * session — and an administrator's temporary credential became a permanent one.
 *
 * `middleware.ts` is described in AGENTS.md as the most bug-prone area of the
 * codebase, so this suite is deliberately exhaustive about the things a change
 * there breaks: all nine RBAC roles, direct navigation, direct API access, the
 * logout path, an expired/absent session, and the exact database-failure
 * behaviour. The pure predicates are tested directly; the middleware is tested
 * through the same stub shape the pre-existing suite uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  FORCED_CHANGE_PATH,
  GATED_PAGE_PREFIXES,
  PASSWORD_CHANGE_REQUIRED_CODE,
  PASSWORD_STATE_UNAVAILABLE_CODE,
  forcedChangeApiStatus,
  forcedChangeRedirectPath,
  isAlwaysAllowedPath,
  isApiPath,
  isForcedChangeGatedPath,
  PASSWORD_CHANGE_STATE_RPC,
  requiresSessionPresence,
  verdictFromProfile,
} from '../lib/auth/forced-password-change';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const createMiddlewareClient = vi.fn();

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: (...args: unknown[]) => createMiddlewareClient(...args),
}));

/** The nine RBAC roles — types/roles.ts is the source of truth. */
const ALL_ROLES = [
  'admin',
  'consultor',
  'equipo_directivo',
  'lider_generacion',
  'lider_comunidad',
  'supervisor_de_red',
  'community_manager',
  'docente',
  'encargado_licitacion',
] as const;

const SESSION = { user: { id: 'user-uuid-1' } };

function buildSupabase(opts: {
  session: unknown;
  roles?: Array<{ role_type: string; community_id?: string | null }> | null;
  mustChangePassword?: boolean | null;
  profileError?: unknown;
  profileMissing?: boolean;
}) {
  const rolesEqInner = vi.fn().mockResolvedValue({ data: opts.roles ?? [] });
  const rolesEqOuter = vi.fn(() => ({ eq: rolesEqInner }));
  const rolesSelect = vi.fn(() => ({ eq: rolesEqOuter }));

  const profileRow = opts.profileMissing
    ? null
    : { must_change_password: opts.mustChangePassword ?? false };
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: profileRow, error: opts.profileError ?? null });
  const profilesEq = vi.fn(() => ({ maybeSingle }));
  const profilesSelect = vi.fn(() => ({ eq: profilesEq }));

  const from = vi.fn((table: string) =>
    table === 'profiles' ? { select: profilesSelect } : { select: rolesSelect }
  );

  /**
   * The gate probe. F1 moved the middleware's read off `profiles` and onto
   * `current_password_change_state()`, because the database pre-request gate
   * refuses a flagged account's own profile read — the branch that exists to
   * catch flagged users would have been the branch that errored.
   *
   * The RPC returns a plain boolean (it COALESCEs a missing row to false), so a
   * missing profile reads as "not flagged", which is the same verdict the old
   * `maybeSingle()` shape produced.
   */
  const rpc = vi.fn().mockResolvedValue({
    data: opts.profileError ? null : opts.profileMissing ? false : opts.mustChangePassword ?? false,
    error: opts.profileError ?? null,
  });

  const getSession = vi.fn().mockResolvedValue({ data: { session: opts.session } });
  return { auth: { getSession }, from, rpc };
}

function isRedirect(res: Response): boolean {
  return res.status === 307 || res.status === 308;
}

async function run(path: string, supabase: unknown) {
  createMiddlewareClient.mockReturnValue(supabase);
  const { middleware } = await import('../middleware');
  return middleware(new NextRequest(`http://localhost${path}`));
}

beforeEach(() => {
  createMiddlewareClient.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// The predicates
// ---------------------------------------------------------------------------

describe('path predicates', () => {
  it.each([
    '/change-password',
    '/change-password/',
    '/login',
    '/logout',
    '/api/auth/force-password-change',
    '/api/auth/change-password',
    '/api/auth/recovery/exchange',
    '/api/auth/recovery/context',
    '/api/auth/recovery/complete',
    '/api/auth/recovery/invalidate',
    '/api/auth/password-change-state',
    '/api/auth/logout',
    '/api/auth/session',
  ])('%s is always allowed — a flagged user must be able to finish or leave', (path) => {
    expect(isAlwaysAllowedPath(path)).toBe(true);
    expect(isForcedChangeGatedPath(path)).toBe(false);
  });

  it.each([
    '/dashboard',
    '/dashboard/',
    '/dashboard/anything',
    '/profile',
    '/admin/users',
    '/meet/session/abc',
    '/consultor/sessions',
    '/courses/123/lesson/4',
    '/school/transversal-context',
  ])('%s is gated', (path) => {
    expect(isForcedChangeGatedPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/login',
    '/registro',
    '/registro-tractor',
    '/nosotros',
    '/programas',
    '/pasantias',
    '/privacidad',
    '/vias-transformacion',
    '/noticias',
    '/noticias/algo',
    '/pending-approval',
    '/403',
  ])('%s is NOT gated — the public site must stay reachable', (path) => {
    expect(isForcedChangeGatedPath(path)).toBe(false);
  });

  it('/reset-password is not gated, on purpose', () => {
    // S12 makes that page demand a real recovery credential, so an ordinary
    // session sees an invalid-link screen rather than a usable form. Gating it
    // would strand exactly the people who need it: a user who never received,
    // or has lost, the temporary password they are being forced to change.
    expect(isForcedChangeGatedPath('/reset-password')).toBe(false);
  });

  it('APIs are gated by DEFAULT — a new endpoint is protected the day it is written', () => {
    expect(isForcedChangeGatedPath('/api/some-endpoint-that-does-not-exist-yet')).toBe(true);
    expect(isForcedChangeGatedPath('/api/sessions/123')).toBe(true);
    expect(isForcedChangeGatedPath('/api/admin/users')).toBe(true);
    expect(isApiPath('/api/anything')).toBe(true);
    expect(isApiPath('/apifoo')).toBe(false);
  });

  it('a prefix does not leak into a longer sibling name', () => {
    // `/user` is gated; `/username-something` is not a path under it.
    expect(isForcedChangeGatedPath('/user')).toBe(true);
    expect(isForcedChangeGatedPath('/user/settings')).toBe(true);
    expect(isForcedChangeGatedPath('/usernames')).toBe(false);
  });

  it('requiresSessionPresence covers only the ORIGINAL five prefixes', () => {
    // The broadened matcher must not start bouncing anonymous visitors off
    // pages that used to render for them.
    expect(requiresSessionPresence('/admin/users')).toBe(true);
    expect(requiresSessionPresence('/community/workspace/1')).toBe(true);
    expect(requiresSessionPresence('/school/change-history')).toBe(true);
    expect(requiresSessionPresence('/meet/session/1')).toBe(true);
    expect(requiresSessionPresence('/consultor')).toBe(true);

    expect(requiresSessionPresence('/dashboard')).toBe(false);
    expect(requiresSessionPresence('/profile')).toBe(false);
    expect(requiresSessionPresence('/api/sessions')).toBe(false);
    expect(requiresSessionPresence('/community/posts')).toBe(false);
  });
});

describe('verdictFromProfile — the fail-closed decision', () => {
  it('flag true → required', () => {
    expect(verdictFromProfile({ must_change_password: true }, null)).toBe('required');
  });

  it.each([
    ['false', false],
    ['null', null],
    ['absent', undefined],
  ])('flag %s → allowed', (_label, value) => {
    expect(verdictFromProfile({ must_change_password: value as never }, null)).toBe('allowed');
  });

  it('a lookup ERROR → unavailable (fail closed)', () => {
    expect(verdictFromProfile(null, { message: 'connection reset' })).toBe('unavailable');
    // Even when a row came back, an error wins.
    expect(verdictFromProfile({ must_change_password: false }, { message: 'boom' })).toBe(
      'unavailable'
    );
  });

  it('a SUCCESSFUL lookup with no row → allowed', () => {
    // Mirrors the project's roles convention (Z1a): a successful query is
    // authoritative. A profile row can legitimately be absent for a moment
    // after sign-up, and locking that account out would be a defect.
    expect(verdictFromProfile(null, null)).toBe('allowed');
  });

  it('maps verdicts onto the right status and redirect', () => {
    expect(forcedChangeApiStatus('required')).toBe(403);
    expect(forcedChangeApiStatus('unavailable')).toBe(503);
    expect(forcedChangeRedirectPath('required')).toBe(FORCED_CHANGE_PATH);
    expect(forcedChangeRedirectPath('unavailable')).toContain('estado=no-verificado');
  });
});

// ---------------------------------------------------------------------------
// The middleware, per role
// ---------------------------------------------------------------------------

describe('a flagged user reaches nothing but the escape hatches — all nine roles', () => {
  it.each(ALL_ROLES)('%s: /dashboard redirects to /change-password', async (role) => {
    const res = await run(
      '/dashboard',
      buildSupabase({ session: SESSION, roles: [{ role_type: role }], mustChangePassword: true })
    );
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe(`http://localhost${FORCED_CHANGE_PATH}`);
  });

  it.each(ALL_ROLES)('%s: a direct API call is refused with a machine-readable code', async (role) => {
    const res = await run(
      '/api/sessions',
      buildSupabase({ session: SESSION, roles: [{ role_type: role }], mustChangePassword: true })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe(PASSWORD_CHANGE_REQUIRED_CODE);
    // es-CL, because this reaches the user through a toast.
    expect(body.error).toBe('Debes cambiar tu contraseña antes de continuar.');
  });

  it.each(ALL_ROLES)('%s: reaches /change-password itself', async (role) => {
    const supabase = buildSupabase({
      session: SESSION,
      roles: [{ role_type: role }],
      mustChangePassword: true,
    });
    const res = await run(FORCED_CHANGE_PATH, supabase);
    expect(isRedirect(res)).toBe(false);
    // Step 0 returns before any client is built, so not even a session lookup
    // happens — nothing below can make this page unreachable.
    expect(createMiddlewareClient).not.toHaveBeenCalled();
  });

  it.each(ALL_ROLES)('%s: can still log out', async (role) => {
    const supabase = buildSupabase({
      session: SESSION,
      roles: [{ role_type: role }],
      mustChangePassword: true,
    });
    for (const path of ['/logout', '/api/auth/logout', '/login']) {
      createMiddlewareClient.mockReset();
      const res = await run(path, supabase);
      expect(isRedirect(res)).toBe(false);
      expect(res.status).toBe(200);
    }
  });

  it.each(ALL_ROLES)('%s: can reach the endpoint that completes the change', async (role) => {
    const supabase = buildSupabase({
      session: SESSION,
      roles: [{ role_type: role }],
      mustChangePassword: true,
    });
    for (const path of ['/api/auth/force-password-change', '/api/auth/change-password']) {
      createMiddlewareClient.mockReset();
      const res = await run(path, supabase);
      expect(res.status).toBe(200);
    }
  });
});

describe('direct URL navigation cannot skip the gate', () => {
  it.each(GATED_PAGE_PREFIXES)('%s redirects a flagged user', async (prefix) => {
    const res = await run(
      prefix,
      buildSupabase({ session: SESSION, roles: [{ role_type: 'admin' }], mustChangePassword: true })
    );
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe(`http://localhost${FORCED_CHANGE_PATH}`);
  });

  it('an ADMIN is gated too — the role that would otherwise pass every check', async () => {
    // /admin has its own role gate that returns early for admins. The forced
    // change runs BEFORE it, which is the ordering that matters.
    const supabase = buildSupabase({
      session: SESSION,
      roles: [{ role_type: 'admin' }],
      mustChangePassword: true,
    });
    const res = await run('/admin/schools', supabase);
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe(`http://localhost${FORCED_CHANGE_PATH}`);
    // The role lookup never ran: the gate short-circuits before it.
    expect(supabase.from).not.toHaveBeenCalledWith('user_roles');
  });

  it('/meet and /consultor are gated — they used to return before every check', async () => {
    for (const path of ['/meet/session/abc', '/consultor/sessions']) {
      const res = await run(
        path,
        buildSupabase({ session: SESSION, roles: [], mustChangePassword: true })
      );
      expect(isRedirect(res)).toBe(true);
      expect(res.headers.get('location')).toBe(`http://localhost${FORCED_CHANGE_PATH}`);
    }
  });
});

describe('an unflagged user is unaffected', () => {
  it.each(ALL_ROLES)('%s reaches /dashboard', async (role) => {
    const res = await run(
      '/dashboard',
      buildSupabase({ session: SESSION, roles: [{ role_type: role }], mustChangePassword: false })
    );
    expect(isRedirect(res)).toBe(false);
  });

  it.each(ALL_ROLES)('%s reaches an API', async (role) => {
    const res = await run(
      '/api/sessions',
      buildSupabase({ session: SESSION, roles: [{ role_type: role }], mustChangePassword: false })
    );
    expect(res.status).toBe(200);
  });

  it('a missing profile row does not lock the account out', async () => {
    const res = await run(
      '/dashboard',
      buildSupabase({ session: SESSION, profileMissing: true })
    );
    expect(isRedirect(res)).toBe(false);
  });
});

describe('session invalidation and expiry', () => {
  it('an expired/absent session on a legacy prefix still redirects to /login, not /change-password', async () => {
    const res = await run(
      '/admin/users',
      buildSupabase({ session: null, roles: null, mustChangePassword: true })
    );
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toContain('/login?next=');
  });

  it('an absent session never triggers a profile lookup', async () => {
    const supabase = buildSupabase({ session: null, roles: null });
    await run('/api/sessions', supabase);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('an absent session on a NEWLY matched page keeps its previous behaviour', async () => {
    // The matcher grew to cover /dashboard, /profile and the rest. For an
    // anonymous visitor those must behave exactly as they did before this
    // commit — no new server-side redirect. Their client-side gating is
    // unchanged and separately owned.
    for (const path of ['/dashboard', '/profile', '/courses/1']) {
      const res = await run(path, buildSupabase({ session: null, roles: null }));
      expect(isRedirect(res)).toBe(false);
      expect(res.status).toBe(200);
    }
  });

  it('an absent session on a public API is untouched — cron, webhooks, signup forms', async () => {
    for (const path of ['/api/cron/session-reminders', '/api/zoom/webhook', '/api/registro-signup']) {
      const supabase = buildSupabase({ session: null, roles: null });
      const res = await run(path, supabase);
      expect(res.status).toBe(200);
      expect(supabase.from).not.toHaveBeenCalled();
    }
  });
});

describe('the gate fails closed when it cannot read the flag', () => {
  it('a page gets a redirect carrying the loop-breaking marker', async () => {
    const res = await run(
      '/dashboard',
      buildSupabase({ session: SESSION, profileError: { message: 'connection reset' } })
    );
    expect(isRedirect(res)).toBe(true);
    const location = res.headers.get('location')!;
    expect(location).toContain(FORCED_CHANGE_PATH);
    // Without this marker /change-password would read the flag, find it clear,
    // push to /dashboard, and be bounced straight back for as long as the
    // database stayed unreachable.
    expect(location).toContain('estado=no-verificado');
  });

  it('an API gets 503 with a DISTINCT code, not the forced-change one', async () => {
    const res = await run(
      '/api/sessions',
      buildSupabase({ session: SESSION, profileError: { message: 'connection reset' } })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe(PASSWORD_STATE_UNAVAILABLE_CODE);
    expect(body.code).not.toBe(PASSWORD_CHANGE_REQUIRED_CODE);
  });

  it('logs the failure so the outage is visible', async () => {
    await run(
      '/dashboard',
      buildSupabase({ session: SESSION, profileError: { message: 'connection reset' } })
    );
    expect(console.error).toHaveBeenCalledWith(
      '[middleware] could not read must_change_password',
      expect.objectContaining({ pathname: '/dashboard' })
    );
  });

  it('does not lock a user out of /change-password itself', async () => {
    const res = await run(
      FORCED_CHANGE_PATH,
      buildSupabase({ session: SESSION, profileError: { message: 'connection reset' } })
    );
    expect(res.status).toBe(200);
    expect(isRedirect(res)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The matcher must actually cover what the predicate claims
// ---------------------------------------------------------------------------

describe('matcher coverage — a gate that never runs is not a gate', () => {
  it('every gated page prefix appears in the matcher', async () => {
    // Next.js analyses `config.matcher` at build time and ignores computed
    // values, so it has to be a literal — which means it can drift from the
    // predicate. Middleware that is never invoked for a path returns no
    // verdict at all, and the failure is silent.
    const { config } = await import('../middleware');
    for (const prefix of GATED_PAGE_PREFIXES) {
      expect(config.matcher).toContain(prefix);
      expect(config.matcher).toContain(`${prefix}/:path*`);
    }
  });

  it('the API catch-all is in the matcher', async () => {
    const { config } = await import('../middleware');
    expect(config.matcher).toContain('/api/:path*');
  });

  it('the matcher contains nothing that is not gated or legacy-gated', async () => {
    const { config } = await import('../middleware');
    const bare = config.matcher
      .filter((entry: string) => !entry.includes(':path*'))
      .filter((entry: string) => entry !== '/api');

    for (const entry of bare) {
      expect(
        isForcedChangeGatedPath(entry) || requiresSessionPresence(entry),
        `${entry} is matched by the middleware but governed by nothing`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// F1 — the middleware reads the flag through the ONE route the database gate
// leaves open, and the three places that have to agree on its name do agree.
// ---------------------------------------------------------------------------

describe('F1: the gate probe is the middleware read path', () => {
  const MIGRATION = readFileSync(
    join(__dirname, '..', 'supabase', 'migrations', '20260819120000_forced_password_change_boundary.sql'),
    'utf8'
  );

  it('the middleware calls the state RPC and never selects `profiles` itself', async () => {
    const supabase = buildSupabase({ session: SESSION, mustChangePassword: false });
    await run('/dashboard', supabase);

    expect(supabase.rpc).toHaveBeenCalledWith(PASSWORD_CHANGE_STATE_RPC);
    // The database gate refuses a flagged account's own `profiles` read, so a
    // direct select here would 403 for precisely the users this gate is for.
    expect(supabase.from).not.toHaveBeenCalledWith('profiles');
  });

  it('a flagged account is still held when the answer arrives over the RPC', async () => {
    const supabase = buildSupabase({ session: SESSION, mustChangePassword: true });
    const res = await run('/dashboard', supabase);

    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toContain(FORCED_CHANGE_PATH);
  });

  it('the migration creates the function the middleware calls, by that exact name', () => {
    expect(MIGRATION).toContain(`CREATE OR REPLACE FUNCTION public.${PASSWORD_CHANGE_STATE_RPC}()`);
  });

  it('the pre-request gate allow-lists that same function, and only it', () => {
    // The allowance is a path suffix match on `/rpc/<name>`. If the RPC name and
    // the allow-list drift, a flagged user cannot be told they are flagged.
    expect(MIGRATION).toContain(`'%/rpc/${PASSWORD_CHANGE_STATE_RPC}'`);

    const allowances = MIGRATION.match(/'%\/rpc\/[a-z_]+'/g) ?? [];
    expect(allowances).toEqual([`'%/rpc/${PASSWORD_CHANGE_STATE_RPC}'`]);
  });

  it('the gate is actually installed on the authenticator role', () => {
    expect(MIGRATION).toContain('pgrst.db_pre_request');
    expect(MIGRATION).toContain('public.gate_password_change');
    expect(MIGRATION).toContain("NOTIFY pgrst, 'reload config'");
  });

  it('the migration disables no row-level security anywhere', () => {
    expect(MIGRATION.toUpperCase()).not.toContain('DISABLE ROW LEVEL SECURITY');
  });

  it('the flag column is protected by a trigger, not only by a policy', () => {
    expect(MIGRATION).toContain('CREATE TRIGGER protect_must_change_password');
    expect(MIGRATION).toContain('BEFORE UPDATE ON public.profiles');
    expect(MIGRATION).toContain("current_user IN ('authenticated', 'anon')");
  });
});
