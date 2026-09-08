// @vitest-environment node
/**
 * F2 — the recovery URL the application actually sends.
 *
 * Invitations used to e-mail `generateLink().properties.action_link`: the
 * PROVIDER's URL, which consumes the token at Supabase and then bounces the
 * browser to /reset-password in whatever shape the project's dashboard settings
 * produce — an `#access_token=…` fragment for an implicit project, `?code=…` for
 * a PKCE one. So the application could not know what would arrive, the shape
 * could change without a code change, and the mandatory e2e could not open the
 * link the product sends (it hand-built a different format instead).
 *
 * `hashed_token` is the same one-time credential without the provider's
 * redirect wrapper, so the URL can be built here, in one known format.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRecoveryUrl, generateRecoveryLink } from '../../../lib/auth/recovery-link';

const HASHED = 'pkce_synthetic_hashed_token_value';

function buildAdmin(result: { data?: unknown; error?: unknown }) {
  const generateLink = vi.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  return { admin: { auth: { admin: { generateLink } } }, generateLink };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('buildRecoveryUrl', () => {
  it('produces the application URL, not the provider one', () => {
    expect(buildRecoveryUrl('https://genera.example.org', HASHED)).toBe(
      `https://genera.example.org/reset-password?token_hash=${HASHED}&type=recovery`
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(buildRecoveryUrl('https://genera.example.org/', HASHED)).toBe(
      `https://genera.example.org/reset-password?token_hash=${HASHED}&type=recovery`
    );
  });

  it('encodes a token that would otherwise break the query string', () => {
    const url = buildRecoveryUrl('https://genera.example.org', 'a+b/c=d&e');
    expect(url).toContain('token_hash=a%2Bb%2Fc%3Dd%26e');
    // The `type` parameter must survive as its own parameter.
    expect(new URL(url).searchParams.get('type')).toBe('recovery');
    expect(new URL(url).searchParams.get('token_hash')).toBe('a+b/c=d&e');
  });

  it('is the format /reset-password verifies', () => {
    // `readRecoveryMaterial` reads `token_hash` from the QUERY and requires
    // `type` to be recovery or absent.
    const url = new URL(buildRecoveryUrl('https://genera.example.org', HASHED));
    expect(url.pathname).toBe('/reset-password');
    expect(url.hash).toBe('');
    expect(url.searchParams.get('token_hash')).toBe(HASHED);
  });
});

describe('generateRecoveryLink', () => {
  it('uses hashed_token and IGNORES action_link entirely', async () => {
    const { admin } = buildAdmin({
      data: {
        properties: {
          hashed_token: HASHED,
          action_link: 'https://synthetic.supabase.co/auth/v1/verify?token=abc&type=recovery',
        },
      },
    });

    const result = await generateRecoveryLink(admin as never, {
      email: 'sintetica@example.com',
      baseUrl: 'https://genera.example.org',
    });

    expect(result).toEqual({
      ok: true,
      url: `https://genera.example.org/reset-password?token_hash=${HASHED}&type=recovery`,
    });
    expect(JSON.stringify(result)).not.toContain('supabase.co');
  });

  it('still passes the real redirect so the provider allow-list stays meaningful', async () => {
    const { admin, generateLink } = buildAdmin({ data: { properties: { hashed_token: HASHED } } });

    await generateRecoveryLink(admin as never, {
      email: 'sintetica@example.com',
      baseUrl: 'https://genera.example.org/',
    });

    expect(generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'sintetica@example.com',
      options: { redirectTo: 'https://genera.example.org/reset-password' },
    });
  });

  it('reports a provider failure without leaking its wording', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = buildAdmin({ error: { message: 'user not found: sintetica@example.com' } });

    const result = await generateRecoveryLink(admin as never, {
      email: 'sintetica@example.com',
      baseUrl: 'https://genera.example.org',
    });

    expect(result).toEqual({ ok: false, reason: 'generate_failed' });
    expect(JSON.stringify(result)).not.toContain('sintetica@example.com');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sintetica@example.com');
  });

  it('refuses to build a URL when no hashed token comes back', async () => {
    // Falling back to `action_link` here would silently reintroduce the
    // implicit-fragment landing this change exists to remove.
    const { admin } = buildAdmin({
      data: { properties: { action_link: 'https://synthetic.supabase.co/auth/v1/verify?token=abc' } },
    });

    const result = await generateRecoveryLink(admin as never, {
      email: 'sintetica@example.com',
      baseUrl: 'https://genera.example.org',
    });

    expect(result).toEqual({ ok: false, reason: 'no_hashed_token' });
  });
});
