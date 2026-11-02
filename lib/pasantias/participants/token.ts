/**
 * SERVER ONLY. The coordinator link token (FIRST §4, FIRST-B1).
 *
 * A token is 256 random bits, base64url (43 characters). The database stores
 * only its SHA-256 hex digest (`token_hash`), so no pepper or new secret is
 * needed and a database read never yields a usable link.
 *
 * Transport is `Authorization: Intake <token>`, never `Bearer`: GENERA treats
 * any Bearer value as a Supabase login token (`getApiUser` sends it to the auth
 * server, `createApiSupabaseClient` forwards it to PostgREST). The intake
 * routes never call those shared auth helpers.
 */
import { createHash, randomBytes } from 'crypto';

const INTAKE_AUTHORIZATION = /^Intake ([A-Za-z0-9_-]{43})$/;

export function generateIntakeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashIntakeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * The token from an `Authorization` header, or null. Strict: exactly one
 * space, the exact scheme, exactly 43 base64url characters. Bearer, a missing
 * value, extra whitespace and any other length are all refused.
 */
export function parseIntakeAuthorization(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const match = INTAKE_AUTHORIZATION.exec(header);
  return match ? match[1] : null;
}
