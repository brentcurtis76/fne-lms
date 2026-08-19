// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Role = { role_type: string; community_id?: string | null };

const createMiddlewareClient = vi.fn();

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: (...args: unknown[]) => createMiddlewareClient(...args),
}));

/**
 * S4 added a `profiles` read to the middleware, so the stub has to answer two
 * differently shaped queries:
 *
 *   user_roles  from().select().eq().eq()            -> { data: roles }
 *   profiles    from().select().eq().maybeSingle()   -> { data: profile, error }
 *
 * `mustChangePassword` defaults to false so every pre-existing test keeps
 * asserting what it always asserted: with the flag clear, the gate is
 * transparent and the authorization layer below behaves exactly as before.
 */
function buildSupabase(opts: {
  session: unknown;
  roles: Role[] | null;
  mustChangePassword?: boolean | null;
  profileError?: unknown;
  profileMissing?: boolean;
}) {
  const rolesEqInner = vi.fn().mockResolvedValue({ data: opts.roles });
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

  // F1: the gate probe. The middleware reads the flag through
  // `current_password_change_state()` rather than a `profiles` SELECT, because
  // the database pre-request gate refuses a flagged account's own profile read.
  const rpc = vi.fn().mockResolvedValue({
    data: opts.profileError ? null : opts.profileMissing ? false : opts.mustChangePassword ?? false,
    error: opts.profileError ?? null,
  });

  const getSession = vi.fn().mockResolvedValue({ data: { session: opts.session } });
  return { auth: { getSession }, from, rpc };
}

const SESSION = { user: { id: 'user-uuid-1' } };

function isRedirect(res: Response): boolean {
  return res.status === 307 || res.status === 308;
}

beforeEach(() => {
  createMiddlewareClient.mockReset();
});

describe('middleware admin route gating', () => {
  it('allows equipo_directivo to access /admin/growth-communities', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'equipo_directivo' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/growth-communities'));
    expect(isRedirect(res)).toBe(false);
  });

  it('allows equipo_directivo to access nested /admin/growth-communities/abc/members', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'equipo_directivo' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(
      new NextRequest('http://localhost/admin/growth-communities/abc/members')
    );
    expect(isRedirect(res)).toBe(false);
  });

  it('redirects equipo_directivo away from /admin/users to /dashboard', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'equipo_directivo' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/users'));
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('still allows admin to access /admin/growth-communities', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'admin' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/growth-communities'));
    expect(isRedirect(res)).toBe(false);
  });

  it('still allows consultor to access /admin/assessment-builder', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'consultor' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/assessment-builder'));
    expect(isRedirect(res)).toBe(false);
  });

  it('allows equipo_directivo to access exact /admin/school-users', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'equipo_directivo' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/school-users'));
    expect(isRedirect(res)).toBe(false);
  });

  it('redirects equipo_directivo away from nested /admin/school-users/foo', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'equipo_directivo' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/school-users/foo'));
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('redirects equipo_directivo away from deeper nested /admin/school-users/123/edit', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'equipo_directivo' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(
      new NextRequest('http://localhost/admin/school-users/123/edit')
    );
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('still allows admin to access nested /admin/school-users/foo', async () => {
    createMiddlewareClient.mockReturnValue(
      buildSupabase({ session: SESSION, roles: [{ role_type: 'admin' }] })
    );
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/school-users/foo'));
    expect(isRedirect(res)).toBe(false);
  });

  it('redirects to /login when there is no session', async () => {
    createMiddlewareClient.mockReturnValue(buildSupabase({ session: null, roles: null }));
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/growth-communities'));
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe(
      'http://localhost/login?next=%2Fadmin%2Fgrowth-communities'
    );
  });
});

const MEET_PATH = '/meet/session/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';
const CONSULTOR_PATH = '/consultor/sessions/3f1c5f5e-0f1a-4d3e-9a11-2b6c8f0d1e22';

