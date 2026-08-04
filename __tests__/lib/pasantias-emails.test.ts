/**
 * The two pieces of auto-reply dedup policy that live in `lib/pasantias/emails`.
 *
 * The route proves the behaviour end-to-end; this file pins the arithmetic and
 * the release rule directly, because neither is visible in an assertion made
 * against a mocked query chain.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_REPLY_DEDUP_WINDOW_MS,
  autoReplyClaimCutoff,
  canReleaseAutoReplyClaim,
} from '../../lib/pasantias/emails';

describe('autoReplyClaimCutoff', () => {
  it('is exactly one dedup window behind the given instant', () => {
    const now = new Date('2026-10-05T12:00:00.000Z');
    expect(autoReplyClaimCutoff(now)).toBe('2026-10-04T12:00:00.000Z');
    expect(Date.parse(autoReplyClaimCutoff(now))).toBe(now.getTime() - AUTO_REPLY_DEDUP_WINDOW_MS);
  });

  it('is the window the plan names — 24 hours', () => {
    expect(AUTO_REPLY_DEDUP_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('renders as an ISO timestamp the claim statement can compare against', () => {
    expect(autoReplyClaimCutoff(new Date('2026-10-05T12:00:00.000Z'))).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });
});

describe('canReleaseAutoReplyClaim', () => {
  it('never releases after a successful send', () => {
    expect(canReleaseAutoReplyClaim({ sent: true })).toBe(false);
  });

  // Both mean the message was never queued, so re-opening the window cannot
  // produce a second copy — and a misconfigured key must not mark a lead as
  // "brochure sent" for a day when nobody was mailed.
  it('releases when nothing can have left this process', () => {
    expect(canReleaseAutoReplyClaim({ sent: false, failure: 'not_configured' })).toBe(true);
    expect(canReleaseAutoReplyClaim({ sent: false, failure: 'rejected' })).toBe(true);
  });

  it('keeps the claim when the outcome is unknown', () => {
    expect(canReleaseAutoReplyClaim({ sent: false, failure: 'unknown' })).toBe(false);
  });
});
