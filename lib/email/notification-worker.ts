/**
 * The notification email worker (NOTIF plan D4, ledger N3-03). Dormant: it does
 * nothing unless `NOTIFICATION_OUTBOX_DELIVERY` is on, and nothing enqueues rows
 * until N5-02.
 *
 * One run claims due immediate rows of `notification_email_outbox` under a
 * lease (`claim_notification_emails`, `SKIP LOCKED`) and, for each:
 *
 *   1. before every attempt, re-checks that the recipient can still see the
 *      source record (`checkNotificationAccess`) and still wants the email
 *      (`resolveEmailPreference`, current rows). Revoked or switched off
 *      cancels the row; a failed read sends nothing and leaves it for later;
 *   2. asks `authorizeUserEmail` for the tenant disposition, on every attempt;
 *   3. freezes the rendered message, encrypted, in `send_snapshot`
 *      (`begin_notification_email_attempt`, which never replaces a stored one)
 *      and sends the bytes the database returned, so a retry is the same
 *      message under the same idempotency key. An email the recipient can
 *      switch off is frozen with its `List-Unsubscribe` headers (N3-05),
 *      signed for the version of the recipient's preference row, which is
 *      written in `default` when there is none; when they cannot be signed
 *      it is not frozen and nothing is sent;
 *   4. asks the database whether the address has bounced (N3-06), on every
 *      attempt: a first attempt hands over a keyed digest of the address, which
 *      is recorded for the row; a retry is judged by the digest recorded when
 *      its message was frozen. A bounce suppresses the address, not the user:
 *      the row is cancelled, and without the key or an answer nothing is sent;
 *   5. submits through `deliverOutboundEmail` and records what happened.
 *
 * Failure semantics (N3-04). A provider refusal is definite: the row fails, and
 * a 409 fails it on the first response, the key never changed to get past it.
 * A 429, a 5xx or a call that threw is ambiguous: the message may have gone
 * out. The row keeps its snapshot and key, waits out a jittered exponential
 * backoff, and once a snapshot is frozen a row that stops is never `cancelled`
 * but `cancelled_after_ambiguous`; 24 hours after its first attempt it becomes
 * `unknown` without another send.
 *
 * Throttle. One run claims at most `SEND_BUDGET` rows and sends them one after
 * another. Password recovery mail shares the provider and goes first: the claim
 * returns nothing while recovery mail is due, and the worker asks again before
 * each send. When recovery mail is due, that read fails, or the provider
 * answers ambiguously, the run sends nothing more and hands its rows back.
 *
 * Only the live lease owner can freeze or finish a row: the database checks it.
 * Nothing that identifies a recipient is logged or returned.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCatalogEntry, getCatalogTemplates, type NotificationCategory } from '../notifications/catalog';
import { resolveEmailPreference } from '../notifications/resolve-preference';
import { getAppBaseUrl } from '../utils/app-url';
import { checkNotificationAccess } from './notification-access';
import { createUnsubscribeToken, preferenceVersionForLink, unsubscribeHeaders } from './notification-unsubscribe';
import { buildNotificationEmail, platformPath } from './notifications';
import { authorizeUserEmail } from './outbound-policy';
import { deliverOutboundEmail, isDeliveryConfigured, resolveSender, type EmailTransport } from './provider';

/** Rows claimed per run. Each makes at most one provider call, so this is also the most a run can send. */
const SEND_BUDGET = 20;
const LEASE_SECONDS = 120;
/** After a failed read or a missing configuration: nothing was sent. */
const RETRY_SECONDS = 900;
/** For a row handed back unsent because the run stopped sending. */
const RELEASE_SECONDS = 60;
/** After an ambiguous provider outcome: doubles per attempt up to the maximum. */
const BACKOFF_BASE_SECONDS = 120;
const BACKOFF_MAX_SECONDS = 3600;
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
  /** Ambiguous for 24 hours: closed without another send. */
  unknown: number;
  /** Handed back unsent because the run stopped sending (recovery mail due, or the provider backing off). */
  deferred: number;
  /** Rows whose lease was gone before the outcome could be written; the database left them unchanged. */
  lost: number;
}

