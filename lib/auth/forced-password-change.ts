/**
 * S4 — the forced-password-change gate.
 *
 * WHAT WAS BROKEN. `profiles.must_change_password` was advisory. Exactly one
 * surface read it — `pages/login.tsx`, which redirected to `/change-password`
 * after a successful sign-in — and `pages/change-password.tsx`, which would
 * bounce you to `/dashboard` if the flag was false. That is a suggestion, not a
 * gate:
 *
 *   - navigate straight to `/dashboard` (or any other page) and nothing checked,
 *   - call any API directly and nothing checked,
 *   - a session established before the flag was set kept working indefinitely,
 *   - and `/login` only checks on the sign-in it handles, so a user who already
 *     had a session never passed through the check at all.
 *
 * So a temporary credential issued by an administrator, or the initial password
 * of a bulk-imported account, was in practice a permanent one.
 *
 * THIS MODULE holds the pure routing predicates. `middleware.ts` holds the
 * session and database work. Splitting them is what makes the decision table
 * testable per role and per path without standing up an Edge runtime, and what
 * lets a test assert that the middleware's `matcher` actually covers every path
 * the gate claims to govern — a matcher that misses a prefix is a gate that
 * silently does not run there.
 *
 * FAIL-CLOSED. A profile lookup that ERRORS blocks the request. A lookup that
 * SUCCEEDS and returns no row does not: that mirrors the project's established
 * roles convention (Z1a — "a SUCCESSFUL query is authoritative and final; zero
 * rows means zero roles"), and treating a missing profile as "must change" would
 * lock out an account in the window between sign-up and the profile trigger.
 */

/** Where a flagged user is sent, and the one page they can always reach. */
export const FORCED_CHANGE_PATH = '/change-password';

/**
 * Marker appended when the gate could not READ the flag rather than finding it
 * set. `/change-password` renders a retry panel instead of the form for it, and
 * — this is the point — does not auto-redirect to `/dashboard`, which is what
 * would otherwise ping-pong against the middleware for as long as the database
 * stayed unreachable.
 */
export const FORCED_CHANGE_UNVERIFIED_PARAM = 'estado';
export const FORCED_CHANGE_UNVERIFIED_VALUE = 'no-verificado';

/** Machine-readable codes for API callers. */
export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';
export const PASSWORD_STATE_UNAVAILABLE_CODE = 'PASSWORD_STATE_UNAVAILABLE';

/** es-CL, because these reach the user through a toast or an error panel. */
export const PASSWORD_CHANGE_REQUIRED_MESSAGE =
  'Debes cambiar tu contraseña antes de continuar.';
export const PASSWORD_STATE_UNAVAILABLE_MESSAGE =
  'No pudimos verificar el estado de tu cuenta. Inténtalo nuevamente en unos momentos.';

/**
 * The minimum a flagged user must still be able to reach: the page that lets
 * them finish, the endpoints that complete the change, and the way out.
 *
 * `/login` is here because signing out lands there, and `/logout` because the
 * sign-out affordance on `/change-password` uses it. `/api/auth/session` is the
 * session probe the shell issues on load.
 *
 * NOT here, deliberately:
 *   - `/reset-password`. S12 makes that page demand a real recovery credential,
 *     so an ordinary session sees an invalid-link screen rather than a usable
 *     form; allowing it does not weaken this gate. It is allowed (by being
 *     absent from the gated list below) because a user who never received or
 *     has lost their temporary password needs the recovery flow to get in at
 *     all — and gating it would strand exactly those people.
 *   - `/api/auth/my-roles`. `/change-password` renders its own minimal shell
 *     with no sidebar, so it needs no role lookup.
 */
const ALWAYS_ALLOWED_EXACT = new Set<string>([
  FORCED_CHANGE_PATH,
  '/login',
  '/logout',
  '/api/auth/force-password-change',
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/session',
]);

/**
 * Page prefixes behind the gate. An explicit list rather than "everything that
 * is not public", because the public marketing site, the proposal viewer and
 * the public sign-up forms share the same `pages/` tree, and a flagged user
 * bounced off `/privacidad` would be a regression with no security value.
 *
 * A prefix matches the bare path and everything under it: `/dashboard`,
 * `/dashboard/`, `/dashboard/anything`.
 */
export const GATED_PAGE_PREFIXES: readonly string[] = [
  '/admin',
  '/assignments',
  '/community',
  '/consultor',
  '/contract-print',
  '/contracts',
  '/course-manager',
  '/courses',
  '/creador-de-cursos',
  '/dashboard',
  '/dashboard-old',
  '/debug-feedback-permissions',
  '/detailed-reports',
  '/directivo',
  '/docente',
  '/equipo',
  '/expense-reports',
  '/licitaciones',
  '/meet',
  '/mi-aprendizaje',
  '/mis-horas',
  '/my-paths',
  '/notifications',
  '/profile',
  '/qa',
  '/quiz-reviews',
  '/reporte-horas',
  '/reports',
  '/school',
  '/student',
  '/user',
];

