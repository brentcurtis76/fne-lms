import { Resend } from 'resend';
import type { OutboundEmailAuthorization } from './outbound-policy';

export interface OutboundEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

/**
 * THE SENDER CONTRACT — one rule for every outbound message: the consumers that
 * omit `message.from` (meeting summary, notification, invitation/recovery and
 * expense mail) and the ones that pass their own (contact, pasantías).
 *
 * The sender value — `message.from` when given, else `EMAIL_FROM_ADDRESS` —
 * accepts exactly two forms:
 *
 *   Name <address@host.tld>   used verbatim
 *   address@host.tld          a bare address, which gets the Genera display name
 *
 * Unset or empty means `DEFAULT_SENDER`. Anything else is invalid, and so is any
 * value holding a control character (CR/LF included): it could inject headers.
 * An invalid value is never sent and never repaired — `deliverOutboundEmail`
 * answers `not_configured` with detail `invalid_sender` before the transport.
 */
const DEFAULT_SENDER = 'Genera <notificaciones@nuevaeducacion.org>';

const ADDRESS = '[^\\s<>@]+@[^\\s<>@]+\\.[^\\s<>@]+';
const BARE_ADDRESS = new RegExp(`^${ADDRESS}$`);
const NAMED_ADDRESS = new RegExp(`^[^<>]*[^\\s<>]\\s*<${ADDRESS}>$`);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * The sender to use, or null when the value is invalid. `explicit` is a
 * caller's own `message.from`; without one the value is `EMAIL_FROM_ADDRESS`.
 */
export function resolveSender(explicit?: string): string | null {
  const configured = explicit || process.env.EMAIL_FROM_ADDRESS;
  if (!configured) return DEFAULT_SENDER;
  if (CONTROL_CHARACTER.test(configured)) return null;
  if (BARE_ADDRESS.test(configured)) return `Genera <${configured}>`;
  if (NAMED_ADDRESS.test(configured)) return configured;
  return null;
}

export type EmailTransport = (
  message: OutboundEmailMessage,
  options?: { idempotencyKey?: string }
) => Promise<{ data?: { id?: string } | null; error?: { message?: string; statusCode?: number | null } | null }>;

export type ProviderDelivery =
  | { status: 'provider_accepted'; providerMessageId?: string }
  /** A definite refusal. `conflict` marks HTTP 409: the provider already holds this idempotency key. */
  | { status: 'provider_rejected'; detail?: string; conflict?: true }
  | { status: 'transport_error'; detail?: string }
  | { status: 'not_configured'; detail?: string }
  | { status: 'suppressed_qa' }
  | { status: 'refused'; detail?: string };

function resendTransport(apiKey: string): EmailTransport {
  const resend = new Resend(apiKey);
  return async (message, options) => {
    if (!options?.idempotencyKey) return resend.emails.send(message);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': options.idempotencyKey,
      },
      body: JSON.stringify(message),
    });
    const body = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        throw new Error('transient provider failure');
      }
      return {
        data: null,
        error: { message: body?.message ?? 'provider rejected request', statusCode: response.status },
      };
    }
    return { data: { id: body?.id }, error: null };
  };
}

/** False when `deliverOutboundEmail` would answer `not_configured` for the canonical sender. */
export function isDeliveryConfigured(transport?: EmailTransport): boolean {
  return resolveSender() !== null && Boolean(transport || process.env.RESEND_API_KEY);
}

/** The only module allowed to call the real outbound email provider. */
export async function deliverOutboundEmail(params: {
  authorization: OutboundEmailAuthorization;
  /** Omit `from` to send as the canonical sender; a given one obeys the same rule (see `resolveSender`). */
  message: Omit<OutboundEmailMessage, 'from'> & { from?: string };
  idempotencyKey?: string;
  transport?: EmailTransport;
}): Promise<ProviderDelivery> {
  if (params.authorization.kind === 'suppressed_qa') return { status: 'suppressed_qa' };
  if (params.authorization.kind === 'refuse') {
    return { status: 'refused', detail: params.authorization.reason };
  }

  const from = resolveSender(params.message.from);
  if (!from) return { status: 'not_configured', detail: 'invalid_sender' };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !params.transport) return { status: 'not_configured' };

  try {
    const transport = params.transport ?? resendTransport(apiKey as string);
    const { data, error } = await transport({ ...params.message, from }, {
      idempotencyKey: params.idempotencyKey,
    });
    if (error) {
      // Only a keyed send reads the status: an unkeyed one keeps the plain refusal it always had.
      const status = params.idempotencyKey ? error.statusCode : undefined;
      // 429 and 5xx leave it open whether the message was taken, like a call that threw.
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        return { status: 'transport_error', detail: error.message };
      }
      return {
        status: 'provider_rejected',
        detail: error.message,
        ...(status === 409 ? { conflict: true as const } : {}),
      };
    }
    return {
      status: 'provider_accepted',
      ...(typeof data?.id === 'string' ? { providerMessageId: data.id } : {}),
    };
  } catch (error) {
    return {
      status: 'transport_error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
