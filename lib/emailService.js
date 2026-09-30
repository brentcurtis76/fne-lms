import { meetingSummaryTemplate } from './emailTemplates';
import { deliverOutboundEmail } from './email/provider';

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
