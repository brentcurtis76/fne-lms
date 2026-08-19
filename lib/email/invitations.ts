/**
 * The two e-mails the access-grant flow sends.
 *
 * Extracted from `pages/api/admin/tractor-signups/grant.ts` so the grant and
 * the resend (S7) share one implementation rather than two that drift, and so
 * the rendering can be tested without standing up an API route.
 *
 * WHAT WAS WRONG with the version this replaces:
 *
 *   - It offered no fallback for the button. The copy under it read "copia y
 *     pega el enlace de recuperación desde tu correo en el navegador" — which
 *     is circular: the reader IS in their correo, and the link exists nowhere
 *     they can copy it from. In a mail client that strips or fails to render
 *     the anchor (several school-managed Outlook configurations do exactly
 *     that) the invitation was unusable, and the person had no way to proceed.
 *     The complete URL is now printed as visible, selectable text underneath.
 *   - There was no e-mail at all when the grant attached roles to an EXISTING
 *     profile (S8). Those people were given access and never told.
 *
 * INVARIANTS, both enforced by tests:
 *
 *   - The action link never leaves this module. It is not returned, not logged,
 *     and not placed in any result object. Callers learn only whether delivery
 *     succeeded and, if not, why in coarse terms.
 *   - Every interpolated value is HTML-escaped. The names come from a public
 *     sign-up form, so they are attacker-controlled text.
 */
import { Resend } from 'resend';

export type DeliveryFailureReason =
  /** RESEND_API_KEY is absent — the platform cannot send at all. */
  | 'not_configured'
  /** The provider accepted the request and refused the message. */
  | 'provider_rejected'
  /** The call threw: network, DNS, timeout. */
  | 'transport_error';

export interface DeliveryResult {
  sent: boolean;
  reason?: DeliveryFailureReason;
  /**
   * Operator-facing detail. Never contains the action link — the link is not in
   * scope where this is built.
   */
  detail?: string;
}

/** es-CL, for the administrator's toast. */
export const DELIVERY_MESSAGES: Record<DeliveryFailureReason, string> = {
  not_configured:
    'No se envió el correo: el servicio de correo no está configurado. Avisa al equipo técnico.',
  provider_rejected:
    'No se envió el correo: el proveedor rechazó el mensaje. Verifica la dirección e inténtalo nuevamente.',
  transport_error:
    'No se pudo enviar el correo por un problema de conexión. Inténtalo nuevamente en unos momentos.',
};

export const DELIVERY_SUCCESS_MESSAGE = 'Correo enviado correctamente.';

const DEFAULT_FROM = 'Genera <notificaciones@nuevaeducacion.org>';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The shared shell. `ctaHref` is escaped for both the attribute and the visible
 * fallback; the two are the same string, so a mail client that renders neither
 * anchors nor styles still shows a usable URL.
 */
function renderEmail(params: {
  heading: string;
  firstName: string;
  bodyLine: string;
  ctaLabel: string;
  ctaHref: string;
  fallbackLead: string;
  closingLine?: string;
}): string {
  const safeFirstName = escapeHtml(params.firstName);
  const safeBodyLine = escapeHtml(params.bodyLine);
  const safeHeading = escapeHtml(params.heading);
  const safeCtaLabel = escapeHtml(params.ctaLabel);
  const safeHref = escapeHtml(params.ctaHref);
  const safeFallbackLead = escapeHtml(params.fallbackLead);
  const safeClosing = params.closingLine ? escapeHtml(params.closingLine) : null;

  return `
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
                ${safeHeading}
              </h1>
            </div>
            <div style="padding:30px 28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${safeFirstName},</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">
                ${safeBodyLine}
              </p>
              <p style="margin:26px 0;text-align:center;">
                <a href="${safeHref}" style="display:inline-block;background:#fbbf24;color:#0a0a0a;text-decoration:none;font-weight:700;border-radius:6px;padding:14px 22px;">
                  ${safeCtaLabel}
                </a>
              </p>
              <p style="margin:0 0 8px;color:#666;font-size:13px;line-height:1.6;">
                ${safeFallbackLead}
              </p>
              <p style="margin:0;color:#0a0a0a;font-size:13px;line-height:1.6;word-break:break-all;">
                ${safeHref}
              </p>
              ${safeClosing ? `<p style="margin:20px 0 0;color:#666;font-size:13px;line-height:1.6;">${safeClosing}</p>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;
}

