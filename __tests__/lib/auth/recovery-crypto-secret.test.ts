// @vitest-environment node
/**
 * Key-selection contract for recovery cryptography.
 *
 * Before this change the encryption root WAS the Supabase service-role API key,
 * so rotating that key silently invalidated every queued recovery envelope and
 * outstanding grant. That made a routine credential rotation a user-facing
 * event, which is exactly the pressure that keeps a leaked key in service.
 *
 * The decisive case here is `rotating only the API key`: it runs the same
 * seal/rotate/open sequence twice, once with `RECOVERY_CRYPTO_SECRET` set and
 * once without, and asserts the outcomes differ. The legacy half is what proves
 * the coupling was real; the new half is what proves it is gone. Neither is
 * evidence without the other.
 *
 * No real credential appears here. Every secret is a synthetic string of the
 * required length.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  sealRecoveryEnvelope,
  openRecoveryEnvelope,
  fingerprintRecoveryCandidate,
  fingerprintRecoveryIp,
  issueRecoveryGrant,
  verifyRecoveryGrant,
} from '../../../lib/auth/recovery-crypto';

const DEDICATED = 'dedicated-recovery-secret-0000000000000000';
const API_KEY_A = 'synthetic-service-role-key-AAAAAAAAAAAAAAAA';
const API_KEY_B = 'synthetic-service-role-key-BBBBBBBBBBBBBBBB';
const SHORT = 'too-short';

const NAMES = ['RECOVERY_CRYPTO_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
const original = new Map(NAMES.map((n) => [n, process.env[n]]));

/** Assigning `undefined` would store the STRING "undefined"; delete instead. */
function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  for (const name of NAMES) setEnv(name, undefined);
});

afterAll(() => {
  for (const [name, value] of original) setEnv(name, value);
});

const PAYLOAD = { email: 'synthetic@example.test', at: 1 };
const seal = () => sealRecoveryEnvelope(PAYLOAD, 'request');
const open = (envelope: string) => openRecoveryEnvelope(envelope, 'request');

// ---------------------------------------------------------------------------
// Selection order: explicit -> RECOVERY_CRYPTO_SECRET -> SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------------------

describe('secret selection order', () => {
  it('1. an explicit argument wins over both environment variables', () => {
    setEnv('RECOVERY_CRYPTO_SECRET', DEDICATED);
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);
    const explicit = 'explicit-secret-for-this-test-000000000000';

    const sealed = sealRecoveryEnvelope(PAYLOAD, 'request', explicit);

    expect(openRecoveryEnvelope(sealed, 'request', explicit)).toEqual(PAYLOAD);
    // Proves the explicit value was actually used, not merely accepted.
    expect(openRecoveryEnvelope(sealed, 'request')).toBeNull();
  });

  it('2. RECOVERY_CRYPTO_SECRET wins over the legacy API key', () => {
    setEnv('RECOVERY_CRYPTO_SECRET', DEDICATED);
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);

    const sealed = seal();

    expect(openRecoveryEnvelope(sealed, 'request', DEDICATED)).toEqual(PAYLOAD);
    expect(openRecoveryEnvelope(sealed, 'request', API_KEY_A)).toBeNull();
  });

  it('3. the legacy API key is still used when no dedicated secret is set', () => {
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);

    const sealed = seal();

    expect(openRecoveryEnvelope(sealed, 'request', API_KEY_A)).toEqual(PAYLOAD);
    expect(open(sealed)).toEqual(PAYLOAD);
  });

  it('a blank dedicated secret falls through to the legacy key rather than breaking', () => {
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);
    for (const blank of ['', '   ']) {
      setEnv('RECOVERY_CRYPTO_SECRET', blank);
      const sealed = seal();
      expect(openRecoveryEnvelope(sealed, 'request', API_KEY_A), `blank=${JSON.stringify(blank)}`).toEqual(PAYLOAD);
    }
  });
});

// ---------------------------------------------------------------------------
// No configured secret, and refusing to silently weaken.
// ---------------------------------------------------------------------------

