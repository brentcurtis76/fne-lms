// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type Role = { role_type: string; community_id?: string | null };

const createMiddlewareClient = vi.fn();

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createMiddlewareClient: (...args: unknown[]) => createMiddlewareClient(...args),
}));

function buildSupabase(opts: { session: unknown; roles: Role[] | null }) {
  const eqInner = vi.fn().mockResolvedValue({ data: opts.roles });
  const eqOuter = vi.fn(() => ({ eq: eqInner }));
  const select = vi.fn(() => ({ eq: eqOuter }));
  const from = vi.fn(() => ({ select }));
  const getSession = vi.fn().mockResolvedValue({ data: { session: opts.session } });
  return { auth: { getSession }, from };
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

  it('redirects to /login when there is no session', async () => {
    createMiddlewareClient.mockReturnValue(buildSupabase({ session: null, roles: null }));
    const { middleware } = await import('../middleware');
    const res = await middleware(new NextRequest('http://localhost/admin/growth-communities'));
    expect(isRedirect(res)).toBe(true);
    expect(res.headers.get('location')).toBe('http://localhost/login');
  });
});
