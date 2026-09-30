/**
 * Unsubscribe links for notification email (NOTIF plan D5, ledger N3-05).
 * Dormant: only the outbox worker builds them, and it is off until N5-02.
 *
 * A link carries a signed token naming one user, a purpose and, per category,
 * the `pref_version` the preference row had when the email was frozen. A link
 * is only signed for an existing row (`preferenceVersionForLink` writes a
 * `default` one for a recipient who has none), so any later change to it,
 * deleting it included, leaves the link stale. The token is the only
 * authorization of the public endpoint, so everything it grants is in it and
 * nothing else is trusted:
 *
 *   - `category`: turn one category off;
 *   - `digest`: turn off every category a digest email carried.
 *
 * `apply_notification_unsubscribe` applies a category only while its version
 * still matches, in one transaction with the cancellation of that user's
 * pending optional outbox rows, so a replayed or stale link never undoes a
 * later choice.
 *
 * Server-only: it reads `NOTIFICATION_UNSUBSCRIBE_SECRET`, and no page imports
 * it. Tokens and addresses are never logged.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORY_LABELS, type NotificationCategory } from '../notifications/catalog';
import { getAppBaseUrl } from '../utils/app-url';

export const UNSUBSCRIBE_API_PATH = '/api/notifications/unsubscribe';
export const UNSUBSCRIBE_PAGE_PATH = '/notificaciones/baja';
/** The exact form value of an RFC 8058 one-click request, and of the header that announces it. */
export const ONE_CLICK = 'List-Unsubscribe=One-Click';

/** An email stays in a mailbox long after it was sent; past this the link is refused. */
const TOKEN_TTL_SECONDS = 60 * 86400;
const MAX_SCOPES = 8;
/** Part of every signature, so a value signed for anything else never verifies here. */
const DOMAIN = 'genera/notification-unsubscribe/v1';
const TOKEN_SHAPE = /^[cd]\.[A-Za-z0-9_-]{40,600}\.[A-Za-z0-9_-]{43}$/;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type UnsubscribeKind = 'category' | 'digest';

export interface UnsubscribeScope {
  category: NotificationCategory;
  /** `pref_version` of the user's preference row for this category: 1 or more. */
  prefVersion: number;
}

export interface VerifiedUnsubscribe {
  ok: true;
  kind: UnsubscribeKind;
  userId: string;
  scopes: UnsubscribeScope[];
}

export type UnsubscribeVerification =
  | VerifiedUnsubscribe
  | { ok: false; reason: 'malformed' | 'not_configured' | 'invalid' | 'expired' };

export type UnsubscribeOutcome = 'unsubscribed' | 'already_off' | 'stale';

/**
 * The signing secret, from the server-only `NOTIFICATION_UNSUBSCRIBE_SECRET`.
 * No fallback to another secret; shorter than 32 characters counts as unset.
 */
function signingSecret(): string | null {
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

function signature(secret: string, code: string, body: string): string {
  return createHmac('sha256', secret).update(`${DOMAIN}\n${code}\n${body}`).digest('base64url');
}

/** One category for a category token, one to eight distinct ones for a digest token. */
function validScopes(kind: UnsubscribeKind, scopes: unknown): scopes is UnsubscribeScope[] {
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > (kind === 'category' ? 1 : MAX_SCOPES)) return false;
  const seen = new Set<string>();
  return scopes.every((scope) => {
    const { category, prefVersion } = (scope ?? {}) as Partial<UnsubscribeScope>;
    if (typeof category !== 'string' || !Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category)) return false;
    if (seen.has(category) || !Number.isSafeInteger(prefVersion) || (prefVersion as number) < 1) return false;
    seen.add(category);
    return true;
  });
}

/** True for a string with the outer form of a token. Says nothing about its signature. */
export function isUnsubscribeTokenShape(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_SHAPE.test(token);
}

