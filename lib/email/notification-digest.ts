/**
 * The daily notification digest consumer (NOTIF plan D4, D5, D9; ledger N5-01).
 * Dormant: it does nothing unless `NOTIFICATION_OUTBOX_DELIVERY` is on, and
 * only the digest cron route (`/api/cron/email-digest`) calls it; nothing
 * schedules that route or produces digest rows until N5-02.
 *
 * It drives the digest run RPCs of `20261008000000_notification_digest_runs.sql`
 * and never writes a run or member row itself. One call:
 *
 *   1. opens the runs that are due (`open_notification_digest_runs`: one run per
 *      user and Santiago civil date, computed by the database) and claims up to
 *      `SEND_BUDGET` of them under a lease (`claim_notification_digest_runs`,
 *      which returns nothing while password recovery mail is due);
 *   2. for a run not yet frozen, re-checks every pending member before anything
 *      is rendered: the source record (`checkNotificationAccess`) and the current
 *      preference (`resolveEmailPreference`). A member the recipient may no
 *      longer see or switched off is cancelled and never rendered; one whose
 *      category is now immediate or mandatory stays in the digest. A failed read
 *      cancels nothing and sends nothing. No member left cancels the run;
 *   3. reads the address from the profile, asks whether it has bounced and asks
 *      `authorizeUserEmail` for the tenant disposition, then renders the digest
 *      (es-CL, the catalog's allowlisted fields, a link per notice, the settings
 *      page, a body unsubscribe link per category and the RFC 8058 header link
 *      for the whole digest) and freezes it, encrypted, with the exact member set
 *      and the address digest (`begin_notification_digest_attempt`). A changed
 *      member set or a held row returns nothing: it reads the members again and
 *      tries again, a bounded number of times;
 *   4. sends the bytes the database returned under the run's provider key, and
 *      a retry of a frozen run sends the stored bytes again under the same key.
 *      Before every retry the frozen members, the preferences and the tenant are
 *      checked again, and the profile must still hold the frozen address (same
 *      normalized digest); any refusal, a removed or changed mailbox included,
 *      ends the whole run as `cancelled_after_ambiguous` (the bytes cannot be
 *      re-rendered or readdressed), and 24 hours after the first attempt it is
 *      `unknown` without another send;
 *   5. right before every provider call, first attempt and retry alike, renews
 *      the lease and reads the run again with its token: a begin answered after
 *      the lease ran out or another owner took the run, an unreadable state, 24
 *      hours or a suppression since the freeze never reach the provider. The
 *      window between that check and the provider's answer cannot be closed by
 *      the database; the stable provider key is what keeps a repeat idempotent.
 *
 * Outcomes follow the immediate worker (N3-04): accepted is `sent` once the
 * database recorded it; a refusal, a 409 included, is `failed`; a 429, a 5xx or a
 * call that threw is ambiguous and waits out a jittered backoff, at least the
 * provider's valid `Retry-After` and at most a day, with its bytes and key, and
 * the call sends nothing more. The `E2E_MAIL_OUTBOX` mirror records each guarded
 * attempt's frozen message and headers; it is an observation, never a send. Only the live lease token can cancel,
 * freeze, finish or settle: the database checks it, and a refused call ends the
 * run's processing as `lost`. Nothing that identifies a recipient is logged or
 * returned.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCatalogEntry, getCatalogTemplates, type NotificationCategory } from '../notifications/catalog';
import { resolveEmailPreference } from '../notifications/resolve-preference';
import { getAppBaseUrl } from '../utils/app-url';
import { escapeHtml } from '../utils/html-escape';
import { checkNotificationAccess } from './notification-access';
import { buildDigestUnsubscribeLinks, preferenceVersionForLink, type DigestUnsubscribeLinks } from './notification-unsubscribe';
import {
  isOutboxDeliveryEnabled,
  notificationAddressDigest,
  openSnapshot,
  readNotificationAddressSuppression,
  sealSnapshot,
} from './notification-worker';
import { NOTIFICATION_SETTINGS_PATH, platformPath } from './notifications';
import { captureOutboundEmail } from './outbox';
import { authorizeUserEmail, type OutboundEmailAuthorization } from './outbound-policy';
import { deliverOutboundEmail, isDeliveryConfigured, MAX_RETRY_AFTER_SECONDS, resolveSender, type EmailTransport } from './provider';

/** Runs opened per call, and the most notices one digest carries (the rest wait for a later date). */
const OPEN_LIMIT = 20;
const MAX_MEMBERS = 50;
/** Runs claimed per call. Each makes at most one provider call, so this is also the most a call can send. */
const SEND_BUDGET = 10;
const LEASE_SECONDS = 300;
/** After a failed read or a missing configuration: nothing was sent. */
const RETRY_SECONDS = 900;
/** For a run handed back unsent because the call stopped sending, or a freeze that kept meeting a changed member set. */
const RELEASE_SECONDS = 60;
/** After an ambiguous provider outcome: doubles per attempt up to the maximum. */
const BACKOFF_BASE_SECONDS = 120;
const BACKOFF_MAX_SECONDS = 3600;
/** Freeze attempts per run and call when the member set changed underneath. */
const FREEZE_TRIES = 3;
const GENERIC_TITLE = 'Tienes una nueva notificación en Genera';
/** Until N5-06 the finalize route's summary is a meeting's only email (as in the immediate worker). */
const EMAIL_SUPPRESSED_EVENT = 'meeting_finalized';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface NotificationDigestResult {
  enabled: boolean;
  status: 'disabled' | 'not_configured' | 'ok';
  /** Runs this call opened. */
  opened: number;
  /** Runs this call leased. Every one ends in exactly one of the counters below. */
  claimed: number;
  sent: number;
  failed: number;
  /** Ended without a send: no member left, address suppressed, tenant refused, or `cancelled_after_ambiguous`. */
  cancelled: number;
  /** Ambiguous for 24 hours: closed without another send. */
  unknown: number;
  /** Handed back for a later attempt: a failed read, a missing configuration or an ambiguous provider answer. */
  retried: number;
  /** Handed back unsent because the call stopped sending (recovery mail due, or the provider backing off). */
  deferred: number;
  /** The lease was gone, or a call threw, before an outcome was recorded; the database left the run as it was. */
  lost: number;
  /** Members cancelled before a freeze because access, preference or the event rule refused them. */
  membersCancelled: number;
}

