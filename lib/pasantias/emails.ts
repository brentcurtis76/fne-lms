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
 * commercial module is unreachable from here by construction, not by care. The
 * brochure is linked, never inlined: its prices stay inside the PDF bytes.
 *
 * January 2027 (PASANT-B002b, documents since PASANT-B003) gets its own
 * acknowledgement: it names the one program the submission is about and links
 * the two shared documents — the price-free ficha and the full brochure, each
 * covering both programs. Like every message here it promises no further mail:
 * it confirms the registration and hands over the documents (contract §6,
 * DEC-07), nothing else.
 */
import { escapeHtml } from '../utils/html-escape';
import { buildAbsoluteUrl } from '../utils/app-url';
import { LEGAL_IDENTITY } from '../legal/privacy-notice';
import { COHORT_LABEL, COHORT_PLACES, COHORT_PROGRAMS } from './cohort-public';
import { PASANTIAS_WHATSAPP } from './pdf/contact';
import type { JanuaryProgramId } from './leads';
import { deliverOutboundEmail, type EmailTransport } from '../email/provider';
import { PUBLIC_OUTBOUND_EMAIL } from '../email/outbound-policy';

/**
 * Optional dependencies of the senders below. Production passes none, and
 * `deliverOutboundEmail` then builds its own Resend transport from
 * `RESEND_API_KEY` exactly as before. A test passes `transport` to run the REAL
 * provider boundary — sender rule, configuration check, status mapping —
 * without a network call. Only the transport is injectable: the authorization
 * stays `PUBLIC_OUTBOUND_EMAIL` and the sender stays the provider's rule.
 */
export interface LeadEmailDependencies {
  transport?: EmailTransport;
}

/**
 * January copy, read from the public cohort module, which transcribes the
 * ratified contract (`cohort.label` p.1, `inspira.name` and
 * `mirada-profunda.name` p.3). Only names — no date, school or price.
 */
export const JANUARY_COHORT_LABEL = COHORT_LABEL;

export const JANUARY_PROGRAM_NAMES: Readonly<Record<JanuaryProgramId, string>> =
  Object.fromEntries(COHORT_PROGRAMS.map((program) => [program.id, program.name])) as Record<
    JanuaryProgramId,
    string
  >;

/** Where internal lead notifications go (Appendix A-10 contact address). */
export const LEAD_NOTIFICATION_RECIPIENT = 'info@nuevaeducacion.org';

/** Path of the brochure endpoint A4 serves — one brochure for both programs. */
export const BROCHURE_PATH = '/api/pasantias/brochure';

/** Path of the price-free ficha endpoint — one ficha for both programs. */
export const FICHA_PATH = '/api/pasantias/ficha';

/** The two shared January documents, as absolute URLs. */
export interface LeadDocumentUrls {
  fichaUrl: string;
  brochureUrl: string;
}

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
 * - `rejected` — Resend answered with a 4xx other than 429 and refused: the call
 *   completed, nothing queued.
 * - `unknown` — anything else: the call threw, or Resend's SDK resolved an error
 *   without a status (it does that, rather than throw, when the request failed),
 *   or answered 429 or 5xx. The provider may or may not already hold it.
 *
 * `sent` means the provider accepted the message, never that it was delivered.
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
 * "brochure sent" for a day when nobody was ever mailed. A failed transport is
 * genuinely ambiguous (the provider may already have accepted the message), so
 * that claim is KEPT: [A7] is an upper bound on messages, and a second copy is
 * the one failure this endpoint refuses to risk.
 */
export function canReleaseAutoReplyClaim(result: LeadEmailResult): boolean {
  return !result.sent && result.failure !== 'unknown';
}

/** The `p_outcome` values `pasantias_settle_program_reply` accepts. */
export type ProgramReplyOutcome = 'not_sent' | 'provider_accepted' | 'ambiguous';

/**
 * How a January reply attempt settles its program claim — the same rule as
 * {@link canReleaseAutoReplyClaim}, spelled as the settle RPC's outcome:
 *
 * - `provider_accepted` — the provider took the message. Never a delivery claim.
 * - `not_sent` — known: nothing left this process (`not_configured`, `rejected`),
 *   so the claim is restored and the next submission may try again.
 * - `ambiguous` — everything else, an `unknown` transport outcome above all. The claim is
 *   kept for its 24 h window: a second copy is the failure this refuses to risk.
 *
 * Only an explicit known-not-sent failure releases; a result without a failure
 * kind is ambiguous, not "probably fine".
 */
