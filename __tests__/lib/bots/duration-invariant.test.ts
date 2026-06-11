// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { STALE_CLAIM_TAKEOVER_MS } from '../../../lib/bots/store';

// A stale-claim takeover while the original webhook invocation is still alive
// would process the same Telegram update twice (duplicate receipt cards).
// This test pins the cross-file invariant: takeover threshold must exceed the
// route's maxDuration plus a safety buffer. If you change either value,
// change both.
describe('webhook duration vs stale-claim takeover invariant', () => {
  it('keeps the takeover threshold above maxDuration + 20s buffer', () => {
    const vercelConfig = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'));
    const maxDuration = vercelConfig.functions?.['pages/api/bots/telegram.ts']?.maxDuration;
    expect(typeof maxDuration).toBe('number');
    expect(STALE_CLAIM_TAKEOVER_MS).toBeGreaterThanOrEqual((maxDuration + 20) * 1000);
  });
});
