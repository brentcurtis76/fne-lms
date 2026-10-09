import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  forcedChangeApiBody,
  forcedChangeApiStatus,
  forcedChangeRedirectPath,
  isAlwaysAllowedPath,
  isApiPath,
  isForcedChangeGatedPath,
  PASSWORD_CHANGE_STATE_RPC,
  requiresSessionPresence,
  verdictFromProfile,
} from './lib/auth/forced-password-change';

/** W-B10c-01b: what a gated API answers when the auth server rejects the cookie's token. */
const INVALID_SESSION_API_BODY = {
  error: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  code: 'SESSION_INVALID',
};

/**
 * Supabase auth cookies: `sb-<ref>-auth-token`, chunked as `.0`, `.1`, … when
 * the session is large. Only these are expired; nothing else the browser holds.
 */
const AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

function expireAuthCookies(req: NextRequest, response: NextResponse): NextResponse {
  for (const { name } of req.cookies.getAll()) {
    if (AUTH_COOKIE_PATTERN.test(name)) {
      response.cookies.set(name, '', { path: '/', maxAge: 0 });
    }
  }
  return response;
}

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

  // W-B10c-01b: the cookie supplies only the access token. Its stored `user` is
  // client-controlled (auth-helpers accepts a legacy JSON session object as-is),
  // so a lower-role caller could pair their own valid token with a cookie that
  // names an admin and have the role lookups below run for the admin's id. The
  // identity used for every decision comes from the auth server instead, as in
  // lib/api-auth.ts. Never fall back to the cookie's user.
  let userId: string | null = null;
  let invalidSession = false;
  if (session) {
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      session.access_token
    );
    if (!userError && user) {
      userId = user.id;
    } else if (isAuthRetryableFetchError(userError)) {
      // The auth server could not be reached, so we cannot tell who this is.
      // Same fail-closed answer as an unreadable forced-change flag: the retry
      // panel for pages, 503 for APIs. The cookie is kept — it may be fine.
      console.error('[middleware] session verification unavailable', {
        pathname,
        error: userError?.message,
      });
      if (isApiPath(pathname)) {
        return new NextResponse(JSON.stringify(forcedChangeApiBody('unavailable')), {
          status: forcedChangeApiStatus('unavailable'),
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      return NextResponse.redirect(new URL(forcedChangeRedirectPath('unavailable'), req.url));
    } else {
      // The auth server rejects the token: a forged, revoked or otherwise dead
      // cookie. APIs refuse it outright — falling through as anonymous would let
      // a route that still reads the cookie's user act on it. Pages treat the
      // caller as signed out AND expire the cookie, otherwise the login page
      // would see the leftover session and bounce straight back here.
      console.warn('[middleware] session verification failed', {
        pathname,
        error: (userError as { message?: string } | null)?.message ?? 'no user',
      });
      if (isApiPath(pathname)) {
        return expireAuthCookies(
          req,
          new NextResponse(JSON.stringify(INVALID_SESSION_API_BODY), {
            status: 401,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          })
        );
      }
      invalidSession = true;
    }
  }

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
  if (!userId) {
    if (!requiresSessionPresence(pathname)) {
      return invalidSession ? expireAuthCookies(req, res) : res;
    }
    const destination = `${pathname}${req.nextUrl.search}`;
    const toLogin = NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(destination)}`, req.url)
    );
    return invalidSession ? expireAuthCookies(req, toLogin) : toLogin;
  }

  // --- S4 STEP 1: forced password change --------------------------------------
  // Runs before every authorization branch below, including the
  // session-presence-only early return, because a user who must change their
  // password must not reach ANY of them. This is the whole point: the flag used
  // to be read on the /login redirect and nowhere else, so direct navigation,
  // a direct API call, or simply already having a session bypassed it entirely.
  //
  // One RPC per gated authenticated request, on the USER-scoped middleware
  // client — no service-role key is used in middleware. It calls
  // `public.current_password_change_state()`, which takes no argument and reads
  // `auth.uid()`, so it can only ever report on the caller.
  //
  // It is an RPC rather than a `profiles` SELECT because the database gate
  // added in 20260819120000 refuses EVERY PostgREST request from a flagged
  // account — including a read of its own profile row. This one function is the
  // single route that gate leaves open, precisely so the middleware can still
  // ask the question whose answer is "you are being held". A direct
  // `.from('profiles')` here would 403 for exactly the users the gate is for,
  // and the middleware would read that as `unavailable` and park everybody on
  // the retry panel instead of the change-password form.
  if (isForcedChangeGatedPath(pathname)) {
    const { data: flag, error } = await supabase.rpc(
      PASSWORD_CHANGE_STATE_RPC
    );

    const verdict = verdictFromProfile(
      error ? null : { must_change_password: flag === true },
      error
    );

    if (verdict !== 'allowed') {
      if (error) {
        console.error('[middleware] could not read must_change_password', {
          user_id: userId,
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
      .eq('user_id', userId)
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
      .eq('user_id', userId)
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
        .eq('user_id', userId)
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
    '/configuracion', '/configuracion/:path*',
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