export function programReplyOutcome(result: LeadEmailResult): ProgramReplyOutcome {
  if (result.sent) return 'provider_accepted';
  if (result.failure === 'not_configured' || result.failure === 'rejected') return 'not_sent';
  return 'ambiguous';
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
  /** The January program of this submission; absent or null for the single-track cohort. */
  program?: JanuaryProgramId | null;
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

/**
 * Both January document URLs, resolved the same way as {@link buildBrochureUrl}
 * and for the same reason: never from the request's `Host`. Throws in
 * production without a configured origin; {@link sendLeadProgramAutoReply}
 * turns that into a known not-sent result.
 */
export function buildDocumentUrls(): LeadDocumentUrls {
  return {
    fichaUrl: buildAbsoluteUrl(FICHA_PATH),
    brochureUrl: buildAbsoluteUrl(BROCHURE_PATH),
  };
}

/** Subject lines are plain text: strip line breaks so a value cannot shape them. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Shared FNE frame. `content` is the only parameter that may contain markup,
 * and every caller builds it from escaped values. `cohortLabel` defaults to the
 * public module's, so the October messages render exactly as before.
 */
function fneLayout(content: string, preheader: string, cohortLabel: string = COHORT_LABEL): string {
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
                <div style="margin-top:4px;font-size:14px;color:#d4d4d4;">${escapeHtml(cohortLabel)}</div>
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
 *
 * The single-track (program-less) path. While the public cohort is January,
 * `validateLeadSubmission` requires a program, so the route always takes the
 * January path and this message is not reached; it is kept, not deleted,
 * because the route's single-track branch still calls it.
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

/**
 * January acknowledgement: names the one program this message covers and links
 * the two shared documents, each of which covers both programs. No dates,
 * schools or prices in the body — the documents carry those — and no promise of
 * any further message.
 */
export function renderLeadProgramAutoReplyHtml(params: {
  firstName: string;
  program: JanuaryProgramId;
  fichaUrl: string;
  brochureUrl: string;
}): string {
  const firstName = escapeHtml(params.firstName);
  const programName = escapeHtml(JANUARY_PROGRAM_NAMES[params.program]);
  // URLs from our own configuration, escaped anyway: attribute interpolation.
  const fichaUrl = escapeHtml(params.fichaUrl);
  const brochureUrl = escapeHtml(params.brochureUrl);

  const content = `
                <p style="margin:0 0 16px;">Hola ${firstName},</p>
                <p style="margin:0 0 16px;">
                  Gracias por tu interés en las Pasantías INSPIRA en Barcelona. Registramos tu
                  solicitud para <strong>${programName}</strong>, ${escapeHtml(JANUARY_COHORT_LABEL)}.
                </p>
                <p style="margin:0 0 22px;">
                  Aquí tienes la información de los dos programas:
                </p>
                <p style="margin:0 0 12px;">
                  <a href="${fichaUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:15px;font-weight:700;">
                    Ficha de los dos programas (PDF)
                  </a>
                </p>
                <p style="margin:0 0 26px;">
                  <a href="${brochureUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:13px 22px;font-size:15px;font-weight:700;">
                    Programa completo con valores (PDF)
                  </a>
                </p>
                <p style="margin:0 0 16px;">${escapeHtml(COHORT_PLACES)}</p>
                <p style="margin:0 0 8px;">
                  Si tienes dudas, respóndenos este correo o escríbenos por WhatsApp al
                  ${escapeHtml(PASANTIAS_WHATSAPP)}.
                </p>
                <p style="margin:22px 0 0;">Un saludo,<br />Equipo ${escapeHtml(LEGAL_IDENTITY.brandName)}</p>`;

  return fneLayout(
    content,
    'Recibimos tu solicitud para las Pasantías INSPIRA en Barcelona',
    JANUARY_COHORT_LABEL
  );
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
  const program = lead.program ?? null;

  const rows = [
    detailRow('Programa', program ? JANUARY_PROGRAM_NAMES[program] : null),
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

  return fneLayout(
    content,
    `Solicitud de ${singleLine(`${lead.firstName} ${lead.lastName}`)}`,
    program ? JANUARY_COHORT_LABEL : COHORT_LABEL
  );
}

/**
 * Send one message through Resend, soft-failing on every path.
 *
 * Returns rather than throws: both callers are best-effort and must not turn a
 * mail problem into a failed submission.
 */
async function sendSoft(
  logPrefix: string,
  payload: { to: string; subject: string; html: string; replyTo?: string },
  deps: LeadEmailDependencies = {}
): Promise<LeadEmailResult> {
  const result = await deliverOutboundEmail({
    authorization: PUBLIC_OUTBOUND_EMAIL,
    message: {
      from: process.env.EMAIL_FROM_ADDRESS || 'Genera <notificaciones@nuevaeducacion.org>',
      to: payload.to,
      ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      subject: payload.subject,
      html: payload.html,
    },
    // Absent unless injected, so the production call is unchanged.
    ...(deps.transport ? { transport: deps.transport } : {}),
    // A refusal releases a reply claim, so only a definite one may read as such.
    definiteRefusalOnly: true,
  });
  if (result.status === 'provider_accepted') return { sent: true };
  if (result.status === 'not_configured') {
    return { sent: false, error: 'RESEND_API_KEY no configurado', failure: 'not_configured' };
  }
  if (result.status === 'provider_rejected') {
    console.error(`[${logPrefix}] provider rejected email`);
    return { sent: false, error: 'Resend rechazó el envío', failure: 'rejected' };
  }
  console.error(`[${logPrefix}] outbound email failed`, { status: result.status });
  return { sent: false, error: 'Error de transporte', failure: 'unknown' };
}

/** Auto-reply with the brochure link. Its success gates `brochure_sent_at`. */
export async function sendLeadAutoReply(
  params: {
    to: string;
    firstName: string;
    brochureUrl: string;
  },
  deps?: LeadEmailDependencies
): Promise<LeadEmailResult> {
  return sendSoft(
    'pasantias-lead auto-reply',
    {
      to: params.to,
      subject: `Tu programa de las Pasantías INSPIRA · Barcelona ${singleLine(COHORT_LABEL)}`,
      html: renderLeadAutoReplyHtml({
        firstName: params.firstName,
        brochureUrl: params.brochureUrl,
      }),
    },
    deps
  );
}

/**
 * January acknowledgement for the one interest whose reply claim this request
 * won. Its result settles exactly that claim (see {@link programReplyOutcome}).
 *
 * The document URLs are resolved FIRST, before any message is built: a missing
 * production origin then returns `not_configured` — known not sent, so the
 * route settles `not_sent` and the next submission may try again — instead of
 * throwing into the route, where a throw reads as `ambiguous` and would hold
 * the claim for a day over a message that never existed. `documents` lets a
 * caller pass already-resolved URLs; the route passes none.
 */
export async function sendLeadProgramAutoReply(
  params: {
    to: string;
    firstName: string;
    program: JanuaryProgramId;
    documents?: LeadDocumentUrls;
  },
  deps?: LeadEmailDependencies
): Promise<LeadEmailResult> {
  let documents: LeadDocumentUrls;
  try {
    documents = params.documents ?? buildDocumentUrls();
  } catch (urlError) {
    console.error('[pasantias-lead program auto-reply] document URLs unavailable:', urlError);
    return {
      sent: false,
      error: 'Origen de la aplicación no configurado',
      failure: 'not_configured',
    };
  }

  return sendSoft(
    'pasantias-lead program auto-reply',
    {
      to: params.to,
      subject: `Recibimos tu solicitud · ${singleLine(JANUARY_PROGRAM_NAMES[params.program])} · ${JANUARY_COHORT_LABEL}`,
      html: renderLeadProgramAutoReplyHtml({
        firstName: params.firstName,
        program: params.program,
        fichaUrl: documents.fichaUrl,
        brochureUrl: documents.brochureUrl,
      }),
    },
    deps
  );
}

/** Internal notification. Never deduped — FNE wants every submission. */
export async function sendLeadNotification(
  params: {
    lead: LeadEmailPayload;
    isNewLead: boolean;
  },
  deps?: LeadEmailDependencies
): Promise<LeadEmailResult> {
  const { lead } = params;
  const who = singleLine(`${lead.firstName} ${lead.lastName}`);
  const where = singleLine(lead.institution);
  const tag = lead.program
    ? `Pasantías INSPIRA · ${JANUARY_COHORT_LABEL}`
    : 'Pasantías INSPIRA';

  return sendSoft(
    'pasantias-lead notification',
    {
      to: LEAD_NOTIFICATION_RECIPIENT,
      replyTo: lead.email,
      subject: `[${tag}] ${who} — ${where}`,
      html: renderLeadNotificationHtml(params),
    },
    deps
  );
}
