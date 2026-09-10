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

  it('keeps the sealed payload opaque', () => {
    const envelope = sealRecoveryEnvelope({ recoveryUrl: 'https://example.test/secret' }, 'message', SECRET);
    expect(envelope).not.toContain('example.test');
    expect(openRecoveryEnvelope(envelope, 'message', SECRET)).toEqual({
      recoveryUrl: 'https://example.test/secret',
    });
  });

  it('rejects a wrong secret and every wrong purpose without exposing plaintext', () => {
    const envelope = sealRecoveryEnvelope({ recoveryUrl: 'https://example.test/secret' }, 'message', SECRET);
    // Positive control first: the rejections below are not vacuous.
    expect(openRecoveryEnvelope(envelope, 'message', SECRET)).not.toBeNull();
    expect(openRecoveryEnvelope(envelope, 'message', OTHER_SECRET)).toBeNull();
    for (const purpose of ['request', 'grant'] as const) {
      expect(openRecoveryEnvelope(envelope, purpose, SECRET)).toBeNull();
      expect(openRecoveryEnvelope(envelope, purpose, OTHER_SECRET)).toBeNull();
    }
  });

  it('uses a keyed IP fingerprint rather than storing an address or raw digest', () => {
    const first = fingerprintRecoveryIp('192.0.2.10', SECRET);
    const secondKey = fingerprintRecoveryIp('192.0.2.10', OTHER_SECRET);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(secondKey);
    expect(first).not.toContain('192.0.2.10');
  });
});

// ---------------------------------------------------------------------------
// Tamper rejection, mutated on decoded bytes rather than on envelope text.
//
// The previous form of this test rewrote the last two characters of the
// envelope with 'aa'. The tag segment is 16 bytes = 22 base64url characters, so
// its final character carries only 2 significant bits (the low 4 are padding a
// decoder discards). That mutation therefore left the decoded tag BYTE-IDENTICAL
// whenever the canonical suffix was one of 'aQ'..'af' — 16 of 4096 suffix pairs,
// i.e. 1 envelope in 256, which then decrypted normally and failed the
// assertion. The control test below pins that arithmetic down exactly.
//
// Mutating decoded bytes and re-encoding guarantees a real difference while
// preserving segment count, encoding validity and decoded length, so rejection
// is produced by GCM authentication and not by the parse/length guards in
// openRecoveryEnvelope.
// ---------------------------------------------------------------------------

type EnvelopeSegment = 'iv' | 'ciphertext' | 'tag';

const SEGMENT_INDEX: Record<EnvelopeSegment, number> = { iv: 1, ciphertext: 2, tag: 3 };

/** Flips the low bit of the first byte of one segment, re-encoding canonically. */
function mutateSegment(envelope: string, segment: EnvelopeSegment) {
  const parts = envelope.split('.');
  const index = SEGMENT_INDEX[segment];
  const original = parts[index];
  const bytes = Buffer.from(original, 'base64url');
  const mutatedBytes = Buffer.from(bytes);
  mutatedBytes[0] ^= 0x01;
  const encoded = mutatedBytes.toString('base64url');
  parts[index] = encoded;
  return { original, encoded, bytes, mutatedBytes, envelope: parts.join('.') };
}

describe('recovery envelope tamper rejection (byte-level, deterministic)', () => {
  const payloads = [
    { recoveryUrl: 'https://example.test/secret' },
    { email: 'persona@synthetic.test' },
    { recoveryUrl: 'https://example.test/other', email: 'otra@synthetic.test' },
  ];

  it.each<EnvelopeSegment>(['iv', 'ciphertext', 'tag'])(
    'rejects a single flipped bit in the %s of every payload',
    segment => {
      for (const payload of payloads) {
        const envelope = sealRecoveryEnvelope(payload, 'message', SECRET);
        expect(openRecoveryEnvelope(envelope, 'message', SECRET)).toEqual(payload);

        const mutation = mutateSegment(envelope, segment);

        // The mutation really changed the decoded bytes ...
        expect(mutation.mutatedBytes.equals(mutation.bytes)).toBe(false);
        expect(mutation.encoded).not.toBe(mutation.original);
        expect(mutation.envelope).not.toBe(envelope);
        // ... while keeping a well-formed envelope of identical shape, so the
        // rejection cannot come from a length or parse guard.
        expect(mutation.mutatedBytes).toHaveLength(mutation.bytes.length);
        expect(mutation.encoded).toHaveLength(mutation.original.length);
        expect(mutation.envelope.split('.')).toHaveLength(4);
        expect(mutation.envelope.split('.')[0]).toBe('v1');
        expect(Buffer.from(mutation.encoded, 'base64url').equals(mutation.mutatedBytes)).toBe(true);

        expect(openRecoveryEnvelope(mutation.envelope, 'message', SECRET)).toBeNull();
      }
    }
  );

  it('rejects a byte-level mutation of an issued grant', () => {
    const issued = issueRecoveryGrant(USER_ID, { secret: SECRET });
    expect(verifyRecoveryGrant(issued.grant, { secret: SECRET })).toMatchObject({ ok: true });

    const sealed = issued.grant.slice('rg1.'.length);
    const mutation = mutateSegment(sealed, 'tag');
    expect(mutation.encoded).not.toBe(mutation.original);
    expect(verifyRecoveryGrant(`rg1.${mutation.envelope}`, { secret: SECRET })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('control: the previous textual mutation was not guaranteed to change any byte', () => {
    // A canonical 16-byte tag encoding whose suffix is 'aQ'.
    const canonical = `${'A'.repeat(20)}aQ`;
    const decoded = Buffer.from(canonical, 'base64url');
    expect(decoded).toHaveLength(16);
    expect(decoded.toString('base64url')).toBe(canonical);

    const textual = `${canonical.slice(0, -2)}aa`;
    expect(textual).not.toBe(canonical);
    // Different text, identical tag: the old assertion was testing nothing here.
    expect(Buffer.from(textual, 'base64url').equals(decoded)).toBe(true);

    // Exhaustive over the alphabet: exactly 16 of 4096 suffix pairs survive,
    // which is the observed 1-in-256 failure rate of the old test.
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const survivors: string[] = [];
    for (const first of ALPHABET) {
      for (const second of ALPHABET) {
        const suffixed = `${'A'.repeat(20)}${first}${second}`;
        const mutated = `${suffixed.slice(0, -2)}aa`;
        if (Buffer.from(suffixed, 'base64url').equals(Buffer.from(mutated, 'base64url'))) {
          survivors.push(first + second);
        }
      }
    }
    expect(survivors).toEqual([
      'aQ', 'aR', 'aS', 'aT', 'aU', 'aV', 'aW', 'aX',
      'aY', 'aZ', 'aa', 'ab', 'ac', 'ad', 'ae', 'af',
    ]);
    expect(ALPHABET.length ** 2 / survivors.length).toBe(256);

    // The byte-level mutation used above has no such blind spot.
    const envelope = sealRecoveryEnvelope({ recoveryUrl: 'https://example.test/secret' }, 'message', SECRET);
    const mutation = mutateSegment(envelope, 'tag');
    expect(mutation.mutatedBytes.equals(mutation.bytes)).toBe(false);
    expect(openRecoveryEnvelope(mutation.envelope, 'message', SECRET)).toBeNull();
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
