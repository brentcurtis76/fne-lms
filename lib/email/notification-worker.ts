/**
 * The notification email worker (NOTIF plan D4, ledger N3-03). Dormant: it does
 * nothing unless `NOTIFICATION_OUTBOX_DELIVERY` is on, and nothing enqueues rows
 * until N5-02.
 *
 * One run claims due immediate rows of `notification_email_outbox` under a
 * lease (`claim_notification_emails`, `SKIP LOCKED`) and, for each:
 *
 *   1. before the first attempt, re-checks that the recipient can still see the
 *      source record (`checkNotificationAccess`) and still wants the email
 *      (`resolveEmailPreference`, current rows). Revoked or switched off
 *      cancels the row; a failed read sends nothing and leaves it for later;
 *   2. asks `authorizeUserEmail` for the tenant disposition, on every attempt;
 *   3. freezes the rendered message, encrypted, in `send_snapshot`
 *      (`begin_notification_email_attempt`, which never replaces a stored one)
 *      and sends the bytes the database returned, so a retry is the same
 *      message under the same idempotency key;
 *   4. submits through `deliverOutboundEmail` and records what happened.
 *
 * Only the live lease owner can freeze or finish a row: the database checks it.
 * N3-04 owns retry classification, backoff, the 24-hour `unknown` and the purge;
 * here an unsent row is retried after a fixed delay.
 *
 * Nothing that identifies a recipient is logged or returned.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCatalogEntry, getCatalogTemplates } from '../notifications/catalog';
import { resolveEmailPreference } from '../notifications/resolve-preference';
import { getAppBaseUrl } from '../utils/app-url';
import { checkNotificationAccess } from './notification-access';
import { buildNotificationEmail, platformPath } from './notifications';
import { authorizeUserEmail } from './outbound-policy';
import { deliverOutboundEmail, resolveSender, type EmailTransport } from './provider';

const BATCH_SIZE = 20;
const LEASE_SECONDS = 120;
const RETRY_SECONDS = 900;
const GENERIC_TITLE = 'Tienes una nueva notificación en Genera';
/** Until N5-06 the finalize route's summary is a meeting's only email. */
const EMAIL_SUPPRESSED_EVENT = 'meeting_finalized';

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_AAD = Buffer.from('genera/notification-email-snapshot/v1', 'utf8');

export interface NotificationWorkerResult {
  enabled: boolean;
  status: 'disabled' | 'not_configured' | 'ok';
  claimed: number;
  sent: number;
  cancelled: number;
  failed: number;
  retried: number;
  digest: number;
  /** Rows whose lease was gone before the outcome could be written; the database left them unchanged. */
  lost: number;
}

type RowOutcome = 'sent' | 'cancelled' | 'failed' | 'retried' | 'digest' | 'lost';

interface ClaimedRow {
  id: string;
  idempotency_key: string;
  event_type: string;
  user_id: string;
  related_url: string | null;
  payload: Record<string, unknown> | null;
  has_snapshot: boolean;
  source_kind: string | null;
  source_id: string | null;
}

interface FrozenMessage {
  to: string;
  subject: string;
  html: string;
}

/** Off unless explicitly on: unset, empty or any other value keeps the worker inert. */
export function isOutboxDeliveryEnabled(): boolean {
  const flag = process.env.NOTIFICATION_OUTBOX_DELIVERY?.trim().toLowerCase();
  return flag === 'on' || flag === 'true' || flag === '1';
}

/**
 * The snapshot key, from the server-only `NOTIFICATION_SNAPSHOT_SECRET`. No
 * fallback to another secret: rotating that one would make queued snapshots
 * unreadable. Shorter than 32 characters counts as unset.
 */
function snapshotKey(): Buffer | null {
  const secret = process.env.NOTIFICATION_SNAPSHOT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return null;
  return createHash('sha256').update('genera/notification-email-snapshot/').update(secret).digest();
}

/** AES-256-GCM as a bytea literal: version, iv, tag, ciphertext. */
export function sealSnapshot(key: Buffer, message: FrozenMessage): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(SNAPSHOT_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
  return `\\x${Buffer.concat([Buffer.from([SNAPSHOT_VERSION]), iv, cipher.getAuthTag(), ciphertext]).toString('hex')}`;
}

