// @vitest-environment node
/**
 * lib/auth/recovery-proof — the module that decides what counts as proof.
 *
 * The finding it answers: the previous round proved identity to the recovery
 * endpoint with an ordinary bearer access token, and `getUser` cannot tell a
 * recovery-minted token from a login-minted one. This module replaces that with
 * `verifyOtp({ type: 'recovery' })`, which is purpose-bound, one-time, expiring
 * and identity-bearing — and which no shape of ordinary session credential
 * satisfies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RECOVERY_TYPE,
  consumeRecoveryProof,
  isRecoveryProofRefusal,
} from '../../../lib/auth/recovery-proof';

const LINK_OWNER = '11111111-1111-4111-8111-111111111111';
const HASH = 'one-time-hash';

function verifier(
  opts: { userId?: string | null; error?: { message: string } | null; throws?: boolean } = {}
) {
  const calls: any[] = [];
  const signOuts: unknown[] = [];
  return {
    calls,
    signOuts,
    factory: () => ({
      auth: {
        verifyOtp: vi.fn(async (args: any) => {
          calls.push(args);
          if (opts.throws) throw new Error('network');
          if (opts.error) return { data: null, error: opts.error };
          const id = 'userId' in opts ? opts.userId : LINK_OWNER;
          return { data: { user: id === null ? null : { id } }, error: null };
        }),
        signOut: vi.fn(async (o: unknown) => {
          signOuts.push(o);
          return { error: null };
        }),
      },
    }),
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon');
});

afterEach(() => vi.unstubAllEnvs());

describe('what it consumes', () => {
  it('verifies with the LITERAL recovery type and returns the account GoTrue names', async () => {
    const v = verifier();
    const result = await consumeRecoveryProof({ tokenHash: HASH, type: 'recovery' }, v.factory);

    expect(result).toEqual({ ok: true, userId: LINK_OWNER });
    expect(v.calls).toEqual([{ token_hash: HASH, type: RECOVERY_TYPE }]);
  });

  it('accepts material with no declared type — the format is unambiguous', async () => {
    const v = verifier();
    const result = await consumeRecoveryProof({ tokenHash: HASH }, v.factory);

    expect(result).toEqual({ ok: true, userId: LINK_OWNER });
    expect(v.calls[0].type).toBe('recovery');
  });

  it('trims surrounding whitespace before verifying', async () => {
    const v = verifier();
    await consumeRecoveryProof({ tokenHash: `  ${HASH}  ` }, v.factory);
    expect(v.calls[0].token_hash).toBe(HASH);
  });

  it('discards the throwaway session it minted', async () => {
    const v = verifier();
    await consumeRecoveryProof({ tokenHash: HASH }, v.factory);
    expect(v.signOuts).toEqual([{ scope: 'local' }]);
  });
});

describe('what it refuses', () => {
  it.each([
    ['no material at all', {}],
    ['an empty string', { tokenHash: '' }],
    ['whitespace only', { tokenHash: '   ' }],
    ['a non-string', { tokenHash: 12345 }],
    ['an object', { tokenHash: { evil: true } }],
  ])('refuses %s without contacting the provider', async (_label, material) => {
    const v = verifier();
    const result = await consumeRecoveryProof(material as never, v.factory);

    expect(isRecoveryProofRefusal(result)).toBe(true);
    expect((result as any).reason).toBe('missing_material');
    expect(v.calls).toEqual([]);
  });

  it.each([['magiclink'], ['signup'], ['email_change'], ['invite']])(
    'refuses a link declaring type=%s, without contacting the provider',
    async (type) => {
      const v = verifier();
      const result = await consumeRecoveryProof({ tokenHash: HASH, type }, v.factory);

      expect((result as any).reason).toBe('wrong_type');
      expect(v.calls).toEqual([]);
    }
  );

  it('refuses expired / consumed / replayed material with ONE reason', async () => {
    for (const message of [
      'Token has expired or is invalid',
      'Email link is invalid or has expired',
      'Token already used',
    ]) {
      const v = verifier({ error: { message } });
      const result = await consumeRecoveryProof({ tokenHash: HASH }, v.factory);
      expect((result as any).reason).toBe('invalid');
    }
  });

  it('refuses a verification that returns no user', async () => {
    const v = verifier({ userId: null });
    const result = await consumeRecoveryProof({ tokenHash: HASH }, v.factory);
    expect((result as any).reason).toBe('invalid');
  });

  it('turns a thrown verifyOtp into a refusal, not a crash', async () => {
    const v = verifier({ throws: true });
    const result = await consumeRecoveryProof({ tokenHash: HASH }, v.factory);
    expect((result as any).reason).toBe('invalid');
  });

  it('reports not_configured when the server has no Supabase environment', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    const result = await consumeRecoveryProof({ tokenHash: HASH });
    expect((result as any).reason).toBe('not_configured');
  });
});

describe('what it never does', () => {
  it('never logs the material', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const v = verifier({ error: { message: 'Token has expired or is invalid' } });
    await consumeRecoveryProof({ tokenHash: HASH }, v.factory);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(HASH);
  });

  it('never returns the provider wording', async () => {
    const v = verifier({ error: { message: 'Token has expired or is invalid' } });
    const result = await consumeRecoveryProof({ tokenHash: HASH }, v.factory);
    expect(JSON.stringify(result)).not.toContain('expired');
  });
});
