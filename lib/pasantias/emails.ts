/**
 * Transactional e-mail for the Pasantías INSPIRA lead form (A5).
 *
 * Two messages, both best-effort: an auto-reply to the person who submitted
 * the form, and an internal notification to FNE. Neither may fail the request
 * — a lead that is safely persisted is the outcome that matters, so a missing
 * `RESEND_API_KEY` or a transport error is logged and swallowed, exactly as
 * `pages/api/contact.ts` and the tractor-signup grant flow already do.
 *
 * Layout: deliberately NOT the Genera `emailLayout` (D-09). These messages come
 * from Fundación Nueva Educación about a Barcelona internship, not from the
 * Genera platform, and a GENERA masthead on them would be wrong. The markup
 * below is the minimal FNE-branded frame that both messages share.
 *
 * PRICES: none, ever (D-02). This module imports `cohort-public` only — the
 * commercial module is unreachable from here by construction, not by care.
 */
import { Resend } from 'resend';
import { escapeHtml } from '../utils/html-escape';
import { buildAbsoluteUrl } from '../utils/app-url';
import { LEGAL_IDENTITY } from '../legal/privacy-notice';
import { COHORT_LABEL } from './cohort-public';
import { PASANTIAS_WHATSAPP } from './pdf/contact';

/** Where internal lead notifications go (Appendix A-10 contact address). */
export const LEAD_NOTIFICATION_RECIPIENT = 'info@nuevaeducacion.org';

/** Path of the brochure endpoint A4 serves. */
export const BROCHURE_PATH = '/api/pasantias/brochure';

/**
 * A lead never gets the auto-reply more than once a day, however many times
 * the form is submitted. `brochure_sent_at` is the durable record, so the
 * dedup survives a restart — unlike an in-process cache.
 */
export const AUTO_REPLY_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Why a send did not happen — what the caller needs in order to decide whether
 * a failed auto-reply may release the 24 h claim it has already taken.
 *
 * - `not_configured` — no `RESEND_API_KEY`, so the request was never built.
 * - `rejected` — Resend answered and refused: the call completed, nothing queued.
 * - `unknown` — the call threw. The provider may or may not already hold it.
 */
export type LeadEmailFailure = 'not_configured' | 'rejected' | 'unknown';

export interface LeadEmailResult {
  sent: boolean;
  /** Present when the send did not happen. Logged, never shown to a visitor. */
  error?: string;
  /** Present exactly when `sent` is false. */
  failure?: LeadEmailFailure;
}

/**
 * Whether a failed auto-reply may re-open the 24 h window it claimed.
 *
 * Releasing is safe only where we know nothing left this process:
 * `not_configured` and `rejected` both mean no message was queued, so re-opening
 * cannot duplicate anything — and a missing key must not silently mark a lead as
 * "brochure sent" for a day when nobody was ever mailed. A thrown transport is
 * genuinely ambiguous (the provider may already have accepted the message), so
 * that claim is KEPT: [A7] is an upper bound on messages, and a second copy is
 * the one failure this endpoint refuses to risk.
 */
export function canReleaseAutoReplyClaim(result: LeadEmailResult): boolean {
  return !result.sent && result.failure !== 'unknown';
}

/** The lead fields both messages read. Already validated, never escaped yet. */
export interface LeadEmailPayload {
  firstName: string;
  lastName: string;
  email: string;
  institution: string;
  phone: string | null;
  roleTitle: string | null;
  numPeople: number | null;
  message: string | null;
  marketingOptIn: boolean;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/**
 * The far edge of the dedup window, as the value a claim statement compares
 * `brochure_sent_at` against: a row is claimable when the column IS NULL or
 * holds something older than this.
 *
 * Deliberately a cutoff and NOT a `shouldSendAutoReply(...)` predicate. A
 * predicate evaluated in application memory is check-then-act — two requests
 * read the same timestamp, both pass, both send — which is exactly the race
 * this round exists to remove. The only legitimate consumer of this window is
 * the WHERE clause of the conditional UPDATE in `pages/api/pasantias/lead.ts`,
 * where PostgreSQL evaluates it against the row it has locked.
 */
export function autoReplyClaimCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - AUTO_REPLY_DEDUP_WINDOW_MS).toISOString();
}