type RunOutcome = 'sent' | 'failed' | 'cancelled' | 'unknown' | 'retried' | 'deferred' | 'lost';
type Step = { outcome: RunOutcome; halt?: string };

interface ClaimedRun {
  run_id: string;
  lease_token: string;
  user_id: string;
  local_date: string;
  provider_key: string;
}

interface RunState {
  attempt_count: number;
  has_snapshot: boolean;
  expired: boolean;
  address_suppressed: boolean;
}

interface Member {
  outbox_id: string;
  status: string;
  event_type: string;
  related_url: string | null;
  payload: Record<string, unknown> | null;
  source_kind: string | null;
  source_id: string | null;
}

interface Preferences {
  categories: Map<string, { mode: unknown; version: unknown }>;
  legacyOff: Set<string>;
}

/** Keep the member (its unsubscribe category, null for a mandatory event), drop it, or decide nothing now. */
type Verdict =
  | { kind: 'keep'; category: NotificationCategory | null }
  | { kind: 'drop'; code: string }
  | { kind: 'unavailable'; code: string };

type FrozenMessage = NonNullable<ReturnType<typeof openSnapshot>>;

interface Ctx {
  client: SupabaseClient;
  key: Buffer;
  transport?: EmailTransport;
  random: () => number;
  run: ClaimedRun;
  result: NotificationDigestResult;
}

/** The snapshot key: the immediate worker's derivation of `NOTIFICATION_SNAPSHOT_SECRET`, no fallback, under 32 characters unset. */
function snapshotKey(): Buffer | null {
  const secret = process.env.NOTIFICATION_SNAPSHOT_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return null;
  return createHash('sha256').update('genera/notification-email-snapshot/').update(secret).digest();
}

