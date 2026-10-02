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
import { captureOutboundEmail } from './outbox';
import {
  deliverOutboundEmail,
  resolveSender,
  type EmailTransport,
} from './provider';
import type { OutboundEmailAuthorization } from './outbound-policy';
import { renderEmail } from './render';

export type { EmailTransport } from './provider';

/**
 * WHAT A SEND CAN ACTUALLY BE, and why the list is longer than it was.
 *
 * The previous shape had one success state and called it `sent`, and the toast
 * said "Correo enviado correctamente." Both overstate what this process knows.
 * Handing a message to Resend's API and getting a 200 means the PROVIDER
 * ACCEPTED IT. It does not mean the recipient's mail server accepted it, that it
 * survived a spam filter, or that it did not bounce twenty minutes later. Only a
 * provider webhook can say that; recovery messages now record those events
 * through the signature-verified Resend webhook.
 *
 * So the states are named for what is actually observed:
 *
 *   not_configured          no API key on this server; nothing was attempted
 *   link_generation_failed  the recovery credential could not be minted, so
 *                           there was nothing to put in the message
 *   transport_error         the call threw: network, DNS, timeout
 *   provider_rejected       the provider answered, and refused the message
 *   provider_accepted       the provider answered, and accepted it. THIS IS THE
 *                           FURTHEST ANY REPOSITORY TEST CAN PROVE.
 *   delivered               a verified provider webhook reported delivery. The
 *                           synchronous send functions never produce it.
 *   bounced                 a verified provider webhook reported a bounce. Same:
 *                           the send functions never infer it from acceptance.
 */
export type DeliveryStatus =
  | 'not_configured'
  | 'link_generation_failed'
  | 'suppressed_qa'
  | 'refused'
  | 'transport_error'
  | 'provider_rejected'
  | 'provider_accepted'
  | 'delivered'
  | 'bounced';

/** The subset that means the message did not get to the provider. */
export type DeliveryFailureReason =
  | 'not_configured'
  | 'link_generation_failed'
  | 'suppressed_qa'
  | 'refused'
  | 'provider_rejected'
  | 'transport_error';

/** The statuses that only the verified webhook path may record. */
export const WEBHOOK_ONLY_STATUSES: readonly DeliveryStatus[] = Object.freeze([
  'delivered',
  'bounced',
]);

export interface DeliveryResult {
  /**
   * Kept for the existing call sites, and now precisely defined: true means the
   * PROVIDER ACCEPTED the message, nothing more.
   */
  sent: boolean;
  status: DeliveryStatus;
  reason?: DeliveryFailureReason;
  /**
   * Operator-facing detail. Never contains the action link — the link is not in
   * scope where this is built.
   */
  detail?: string;
  /**
   * The provider's own message id, when it gives one. Useful for correlating a
   * complaint with a send. Not a secret, and never the token or the URL.
   */
  providerMessageId?: string;
}

/** es-CL, for the administrator's toast. */
export const DELIVERY_MESSAGES: Record<DeliveryFailureReason, string> = {
  not_configured:
    'No se envió el correo: el servicio de correo no está configurado. Avisa al equipo técnico.',
  link_generation_failed:
    'No se envió el correo: no se pudo generar el enlace de acceso. Inténtalo nuevamente.',
  suppressed_qa:
    'No se envió el correo: esta cuenta pertenece al entorno interno de simulación QA.',
  refused:
    'No se envió el correo: no se pudo verificar de forma segura el ámbito del destinatario.',
  provider_rejected:
    'No se envió el correo: el proveedor rechazó el mensaje. Verifica la dirección e inténtalo nuevamente.',
  transport_error:
    'No se pudo enviar el correo por un problema de conexión. Inténtalo nuevamente en unos momentos.',
};

/**
 * Deliberately says "accepted", not "delivered" or "sent correctly". An
 * administrator reading this should understand that the message left this
 * platform, and that arrival in the recipient's inbox is a separate fact nobody
 * here has checked.
 */
export const DELIVERY_SUCCESS_MESSAGE =
  'El proveedor de correo aceptó el mensaje. La llegada a la bandeja del destinatario no se confirma desde aquí.';

export { escapeHtml } from '../utils/html-escape';

/**
 * The invitation/recovery message in the shared shell (`./render`, which
 * escapes every value): a greeting, one body line, the button, and the same URL
 * as visible text.
 */
function renderInvitation(params: {
  heading: string;
  firstName: string;
  bodyLine: string;
  ctaLabel: string;
  ctaHref: string;
  closingLine: string;
}): string {
  const firstName = params.firstName.trim();
  // Older recovery callers used "Hola" as a missing-name placeholder, which
  // rendered as the accidental greeting "Hola Hola,". Treat that legacy
  // placeholder exactly like an absent name.
  const greeting = firstName && !/^hola,?$/i.test(firstName) ? `Hola ${firstName},` : 'Hola,';

  return renderEmail({
    heading: params.heading,
    paragraphs: [greeting, params.bodyLine],
    ctaLabel: params.ctaLabel,
    ctaHref: params.ctaHref,
    fallbackLead: 'Si el botón no funciona, copia y pega esta dirección completa en tu navegador:',
    closingLine: params.closingLine,
  });
}