/** A signed token, or null when the secret is unset or the scope is not one a token may carry. */
export function createUnsubscribeToken(
  kind: UnsubscribeKind,
  userId: string,
  scopes: UnsubscribeScope[],
  now: number = Date.now()
): string | null {
  const secret = signingSecret();
  if (!secret || !USER_ID.test(userId) || !validScopes(kind, scopes)) return null;
  const code = kind === 'category' ? 'c' : 'd';
  const expires = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  const payload = [userId, expires, scopes.map((scope) => [scope.category, scope.prefVersion])];
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${code}.${body}.${signature(secret, code, body)}`;
}

/** Shape, then signature, then content and expiry. Nothing of a token is trusted before its signature holds. */
export function verifyUnsubscribeToken(token: unknown, now: number = Date.now()): UnsubscribeVerification {
  if (!isUnsubscribeTokenShape(token)) return { ok: false, reason: 'malformed' };
  const secret = signingSecret();
  if (!secret) return { ok: false, reason: 'not_configured' };

  const [code, body, mac] = token.split('.');
  const expected = signature(secret, code, body);
  if (!timingSafeEqual(Buffer.from(mac, 'utf8'), Buffer.from(expected, 'utf8'))) return { ok: false, reason: 'invalid' };

  const kind: UnsubscribeKind = code === 'c' ? 'category' : 'digest';
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!Array.isArray(payload) || payload.length !== 3 || !Array.isArray(payload[2])) return { ok: false, reason: 'invalid' };
  const [userId, expires, pairs] = payload as [unknown, unknown, unknown[]];
  const scopes = pairs.map((pair) => (Array.isArray(pair) && pair.length === 2 ? { category: pair[0], prefVersion: pair[1] } : null));
  if (typeof userId !== 'string' || !USER_ID.test(userId) || !Number.isSafeInteger(expires) || !validScopes(kind, scopes)) {
    return { ok: false, reason: 'invalid' };
  }
  if ((expires as number) * 1000 <= now) return { ok: false, reason: 'expired' };

  return { ok: true, kind, userId, scopes };
}

/** The confirmation page for a token: what a link in an email body points at. A GET there changes nothing. */
export function unsubscribePageUrl(token: string): string {
  return `${getAppBaseUrl()}${UNSUBSCRIBE_PAGE_PATH}?t=${token}`;
}

/** The two RFC 8058 headers for a token. The URL takes the one-click POST; a GET only shows the confirmation page. */
export function unsubscribeHeaders(token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${getAppBaseUrl()}${UNSUBSCRIBE_API_PATH}?t=${token}>`,
    'List-Unsubscribe-Post': ONE_CLICK,
  };
}

export interface DigestUnsubscribeLinks {
  /** Turns off every category of the digest in one request. */
  headers: Record<string, string>;
  /** One confirmation link per category, for the digest body. */
  categoryLinks: Array<{ category: NotificationCategory; label: string; url: string }>;
}

/**
 * The unsubscribe links of one digest email (N5-01 sends it): a header link for
 * the whole digest and a body link per category, each bound to the version of
 * its own category. Null when no link can be signed: the digest must not go out.
 */
export function buildDigestUnsubscribeLinks(
  userId: string,
  scopes: UnsubscribeScope[],
  now: number = Date.now()
): DigestUnsubscribeLinks | null {
  const digestToken = createUnsubscribeToken('digest', userId, scopes, now);
  if (!digestToken) return null;
  const categoryLinks: DigestUnsubscribeLinks['categoryLinks'] = [];
  for (const scope of scopes) {
    const token = createUnsubscribeToken('category', userId, [scope], now);
    if (!token) return null;
    categoryLinks.push({ category: scope.category, label: CATEGORY_LABELS[scope.category], url: unsubscribePageUrl(token) });
  }
  return { headers: unsubscribeHeaders(digestToken), categoryLinks };
}

/**
 * The version a link for this user and category is signed with. A recipient
 * with no preference row gets one first, in `default` mode, which decides
 * nothing. Null when the row cannot be written or read, or when no link could
 * be signed anyway.
 */
export async function preferenceVersionForLink(
  client: SupabaseClient,
  userId: string,
  category: NotificationCategory
): Promise<number | null> {
  if (!signingSecret()) return null;
  const created = await client
    .from('user_notification_category_prefs')
    .upsert({ user_id: userId, category }, { onConflict: 'user_id,category', ignoreDuplicates: true });
  if (created.error) return null;
  const { data, error } = await client
    .from('user_notification_category_prefs')
    .select('pref_version')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();
  const version: unknown = data?.pref_version;
  return !error && Number.isSafeInteger(version) && (version as number) >= 1 ? (version as number) : null;
}

/**
 * Applies a verified token in one database transaction. Per category:
 * `unsubscribed` (now off, pending optional mail cancelled), `already_off`, or
 * `stale` (the preference changed after the email was sent: nothing is done).
 * Null when the database did not answer as expected; nothing was changed.
 */
export async function applyUnsubscribe(
  client: SupabaseClient,
  verified: VerifiedUnsubscribe
): Promise<Array<{ category: NotificationCategory; outcome: UnsubscribeOutcome }> | null> {
  const { data, error } = await client.rpc('apply_notification_unsubscribe', {
    p_user_id: verified.userId,
    p_categories: verified.scopes.map((scope) => scope.category),
    p_versions: verified.scopes.map((scope) => scope.prefVersion),
  });
  if (error || !Array.isArray(data) || data.length !== verified.scopes.length) return null;

  const results: Array<{ category: NotificationCategory; outcome: UnsubscribeOutcome }> = [];
  for (const scope of verified.scopes) {
    const row = data.find((entry) => entry?.category === scope.category);
    if (!row || !['unsubscribed', 'already_off', 'stale'].includes(row.outcome)) return null;
    results.push({ category: scope.category, outcome: row.outcome });
  }
  return results;
}