/**
 * The prefixes whose UNAUTHENTICATED behaviour predates this gate: a visitor
 * with no session is redirected to `/login?next=…`. Everything else added to the
 * matcher for the gate keeps whatever it did before for anonymous visitors,
 * which is how this change can broaden the matcher without changing what a
 * logged-out person sees anywhere.
 */
export const SESSION_REQUIRED_PAGE_PREFIXES: readonly string[] = [
  '/admin',
  '/community/workspace',
  '/school',
  '/meet',
  '/consultor',
];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/** A flagged user may reach this path. */
export function isAlwaysAllowedPath(pathname: string): boolean {
  if (ALWAYS_ALLOWED_EXACT.has(pathname)) return true;
  // Tolerate the trailing-slash form: Next's default `trailingSlash` is false,
  // but a gate that silently stops allowing the change-password page if that
  // config ever flips is not a gate anybody wants to debug.
  if (pathname.endsWith('/') && ALWAYS_ALLOWED_EXACT.has(pathname.slice(0, -1))) {
    return true;
  }
  return false;
}

/**
 * Whether the forced-change gate governs this path.
 *
 * APIs are gated by DEFAULT — everything under `/api` except the allow-list
 * above. That is the fail-closed direction: a new endpoint is protected the day
 * it is written, and forgetting to add it to a list cannot leave it open.
 * Pages are gated by explicit prefix, because the same tree serves the public
 * site.
 */
export function isForcedChangeGatedPath(pathname: string): boolean {
  if (isAlwaysAllowedPath(pathname)) return false;
  if (isApiPath(pathname)) return true;
  return matchesPrefix(pathname, GATED_PAGE_PREFIXES);
}

/** Whether an unauthenticated visitor to this path is bounced to `/login`. */
export function requiresSessionPresence(pathname: string): boolean {
  return matchesPrefix(pathname, SESSION_REQUIRED_PAGE_PREFIXES);
}

export type ForcedChangeVerdict = 'allowed' | 'required' | 'unavailable';

/**
 * Turn a profile lookup result into a verdict.
 *
 * Extracted so the fail-closed decision is one testable function rather than a
 * conditional buried in the middleware:
 *
 *   error        → `unavailable`. Fail CLOSED. The alternative lets a flagged
 *                  account through during precisely the window an attacker
 *                  would want, and the cost — a short outage where nobody
 *                  reaches the app — is the same cost the app already pays when
 *                  its database is unreachable.
 *   no row       → `allowed`. A successful query is authoritative (Z1a). A
 *                  profile can legitimately be absent for a moment after
 *                  sign-up, and locking that account out would be a defect, not
 *                  a defence.
 *   flag true    → `required`.
 *   anything else→ `allowed`.
 */
export function verdictFromProfile(
  profile: { must_change_password?: boolean | null } | null | undefined,
  error: unknown
): ForcedChangeVerdict {
  if (error) return 'unavailable';
  if (!profile) return 'allowed';
  return profile.must_change_password === true ? 'required' : 'allowed';
}

/** The JSON body a gated API returns. */
export function forcedChangeApiBody(verdict: Exclude<ForcedChangeVerdict, 'allowed'>): {
  error: string;
  code: string;
} {
  return verdict === 'required'
    ? { error: PASSWORD_CHANGE_REQUIRED_MESSAGE, code: PASSWORD_CHANGE_REQUIRED_CODE }
    : { error: PASSWORD_STATE_UNAVAILABLE_MESSAGE, code: PASSWORD_STATE_UNAVAILABLE_CODE };
}

/** The HTTP status a gated API returns. */
export function forcedChangeApiStatus(
  verdict: Exclude<ForcedChangeVerdict, 'allowed'>
): number {
  // 403, not 401: the caller IS authenticated. A 401 would send well-behaved
  // clients into a re-authentication loop that cannot possibly clear the flag.
  return verdict === 'required' ? 403 : 503;
}

/** Where a gated page redirect points, including the loop-breaking marker. */
export function forcedChangeRedirectPath(
  verdict: Exclude<ForcedChangeVerdict, 'allowed'>
): string {
  return verdict === 'required'
    ? FORCED_CHANGE_PATH
    : `${FORCED_CHANGE_PATH}?${FORCED_CHANGE_UNVERIFIED_PARAM}=${FORCED_CHANGE_UNVERIFIED_VALUE}`;
}