/**
 * Seconds until the next attempt after `attempt` ambiguous ones: doubling, capped, the upper half random. A valid
 * provider `Retry-After` (already clamped to a day by `parseRetryAfter`) is the floor; the result never exceeds a day,
 * the ambiguity window and the database's limit, so a later wait than that ends the run as `unknown` instead.
 */
function backoffSeconds(attempt: number, random: () => number, retryAfterSeconds = 0): number {
  const ceiling = Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * 2 ** (attempt - 1));
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(Math.round(ceiling / 2 + random() * (ceiling / 2)), retryAfterSeconds));
}

const lease = (ctx: Ctx) => ({ p_run_id: ctx.run.run_id, p_lease_token: ctx.run.lease_token });

async function finish(
  ctx: Ctx,
  outcome: 'sent' | 'failed' | 'cancelled' | 'retry',
  code: string | null,
  extra: { providerMessageId?: string; retrySeconds?: number } = {}
): Promise<RunOutcome> {
  const { data, error } = await ctx.client.rpc('finish_notification_digest_run', {
    ...lease(ctx),
    p_outcome: outcome,
    p_error_code: code,
    p_provider_message_id: extra.providerMessageId ?? null,
    p_retry_seconds: outcome === 'retry' ? extra.retrySeconds ?? RETRY_SECONDS : null,
  });
  if (error || data !== true) return 'lost';
  return outcome === 'retry' ? 'retried' : outcome;
}

const release = async (ctx: Ctx, code: string, seconds = RETRY_SECONDS): Promise<Step> => ({
  outcome: await finish(ctx, 'retry', code, { retrySeconds: seconds }),
});

async function settle(ctx: Ctx, outcome: 'cancelled_after_ambiguous' | 'unknown', code: string): Promise<Step> {
  const { data, error } = await ctx.client.rpc('settle_ambiguous_notification_digest_run', {
    ...lease(ctx),
    p_outcome: outcome,
    p_error_code: code,
  });
  if (error || data !== true) return { outcome: 'lost' };
  return { outcome: outcome === 'unknown' ? 'unknown' : 'cancelled' };
}

/** The live owner's view of the run; 'lost' when the token no longer holds it. */
async function readState(ctx: Ctx): Promise<RunState | 'lost' | 'unavailable'> {
  const { data, error } = await ctx.client.rpc('notification_digest_run_state', lease(ctx));
  if (error || !Array.isArray(data)) return 'unavailable';
  const state = data[0];
  if (!state) return 'lost';
  if (!Number.isSafeInteger(state.attempt_count) || typeof state.has_snapshot !== 'boolean') return 'unavailable';
  return state as RunState;
}

/** Every member with its current outbox state. A run always has members, so none means the token no longer holds it. */
async function readMembers(ctx: Ctx): Promise<Member[] | 'lost' | 'unavailable'> {
  const { data, error } = await ctx.client.rpc('notification_digest_run_members', lease(ctx));
  if (error || !Array.isArray(data)) return 'unavailable';
  return data.length === 0 ? 'lost' : (data as Member[]);
}

/** The recipient's category rows and legacy suppressions, read once per attempt; null when either read failed. */
async function readPreferences(client: SupabaseClient, userId: string): Promise<Preferences | null> {
  try {
    const [category, legacy] = await Promise.all([
      client.from('user_notification_category_prefs').select('category, email_mode, pref_version').eq('user_id', userId),
      client.from('user_notification_preferences').select('notification_type, email_enabled').eq('user_id', userId),
    ]);
    if (category.error || legacy.error || !Array.isArray(category.data) || !Array.isArray(legacy.data)) return null;
    const preferences: Preferences = { categories: new Map(), legacyOff: new Set() };
    for (const row of category.data) preferences.categories.set(row.category, { mode: row.email_mode, version: row.pref_version });
    for (const row of legacy.data) if (row.email_enabled === false) preferences.legacyOff.add(row.notification_type);
    return preferences;
  } catch {
    return null;
  }
}

