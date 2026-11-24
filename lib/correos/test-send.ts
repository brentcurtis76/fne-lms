/**
 * "Send me a test": one message, to the signed-in admin's own address, subject prefixed "[PRUEBA] ".
 *
 * There is deliberately no recipient parameter. The only address this function can send to is the one in
 * the identity the host itself established for the request; nothing a caller or a request body says can
 * change it.
 */
import { renderEmail } from './template';
import type { AdminIdentity, CorreosHost, EmailContent } from './types';
import { validateContent } from './validate';

export const TEST_SUBJECT_PREFIX = '[PRUEBA] ';

export type TestSendResult =
  | { status: 'sent'; to: string }
  | { status: 'refused'; reason: 'not_signed_in' | 'not_admin' }
  | { status: 'invalid'; errors: string[] }
  | { status: 'not_sent'; reason: string }
  | { status: 'not_configured' };

export async function sendTestEmail(
  host: CorreosHost,
  identity: AdminIdentity,
  content: EmailContent
): Promise<TestSendResult> {
  if (identity.kind !== 'admin') return { status: 'refused', reason: identity.reason };
  const to = typeof identity.email === 'string' ? identity.email.trim() : '';
  if (!to || !identity.adminId) return { status: 'not_sent', reason: 'missing_recipient' };

  const errors = validateContent(content);
  if (errors.length) return { status: 'invalid', errors };

  const rendered = await renderEmail(host.brand, content);
  let result;
  try {
    result = await host.sendSingle({
      to: { address: to, userId: identity.adminId },
      subject: `${TEST_SUBJECT_PREFIX}${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });
  } catch {
    return { status: 'not_sent', reason: 'send_failed' };
  }
  if (result.status === 'sent') return { status: 'sent', to };
  if (result.status === 'not_configured') return { status: 'not_configured' };
  return { status: 'not_sent', reason: result.reason };
}
