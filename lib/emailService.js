import { meetingSummaryTemplate } from './emailTemplates';
import { deliverOutboundEmail } from './email/provider';

const DEFAULT_SENDER = 'Genera <notificaciones@fne-lms.com>';
const ADDRESS = '[^\\s<>@]+@[^\\s<>@]+\\.[^\\s<>@]+';
const BARE_ADDRESS = new RegExp(`^${ADDRESS}$`);
const NAMED_ADDRESS = new RegExp(`^[^<>]*[^\\s<>]\\s*<${ADDRESS}>$`);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * EMAIL_FROM_ADDRESS is shared with lib/email/** and accepts either the full
 * `Name <address>` form or a bare address, which gets the Genera display name.
 * Control characters (CR/LF included) are never accepted: they could inject headers.
 */
function resolveSender() {
  const configured = process.env.EMAIL_FROM_ADDRESS;
  if (!configured) return DEFAULT_SENDER;
  if (CONTROL_CHARACTER.test(configured)) throw new Error('EMAIL_FROM_ADDRESS is not a valid sender');
  if (BARE_ADDRESS.test(configured)) return `Genera <${configured}>`;
  if (NAMED_ADDRESS.test(configured)) return configured;
  throw new Error('EMAIL_FROM_ADDRESS is not a valid sender');
}

/**
 * Send a community-meeting summary email to a list of recipients.
 *
 * @param {Object} templateData MeetingSummaryEmailData shape (already rendered HTML blocks)
 * @param {Array<{id: string, email: string, name: string}>} recipients
 * @returns {Promise<{sent: number, failed: number, errors: Array<{email: string, error: string}>}>}
 */
export async function sendMeetingSummary(templateData, recipients, authorization) {
  const subject =
    typeof meetingSummaryTemplate.subject === 'function'
      ? meetingSummaryTemplate.subject(templateData)
      : meetingSummaryTemplate.subject;
  const html = meetingSummaryTemplate.generateHTML(templateData);
  const text = meetingSummaryTemplate.generateText
    ? meetingSummaryTemplate.generateText(templateData)
    : undefined;

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const recipient of recipients) {
    if (!recipient?.email) {
      failed += 1;
      errors.push({ email: recipient?.email || 'unknown', error: 'missing_email' });
      continue;
    }
    try {
      const delivery = await deliverOutboundEmail({
        authorization,
        message: {
          from: resolveSender(),
          to: recipient.email,
          subject,
          html,
          text,
          headers: {
            'X-Notification-Type': 'meeting_finalized',
          },
        },
      });
      if (delivery.status === 'provider_accepted') sent += 1;
      else {
        failed += 1;
        errors.push({ email: recipient.email, error: delivery.status });
      }
    } catch (error) {
      failed += 1;
      errors.push({
        email: recipient.email,
        error: error?.message || String(error),
      });
      // Do not abort — log and continue.
      console.error('sendMeetingSummary: failed to send to', recipient.email, error);
    }
  }

  return { sent, failed, errors };
}
