/**
 * Absolute application URLs.
 *
 * Anything that leaves the browser — an .ics file a calendar client will open
 * days later, a notification payload rendered inside an e-mail — needs a fully
 * qualified URL. Relative paths (`/meet/session/{id}`) only work inside the app.
 *
 * The precedence mirrors the pattern already used by
 * `pages/api/admin/tractor-signups/grant.ts`: an explicitly configured public
 * base URL wins; the request `Host` header is a development/preview fallback.
 * The header is client-controlled, so it must never be the source of truth in
 * production — set `NEXT_PUBLIC_BASE_URL` there.
 */

type RequestLike = { headers?: { host?: string | string[] } } | null | undefined;

/**
 * Resolve the public origin of the app, without a trailing slash.
 */
export function getAppBaseUrl(req?: RequestLike): string {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const rawHost = req?.headers?.host;
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;

  if (!host) {
    return 'http://localhost:3000';
  }

  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/**
 * Build an absolute URL for an app path (`/meet/session/{id}` → `https://…/meet/session/{id}`).
 */
export function buildAbsoluteUrl(path: string, req?: RequestLike): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getAppBaseUrl(req)}${normalized}`;
}
