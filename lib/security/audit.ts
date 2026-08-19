/**
 * The security audit trail. One writer, one table, one sanitiser.
 *
 * WHAT WAS BROKEN. Eight call sites wrote to `public.audit_logs`. That table has
 * never existed — not in the baseline dump, not in any migration, not in the
 * live database. Every write returned `42P01 relation does not exist`, and every
 * call site logged the error and carried on ("Continue anyway as this is not
 * critical"). The platform therefore reported a complete audit trail for
 * administrative password resets, role assignments, e-mail changes and bulk user
 * creation while persisting none of it.
 *
 * THE FAIL-OPEN / FAIL-CLOSED DECISION, stated once so every call site inherits
 * it rather than inventing its own:
 *
 *   FAIL OPEN, but visibly — password reset, voluntary and forced password
 *   change, user creation (manual and bulk), user update, e-mail change, role
 *   assignment, invitation send, QA-tester status, meeting deletion. In every
 *   one of these the security-relevant effect has ALREADY COMMITTED by the time
 *   the audit row is attempted; refusing the response would not undo it, and
 *   would leave the caller believing an operation failed that in fact succeeded.
 *   The response therefore carries `audited: false` and the failure is logged
 *   under the stable prefix `[security-audit]` so it is alertable.
 *
 *   FAIL CLOSED — invitation resend. There the audit row is not a record of the
 *   effect, it IS the rate-limit ledger: `findRecentSecurityAudit` is what proves
 *   a resend is allowed. If the trail cannot be read or written, the request is
 *   refused rather than sending an unbounded number of recovery links to an
 *   address. Enforced in `pages/api/admin/tractor-signups/resend-invite.ts`.
 *
 * This module NEVER throws. A defect in auditing must not become an outage in
 * the operation being audited — which is precisely why the fail-open decision is
 * safe to state.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const SECURITY_AUDIT_TABLE = 'security_audit_events';

/**
 * The typed operation set. Mirrors the `security_audit_events_action_check`
 * constraint in `supabase/migrations/20260818120000_security_audit_events.sql`;
 * `__tests__/lib/security/audit-actions.test.ts` parses that file and fails if
 * the two ever drift. Adding an action means editing both — deliberately, so a
 * new category cannot appear in the data without a migration.
 */
export const SECURITY_AUDIT_ACTIONS = [
  'password_reset_admin',
  'password_change_voluntary',
  'password_change_forced',
  'password_change_recovery',
  'password_recovery_requested',
  'user_created_manual',
  'user_created_bulk',
  'bulk_credentials_delivered',
  'user_updated',
  'user_email_changed',
  'profile_rollback_skipped',
  'role_assigned',
  'role_removed',
  'access_granted_new_user',
  'access_granted_existing_user',
  'invitation_sent',
  'invitation_resent',
  'qa_tester_status_changed',
  'meeting_deleted',
] as const;

export type SecurityAuditAction = (typeof SECURITY_AUDIT_ACTIONS)[number];

export const SECURITY_AUDIT_OUTCOMES = [
  'success',
  'failure',
  'denied',
  'partial_failure',
] as const;

export type SecurityAuditOutcome = (typeof SECURITY_AUDIT_OUTCOMES)[number];

export interface SecurityAuditEvent {
  action: SecurityAuditAction;
  outcome: SecurityAuditOutcome;
  /** Who performed it. Null for system-initiated events. */
  actorUserId?: string | null;
  /** The requester's role at the time — admin and equipo_directivo differ. */
  actorRole?: string | null;
  /** Who it was done to, when that is a different person. */
  targetUserId?: string | null;
  schoolId?: number | null;
  /** Structured, non-sensitive context. Sanitised before it is written. */
  metadata?: Record<string, unknown>;
}

export interface SecurityAuditResult {
  /** False means the row did not land. Callers surface this; they do not throw. */
  recorded: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

/**
 * Keys whose values must never reach the trail. Matched case-insensitively on a
 * normalised key (non-alphanumerics stripped), so `temporary_password`,
 * `temporaryPassword` and `TemporaryPassword` are one rule rather than three.
 *
 * The storage layer repeats this as a CHECK constraint on the top-level keys.
 * This pass is the recursive half — it reaches into nested objects and arrays,
 * where a CHECK cannot follow.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  'password',
  'contrasena',
  'credential',
  'token',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'actionlink',
  'recoveryurl',
  'reseturl',
  'emailbody',
  'html',
];

/**
 * Keys that contain a forbidden fragment but are themselves safe and useful.
 * `email_domain` is the school's mail domain, not a person — it is the one
 * signal that makes "did the invitation go to the right kind of address?"
 * answerable without storing anybody's address.
 */
const ALLOWED_KEYS = new Set(['emaildomain']);

/** Exact keys that are forbidden outright (too generic to match by fragment). */
const FORBIDDEN_EXACT_KEYS = new Set(['email', 'emailaddress', 'to', 'from', 'body']);

const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 4;
const MAX_SERIALISED_BYTES = 4096;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (ALLOWED_KEYS.has(normalised)) return false;
  if (FORBIDDEN_EXACT_KEYS.has(normalised)) return true;
  return FORBIDDEN_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/**
 * Value-level redaction, for the secrets that arrive without an incriminating
 * key. A recovery link handed to `{ detail: '<url>' }` would otherwise sail
 * through the key filter; so would a JWT.
 */
function sanitiseString(value: string): string {
  if (/^https?:\/\//i.test(value.trim())) return '[redacted-url]';
  if (/\beyJ[A-Za-z0-9_-]{8,}\./.test(value)) return '[redacted-token]';
  if (/[?&](token|token_hash|code|access_token|refresh_token)=/i.test(value)) {
    return '[redacted-url]';
  }
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
}

function sanitiseValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') return sanitiseString(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;

  // Functions, symbols and bigints have no place in an audit payload.
  if (typeof value !== 'object') return null;

  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitiseValue(entry, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  return sanitiseObject(value as Record<string, unknown>, depth + 1);
}

function sanitiseObject(input: Record<string, unknown>, depth: number): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isForbiddenKey(key)) continue;
    output[key] = sanitiseValue(value, depth);
  }
  return output;
}

