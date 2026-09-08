// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  fingerprintRecoveryIp,
  hashRecoveryGrant,
  issueRecoveryGrant,
  openRecoveryEnvelope,
  sealRecoveryEnvelope,
  verifyRecoveryGrant,
} from '../../../lib/auth/recovery-crypto';

const SECRET = 'synthetic-service-role-secret-that-is-long-enough-2026';
const OTHER_SECRET = 'different-synthetic-service-secret-long-enough-2026';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('recovery envelope cryptography', () => {
  it('round-trips only with the same purpose and secret', () => {
    const envelope = sealRecoveryEnvelope({ email: 'persona@synthetic.test' }, 'request', SECRET);
    expect(openRecoveryEnvelope(envelope, 'request', SECRET)).toEqual({
      email: 'persona@synthetic.test',
    });
    expect(openRecoveryEnvelope(envelope, 'message', SECRET)).toBeNull();
    expect(openRecoveryEnvelope(envelope, 'request', OTHER_SECRET)).toBeNull();
  });

  it('rejects tampering without exposing plaintext', () => {
    const envelope = sealRecoveryEnvelope({ recoveryUrl: 'https://example.test/secret' }, 'message', SECRET);
    const changed = `${envelope.slice(0, -2)}aa`;
    expect(openRecoveryEnvelope(changed, 'message', SECRET)).toBeNull();
    expect(envelope).not.toContain('example.test');
  });

  it('uses a keyed IP fingerprint rather than storing an address or raw digest', () => {
    const first = fingerprintRecoveryIp('192.0.2.10', SECRET);
    const secondKey = fingerprintRecoveryIp('192.0.2.10', OTHER_SECRET);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(secondKey);
    expect(first).not.toContain('192.0.2.10');
  });
});

describe('opaque recovery grants', () => {
  it('are high-entropy, purpose-bound, subject-bound, and hashable for persistence', () => {
    const first = issueRecoveryGrant(USER_ID, { secret: SECRET });
    const second = issueRecoveryGrant(USER_ID, { secret: SECRET });
    expect(first.grant).not.toBe(second.grant);
    expect(first.grant.length).toBeGreaterThan(120);
    expect(first.grantHash).toBe(hashRecoveryGrant(first.grant));
    expect(first.grantHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.grantHash).not.toContain(USER_ID);
    expect(verifyRecoveryGrant(first.grant, { secret: SECRET })).toMatchObject({
      ok: true,
      claims: { purpose: 'password_recovery', subject: USER_ID },
    });
  });

  it('rejects expiry, a different secret, and ciphertext modification', () => {
    const now = new Date('2026-08-19T12:00:00.000Z');
    const issued = issueRecoveryGrant(USER_ID, { now, ttlSeconds: 60, secret: SECRET });
    expect(
      verifyRecoveryGrant(issued.grant, {
        now: new Date('2026-08-19T12:01:00.000Z'),
        secret: SECRET,
      })
    ).toEqual({ ok: false, reason: 'expired' });
    expect(verifyRecoveryGrant(issued.grant, { now, secret: OTHER_SECRET })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(verifyRecoveryGrant(`${issued.grant}x`, { now, secret: SECRET })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects invalid subjects and lifetime expansion', () => {
    expect(() => issueRecoveryGrant('not-a-user-id', { secret: SECRET })).toThrow();
    expect(() => issueRecoveryGrant(USER_ID, { ttlSeconds: 3601, secret: SECRET })).toThrow();
  });
});