describe('missing or unusable secret', () => {
  it('throws on seal when nothing is configured', () => {
    expect(() => seal()).toThrow('RECOVERY_CRYPTO_NOT_CONFIGURED');
    expect(() => fingerprintRecoveryCandidate('a@example.test')).toThrow('RECOVERY_CRYPTO_NOT_CONFIGURED');
    expect(() => fingerprintRecoveryIp('203.0.113.1')).toThrow('RECOVERY_CRYPTO_NOT_CONFIGURED');
  });

  it('returns a not_configured verdict rather than a false rejection', () => {
    expect(verifyRecoveryGrant('rg1.v1.a.b.c')).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('opens nothing when nothing is configured', () => {
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);
    const sealed = seal();
    setEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);
    expect(open(sealed)).toBeNull();
  });

  it('treats a too-short legacy key as unconfigured', () => {
    setEnv('SUPABASE_SERVICE_ROLE_KEY', SHORT);
    expect(() => seal()).toThrow('RECOVERY_CRYPTO_NOT_CONFIGURED');
  });

  it('fails closed on a too-short dedicated secret instead of falling back', () => {
    setEnv('RECOVERY_CRYPTO_SECRET', SHORT);
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);

    // The point: a misconfigured dedicated secret must surface, not be masked by
    // the legacy fallback and quietly encrypt under a different root.
    expect(() => seal()).toThrow('RECOVERY_CRYPTO_NOT_CONFIGURED');
  });
});

// ---------------------------------------------------------------------------
// The decoupling itself.
// ---------------------------------------------------------------------------

describe('rotating only the API key', () => {
  it('LEGACY: invalidates envelopes when the API key is the crypto root', () => {
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);
    const sealed = seal();

    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_B);

    expect(open(sealed)).toBeNull();
  });

  it('DECOUPLED: preserves envelopes when RECOVERY_CRYPTO_SECRET is configured', () => {
    setEnv('RECOVERY_CRYPTO_SECRET', DEDICATED);
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);
    const sealed = seal();

    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_B);

    expect(open(sealed)).toEqual(PAYLOAD);
  });

  it('DECOUPLED: preserves grants and candidate fingerprints across an API-key rotation', () => {
    setEnv('RECOVERY_CRYPTO_SECRET', DEDICATED);
    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_A);

    const subject = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const { grant } = issueRecoveryGrant(subject);
    const candidate = fingerprintRecoveryCandidate('person@example.test');
    const ip = fingerprintRecoveryIp('203.0.113.1');

    setEnv('SUPABASE_SERVICE_ROLE_KEY', API_KEY_B);

    const verified = verifyRecoveryGrant(grant);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.claims.subject).toBe(subject);
    expect(fingerprintRecoveryCandidate('person@example.test')).toBe(candidate);
    expect(fingerprintRecoveryIp('203.0.113.1')).toBe(ip);
  });

  it('rotating the dedicated secret DOES invalidate envelopes, which is why a cutover needs a drained queue', () => {
    setEnv('RECOVERY_CRYPTO_SECRET', DEDICATED);
    const sealed = seal();

    setEnv('RECOVERY_CRYPTO_SECRET', 'a-different-dedicated-secret-000000000000');

    expect(open(sealed)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Server-only. The encryption root must never reach a browser bundle.
// ---------------------------------------------------------------------------

describe('server-only exposure', () => {
  it('is not a NEXT_PUBLIC_ name', () => {
    expect('RECOVERY_CRYPTO_SECRET'.startsWith('NEXT_PUBLIC_')).toBe(false);
  });

  it('is not surfaced through next.config.js', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const config = readFileSync(resolve(__dirname, '../../../next.config.js'), 'utf8');
    expect(config).not.toContain('RECOVERY_CRYPTO_SECRET');
    expect(config).not.toContain('NEXT_PUBLIC_RECOVERY');
  });

  it('is read only inside the server-only crypto module', async () => {
    const { execFileSync } = await import('node:child_process');
    const { resolve } = await import('node:path');
    const root = resolve(__dirname, '../../..');
    const hits = execFileSync('git', ['grep', '-l', 'RECOVERY_CRYPTO_SECRET', '--', '.'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      // Only executable source can actually read an environment variable, so
      // exclude by file TYPE rather than by directory: prose may name the
      // variable anywhere (runbooks live under docs/, but PROJECT_STATE.md is
      // at the repository root), and a directory allow-list would make this
      // assertion fail on documentation rather than on a real leak.
      .filter((f) => !f.endsWith('.md') && !f.startsWith('__tests__/'));

    expect(hits).toEqual(['lib/auth/recovery-crypto.ts']);
  });
});