describe('middleware next= round-trip for unauthenticated requests', () => {
  async function redirectFor(url: string): Promise<string | null> {
    createMiddlewareClient.mockReturnValue(buildSupabase({ session: null, roles: null }));
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest(url));
    expect(isRedirect(res)).toBe(true);
    return res.headers.get('location');
  }

  it('carries a /meet deep link through the login bounce', async () => {
    expect(await redirectFor(`http://localhost${MEET_PATH}`)).toBe(
      `http://localhost/login?next=${encodeURIComponent(MEET_PATH)}`
    );
  });

  it('carries a /consultor deep link through the login bounce', async () => {
    expect(await redirectFor(`http://localhost${CONSULTOR_PATH}`)).toBe(
      `http://localhost/login?next=${encodeURIComponent(CONSULTOR_PATH)}`
    );
  });

  it('carries an /admin deep link through the login bounce', async () => {
    expect(await redirectFor('http://localhost/admin/assessment-builder/42')).toBe(
      `http://localhost/login?next=${encodeURIComponent('/admin/assessment-builder/42')}`
    );
  });

  it('preserves the query string of the original destination', async () => {
    const destination = '/school/completion-status?school_id=7&tab=resumen';
    expect(await redirectFor(`http://localhost${destination}`)).toBe(
      `http://localhost/login?next=${encodeURIComponent(destination)}`
    );
  });

  it('encodes the destination so it cannot inject extra login query params', async () => {
    const location = await redirectFor('http://localhost/admin/x?a=1#frag');
    // Everything after `next=` must be a single opaque value: no bare `&`, `?`
    // or `#` may survive into the login URL's own query string.
    const query = new URL(location as string).search;
    expect(query.startsWith('?next=')).toBe(true);
    expect(query.slice('?next='.length)).not.toMatch(/[&?#]/);
  });

  it('redirects mid-flight when a session is revoked on a previously reachable route', async () => {
    // Session-invalidation case: the user was authorized a moment ago, the
    // cookie no longer resolves to a session, and the very next navigation
    // must bounce to login instead of falling through to the route.
    const supabase = buildSupabase({ session: null, roles: null });
    createMiddlewareClient.mockReturnValue(supabase);
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/community/workspace/tareas'));

    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe(
      `http://localhost/login?next=${encodeURIComponent('/community/workspace/tareas')}`
    );
    // No session ⇒ no reason to ask the database anything.
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('middleware session-presence-only routes', () => {
  it.each([
    ['/meet root', '/meet'],
    ['/meet session', MEET_PATH],
    ['/consultor root', '/consultor'],
    ['/consultor session', CONSULTOR_PATH],
    ['/consultor nested', '/consultor/sessions/abc/edit'],
  ])('lets an authenticated user through %s without any role lookup', async (_label, path) => {
    // These prefixes are gated by their own SSR/client checks, so the
    // middleware must not spend a ROLE lookup on them.
    //
    // S4: it does now read `profiles` here, deliberately — a user who must
    // change their password must not reach /meet or /consultor either, and
    // those were previously the two prefixes that returned before every check.
    const supabase = buildSupabase({ session: SESSION, roles: null });
    createMiddlewareClient.mockReturnValue(supabase);
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest(`http://localhost${path}`));

    expect(isRedirect(res)).toBe(false);
    expect(supabase.from).not.toHaveBeenCalledWith('user_roles');
  });

  it('lets a role-less authenticated user reach /meet', async () => {
    // Roles are irrelevant here by design: /meet decides for itself.
    const supabase = buildSupabase({ session: SESSION, roles: [] });
    createMiddlewareClient.mockReturnValue(supabase);
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest(`http://localhost${MEET_PATH}`));

    expect(isRedirect(res)).toBe(false);
    expect(supabase.from).not.toHaveBeenCalledWith('user_roles');
  });

  it('still runs the /admin role lookup (the exemption is prefix-scoped)', async () => {
    const supabase = buildSupabase({
      session: SESSION,
      roles: [{ role_type: 'equipo_directivo' }],
    });
    createMiddlewareClient.mockReturnValue(supabase);
    const { middleware } = await import('../middleware');
    await middleware(new NextRequest('http://localhost/admin/users'));

    expect(supabase.from).toHaveBeenCalledWith('user_roles');
  });
});

describe('middleware matcher', () => {
  it('still covers the five originally gated prefixes', async () => {
    // S4 broadened the matcher from five prefixes to every API route plus the
    // authenticated page tree. This asserts the ORIGINAL five survived that
    // broadening; the new coverage is asserted (against the predicate, so the
    // two cannot drift) in __tests__/middleware.forced-password-change.test.ts.
    const { config } = await import('../middleware');
    for (const original of [
      '/admin/:path*',
      '/community/:path*',
      '/school/:path*',
      '/meet/:path*',
      '/consultor/:path*',
    ]) {
      expect(config.matcher).toContain(original);
    }
  });
});