type RowOutcome = 'sent' | 'cancelled' | 'failed' | 'retried' | 'digest' | 'unknown' | 'deferred' | 'lost';

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
  /** The unsubscribe headers of an email the recipient can switch off. */
  headers?: Record<string, string>;
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
    if (typeof parsed?.to !== 'string' || typeof parsed.subject !== 'string' || typeof parsed.html !== 'string') return null;
    const message: FrozenMessage = { to: parsed.to, subject: parsed.subject, html: parsed.html };
    if (parsed.headers !== undefined) {
      const headers = parsed.headers;
      if (!headers || typeof headers !== 'object' || Object.values(headers).some((value) => typeof value !== 'string')) return null;
      message.headers = headers;
    }
    return message;
  } catch {
    return null;
  }
}

/**
 * The address digest key, from the server-only `NOTIFICATION_SUPPRESSION_SECRET`. No
 * fallback to another secret: under a changed key no stored suppression would
 * match again. Shorter than 32 characters counts as unset.
 */
function suppressionKey(): Buffer | null {
  const secret = process.env.NOTIFICATION_SUPPRESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return null;
  return createHash('sha256').update('genera/notification-address-suppression/v1/').update(secret).digest();
}

/**
 * What a bounce suppression is stored and looked up under: HMAC-SHA256 of the
 * trimmed, lowercased address, as hex. The address itself is never stored.
 * Null without the key or an address.
 */
export function notificationAddressDigest(address: string): string | null {
  const key = suppressionKey();
  const normalized = address.trim().toLowerCase();
  if (!key || !normalized) return null;
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

/**
 * Whether notification email to this address is suppressed after a bounce, for
 * server code with the service role (N4-02's notice). `unavailable` without the
 * key or an answer.
 */
export async function readNotificationAddressSuppression(
  client: Pick<SupabaseClient, 'rpc'>,
  address: string
): Promise<'suppressed' | 'clear' | 'unavailable'> {
  const digest = notificationAddressDigest(address);
  if (!digest) return 'unavailable';
  try {
    const { data, error } = await client.rpc('notification_email_address_suppressed', { p_address_digest: digest });
    if (error || typeof data !== 'boolean') return 'unavailable';
    return data ? 'suppressed' : 'clear';
  } catch {
    return 'unavailable';
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
/**
 * The email goes out now. `unsubscribe` is what its link switches off, with the version of the preference row
 * that was read (null when there is no row); null for an email nobody can switch off.
 */
type Go = { unsubscribe: { category: NotificationCategory; prefVersion: unknown } | null };

/** The recipient's current email preference for this event. */
async function preferenceStep(client: SupabaseClient, row: ClaimedRow): Promise<Stop | Go> {
  const entry = getCatalogEntry(row.event_type);
  let categoryMode: unknown = null;
  let prefVersion: unknown = null;
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
          .select('email_mode, pref_version')
          .eq('user_id', row.user_id)
          .eq('category', entry.category)
          .maybeSingle(),
      ]);
      if (legacy.error || category.error) lookupFailed = true;
      legacySuppressed = legacy.data?.email_enabled === false;
      categoryMode = category.data?.email_mode ?? null;
      if (category.data) prefVersion = category.data.pref_version;
    } catch {
      lookupFailed = true;
    }
  }

  const decision = resolveEmailPreference({ eventType: row.event_type, categoryMode, legacySuppressed, lookupFailed });
  if (decision.reason === 'preference_unavailable') return { outcome: 'retry', code: 'preference_unavailable' };
  if (decision.mode === 'off') return { outcome: 'cancelled', code: 'preference_off' };
  if (decision.mode === 'digest') return { outcome: 'digest' };
  if (!entry || entry.mandatory) return { unsubscribe: null };
  return { unsubscribe: { category: entry.category, prefVersion } };
}

/** Whether the recipient may get this email now: the source record and the current preference. */
async function eligibility(client: SupabaseClient, row: ClaimedRow): Promise<Stop | Go> {
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

  return preferenceStep(client, row);
}

/**
 * The sealed message of a first attempt. The address comes from the profile, never from the row or its payload.
 * An email the recipient can switch off is sealed with its unsubscribe headers, or not at all.
 */
async function sealFirstAttempt(
  client: SupabaseClient,
  row: ClaimedRow,
  key: Buffer,
  unsubscribe: Go['unsubscribe']
): Promise<Stop | { sealed: string; to: string }> {
  const { data: profile, error } = await client.from('profiles').select('email').eq('id', row.user_id).maybeSingle();
  if (error) return { outcome: 'retry', code: 'recipient_lookup_failed' };
  const to = typeof profile?.email === 'string' ? profile.email.trim() : '';
  if (!to) return { outcome: 'failed', code: 'missing_recipient' };

  let headers: Record<string, string> | undefined;
  if (unsubscribe) {
    // The link is signed for a row's version: a recipient with no row gets the row first.
    const prefVersion = unsubscribe.prefVersion ?? (await preferenceVersionForLink(client, row.user_id, unsubscribe.category));
    const token = createUnsubscribeToken('category', row.user_id, [{ category: unsubscribe.category, prefVersion: prefVersion as number }]);
    if (!token) return { outcome: 'retry', code: 'unsubscribe_unavailable' };
    headers = unsubscribeHeaders(token);
  }

  return { sealed: sealSnapshot(key, { ...renderMessage(row, to), ...(headers ? { headers } : {}) }), to };
}

