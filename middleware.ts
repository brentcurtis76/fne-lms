import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  forcedChangeApiBody,
  forcedChangeApiStatus,
  forcedChangeRedirectPath,
  isAlwaysAllowedPath,
  isApiPath,
  isForcedChangeGatedPath,
  requiresSessionPresence,
  verdictFromProfile,
} from './lib/auth/forced-password-change';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // --- S4 STEP 0: the escape hatches ------------------------------------------
  // The page a flagged user is sent to, the endpoints that complete the change,
  // and the way out. Checked before anything else — including before we look for
  // a session — so no failure below can make `/change-password` unreachable and
  // turn the gate into a lockout. See lib/auth/forced-password-change.ts.
  if (isAlwaysAllowedPath(pathname)) {
    return res;
  }

  const supabase = createMiddlewareClient({ req, res });

  const { data: { session } } = await supabase.auth.getSession();

  // No session → login, carrying the destination so a deep link survives the
  // bounce instead of dumping everyone on /dashboard. The value is echoed back
  // by an attacker-controllable URL, so the login page runs it through
  // `resolveSafeInternalPath` before navigating anywhere.
  //
  // Only the *unauthenticated* redirect gets `next`. The authorization
  // redirects further down deliberately do not: replaying a destination the
  // user is not allowed to reach would just loop them back into a denial.
  //
  // S4: the matcher is now much broader than the five prefixes that used to be
  // gated, so this branch is scoped to `requiresSessionPresence` — the ORIGINAL
  // five. Every prefix added for the forced-change gate keeps exactly the
  // anonymous behaviour it had before (client-side gating, or public). Nothing
  // a logged-out visitor sees changes anywhere in this commit.
  if (!session) {
    if (!requiresSessionPresence(pathname)) {
      return res;
    }
    const destination = `${pathname}${req.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(destination)}`, req.url)
    );
  }

  // --- S4 STEP 1: forced password change --------------------------------------
  // Runs before every authorization branch below, including the
  // session-presence-only early return, because a user who must change their
  // password must not reach ANY of them. This is the whole point: the flag used
  // to be read on the /login redirect and nowhere else, so direct navigation,
  // a direct API call, or simply already having a session bypassed it entirely.
  //
  // One indexed read per gated authenticated request (there is a partial index
  // on `must_change_password = true`). The client here is the USER-scoped
  // middleware client, so the read goes through RLS — a user reading their own
  // profile row, which the existing policy already permits. No service-role key
  // is used in middleware.
  if (isForcedChangeGatedPath(pathname)) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('id', session.user.id)
      .maybeSingle();

    const verdict = verdictFromProfile(profile, error);

    if (verdict !== 'allowed') {
      if (error) {
        console.error('[middleware] could not read must_change_password', {
          user_id: session.user.id,
          pathname,
          error: (error as { message?: string })?.message ?? String(error),
        });
      }

      if (isApiPath(pathname)) {
        return new NextResponse(JSON.stringify(forcedChangeApiBody(verdict)), {
          status: forcedChangeApiStatus(verdict),
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      return NextResponse.redirect(new URL(forcedChangeRedirectPath(verdict), req.url));
    }
  }

  // Everything below is the pre-existing authorization layer, unchanged. It only
  // ever inspects the five original prefixes, so the broader matcher adds no
  // role lookups for the paths that were not previously matched.

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

/**
 * Next.js requires these to be literal constants — it analyses them at build
 * time and ignores anything computed. So the list below is written out rather
 * than derived from `GATED_PAGE_PREFIXES`, and
 * `__tests__/middleware.forced-password-change.test.ts` asserts the two agree.
 * A prefix that is gated in the predicate but missing here is a gate that
 * silently never runs.
 *
 * Both forms are listed for each prefix (`/x` and `/x/:path*`) rather than
 * relying on `:path*` matching the bare path, so the coverage is obvious to a
 * reader and independent of path-to-regexp semantics.
 */
export const config = {
  matcher: [
    // Every API route. Gated by default (S4) — a new endpoint is protected the
    // day it is written. Unauthenticated requests fall straight through, so
    // public forms, cron routes and provider webhooks are unaffected.
    '/api/:path*',

    // Authenticated application pages.
    '/admin', '/admin/:path*',
    '/assignments', '/assignments/:path*',
    '/community', '/community/:path*',
    '/consultor', '/consultor/:path*',
    '/contract-print', '/contract-print/:path*',
    '/contracts', '/contracts/:path*',
    '/course-manager', '/course-manager/:path*',
    '/courses', '/courses/:path*',
    '/creador-de-cursos', '/creador-de-cursos/:path*',
    '/dashboard', '/dashboard/:path*',
    '/dashboard-old', '/dashboard-old/:path*',
    '/debug-feedback-permissions', '/debug-feedback-permissions/:path*',
    '/detailed-reports', '/detailed-reports/:path*',
    '/directivo', '/directivo/:path*',
    '/docente', '/docente/:path*',
    '/equipo', '/equipo/:path*',
    '/expense-reports', '/expense-reports/:path*',
    '/licitaciones', '/licitaciones/:path*',
    '/meet', '/meet/:path*',
    '/mi-aprendizaje', '/mi-aprendizaje/:path*',
    '/mis-horas', '/mis-horas/:path*',
    '/my-paths', '/my-paths/:path*',
    '/notifications', '/notifications/:path*',
    '/profile', '/profile/:path*',
    '/qa', '/qa/:path*',
    '/quiz-reviews', '/quiz-reviews/:path*',
    '/reporte-horas', '/reporte-horas/:path*',
    '/reports', '/reports/:path*',
    '/school', '/school/:path*',
    '/student', '/student/:path*',
    '/user', '/user/:path*',
  ]
};
