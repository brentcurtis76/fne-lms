/**
 * SERVER ONLY. The admin side of the participant intake: the shared guard and
 * the roster writes db-contract §6 assigns to the app (no DB function).
 *
 * Guard order is `pages/api/admin/pasantia-leads/index.ts`'s: method,
 * `checkIsAdmin` (global admin only), 401/403, then the forced-password verdict
 * BEFORE any intake query — a caller authenticated only by `Bearer` never meets
 * the middleware's cookie branch.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkIsAdmin,
  createServiceRoleClient,
  getForcedPasswordChangeVerdict,
  handleMethodNotAllowed,
  sendForcedPasswordChangeResponse,
} from '../../api-auth';
import type { ForcedChangeVerdict } from '../../auth/forced-password-change';
import {
  ADMIN_ROSTER_COLUMNS,
  ROSTERS_TABLE,
  logIntakeFailure,
  setNoStore,
  toAdminRoster,
} from './server';
import { generateIntakeToken, hashIntakeToken } from './token';
import type { AdminRoster, ValidDays } from './types';

/** Admin roster columns plus the participant count; never `token_hash`. */
export const ADMIN_ROSTER_SELECT: string = `${ADMIN_ROSTER_COLUMNS}, participants:pasantias_intake_participants(count)`;

export const ROSTER_LIST_LIMIT = 200;

/** A duplicate-key refusal on the named constraint. Matched, never logged. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return code === '23505' && typeof message === 'string' && message.includes(constraint);
}

export const SCHOOL_KEY_CONSTRAINT = 'pasantias_intake_rosters_school_key';
export const TOKEN_HASH_CONSTRAINT = 'pasantias_intake_rosters_token_hash_key';

/** `expires_at` = server now + validDays, computed on the server only. */
export function expiryFromNow(validDays: ValidDays, now: Date = new Date()): string {
  return new Date(now.getTime() + validDays * 86_400_000).toISOString();
}

async function readVerdict(supabase: SupabaseClient, userId: string): Promise<ForcedChangeVerdict> {
  try {
    return await getForcedPasswordChangeVerdict(supabase, userId);
  } catch (error) {
    logIntakeFailure('admin password-change state unreadable', error);
    return 'unavailable';
  }
}

/**
 * Runs the admin guard. Returns the service client and caller id, or null when
 * a response (405/401/403/forced-password) has already been sent.
 */
export async function authorizeIntakeAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  methods: string[]
): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  setNoStore(res);
  if (!req.method || !methods.includes(req.method)) {
    handleMethodNotAllowed(res, methods);
    return null;
  }
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!isAdmin) {
    res.status(403).json({ error: 'Solo administradores pueden gestionar las nóminas de pasantes' });
    return null;
  }
  const supabase = createServiceRoleClient();
  const verdict = await readVerdict(supabase, user.id);
  if (sendForcedPasswordChangeResponse(res, verdict)) return null;
  return { supabase, userId: user.id };
}

export type TokenWrite =
  | { ok: true; roster: AdminRoster; token: string }
  | { ok: false; reason: 'school_exists' | 'not_found' | 'failed'; error?: unknown };

/**
 * Writes a fresh token hash (create or rotate). A token-hash collision is
 * astronomically unlikely; it is retried with a new token, never surfaced.
 */
export async function writeWithFreshToken(
  attempt: (tokenHash: string) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<TokenWrite> {
  for (let tries = 0; tries < 3; tries += 1) {
    const token = generateIntakeToken();
    const { data, error } = await attempt(hashIntakeToken(token));
    if (error) {
      if (isUniqueViolation(error, TOKEN_HASH_CONSTRAINT)) continue;
      if (isUniqueViolation(error, SCHOOL_KEY_CONSTRAINT)) return { ok: false, reason: 'school_exists' };
      logIntakeFailure('roster token write failed', error);
      return { ok: false, reason: 'failed', error };
    }
    if (!data) return { ok: false, reason: 'not_found' };
    return { ok: true, roster: toAdminRoster(data as Record<string, unknown>), token };
  }
  return { ok: false, reason: 'failed' };
}

export { ROSTERS_TABLE };
