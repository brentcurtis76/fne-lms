/**
 * GENERA's side of the Correos kit: builds the `CorreosHost` for one API request. Server only.
 *
 * - Who is asking: `checkIsAdmin` (the verified user, then the admin role), plus the forced-password rule.
 * - The base address: `getAppBaseUrl`.
 * - One single message: today's path, exactly as `sendNotificationEmail` (lib/email/notifications.ts) does
 *   it: today's sender (`resolveSender()`), the outbound policy for the recipient user first
 *   (`authorizeUserEmail`, so anyone tied to a QA school is suppressed and a failed lookup refuses), the local
 *   E2E outbox only for authorized mail, then `deliverOutboundEmail`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkIsAdmin, createServiceRoleClient, getForcedPasswordChangeVerdict } from '../api-auth';
import { authorizeUserEmail, type OutboundEmailAuthorization } from '../email/outbound-policy';
import { captureOutboundEmail } from '../email/outbox';
import { deliverOutboundEmail, resolveSender, type EmailTransport } from '../email/provider';
import { getAppBaseUrl } from '../utils/app-url';
import type { AdminIdentity, CorreosHost, SingleMessage, SingleSendResult } from '../correos';
import { generaBrand } from './brand';

export interface GeneraHostOptions {
  /** Tests only: a fake transport. Without it, `deliverOutboundEmail` uses the real provider when configured. */
  transport?: EmailTransport;
}

/** Who is asking: an admin (with id and address) or a refusal. Every Correos route calls this first. */
export async function identify(req: NextApiRequest, res: NextApiResponse): Promise<AdminIdentity> {
  const { isAdmin, user, error } = await checkIsAdmin(req, res);
  if (!user) return { kind: 'refused', reason: 'not_signed_in' };
  if (!isAdmin || error) return { kind: 'refused', reason: 'not_admin' };
  try {
    // Defence in depth: an admin who must change their password first gets nothing here either.
    const verdict = await getForcedPasswordChangeVerdict(createServiceRoleClient(), user.id);
    if (verdict !== 'allowed') return { kind: 'refused', reason: 'not_admin' };
  } catch {
    return { kind: 'refused', reason: 'not_admin' };
  }
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return { kind: 'admin', adminId: user.id, email };
}

async function sendSingle(message: SingleMessage, options: GeneraHostOptions): Promise<SingleSendResult> {
  // An invalid sender can never be delivered: stop before anything else.
  if (resolveSender() === null) return { status: 'not_configured' };

  let authorization: OutboundEmailAuthorization;
  try {
    authorization = await authorizeUserEmail(createServiceRoleClient() as SupabaseClient, message.to.userId);
  } catch {
    authorization = { kind: 'refuse', reason: 'user_lookup_failed' };
  }

  const to = message.to.address;
  // The local E2E outbox mirrors only authorized mail; the sender was validated above.
  if (authorization.kind === 'allow') captureOutboundEmail({ to, subject: message.subject, html: message.html });

  const result = await deliverOutboundEmail({
    authorization,
    message: { to, subject: message.subject, html: message.html, text: message.text },
    transport: options.transport,
  });

  switch (result.status) {
    case 'provider_accepted':
      return { status: 'sent' };
    case 'not_configured':
      return { status: 'not_configured' };
    case 'suppressed_qa':
      return { status: 'refused', reason: 'suppressed_qa' };
    case 'refused':
      return { status: 'refused', reason: result.detail ?? 'refused' };
    default:
      return { status: 'refused', reason: result.status };
  }
}

/** The `CorreosHost` for this request. Throws only when the base address cannot be resolved. */
export function buildCorreosHost(req: NextApiRequest, res: NextApiResponse, options: GeneraHostOptions = {}): CorreosHost {
  const baseUrl = getAppBaseUrl(req);
  return {
    brand: generaBrand(baseUrl),
    baseUrl,
    identify: () => identify(req, res),
    sendSingle: (message) => sendSingle(message, options),
  };
}