/**
 * Exported so tests can assert the guarantee directly rather than through a
 * mocked database client.
 */
export function sanitiseAuditMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  const sanitised = sanitiseObject(metadata, 1);

  // Last-resort size cap. A payload this large is a bug in the caller, and the
  // right answer is a marker rather than a refused write: losing the detail is
  // survivable, losing the fact that the operation happened is not.
  if (JSON.stringify(sanitised).length > MAX_SERIALISED_BYTES) {
    return { truncated: true, keys: Object.keys(sanitised).slice(0, MAX_ARRAY_LENGTH) };
  }

  return sanitised;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/**
 * Append one event. Requires a service-role client: `authenticated` holds SELECT
 * only, so an anon/user-scoped client cannot write here by design.
 *
 * Never throws. Returns `{ recorded: false, error }` and logs under the stable
 * `[security-audit]` prefix, which is what makes the fail-open decision above
 * observable rather than silent.
 */
export async function recordSecurityAudit(
  client: Pick<SupabaseClient, 'from'>,
  event: SecurityAuditEvent
): Promise<SecurityAuditResult> {
  const row = {
    action: event.action,
    outcome: event.outcome,
    actor_user_id: isUuid(event.actorUserId) ? event.actorUserId : null,
    actor_role: typeof event.actorRole === 'string' ? event.actorRole.slice(0, 64) : null,
    target_user_id: isUuid(event.targetUserId) ? event.targetUserId : null,
    school_id: Number.isSafeInteger(event.schoolId) ? (event.schoolId as number) : null,
    metadata: sanitiseAuditMetadata(event.metadata),
  };

  try {
    const { error } = await client.from(SECURITY_AUDIT_TABLE).insert(row);

    if (error) {
      console.error('[security-audit] write failed', {
        action: event.action,
        outcome: event.outcome,
        actor_user_id: row.actor_user_id,
        target_user_id: row.target_user_id,
        error: error.message ?? String(error),
      });
      return { recorded: false, error: error.message ?? 'audit insert failed' };
    }

    return { recorded: true };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    console.error('[security-audit] write threw', {
      action: event.action,
      outcome: event.outcome,
      actor_user_id: row.actor_user_id,
      target_user_id: row.target_user_id,
      error: message,
    });
    return { recorded: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Reading (rate limiting)
// ---------------------------------------------------------------------------

export interface RecentAuditQuery {
  action: SecurityAuditAction;
  targetUserId: string;
  /** ISO timestamp; events at or after it count. */
  since: string;
  /** Only these outcomes count. Defaults to successes. */
  outcomes?: SecurityAuditOutcome[];
}

export interface RecentAuditResult {
  found: boolean;
  occurredAt?: string;
  /** Set when the lookup itself failed. Callers that rate-limit MUST fail closed. */
  error?: string;
}

/**
 * The most recent matching event, if any.
 *
 * `error` is a distinct outcome from `found: false` on purpose: "no recent
 * resend" and "cannot tell whether there was a recent resend" must not collapse
 * into the same answer, or an unreadable audit trail would silently become an
 * unlimited resend allowance.
 */
export async function findRecentSecurityAudit(
  client: Pick<SupabaseClient, 'from'>,
  query: RecentAuditQuery
): Promise<RecentAuditResult> {
  const outcomes = query.outcomes ?? ['success'];

  try {
    const { data, error } = await client
      .from(SECURITY_AUDIT_TABLE)
      .select('occurred_at')
      .eq('action', query.action)
      .eq('target_user_id', query.targetUserId)
      .in('outcome', outcomes)
      .gte('occurred_at', query.since)
      .order('occurred_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[security-audit] lookup failed', {
        action: query.action,
        target_user_id: query.targetUserId,
        error: error.message ?? String(error),
      });
      return { found: false, error: error.message ?? 'audit lookup failed' };
    }

    const row = Array.isArray(data) ? data[0] : null;
    return row ? { found: true, occurredAt: row.occurred_at } : { found: false };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    console.error('[security-audit] lookup threw', {
      action: query.action,
      target_user_id: query.targetUserId,
      error: message,
    });
    return { found: false, error: message };
  }
}