/**
 * The brochure URL printed in the auto-reply.
 *
 * Resolved WITHOUT the incoming request: `Host` is attacker-controlled, and
 * this link is baked into a message that outlives the request that produced
 * it. In production `lib/utils/app-url.ts` therefore requires configuration
 * and throws otherwise — which the caller catches, since e-mail is best-effort.
 */
export function buildBrochureUrl(): string {
  return buildAbsoluteUrl(BROCHURE_PATH);
}

/** Subject lines are plain text: strip line breaks so a value cannot shape them. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Shared FNE frame. `content` is the only parameter that may contain markup,
 * and every caller builds it from escaped values.
 */
function fneLayout(content: string, preheader: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#202020;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#ffffff;">
            <tr>
              <td style="background:#0a0a0a;color:#ffffff;padding:28px;">
                <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c8a24a;">
                  Fundación Nueva Educación
                </div>
                <div style="margin-top:10px;font-size:22px;line-height:1.3;font-weight:700;">
                  Pasantías INSPIRA · Barcelona
                </div>
                <div style="margin-top:4px;font-size:14px;color:#d4d4d4;">${escapeHtml(COHORT_LABEL)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;font-size:15px;line-height:1.65;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.6;color:#6b6b6b;">
                ${escapeHtml(LEGAL_IDENTITY.brandName)} · ${escapeHtml(LEGAL_IDENTITY.legalName)}<br />
                ${escapeHtml(LEGAL_IDENTITY.taxId)}<br />
                ${escapeHtml(LEGAL_IDENTITY.streetAddress)}, ${escapeHtml(LEGAL_IDENTITY.city)}, ${escapeHtml(LEGAL_IDENTITY.country)}<br />
                ${escapeHtml(LEGAL_IDENTITY.contactEmail)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Auto-reply to the person who submitted the form. es-CL, no prices: it
 * confirms receipt and hands over the brochure, which is where commercial
 * terms live (D-02).
 */
export function renderLeadAutoReplyHtml(params: {
  firstName: string;
  brochureUrl: string;
}): string {
  const firstName = escapeHtml(params.firstName);
  // A URL from our own configuration, but escaped anyway: it is interpolated
  // into an attribute, and "escape at every interpolation" has no exceptions.
  const brochureUrl = escapeHtml(params.brochureUrl);

  const content = `
                <p style="margin:0 0 16px;">Hola ${firstName},</p>
                <p style="margin:0 0 16px;">
                  Gracias por tu interés en las Pasantías INSPIRA en Barcelona. Recibimos tu
                  solicitud y nuestro equipo se pondrá en contacto contigo a la brevedad.
                </p>
                <p style="margin:0 0 22px;">
                  Mientras tanto, puedes descargar el programa completo de la pasantía:
                </p>
                <p style="margin:0 0 26px;">
                  <a href="${brochureUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:15px;font-weight:700;">
                    Descargar el programa
                  </a>
                </p>
                <p style="margin:0 0 8px;">
                  Si tienes dudas, respóndenos este correo o escríbenos por WhatsApp al
                  ${escapeHtml(PASANTIAS_WHATSAPP)}.
                </p>
                <p style="margin:22px 0 0;">Un saludo,<br />Equipo ${escapeHtml(LEGAL_IDENTITY.brandName)}</p>`;

  return fneLayout(content, 'Tu programa de las Pasantías INSPIRA en Barcelona');
}

/** One `<tr>` of the internal notification table; both cells escaped. */
function detailRow(label: string, value: string | null): string {
  if (!value) {
    return '';
  }
  return `
                  <tr>
                    <td style="padding:6px 12px 6px 0;color:#6b6b6b;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
                    <td style="padding:6px 0;">${escapeHtml(value)}</td>
                  </tr>`;
}

/** Internal notification to FNE. Every value comes from the visitor. */
export function renderLeadNotificationHtml(params: {
  lead: LeadEmailPayload;
  isNewLead: boolean;
}): string {
  const { lead, isNewLead } = params;

  const rows = [
    detailRow('Nombre', `${lead.firstName} ${lead.lastName}`.trim()),
    detailRow('Correo', lead.email),
    detailRow('Institución', lead.institution),
    detailRow('Cargo', lead.roleTitle),
    detailRow('Teléfono', lead.phone),
    detailRow('Participantes', lead.numPeople === null ? null : String(lead.numPeople)),
    detailRow('Marketing', lead.marketingOptIn ? 'Sí, acepta novedades' : 'No'),
    detailRow('utm_source', lead.utmSource),
    detailRow('utm_medium', lead.utmMedium),
    detailRow('utm_campaign', lead.utmCampaign),
  ].join('');

  const messageBlock = lead.message
    ? `
                <p style="margin:22px 0 6px;font-weight:700;">Mensaje</p>
                <div style="padding:12px;background:#f5f5f5;border-left:3px solid #0a0a0a;">${escapeHtml(
                  lead.message
                ).replace(/\n/g, '<br />')}</div>`
    : '';

  const content = `
                <p style="margin:0 0 18px;font-weight:700;">
                  ${isNewLead ? 'Nueva solicitud de pasantía' : 'Solicitud actualizada (contacto ya registrado)'}
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-size:14px;">${rows}
                </table>${messageBlock}`;

  return fneLayout(content, `Solicitud de ${singleLine(`${lead.firstName} ${lead.lastName}`)}`);
}

/**
 * Send one message through Resend, soft-failing on every path.
 *
 * Returns rather than throws: both callers are best-effort and must not turn a
 * mail problem into a failed submission.
 */
async function sendSoft(
  logPrefix: string,
  payload: { to: string; subject: string; html: string; replyTo?: string }
): Promise<LeadEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[${logPrefix}] RESEND_API_KEY missing; email not sent`, {
      toDomain: payload.to.split('@')[1] ?? 'unknown',
    });
    return { sent: false, error: 'RESEND_API_KEY no configurado', failure: 'not_configured' };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM_ADDRESS || 'Genera <notificaciones@nuevaeducacion.org>',
      to: payload.to,
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      subject: payload.subject,
      html: payload.html,
    });

    if (error) {
      console.error(`[${logPrefix}] Resend failed:`, error);
      return { sent: false, error: 'Resend rechazó el envío', failure: 'rejected' };
    }

    return { sent: true };
  } catch (error) {
    console.error(`[${logPrefix}] Resend threw:`, error);
    // Ambiguous by construction: a timeout can follow an accepted request.
    return { sent: false, error: 'Error de transporte', failure: 'unknown' };
  }
}

/** Auto-reply with the brochure link. Its success gates `brochure_sent_at`. */
export async function sendLeadAutoReply(params: {
  to: string;
  firstName: string;
  brochureUrl: string;
}): Promise<LeadEmailResult> {
  return sendSoft('pasantias-lead auto-reply', {
    to: params.to,
    subject: `Tu programa de las Pasantías INSPIRA · Barcelona ${singleLine(COHORT_LABEL)}`,
    html: renderLeadAutoReplyHtml({
      firstName: params.firstName,
      brochureUrl: params.brochureUrl,
    }),
  });
}

/** Internal notification. Never deduped — FNE wants every submission. */
export async function sendLeadNotification(params: {
  lead: LeadEmailPayload;
  isNewLead: boolean;
}): Promise<LeadEmailResult> {
  const { lead } = params;
  const who = singleLine(`${lead.firstName} ${lead.lastName}`);
  const where = singleLine(lead.institution);

  return sendSoft('pasantias-lead notification', {
    to: LEAD_NOTIFICATION_RECIPIENT,
    replyTo: lead.email,
    subject: `[Pasantías INSPIRA] ${who} — ${where}`,
    html: renderLeadNotificationHtml(params),
  });
}
