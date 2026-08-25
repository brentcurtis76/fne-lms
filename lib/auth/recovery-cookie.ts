/**
 * The server-managed recovery-context cookie. Server-only.
 *
 * WHAT IT IS. After `/api/auth/recovery/exchange` consumes the one-time e-mailed
 * proof, the resulting opaque grant is stored in an HttpOnly cookie instead of
 * being handed to page JavaScript. That is what lets an exchanged recovery
 * context survive a page refresh or a tab remount: the browser re-presents the
 * cookie; no script ever holds the grant.
 *
 * WHAT IT IS NOT. It carries no ordinary authenticated session authority — the
 * value is the purpose-bound recovery grant, accepted only by the recovery
 * ceremony, unable to become a session, and useless to any other endpoint. Its
 * `Path` scopes it to `/api/auth/recovery` alone (RFC 6265 path-match: those
 * endpoints live UNDER that segment), its lifetime equals the grant's, and the
 * recovery endpoints clear it on success, exhaustion, interruption, and
 * explicit invalidation. Substituting a different account's cookie is
 * substituting that account's grant — the ceremony then acts on the account the
 * grant's own authenticated claims name, never on anything the caller chose.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export const RECOVERY_GRANT_COOKIE = 'recovery_grant';

/**
 * Every recovery endpoint lives under this path, so the cookie is presented to
 * `/api/auth/recovery/exchange|complete|context|invalidate` and to nothing else.
 */
export const RECOVERY_COOKIE_PATH = '/api/auth/recovery';

/**
 * `Secure` follows the effective protocol rather than NODE_ENV: the mandatory
 * e2e serves a production BUILD over plain-http localhost, where a Secure
 * cookie may be refused, while every real deployment sits behind Vercel's
 * https proxy, which sets `x-forwarded-proto`.
 */
export function isSecureRequest(req: Pick<NextApiRequest, 'headers' | 'socket'>): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (proto) return proto.split(',')[0].trim() === 'https';
  return Boolean((req.socket as { encrypted?: boolean } | undefined)?.encrypted);
}

/** The grant from the request, or null. Next parses cookies for API routes. */
export function readRecoveryGrantCookie(
  req: Pick<NextApiRequest, 'cookies'>
): string | null {
  const value = req.cookies?.[RECOVERY_GRANT_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function cookieAttributes(secure: boolean): string {
  return [
    `Path=${RECOVERY_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function setRecoveryGrantCookie(
  res: NextApiResponse,
  grant: string,
  maxAgeSeconds: number,
  secure: boolean
): void {
  res.setHeader(
    'Set-Cookie',
    `${RECOVERY_GRANT_COOKIE}=${encodeURIComponent(grant)}; Max-Age=${Math.max(
      Math.floor(maxAgeSeconds),
      0
    )}; ${cookieAttributes(secure)}`
  );
}

export function clearRecoveryGrantCookie(res: NextApiResponse, secure: boolean): void {
  res.setHeader(
    'Set-Cookie',
    `${RECOVERY_GRANT_COOKIE}=; Max-Age=0; ${cookieAttributes(secure)}`
  );
}