/** The frozen message, or null when the stored bytes are not a snapshot this key sealed. */
export function openSnapshot(key: Buffer, stored: unknown): FrozenMessage | null {
  if (typeof stored !== 'string' || !/^\\x(?:[0-9a-f]{2})+$/i.test(stored)) return null;
  const bytes = Buffer.from(stored.slice(2), 'hex');
  if (bytes.length <= 29 || bytes[0] !== SNAPSHOT_VERSION) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13));
    decipher.setAAD(SNAPSHOT_AAD);
    decipher.setAuthTag(bytes.subarray(13, 29));
    const parsed = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8'));
    return typeof parsed?.to === 'string' && typeof parsed.subject === 'string' && typeof parsed.html === 'string'
      ? { to: parsed.to, subject: parsed.subject, html: parsed.html }
      : null;
  } catch {
    return null;
  }
}

/** The catalog's allowlisted fields of the stored payload, as the nested object the registry templates read. */
function templateData(eventType: string, payload: Record<string, unknown> | null): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const path of getCatalogEntry(eventType)?.emailFields ?? []) {
    const value = payload && Object.prototype.hasOwnProperty.call(payload, path) ? payload[path] : undefined;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const keys = path.split('.');
    let target = data;
    for (const key of keys.slice(0, -1)) {
      target = (target[key] ??= {}) as Record<string, unknown>;
    }
    target[keys[keys.length - 1]] = value;
  }
  return data;
}

/**
 * The message for a row: the registry templates over the allowlisted payload,
 * or the generic notice for an event whose producer writes its own copy. The
 * bell row's text is not reused: it can carry what an email must not.
 */
function renderMessage(row: ClaimedRow, to: string): FrozenMessage {
  const templates = getCatalogTemplates(row.event_type);
  let title = GENERIC_TITLE;
  let description: string | null = null;
  if (templates) {
    try {
      const data = templateData(row.event_type, row.payload);
      title = templates.title(data);
      description = templates.description(data);
    } catch {
      title = GENERIC_TITLE;
      description = null;
    }
  }
  const url = `${getAppBaseUrl()}${platformPath(row.related_url)}`;
  return { to, ...buildNotificationEmail({ title, description, url }) };
}

type Stop = { outcome: 'cancelled' | 'failed' | 'retry' | 'digest'; code?: string };

/** The recipient's current email preference for this event; null when the email still goes out now. */
async function preferenceStep(client: SupabaseClient, row: ClaimedRow): Promise<Stop | null> {
  const entry = getCatalogEntry(row.event_type);
  let categoryMode: unknown = null;
  let legacySuppressed = false;
  let lookupFailed = false;

  // A mandatory email is decided before, and without, either read.
  if (entry && !entry.mandatory) {
    try {
      const [legacy, category] = await Promise.all([
        client
          .from('user_notification_preferences')
          .select('email_enabled')
          .eq('user_id', row.user_id)
          .eq('notification_type', row.event_type)
          .maybeSingle(),
        client
          .from('user_notification_category_prefs')
          .select('email_mode')
          .eq('user_id', row.user_id)
          .eq('category', entry.category)
          .maybeSingle(),
      ]);
      if (legacy.error || category.error) lookupFailed = true;
      legacySuppressed = legacy.data?.email_enabled === false;
      categoryMode = category.data?.email_mode ?? null;
    } catch {
      lookupFailed = true;
    }
  }

  const decision = resolveEmailPreference({ eventType: row.event_type, categoryMode, legacySuppressed, lookupFailed });
  if (decision.reason === 'preference_unavailable') return { outcome: 'retry', code: 'preference_unavailable' };
  if (decision.mode === 'off') return { outcome: 'cancelled', code: 'preference_off' };
  if (decision.mode === 'digest') return { outcome: 'digest' };
  return null;
}

/** Everything that must hold before a first attempt; the sealed message when it does. */
async function firstAttempt(client: SupabaseClient, row: ClaimedRow, key: Buffer): Promise<Stop | { sealed: string }> {
  if (row.event_type === EMAIL_SUPPRESSED_EVENT) return { outcome: 'cancelled', code: 'email_suppressed' };

  const access = await checkNotificationAccess(client, {
    eventType: row.event_type,
    userId: row.user_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
  });
  if (access.access === 'revoked') return { outcome: 'cancelled', code: access.code };
  if (access.access === 'invalid') return { outcome: 'failed', code: access.code };
  if (access.access === 'unavailable') return { outcome: 'retry', code: access.code };

  const preference = await preferenceStep(client, row);
  if (preference) return preference;

  // The address comes from the profile, never from the row or its payload.
  const { data: profile, error } = await client.from('profiles').select('email').eq('id', row.user_id).maybeSingle();
  if (error) return { outcome: 'retry', code: 'recipient_lookup_failed' };
  const to = typeof profile?.email === 'string' ? profile.email.trim() : '';
  if (!to) return { outcome: 'failed', code: 'missing_recipient' };

  return { sealed: sealSnapshot(key, renderMessage(row, to)) };
}

