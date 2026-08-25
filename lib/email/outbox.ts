/**
 * The controlled test transport — how the e2e opens the link that was actually
 * sent.
 *
 * WHY THIS EXISTS. The authentication lifecycle spec has to prove that the URL
 * placed in the invitation message works when a browser opens it. Before this,
 * it minted its own `?token_hash=…` link through the admin API — a different
 * string in a different format from the one the product e-mails — so the one
 * test meant to prove the chain connects was testing a link nobody receives.
 *
 * A real mail provider in CI is neither required nor wanted. Instead every
 * outbound message is appended, as JSON, to a file the spec reads. The spec then
 * extracts the href from that message's HTML and navigates to it.
 *
 * ==========================================================================
 * IT CANNOT TURN ITSELF ON IN PRODUCTION.
 * ==========================================================================
 *
 * Two independent conditions, both required:
 *
 *   1. `E2E_MAIL_OUTBOX` names a file. It is unset everywhere except the e2e
 *      job, and nothing in the application ever sets it.
 *   2. `VERCEL_ENV` is not `production` and `NODE_ENV` is not `production`
 *      UNLESS the outbox path is explicitly opted into by (1) on a non-Vercel
 *      host. The e2e runs a production BUILD on a local machine, which is why
 *      `NODE_ENV === 'production'` alone cannot be the veto — but `VERCEL_ENV`
 *      is set by the platform and cannot be forged from inside a deployment's
 *      own code, so it is the one that matters.
 *
 * The capture is ADDITIVE and never replaces the real transport: if a provider
 * is configured the message still goes out. This module only ever writes a file.
 * `__tests__/lib/email/outbox.test.ts` pins both refusals.
 */
import { appendFileSync } from 'node:fs';

export interface CapturedMessage {
  to: string;
  subject: string;
  html: string;
}

/** Whether capture is active for this process. Evaluated per call, not cached. */
export function outboxPath(): string | null {
  const path = process.env.E2E_MAIL_OUTBOX;
  if (!path) return null;

  // The platform sets VERCEL_ENV. A deployment cannot claim not to be one.
  if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL === '1') {
    console.error('[outbox] E2E_MAIL_OUTBOX is set on a Vercel deployment; refusing to capture');
    return null;
  }

  return path;
}

/**
 * Append one message to the outbox, if capture is active.
 *
 * Never throws: a failure to write a TEST artefact must not fail the send it is
 * observing.
 */
export function captureOutboundEmail(message: CapturedMessage): void {
  const path = outboxPath();
  if (!path) return;

  try {
    appendFileSync(
      path,
      `${JSON.stringify({ to: message.to, subject: message.subject, html: message.html })}\n`,
      'utf8'
    );
  } catch (error) {
    console.error('[outbox] could not append to the outbox', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