/** Whether the recipient may still get this member: the event rule, the source record, the current preference. */
async function checkMember(client: SupabaseClient, userId: string, member: Member, preferences: Preferences | null): Promise<Verdict> {
  if (member.event_type === EMAIL_SUPPRESSED_EVENT) return { kind: 'drop', code: 'email_suppressed' };
  const access = await checkNotificationAccess(client, {
    eventType: member.event_type,
    userId,
    sourceKind: member.source_kind,
    sourceId: member.source_id,
  });
  if (access.access === 'unavailable') return { kind: 'unavailable', code: access.code };
  if (access.access !== 'allow') return { kind: 'drop', code: access.code };

  // Access is only ever allowed for a catalog event.
  const entry = getCatalogEntry(member.event_type)!;
  const decision = resolveEmailPreference({
    eventType: member.event_type,
    categoryMode: preferences?.categories.get(entry.category)?.mode ?? null,
    legacySuppressed: preferences?.legacyOff.has(member.event_type) ?? false,
    lookupFailed: preferences === null,
  });
  if (decision.reason === 'preference_unavailable') return { kind: 'unavailable', code: 'preference_unavailable' };
  if (decision.mode === 'off') return { kind: 'drop', code: 'preference_off' };
  return { kind: 'keep', category: entry.mandatory ? null : entry.category };
}

type Checked = { member: Member; verdict: Exclude<Verdict, { kind: 'unavailable' }> };

/** Every member checked, with the preferences read for them; the first unavailable answer decides nothing for any. */
async function checkMembers(ctx: Ctx, members: Member[]): Promise<{ checked: Checked[]; preferences: Preferences | null } | { unavailable: string }> {
  const preferences = await readPreferences(ctx.client, ctx.run.user_id);
  const checked: Checked[] = [];
  for (const member of members) {
    const verdict = await checkMember(ctx.client, ctx.run.user_id, member, preferences);
    if (verdict.kind === 'unavailable') return { unavailable: verdict.code };
    checked.push({ member, verdict });
  }
  return { checked, preferences };
}

/**
 * The digest's unsubscribe links, each signed for the current version of its category row; a recipient without a
 * row gets a `default` one first. `{}` when every notice is mandatory; null when a link cannot be signed.
 */
async function unsubscribeLinks(
  ctx: Ctx,
  categories: NotificationCategory[],
  preferences: Preferences | null
): Promise<DigestUnsubscribeLinks | Record<string, never> | null> {
  if (categories.length === 0) return {};
  if (!preferences) return null;
  const scopes = [];
  for (const category of categories) {
    const stored = preferences.categories.get(category);
    const version = stored ? stored.version : await preferenceVersionForLink(ctx.client, ctx.run.user_id, category);
    if (!Number.isSafeInteger(version) || (version as number) < 1) return null;
    scopes.push({ category, prefVersion: version as number });
  }
  return buildDigestUnsubscribeLinks(ctx.run.user_id, scopes);
}

/** The catalog's allowlisted payload fields, as the nested object the registry templates read. */
function templateData(eventType: string, payload: Record<string, unknown> | null): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const path of getCatalogEntry(eventType)?.emailFields ?? []) {
    const value = payload && Object.prototype.hasOwnProperty.call(payload, path) ? payload[path] : undefined;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const keys = path.split('.');
    let target = data;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as Record<string, unknown>;
    target[keys[keys.length - 1]] = value;
  }
  return data;
}

/** One notice: the registry templates over the allowlisted payload, or the generic notice. */
function notice(member: Member): { title: string; description: string | null; url: string } {
  const templates = getCatalogTemplates(member.event_type);
  let title = GENERIC_TITLE;
  let description: string | null = null;
  if (templates) {
    try {
      const data = templateData(member.event_type, member.payload);
      title = templates.title(data);
      description = templates.description(data);
    } catch {
      title = GENERIC_TITLE;
      description = null;
    }
  }
  return { title, description, url: `${getAppBaseUrl()}${platformPath(member.related_url)}` };
}

/** "8 de octubre de 2026" from the run's civil date, as the database computed it. */
function dateLabel(localDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  return match ? `${Number(match[3])} de ${MONTHS[Number(match[2]) - 1]} de ${match[1]}` : null;
}