/**
 * Testability seam. Production leaves it unset and gets a real Resend client;
 * tests inject a double. There is no environment switch, so a deployed build
 * cannot reach a fake transport.
 */
async function send(
  params: {
    to: string;
    subject: string;
    html: string;
    authorization: OutboundEmailAuthorization;
    idempotencyKey?: string;
  },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  if (params.authorization.kind === 'allow' && resolveSender() !== null) {
    // The local E2E outbox mirrors only authorized mail with a valid sender.
    // QA/refused mail and mail that an invalid sender keeps from the provider
    // must leave no transport-adjacent artifact at all.
    captureOutboundEmail(params);
  }

  const result = await deliverOutboundEmail({
    authorization: params.authorization,
    message: {
      to: params.to,
      subject: params.subject,
      html: params.html,
    },
    idempotencyKey: params.idempotencyKey,
    transport,
  });

  if (result.status === 'provider_accepted') {
    return {
      sent: true,
      status: result.status,
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    };
  }
  const reason: DeliveryFailureReason = result.status === 'refused'
    ? 'refused'
    : result.status;
  return {
    sent: false,
    status: result.status,
    reason,
    ...('detail' in result && result.detail ? { detail: result.detail } : {}),
  };
}

/**
 * The state to report when the recovery credential could not be minted at all.
 * Distinct from every transport outcome: nothing was attempted, and retrying the
 * SEND would not help — the link is what failed.
 */
export function linkGenerationFailed(): DeliveryResult {
  return {
    sent: false,
    status: 'link_generation_failed',
    reason: 'link_generation_failed',
  };
}

/**
 * A NEW account: the recipient has no password yet and must set one through a
 * recovery link.
 *
 * `recoveryUrl` is this application's OWN url —
 * `/reset-password?token_hash=…&type=recovery`, built by
 * `lib/auth/recovery-link.ts` from `generateLink().properties.hashed_token` —
 * not the provider's `action_link`. See that module for why. It is consumed here
 * and never escapes: the returned `DeliveryResult` carries only a boolean and a
 * coarse reason.
 */
export async function sendPasswordSetupEmail(
  params: {
    to: string;
    firstName: string;
    recoveryUrl: string;
    bodyLine: string;
    authorization: OutboundEmailAuthorization;
  },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  return send(
    {
      to: params.to,
      authorization: params.authorization,
      subject: 'Activa tu acceso a Genera',
      html: renderInvitation({
        heading: 'Tu acceso está listo',
        firstName: params.firstName,
        bodyLine: params.bodyLine,
        ctaLabel: 'Establecer contraseña',
        ctaHref: params.recoveryUrl,
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
  params: {
    to: string;
    firstName: string;
    loginUrl: string;
    bodyLine: string;
    authorization: OutboundEmailAuthorization;
  },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  return send(
    {
      to: params.to,
      authorization: params.authorization,
      subject: 'Tu acceso a Genera fue actualizado',
      html: renderInvitation({
        heading: 'Tienes acceso nuevo',
        firstName: params.firstName,
        bodyLine: params.bodyLine,
        ctaLabel: 'Ir a Genera',
        ctaHref: params.loginUrl,
        closingLine:
          'Ingresa con la contraseña que ya usabas. Si no la recuerdas, usa "¿Olvidaste tu contraseña?" en la página de inicio de sesión.',
      }),
    },
    transport
  );
}

/**
 * SELF-SERVICE RECOVERY — "olvidé mi contraseña".
 *
 * This used to be Supabase's own template, sent by `resetPasswordForEmail` from
 * the browser, landing on whatever shape the project's dashboard settings
 * produced (an implicit `#access_token=` fragment, or a PKCE `?code=`). Two
 * consequences: `/reset-password` had to keep supporting formats that cannot
 * carry server-verifiable, purpose-bound proof; and the mandatory e2e could not
 * read the message that was actually sent, so its recovery stage rebuilt a link
 * of its own.
 *
 * Every recovery link this platform sends is now built by
 * `lib/auth/recovery-link.ts` and delivered by this module — invitation, resend
 * and self-service alike — in exactly one format.
 */
export async function sendPasswordRecoveryEmail(
  params: {
    to: string;
    firstName: string;
    recoveryUrl: string;
    authorization: OutboundEmailAuthorization;
    idempotencyKey?: string;
  },
  transport?: EmailTransport
): Promise<DeliveryResult> {
  return send(
    {
      to: params.to,
      authorization: params.authorization,
      subject: 'Restablece tu contraseña de Genera',
      idempotencyKey: params.idempotencyKey,
      html: renderInvitation({
        heading: 'Restablece tu contraseña',
        firstName: params.firstName,
        bodyLine:
          'Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, usa el botón para elegir una nueva.',
        ctaLabel: 'Restablecer contraseña',
        ctaHref: params.recoveryUrl,
        closingLine:
          'Si no solicitaste este cambio, ignora este mensaje: tu contraseña actual sigue funcionando. Por seguridad, este enlace caduca.',
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
