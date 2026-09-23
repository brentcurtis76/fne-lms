/**
 * Immediate e-mail for one in-app notification.
 *
 * `NotificationService.createNotification` used to log "Would send immediate
 * email" and stop. This module is the real path, and it goes through the same
 * boundary every other outbound message uses: `authorizeUserEmail` decides
 * whether the recipient's tenant may receive mail at all, and
 * `deliverOutboundEmail` is the only module allowed to reach the provider.
 *
 * The recipient address is looked up server-side from `profiles`. It is never
 * accepted from a caller, so a browser cannot redirect a notification to an
 * address of its choosing, and neither the HTML body nor the authorization is
 * ever supplied from outside.
 *
 * Unlike `lib/email/invitations.ts` this module does NOT mirror into the local
 * E2E outbox. `lib/notificationService.ts` sits inside the browser-reachable
 * closure that `scripts/ci/check-browser-boundaries.mjs` computes, so importing
 * the server-only `./outbox` from here fails that boundary check. Nothing needs
 * the mirror yet: the delivery this unit proves is captured through an injected
 * transport instead.
 */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeHtml } from '../utils/html-escape';
import { getAppBaseUrl } from '../utils/app-url';
import { authorizeUserEmail } from './outbound-policy';
import { deliverOutboundEmail, type EmailTransport } from './provider';

const DEFAULT_FROM = 'Genera <notificaciones@nuevaeducacion.org>';

/** Where a notification whose own link is not usable sends the reader instead. */
const FALLBACK_PATH = '/notifications';

export type NotificationEmailStatus =
  | 'provider_accepted'
  | 'recipient_lookup_failed'
  | 'missing_recipient'
  | 'suppressed_qa'
  | 'refused'
  | 'not_configured'
  | 'provider_rejected'
  | 'transport_error';

export type NotificationEmailResult =
  | { sent: true; status: 'provider_accepted'; providerMessageId?: string }
  | { sent: false; status: Exclude<NotificationEmailStatus, 'provider_accepted'>; detail?: string };

export interface NotificationEmailInput {
  userId: string;
  title: string;
  description?: string | null;
  /** The in-app path stored on the notification, e.g. `/licitaciones`. */
  relatedUrl?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Reduce a stored `related_url` to a path on this platform.
 *
 * Notification URLs are assembled from templates and event payloads, so an
 * absolute URL can end up in the column. A link in an e-mail outlives the
 * request that produced it, so anything that is not unambiguously an in-app
 * path — an absolute URL, a protocol-relative `//host`, a `/\host` a browser
 * would also treat as protocol-relative, an unsubstituted `{placeholder}` —
 * is replaced by the notifications page rather than sent as-is.
 */
export function platformPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return FALLBACK_PATH;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return FALLBACK_PATH;
  // eslint-disable-next-line no-control-regex
  if (/[\\\s{}<>"']|[\u0000-\u001f]/.test(trimmed)) return FALLBACK_PATH;
  return trimmed;
}

/**
 * The provider idempotency key for this message.
 *
 * An explicit key is passed through verbatim: `notificationService` already
 * derives one per (event, event id, recipient) and the in-app row is stored
 * under it, so the two channels must agree.
 *
 * Most callers supply none — `pages/api/assignments/collaborative-submit.ts`
 * does not — and without a key a retry of the same request is a second
 * provider submission even when the in-app duplicate check suppresses its row.
 * So an omitted key is derived from the notification's own identity: the same
 * recipient, title, description and link produce the same key on every attempt,
 * a different notification produces a different one, and the digest is bounded
 * and carries no readable recipient data into a provider header.
 */
export function providerIdempotencyKey(input: NotificationEmailInput): string {
  if (input.idempotencyKey) return input.idempotencyKey;

  const identity = [
    input.userId,
    input.title,
    input.description ?? '',
    platformPath(input.relatedUrl),
  ].join('\u0000');

  return `notif-${createHash('sha256').update(identity, 'utf8').digest('hex')}`;
}

/** A subject line is a header value, not HTML: collapse it to a single line. */
function subjectFor(title: string): string {
  const collapsed = String(title ?? '').replace(/\s+/g, ' ').trim();
  return collapsed || 'Nueva notificación en Genera';
}

/**
 * The message body. Every interpolated value is escaped — the title and the
 * description come from event payloads, and the href is escaped too because it
 * is interpolated into an attribute.
 */
export function buildNotificationEmail(params: {
  title: string;
  description?: string | null;
  url: string;
}): { subject: string; html: string } {
  const subject = subjectFor(params.title);
  const safeTitle = escapeHtml(params.title);
  const safeDescription = escapeHtml(params.description);
  const safeHref = escapeHtml(params.url);

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
              <div style="color:#fbbf24;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                Genera
              </div>
              <h1 style="margin:12px 0 0;font-size:26px;line-height:1.25;">
                ${safeTitle}
              </h1>
            </div>
            <div style="padding:30px 28px;">
              ${safeDescription
                ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;">${safeDescription}</p>`
                : ''}
              <p style="margin:26px 0;text-align:center;">
                <a href="${safeHref}" style="display:inline-block;background:#fbbf24;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:6px;padding:14px 22px;">
                  Ver en Genera
                </a>
              </p>
              <p style="margin:0 0 8px;color:#666;font-size:13px;line-height:1.6;">
                Si el botón no funciona, copia este enlace en tu navegador:
              </p>
              <p style="margin:0;color:#0a0a0a;font-size:13px;line-height:1.6;word-break:break-all;">
                ${safeHref}
              </p>
              <p style="margin:24px 0 0;color:#666;font-size:13px;line-height:1.6;">
                Recibes este correo porque tienes activadas las notificaciones por correo en Genera.
                Puedes cambiarlo en tu configuración de notificaciones.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

  return { subject, html };
}

/**
 * Look the recipient up, authorize, and hand the message to the provider.
 *
 * `transport` is the testability seam, exactly as in `lib/email/invitations.ts`:
 * production leaves it unset and gets the real client, and there is no
 * environment switch that could reach a fake from a deployed build.
 */
export async function sendNotificationEmail(
  client: SupabaseClient,
  input: NotificationEmailInput,
  transport?: EmailTransport
): Promise<NotificationEmailResult> {
  const { data: profile, error } = await client
    .from('profiles')
    .select('email')
    .eq('id', input.userId)
    .maybeSingle();

  if (error) return { sent: false, status: 'recipient_lookup_failed' };

  const to = typeof profile?.email === 'string' ? profile.email.trim() : '';
  if (!to) return { sent: false, status: 'missing_recipient' };

  const authorization = await authorizeUserEmail(client, input.userId);

  const url = `${getAppBaseUrl()}${platformPath(input.relatedUrl)}`;
  const { subject, html } = buildNotificationEmail({
    title: input.title,
    description: input.description,
    url,
  });

  const result = await deliverOutboundEmail({
    authorization,
    message: {
      from: process.env.EMAIL_FROM_ADDRESS || DEFAULT_FROM,
      to,
      subject,
      html,
    },
    idempotencyKey: providerIdempotencyKey(input),
    transport,
  });

  if (result.status === 'provider_accepted') {
    return {
      sent: true,
      status: 'provider_accepted',
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    };
  }

  return {
    sent: false,
    status: result.status,
    ...('detail' in result && result.detail ? { detail: result.detail } : {}),
  };
}
