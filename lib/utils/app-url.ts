/**
 * Absolute application URLs.
 *
 * Anything that leaves the browser — an .ics file a calendar client will open
 * days later, a notification payload rendered inside an e-mail — needs a fully
 * qualified URL. Relative paths (`/meet/session/{id}`) only work inside the app.
 *
 * The `Host` header is attacker-controlled: a crafted request can set it to any
 * value, and the resulting link is then baked into an artifact that outlives the
 * request. So in production the origin MUST come from configuration, and a
 * missing configuration is a loud failure rather than a silent fallback.
 * Outside production the header (and finally localhost) still stands in, which
 * is what makes preview deployments and `npm run dev` work without setup.
 */

type RequestLike = { headers?: { host?: string | string[] } } | null | undefined;

/**
 * Whether this process is serving production traffic.
 *
 * `VERCEL_ENV` is the authority when present — it distinguishes `production`
 * from `preview`, which both run a production build and would otherwise be
 * indistinguishable via `NODE_ENV`.
 */
function isProduction(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv === 'production';
  }
  return process.env.NODE_ENV === 'production';
}

/**
 * Accept a candidate origin only if it parses as an http(s) URL. A typo like
 * `genera.example.cl` (no scheme) or `htps://…` would otherwise be concatenated
 * into every outbound link.
 */
function normalizeOrigin(candidate: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  return candidate.replace(/\/+$/, '');
}

/**
 * The explicitly configured public origin, if any and if usable.
 */
function configuredOrigin(): string | null {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  return configured ? normalizeOrigin(configured) : null;
}

/**
 * The origin Vercel derives from the deployment itself. Not client-controlled,
 * so it is a safe production fallback when no explicit env var is set. Vercel
 * supplies it without a scheme.
 */
function deploymentOrigin(): string | null {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host) {
    return null;
  }
  return normalizeOrigin(/^https?:\/\//.test(host) ? host : `https://${host}`);
}

/**
 * Resolve the public origin of the app, without a trailing slash.
 *
 * @throws in production when no valid origin is configured. Failing the request
 * is the correct outcome: the alternative is emitting an e-mail or a calendar
 * entry whose links point wherever the caller's `Host` header said.
 */
export function getAppBaseUrl(req?: RequestLike): string {
  const configured = configuredOrigin();
  if (configured) {
    return configured;
  }

  if (isProduction()) {
    const deployment = deploymentOrigin();
    if (deployment) {
      return deployment;
    }

    throw new Error(
      'No se puede resolver la URL pública de la aplicación en producción. ' +
        'Configure NEXT_PUBLIC_BASE_URL (o NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL) ' +
        'con una URL http(s) válida. El encabezado Host no se usa en producción ' +
        'porque lo controla el cliente.'
    );
  }

  // Non-production only, from here down.
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
