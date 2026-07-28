import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;

  // No session → login, carrying the destination so a deep link survives the
  // bounce instead of dumping everyone on /dashboard. The value is echoed back
  // by an attacker-controllable URL, so the login page runs it through
  // `resolveSafeInternalPath` before navigating anywhere.
  //
  // Only the *unauthenticated* redirect gets `next`. The authorization
  // redirects further down deliberately do not: replaying a destination the
  // user is not allowed to reach would just loop them back into a denial.
  if (!session) {
    const destination = `${pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(destination)}`, req.url)
    );
  }

  // --- SESSION-PRESENCE-ONLY ROUTES ---
  // `/meet` re-checks authorization in its own getServerSideProps
  // (`resolveMeetSessionAccess`), and `/consultor` is still client-side gated —
  // SSR role gating for it is separately ticketed. Both need nothing from this
  // layer beyond "is there a session?", so they return before any role lookup
  // and cost zero DB round-trips here.
  if (
    pathname === '/meet' ||
    pathname.startsWith('/meet/') ||
    pathname === '/consultor' ||
    pathname.startsWith('/consultor/')
  ) {
    return res;
  }

  // --- ADMIN ROUTES ---
  if (pathname.startsWith('/admin')) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type, community_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const roles = userRoles?.map(r => r.role_type) || [];

    // Admin gets full access
    if (roles.includes('admin')) {
      return res;
    }

    // Community Manager: only news and events
    const cmRoutes = ['/admin/news', '/admin/events'];
    if (roles.includes('community_manager') && cmRoutes.some(r => pathname.startsWith(r))) {
      return res;
    }

    // Consultor: assessment builder, assignments, overview
    const consultorRoutes = ['/admin/assessment-builder', '/admin/consultant-assignments', '/admin/assignment-overview'];
    if (roles.includes('consultor') && consultorRoutes.some(r => pathname.startsWith(r))) {
      return res;
    }

    // Equipo directivo: growth communities + school users management
    // Accept both trailing-slash forms. Next.js's default trailingSlash is false,
    // but we don't want this gate to silently break if that config flips.
    // Nested routes (/admin/school-users/...) are intentionally NOT matched —
    // they would need explicit allow-listing here AND their own ED scope check.
    const onSchoolUsers =
      pathname === '/admin/school-users' || pathname === '/admin/school-users/';
    if (
      roles.includes('equipo_directivo') &&
      (pathname.startsWith('/admin/growth-communities') || onSchoolUsers)
    ) {
      return res;
    }

    // Everyone else → redirect to dashboard
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // --- COMMUNITY WORKSPACE ROUTES ---
  if (pathname.startsWith('/community/workspace')) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type, community_id')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const roles = userRoles?.map(r => r.role_type) || [];
    const hasCommunity = userRoles?.some(r => r.community_id != null) || false;

    // Admin always has access
    if (roles.includes('admin')) {
      return res;
    }

    // Everyone else needs a community_id
    if (!hasCommunity) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // --- SCHOOL-SCOPED ROUTES ---
  // For school pages with a school_id query param,
  // verify equipo_directivo can only access their own school
  const schoolScopedPrefixes = [
    '/school/transversal-context',
    '/school/change-history',
    '/school/completion-status',
  ];
  if (schoolScopedPrefixes.some(prefix => pathname.startsWith(prefix))) {
    const requestedSchoolId = req.nextUrl.searchParams.get('school_id');

    if (requestedSchoolId) {
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const roles = userRoles?.map(r => r.role_type) || [];

      // Admin and consultor can access any school
      if (roles.includes('admin') || roles.includes('consultor')) {
        return res;
      }

      // equipo_directivo: only their own school
      const userSchoolIds = userRoles
        ?.filter(r => r.school_id != null)
        .map(r => String(r.school_id)) || [];

      if (!userSchoolIds.includes(requestedSchoolId)) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/community/workspace/:path*',
    '/school/:path*',
    // Session-presence only — see the early return above.
    '/meet/:path*',
    '/consultor/:path*',
  ]
};