/**
 * Testability seam. Production leaves it unset and gets a real Resend client;
 * tests inject a double. There is no environment switch, so a deployed build
 * cannot reach a fake transport.
 */
export type EmailTransport = (message: {
  from: string;
  to: string;
  subject: string;
  html: string;
}) => Promise<{ error?: { message?: string } | null }>;

function defaultTransport(apiKey: string): EmailTransport {
  const resend = new Resend(apiKey);
  return (message) => resend.emails.send(message);
}

async function send(
  params: { to: string; subject: string; html: string },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey && !transport) {
    // Only the recipient's DOMAIN is logged. This branch fires on every send
    // when the key is missing, which in production is exactly the state the
    // operations runbook exists to fix — a per-send log line carrying a full
    // address would build a copy of the roster in the platform log.
    console.error('[invitations] RESEND_API_KEY missing; e-mail not sent', {
      toDomain: params.to.split('@')[1] ?? 'unknown',
      subject: params.subject,
    });
    return { sent: false, reason: 'not_configured' };
  }

  const deliver = transport ?? defaultTransport(apiKey as string);

  try {
    const { error } = await deliver({
      from: process.env.EMAIL_FROM_ADDRESS || DEFAULT_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    if (error) {
      console.error('[invitations] provider rejected the message', {
        toDomain: params.to.split('@')[1] ?? 'unknown',
        error: error.message ?? 'unknown',
      });
      return { sent: false, reason: 'provider_rejected', detail: error.message };
    }

    return { sent: true };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    console.error('[invitations] transport threw', {
      toDomain: params.to.split('@')[1] ?? 'unknown',
      error: message,
    });
    return { sent: false, reason: 'transport_error', detail: message };
  }
}

/**
 * A NEW account: the recipient has no password yet and must set one through a
 * recovery link.
 *
 * `actionLink` is consumed here and never escapes: the returned `DeliveryResult`
 * carries only a boolean and a coarse reason.
 */
export async function sendPasswordSetupEmail(
  params: { to: string; firstName: string; actionLink: string; bodyLine: string },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  return send(
    {
      to: params.to,
      subject: 'Activa tu acceso a Genera',
      html: renderEmail({
        heading: 'Tu acceso está listo',
        firstName: params.firstName,
        bodyLine: params.bodyLine,
        ctaLabel: 'Establecer contraseña',
        ctaHref: params.actionLink,
        fallbackLead:
          'Si el botón no funciona, copia y pega esta dirección completa en tu navegador:',
        closingLine:
          'Por seguridad, este enlace caduca. Si ya no funciona, pide a tu administrador que te reenvíe la invitación.',
      }),
    },
    transport
  );
}

/**
 * An EXISTING account: the person already has a password, and the grant only
 * attached new access. S8 — this path used to send nothing at all, so people
 * were given access and never told.
 *
 * Deliberately NOT a recovery link. Sending "restablece tu contraseña" to
 * somebody whose password is fine trains them to click password links they did
 * not ask for, and needlessly invalidates a working credential.
 */
export async function sendAccessGrantedEmail(
  params: { to: string; firstName: string; loginUrl: string; bodyLine: string },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  return send(
    {
      to: params.to,
      subject: 'Tu acceso a Genera fue actualizado',
      html: renderEmail({
        heading: 'Tienes acceso nuevo',
        firstName: params.firstName,
        bodyLine: params.bodyLine,
        ctaLabel: 'Ir a Genera',
        ctaHref: params.loginUrl,
        fallbackLead:
          'Si el botón no funciona, copia y pega esta dirección completa en tu navegador:',
        closingLine:
          'Ingresa con la contraseña que ya usabas. Si no la recuerdas, usa "¿Olvidaste tu contraseña?" en la página de inicio de sesión.',
      }),
    },
    transport
  );
}

/** The es-CL sentence an administrator should see for a delivery result. */
export function deliveryMessage(result: DeliveryResult): string {
  if (result.sent) return DELIVERY_SUCCESS_MESSAGE;
  return result.reason
    ? DELIVERY_MESSAGES[result.reason]
    : 'No se pudo enviar el correo. Inténtalo nuevamente.';
}
