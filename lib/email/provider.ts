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

export type EmailTransport = (
  message: OutboundEmailMessage,
  options?: { idempotencyKey?: string }
) => Promise<{ data?: { id?: string } | null; error?: { message?: string } | null }>;

export type ProviderDelivery =
  | { status: 'provider_accepted'; providerMessageId?: string }
  | { status: 'provider_rejected'; detail?: string }
  | { status: 'transport_error'; detail?: string }
  | { status: 'not_configured' }
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
      return { data: null, error: { message: body?.message ?? 'provider rejected request' } };
    }
    return { data: { id: body?.id }, error: null };
  };
}

/** The only module allowed to call the real outbound email provider. */
export async function deliverOutboundEmail(params: {
  authorization: OutboundEmailAuthorization;
  message: OutboundEmailMessage;
  idempotencyKey?: string;
  transport?: EmailTransport;
}): Promise<ProviderDelivery> {
  if (params.authorization.kind === 'suppressed_qa') return { status: 'suppressed_qa' };
  if (params.authorization.kind === 'refuse') {
    return { status: 'refused', detail: params.authorization.reason };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && !params.transport) return { status: 'not_configured' };

  try {
    const transport = params.transport ?? resendTransport(apiKey as string);
    const { data, error } = await transport(params.message, {
      idempotencyKey: params.idempotencyKey,
    });
    if (error) return { status: 'provider_rejected', detail: error.message };
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