async function processRow(
  client: SupabaseClient,
  row: ClaimedRow,
  owner: string,
  key: Buffer,
  transport?: EmailTransport
): Promise<RowOutcome> {
  const finish = async (
    outcome: 'sent' | 'cancelled' | 'failed' | 'retry' | 'digest',
    code?: string,
    providerMessageId?: string
  ): Promise<RowOutcome> => {
    const { data, error } = await client.rpc('finish_notification_email', {
      p_id: row.id,
      p_owner: owner,
      p_outcome: outcome,
      p_error_code: code ?? null,
      p_provider_message_id: providerMessageId ?? null,
      p_retry_seconds: outcome === 'retry' ? RETRY_SECONDS : null,
    });
    if (error || data !== true) return 'lost';
    return outcome === 'retry' ? 'retried' : outcome;
  };

  let sealed: string | null = null;
  if (!row.has_snapshot) {
    let step: Stop | { sealed: string };
    try {
      step = await firstAttempt(client, row, key);
    } catch {
      step = { outcome: 'retry', code: 'worker_error' };
    }
    if ('outcome' in step) return finish(step.outcome, step.code);
    sealed = step.sealed;
  }

  const authorization = await authorizeUserEmail(client, row.user_id);
  if (authorization.kind === 'suppressed_qa') return finish('cancelled', 'suppressed_qa');
  if (authorization.kind === 'refuse') {
    const transient = authorization.reason === 'user_lookup_failed' || authorization.reason === 'school_lookup_failed';
    return finish(transient ? 'retry' : 'failed', `refused_${authorization.reason}`);
  }

  // The database keeps an already frozen snapshot and hands back what is stored;
  // nothing comes back unless this run still owns the lease.
  const { data: stored, error: beginError } = await client.rpc('begin_notification_email_attempt', {
    p_id: row.id,
    p_owner: owner,
    p_snapshot: sealed,
  });
  if (beginError || !stored) return 'lost';

  const message = openSnapshot(key, stored);
  if (!message) return finish('retry', 'snapshot_unreadable');

  const result = await deliverOutboundEmail({
    authorization,
    message,
    idempotencyKey: row.idempotency_key,
    transport,
  });

  switch (result.status) {
    case 'provider_accepted':
      return finish('sent', undefined, result.providerMessageId);
    case 'provider_rejected':
      // A definite refusal by the provider. Its text can name the address, so only the status is kept.
      return finish('failed', 'provider_rejected');
    default:
      // transport_error is ambiguous and not_configured is fixable: the frozen bytes go out again later.
      return finish('retry', result.status);
  }
}

export async function runNotificationEmailWorker(
  client: SupabaseClient,
  deps: { transport?: EmailTransport } = {}
): Promise<NotificationWorkerResult> {
  const result: NotificationWorkerResult = {
    enabled: false,
    status: 'disabled',
    claimed: 0,
    sent: 0,
    cancelled: 0,
    failed: 0,
    retried: 0,
    digest: 0,
    lost: 0,
  };
  if (!isOutboxDeliveryEnabled()) return result;
  result.enabled = true;

  // Without a snapshot key or a valid sender nothing could be frozen or delivered: claim nothing.
  const key = snapshotKey();
  if (!key || resolveSender() === null) {
    result.status = 'not_configured';
    return result;
  }
  result.status = 'ok';

  const owner = `notification-emails:${randomUUID()}`;
  const { data: claimed, error } = await client.rpc('claim_notification_emails', {
    p_owner: owner,
    p_limit: BATCH_SIZE,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw new Error('claim_failed');

  for (const row of (claimed ?? []) as ClaimedRow[]) {
    result.claimed++;
    let outcome: RowOutcome;
    try {
      outcome = await processRow(client, row, owner, key, deps.transport);
    } catch {
      // The row keeps its lease until it expires; the next run picks it up.
      outcome = 'lost';
    }
    result[outcome]++;
  }
  return result;
}
