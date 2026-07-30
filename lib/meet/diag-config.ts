/**
 * The ONE availability contract for the /meet/diag test-join probe (Z0B-2r1).
 *
 * Sol R1 finding ⑧: the diag page decided whether to render the join section from
 * `NEXT_PUBLIC_ZOOM_SDK_CLIENT_ID`, while `/api/meet/diag-signature` required the
 * SERVER-side `ZOOM_SDK_CLIENT_ID` + `ZOOM_SDK_CLIENT_SECRET` pair. Two different
 * env contracts for one feature: a deployment with only the public variable
 * rendered a join form whose every submission 404'd, and the reverse rendered a
 * placeholder on a deployment that was fully capable.
 *
 * So the predicate lives here, is evaluated on the SERVER in both places (the page
 * in `getServerSideProps`, the API in its first gate), and there is exactly one
 * answer. It deliberately does NOT read any `NEXT_PUBLIC_*` variable.
 *
 * Its own module rather than an export from the API route: a page importing an API
 * route pulls that route's imports (`crypto`, the Supabase server client, roleUtils)
 * into the page's module graph and relies on Next's dead-export elimination to keep
 * them out of the browser bundle. A leaf module with no dependencies removes the
 * question. `lib/meet/` rather than `lib/zoom/` keeps it clear of Z1b's production
 * client library on the parallel branch.
 */

/**
 * Meeting numbers this deployment will mint a diag signature for, parsed from
 * `ZOOM_DIAG_MEETING_IDS` (comma-separated). Non-digits are stripped and anything
 * outside Zoom's 9–11 digit range is dropped, so a malformed entry cannot widen the
 * allowlist — it just is not on it.
 */
export function diagMeetingAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ZOOM_DIAG_MEETING_IDS ?? '')
    .split(',')
    .map((entry) => entry.replace(/\D/g, ''))
    .filter((entry) => entry.length >= 9 && entry.length <= 11);
}

/**
 * True only when the join probe can actually work end to end: the server SDK pair
 * is present AND at least one meeting is allowlisted.
 *
 * Both halves are required. An absent or empty allowlist is an UNCONFIGURED
 * endpoint, not an endpoint that signs anything — treating it as "no restriction"
 * would turn a missing env var into an open signer, which is the failure direction
 * that matters here.
 */
export function isDiagJoinConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.ZOOM_SDK_CLIENT_ID && env.ZOOM_SDK_CLIENT_SECRET && diagMeetingAllowlist(env).length > 0
  );
}