/**
 * Whether the row's address has bounced. `to` is the address of a first attempt; null for a retry, whose
 * frozen address the database already holds a digest of. Null when the address is clear to send to.
 */
async function addressStep(client: SupabaseClient, owner: string, row: ClaimedRow, to: string | null): Promise<Stop | 'lost' | null> {
  const unavailable: Stop = { outcome: 'retry', code: 'suppression_unavailable' };
  if (!suppressionKey()) return unavailable;
  try {
    const { data, error } = await client.rpc('check_notification_email_address', {
      p_id: row.id,
      p_owner: owner,
      p_address_digest: to === null ? null : notificationAddressDigest(to),
    });
    if (error) return unavailable;
    if (data === null) return 'lost';
    if (data === 'clear') return null;
    if (data === 'suppressed') return { outcome: 'cancelled', code: 'address_suppressed' };
    return unavailable;
  } catch {
    return unavailable;
  }
}

/** Seconds until the next attempt after `attempt` ambiguous ones: doubling, capped, the upper half random. */
function backoffSeconds(attempt: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

interface Run {
  client: SupabaseClient;
  owner: string;
  key: Buffer;
  transport?: EmailTransport;
  random: () => number;
}

async function finishRow(
  run: Run,
  row: ClaimedRow,
  outcome: 'sent' | 'cancelled' | 'failed' | 'retry' | 'digest',
  code?: string,
  extra: { providerMessageId?: string; retrySeconds?: number } = {}
): Promise<RowOutcome> {
  const { data, error } = await run.client.rpc('finish_notification_email', {
    p_id: row.id,
    p_owner: run.owner,
    p_outcome: outcome,
    p_error_code: code ?? null,
    p_provider_message_id: extra.providerMessageId ?? null,
    p_retry_seconds: outcome === 'retry' ? extra.retrySeconds ?? RETRY_SECONDS : null,
  });
  if (error || data !== true) return 'lost';
  return outcome === 'retry' ? 'retried' : outcome;
}

/** Hands a claimed row back unsent, due again shortly; whatever it holds is kept. */
async function releaseRow(run: Run, row: ClaimedRow, code: string): Promise<RowOutcome> {
  const released = await finishRow(run, row, 'retry', code, { retrySeconds: RELEASE_SECONDS });
  return released === 'retried' ? 'deferred' : released;
}

/** One row. `halt` is set when the run must send nothing more; it is the code the remaining rows are released with. */
async function processRow(run: Run, row: ClaimedRow): Promise<{ outcome: RowOutcome; halt?: string }> {
  const { client, owner } = run;

  const settle = async (outcome: 'cancelled_after_ambiguous' | 'unknown', code: string): Promise<RowOutcome> => {
    const { data, error } = await client.rpc('settle_ambiguous_notification_email', {
      p_id: row.id,
      p_owner: owner,
      p_outcome: outcome,
      p_error_code: code,
    });
    if (error || data !== true) return 'lost';
    return outcome === 'unknown' ? 'unknown' : 'cancelled';
  };

  // A frozen snapshot means an earlier attempt may have reached the provider.
  const ambiguous = row.has_snapshot;
  let attempts = 0;
  if (ambiguous) {
    const { data, error } = await client.rpc('notification_email_retry_state', { p_id: row.id, p_owner: owner });
    const state = Array.isArray(data) ? data[0] : null;
    if (error || !state) return { outcome: 'lost' };
    if (state.expired) return { outcome: await settle('unknown', 'ambiguous_timeout') };
    attempts = state.attempt_count;
  }

  /** Ends the row, or leaves it for later. A row that may already have been sent is never plainly cancelled or failed. */
  const stop = (step: Stop): Promise<RowOutcome> => {
    if (step.outcome === 'retry') return finishRow(run, row, 'retry', step.code);
    if (ambiguous) return settle('cancelled_after_ambiguous', step.code ?? 'preference_digest');
    return finishRow(run, row, step.outcome, step.code);
  };

  let step: Stop | { sealed: string | null; to: string | null };
  try {
    // Before the first attempt, and again before every retry of an ambiguous one.
    const checked = await eligibility(client, row);
    if ('outcome' in checked) step = checked;
    else step = ambiguous ? { sealed: null, to: null } : await sealFirstAttempt(client, row, run.key, checked.unsubscribe);
  } catch {
    step = { outcome: 'retry', code: 'worker_error' };
  }
  if ('outcome' in step) return { outcome: await stop(step) };

  const authorization = await authorizeUserEmail(client, row.user_id);
  if (authorization.kind === 'suppressed_qa') return { outcome: await stop({ outcome: 'cancelled', code: 'suppressed_qa' }) };
  if (authorization.kind === 'refuse') {
    const transient = authorization.reason === 'user_lookup_failed' || authorization.reason === 'school_lookup_failed';
    return { outcome: await stop({ outcome: transient ? 'retry' : 'failed', code: `refused_${authorization.reason}` }) };
  }

  // Nothing to send with: the row stays unfrozen, so it is not mistaken for an attempt.
  if (!isDeliveryConfigured(run.transport)) return { outcome: await finishRow(run, row, 'retry', 'not_configured') };

  // Password recovery mail goes first. A queue that cannot be read counts as due.
  const recovery = await client.rpc('password_recovery_email_due');
  if (recovery.error || recovery.data !== false) {
    const code = recovery.data === true && !recovery.error ? 'recovery_priority' : 'priority_unavailable';
    return { outcome: await releaseRow(run, row, code), halt: code };
  }

  // A bounced address gets nothing more, whoever the user is: neither a first message nor a frozen one.
  const suppression = await addressStep(client, owner, row, step.to);
  if (suppression === 'lost') return { outcome: 'lost' };
  if (suppression) return { outcome: await stop(suppression) };

  // The database keeps an already frozen snapshot and hands back what is stored; nothing comes
  // back unless this run still owns the lease and the row is within 24 hours of its first attempt.
  const { data: stored, error: beginError } = await client.rpc('begin_notification_email_attempt', {
    p_id: row.id,
    p_owner: owner,
    p_snapshot: step.sealed,
  });
  if (beginError || !stored) return { outcome: 'lost' };

  const message = openSnapshot(run.key, stored);
  if (!message) return { outcome: await finishRow(run, row, 'retry', 'snapshot_unreadable') };

  const result = await deliverOutboundEmail({
    authorization,
    message,
    idempotencyKey: row.idempotency_key,
    transport: run.transport,
  });

  switch (result.status) {
    case 'provider_accepted':
      return { outcome: await finishRow(run, row, 'sent', undefined, { providerMessageId: result.providerMessageId }) };
    case 'provider_rejected':
      // A definite refusal, and a 409 is one: the key is never changed to get past it.
      // The provider's text can name the address, so only a code is kept.
      return { outcome: await finishRow(run, row, 'failed', result.conflict ? 'provider_conflict' : 'provider_rejected') };
    default: {
      // 429, 5xx or a call that threw: the message may have gone out. The frozen bytes go
      // out again later under the same key, and this run leaves the provider alone.
      const retrySeconds = backoffSeconds(attempts + 1, run.random);
      return { outcome: await finishRow(run, row, 'retry', result.status, { retrySeconds }), halt: 'provider_backoff' };
    }
  }
}

export async function runNotificationEmailWorker(
  client: SupabaseClient,
  deps: { transport?: EmailTransport; random?: () => number } = {}
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
    unknown: 0,
    deferred: 0,
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

  const run: Run = {
    client,
    owner: `notification-emails:${randomUUID()}`,
    key,
    transport: deps.transport,
    random: deps.random ?? Math.random,
  };
  const { data: claimed, error } = await client.rpc('claim_notification_emails', {
    p_owner: run.owner,
    p_limit: SEND_BUDGET,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) throw new Error('claim_failed');

  let halt: string | undefined;
  for (const row of (claimed ?? []) as ClaimedRow[]) {
    result.claimed++;
    let outcome: RowOutcome;
    try {
      if (halt) {
        outcome = await releaseRow(run, row, halt);
      } else {
        ({ outcome, halt } = await processRow(run, row));
      }
    } catch {
      // The row keeps its lease until it expires; the next run picks it up.
      outcome = 'lost';
    }
    result[outcome]++;
  }
  return result;
}