/** The digest email. Every value is escaped here; links are absolute same-origin URLs. */
function renderDigest(
  localDate: string,
  to: string,
  members: Member[],
  links: DigestUnsubscribeLinks | Record<string, never>
): { to: string; subject: string; html: string; headers?: Record<string, string> } {
  const count = members.length;
  const subject = `Tu resumen diario de Genera: ${count} ${count === 1 ? 'notificación' : 'notificaciones'}`;
  const date = dateLabel(localDate);
  const settings = escapeHtml(`${getAppBaseUrl()}${NOTIFICATION_SETTINGS_PATH}`);
  const items = members
    .map(notice)
    .map(({ title, description, url }) => {
      const href = escapeHtml(url);
      return `<li style="margin:0 0 16px;font-size:16px;line-height:1.5;"><a href="${href}" style="color:#0a0a0a;font-weight:700;">${escapeHtml(title)}</a>${
        description ? `<br /><span style="color:#444;">${escapeHtml(description)}</span>` : ''
      }</li>`;
    })
    .join('\n');
  const categoryLinks = 'categoryLinks' in links
    ? links.categoryLinks
        .map(({ label, url }) => `<li><a href="${escapeHtml(url)}" style="color:#0a0a0a;">No recibir más correos de ${escapeHtml(label)}</a></li>`)
        .join('\n')
    : '';

  const html = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#202020;">
          <div style="max-width:620px;margin:0 auto;background:#ffffff;">
            <div style="background:#0a0a0a;color:#ffffff;padding:28px 28px 22px;">
              <div style="color:#fbbf24;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Genera</div>
              <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;">Tu resumen diario</h1>
              ${date ? `<p style="margin:8px 0 0;font-size:15px;">${escapeHtml(date)}</p>` : ''}
            </div>
            <div style="padding:30px 28px;">
              <ul style="margin:0;padding:0 0 0 20px;">
${items}
              </ul>
              <p style="margin:20px 0 0;color:#666;font-size:13px;line-height:1.6;">
                Recibes este resumen porque elegiste recibir algunas notificaciones de Genera en un resumen diario. Puedes cambiarlo en tu configuración de notificaciones.<br />
                Configuración de notificaciones: <a href="${settings}" style="color:#0a0a0a;word-break:break-all;">${settings}</a>
              </p>
              ${categoryLinks ? `<ul style="margin:12px 0 0;padding:0 0 0 20px;color:#666;font-size:13px;line-height:1.6;">\n${categoryLinks}\n              </ul>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;
  return { to, subject, html, ...('headers' in links ? { headers: links.headers } : {}) };
}

/** A refusal of the tenant check, as the step it leads to: transient reads wait, the rest end the run. */
function refusal(authorization: OutboundEmailAuthorization): { retry: boolean; code: string } | null {
  if (authorization.kind === 'suppressed_qa') return { retry: false, code: 'suppressed_qa' };
  if (authorization.kind === 'refuse') {
    const transient = authorization.reason === 'user_lookup_failed' || authorization.reason === 'school_lookup_failed';
    return { retry: transient, code: `refused_${authorization.reason}` };
  }
  return null;
}

/** Password recovery mail goes first; a queue that cannot be read counts as due. The halt code, or null. */
async function recoveryHalt(ctx: Ctx): Promise<string | null> {
  const { data, error } = await ctx.client.rpc('password_recovery_email_due');
  if (!error && data === false) return null;
  return data === true && !error ? 'recovery_priority' : 'priority_unavailable';
}

/** Hands the run back unsent, due again shortly, and stops the call's sends. */
async function defer(ctx: Ctx, halt: string): Promise<Step> {
  const released = await finish(ctx, 'retry', halt, { retrySeconds: RELEASE_SECONDS });
  return { outcome: released === 'retried' ? 'deferred' : released, halt };
}

/**
 * The live owner's check right before the provider call: the lease renewed, then the run read again with the token.
 * A begin answered after the lease ran out, another owner, 24 hours or a suppression since the freeze stop the send;
 * an unreadable answer hands the run back with its snapshot. Null when the send may go ahead.
 */
async function ownerGuard(ctx: Ctx): Promise<Step | null> {
  const renewed = await renew(ctx);
  const state = await readState(ctx);
  if (state === 'lost') return { outcome: 'lost' };
  if (state === 'unavailable') return release(ctx, 'state_unavailable');
  if (!renewed) return release(ctx, 'lease_unavailable');
  if (state.expired) return settle(ctx, 'unknown', 'ambiguous_timeout');
  if (state.address_suppressed) return settle(ctx, 'cancelled_after_ambiguous', 'address_suppressed');
  return null;
}

/**
 * A retry goes only to the mailbox the profile still holds: the frozen address and the current one compared by their
 * normalized digests. No address now, or another one, revokes the frozen address for the whole run; an unreadable or
 * malformed answer decides nothing and keeps the snapshot. Null when the frozen address is still current.
 */
async function recipientRevoked(ctx: Ctx, frozenTo: string): Promise<Step | null> {
  const { data: profile, error } = await ctx.client.from('profiles').select('email').eq('id', ctx.run.user_id).maybeSingle();
  if (error || (profile !== null && typeof profile !== 'object')) return release(ctx, 'recipient_lookup_failed');
  const email: unknown = profile === null ? null : profile.email;
  if (email !== null && typeof email !== 'string') return release(ctx, 'recipient_lookup_failed');
  const current = typeof email === 'string' ? email.trim() : '';
  if (!current) return settle(ctx, 'cancelled_after_ambiguous', 'missing_recipient');

  const frozen = notificationAddressDigest(frozenTo);
  const now = notificationAddressDigest(current);
  if (!frozen || !now) return release(ctx, 'suppression_unavailable');
  return frozen === now ? null : settle(ctx, 'cancelled_after_ambiguous', 'recipient_changed');
}

/** Submits the frozen message under the run's key, once the owner guard passed, and records what the provider answered. */
async function send(ctx: Ctx, message: FrozenMessage, authorization: OutboundEmailAuthorization, attempts: number): Promise<Step> {
  const guarded = await ownerGuard(ctx);
  if (guarded) return guarded;

  // Only an attempt the guards authorized gets here: the frozen bytes and headers it submits are mirrored once.
  captureOutboundEmail({ to: message.to, subject: message.subject, html: message.html, headers: message.headers });
  const result = await deliverOutboundEmail({
    authorization,
    message,
    idempotencyKey: ctx.run.provider_key,
    transport: ctx.transport,
  });

  switch (result.status) {
    case 'provider_accepted':
      return { outcome: await finish(ctx, 'sent', null, { providerMessageId: result.providerMessageId }) };
    case 'provider_rejected':
      // A definite refusal, and a 409 is one: the key is never changed to get past it. The text can name the address.
      return { outcome: await finish(ctx, 'failed', result.conflict ? 'provider_conflict' : 'provider_rejected') };
    default: {
      // 429, 5xx or a call that threw: the digest may have gone out. Same bytes and key later; this call stops sending.
      const retryAfter = result.status === 'transport_error' ? result.retryAfterSeconds : undefined;
      const retrySeconds = backoffSeconds(attempts + 1, ctx.random, retryAfter);
      return { outcome: await finish(ctx, 'retry', result.status, { retrySeconds }), halt: 'provider_backoff' };
    }
  }
}

/** Renews the lease right before the attempt, so the provider call happens inside it. */
async function renew(ctx: Ctx): Promise<boolean> {
  const { data, error } = await ctx.client.rpc('renew_notification_digest_run', { ...lease(ctx), p_lease_seconds: LEASE_SECONDS });
  return !error && data === true;
}

/** A run with no frozen snapshot: check, cancel, render, freeze, send. */
async function firstAttempt(ctx: Ctx, attempts: number): Promise<Step> {
  const { client, run } = ctx;
  for (let attempt = 1; ; attempt++) {
    const members = await readMembers(ctx);
    if (members === 'lost') return { outcome: 'lost' };
    if (members === 'unavailable') return release(ctx, 'members_unavailable');

    const review = await checkMembers(ctx, members.filter((member) => member.status === 'pending'));
    if ('unavailable' in review) return release(ctx, review.unavailable);

    const kept: Member[] = [];
    const categories: NotificationCategory[] = [];
    let changed = false;
    for (const { member, verdict } of review.checked) {
      if (verdict.kind === 'keep') {
        kept.push(member);
        if (verdict.category && !categories.includes(verdict.category)) categories.push(verdict.category);
        continue;
      }
      const { data, error } = await ctx.client.rpc('cancel_notification_digest_member', {
        ...lease(ctx),
        p_outbox_id: member.outbox_id,
        p_error_code: verdict.code,
      });
      if (!error && data === true) ctx.result.membersCancelled++;
      // Refused: the member changed meanwhile (an unsubscribe) or the lease is gone. Read again.
      else changed = true;
    }
    if (changed) {
      if (attempt >= FREEZE_TRIES) return release(ctx, 'freeze_contention', RELEASE_SECONDS);
      continue;
    }
    if (kept.length === 0) return { outcome: await finish(ctx, 'cancelled', 'no_members') };

    // The address comes from the profile, never from a member row or its payload.
    const { data: profile, error } = await client.from('profiles').select('email').eq('id', run.user_id).maybeSingle();
    if (error) return release(ctx, 'recipient_lookup_failed');
    const to = typeof profile?.email === 'string' ? profile.email.trim() : '';
    if (!to) return { outcome: await finish(ctx, 'cancelled', 'missing_recipient') };

    const digest = notificationAddressDigest(to);
    const suppression = await readNotificationAddressSuppression(client, to);
    if (suppression === 'suppressed') return { outcome: await finish(ctx, 'cancelled', 'address_suppressed') };
    if (!digest || suppression === 'unavailable') return release(ctx, 'suppression_unavailable');

    const authorization = await authorizeUserEmail(client, run.user_id);
    const refused = refusal(authorization);
    if (refused?.retry) return release(ctx, refused.code);
    if (refused) return { outcome: await finish(ctx, 'cancelled', refused.code) };

    // Nothing to send with: the run stays unfrozen, so it is not mistaken for an attempt.
    if (!isDeliveryConfigured(ctx.transport)) return release(ctx, 'not_configured');

    const links = await unsubscribeLinks(ctx, categories, review.preferences);
    if (!links) return release(ctx, 'unsubscribe_unavailable');
    const sealed = sealSnapshot(ctx.key, renderDigest(run.local_date, to, kept, links));

    const halt = await recoveryHalt(ctx);
    if (halt) return defer(ctx, halt);
    if (!(await renew(ctx))) return { outcome: 'lost' };

    const begun = await client.rpc('begin_notification_digest_attempt', {
      ...lease(ctx),
      p_snapshot: sealed,
      p_member_ids: kept.map((member) => member.outbox_id),
      p_address_digest: digest,
    });
    if (!begun.error && begun.data) {
      const message = openSnapshot(ctx.key, begun.data);
      return message ? send(ctx, message, authorization, attempts) : release(ctx, 'snapshot_unreadable');
    }

    // Nothing frozen: the member set changed, a row was held, the address was suppressed meanwhile or the lease is gone.
    if (attempt >= FREEZE_TRIES) return release(ctx, 'freeze_contention', RELEASE_SECONDS);
  }
}

/** A frozen run: an earlier attempt may have reached the provider. Never re-rendered, never cancelled plainly. */
async function retryAttempt(ctx: Ctx, state: RunState): Promise<Step> {
  if (state.expired) return settle(ctx, 'unknown', 'ambiguous_timeout');
  if (state.address_suppressed) return settle(ctx, 'cancelled_after_ambiguous', 'address_suppressed');

  const members = await readMembers(ctx);
  if (members === 'lost') return { outcome: 'lost' };
  if (members === 'unavailable') return release(ctx, 'members_unavailable');
  const review = await checkMembers(ctx, members.filter((member) => member.status === 'sending'));
  if ('unavailable' in review) return release(ctx, review.unavailable);
  const dropped = review.checked.find(({ verdict }) => verdict.kind === 'drop');
  if (dropped?.verdict.kind === 'drop') return settle(ctx, 'cancelled_after_ambiguous', dropped.verdict.code);

  const authorization = await authorizeUserEmail(ctx.client, ctx.run.user_id);
  const refused = refusal(authorization);
  if (refused?.retry) return release(ctx, refused.code);
  if (refused) return settle(ctx, 'cancelled_after_ambiguous', refused.code);

  if (!isDeliveryConfigured(ctx.transport)) return release(ctx, 'not_configured');
  const halt = await recoveryHalt(ctx);
  if (halt) return defer(ctx, halt);
  if (!(await renew(ctx))) return { outcome: 'lost' };

  // The stored bytes come back; the arguments are ignored for a frozen run.
  const begun = await ctx.client.rpc('begin_notification_digest_attempt', {
    ...lease(ctx),
    p_snapshot: null,
    p_member_ids: null,
    p_address_digest: null,
  });
  if (!begun.error && begun.data) {
    const message = openSnapshot(ctx.key, begun.data);
    if (!message) return release(ctx, 'snapshot_unreadable');
    const revoked = await recipientRevoked(ctx, message.to);
    return revoked ?? send(ctx, message, authorization, state.attempt_count);
  }

  // Refused: 24 hours passed, the frozen address bounced, or the lease is gone. Read why.
  const now = await readState(ctx);
  if (now === 'lost') return { outcome: 'lost' };
  if (now === 'unavailable') return release(ctx, 'state_unavailable');
  if (now.expired) return settle(ctx, 'unknown', 'ambiguous_timeout');
  if (now.address_suppressed) return settle(ctx, 'cancelled_after_ambiguous', 'address_suppressed');
  return release(ctx, 'begin_refused');
}

async function processRun(ctx: Ctx): Promise<Step> {
  const state = await readState(ctx);
  if (state === 'lost') return { outcome: 'lost' };
  if (state === 'unavailable') return release(ctx, 'state_unavailable');
  return state.has_snapshot ? retryAttempt(ctx, state) : firstAttempt(ctx, state.attempt_count);
}

/**
 * One digest pass. `transport` and `random` are the test seams, as in the immediate worker. Throws a fixed message,
 * naming nothing, when the runs cannot be opened or claimed; everything after that is contained per run.
 */
export async function runNotificationDigest(
  client: SupabaseClient,
  deps: { transport?: EmailTransport; random?: () => number } = {}
): Promise<NotificationDigestResult> {
  const result: NotificationDigestResult = {
    enabled: false,
    status: 'disabled',
    opened: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    unknown: 0,
    retried: 0,
    deferred: 0,
    lost: 0,
    membersCancelled: 0,
  };
  if (!isOutboxDeliveryEnabled()) return result;
  result.enabled = true;

  // Without a snapshot key or a valid sender nothing could be frozen or delivered: open and claim nothing.
  const key = snapshotKey();
  if (!key || resolveSender() === null) {
    result.status = 'not_configured';
    return result;
  }
  result.status = 'ok';

  const opened = await client.rpc('open_notification_digest_runs', { p_limit: OPEN_LIMIT, p_max_members: MAX_MEMBERS });
  if (opened.error) throw new Error('digest_open_failed');
  result.opened = Array.isArray(opened.data) ? opened.data.length : 0;

  const claimed = await client.rpc('claim_notification_digest_runs', { p_limit: SEND_BUDGET, p_lease_seconds: LEASE_SECONDS });
  if (claimed.error) throw new Error('digest_claim_failed');

  let halt: string | undefined;
  for (const run of (claimed.data ?? []) as ClaimedRun[]) {
    result.claimed++;
    const ctx: Ctx = { client, key, transport: deps.transport, random: deps.random ?? Math.random, run, result };
    let outcome: RunOutcome;
    try {
      if (halt) outcome = (await defer(ctx, halt)).outcome;
      else ({ outcome, halt } = await processRun(ctx));
    } catch {
      // The run keeps its lease until it expires; a later call picks it up. The error can name a recipient.
      outcome = 'lost';
    }
    result[outcome]++;
  }
  return result;
}
