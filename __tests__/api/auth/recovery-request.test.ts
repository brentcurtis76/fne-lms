// @vitest-environment node
/**
 * /api/auth/recovery-request — "olvidé mi contraseña", server-side.
 *
 * WHY THIS ENDPOINT EXISTS. `/login` used to call
 * `supabase.auth.resetPasswordForEmail()` from the browser, which sends
 * SUPABASE'S template with SUPABASE'S link. That link lands as an implicit
 * `#access_token=` fragment or a PKCE `?code=` depending on a dashboard setting,
 * and NEITHER can be turned into server-verifiable, purpose-bound, one-time
 * proof — which is what the recovery ceremony now requires. The invitation path
 * had already moved to `?token_hash=`; this closes the gap so that every recovery
 * link this platform sends has the same shape and the same security story.
 *
 * The two properties under test: the link is the one this application builds, and
 * the ANSWER IS IDENTICAL on every path, so the form cannot be used to discover
 * whether an address has an account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

const {
  mockCreateServiceRoleClient,
  mockGenerateRecoveryLink,
  mockSendPasswordRecoveryEmail,
} = vi.hoisted(() => ({
  mockCreateServiceRoleClient: vi.fn(),
  mockGenerateRecoveryLink: vi.fn(),
  mockSendPasswordRecoveryEmail: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createServiceRoleClient: mockCreateServiceRoleClient };
});

vi.mock('../../../lib/auth/recovery-link', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, generateRecoveryLink: mockGenerateRecoveryLink };
});

vi.mock('../../../lib/email/invitations', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, sendPasswordRecoveryEmail: mockSendPasswordRecoveryEmail };
});

vi.mock('../../../lib/rateLimit', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, rateLimit: () => async () => true };
});

import handler, { RECOVERY_REQUEST_ACKNOWLEDGEMENT } from '../../../pages/api/auth/recovery-request';

const KNOWN = 'sintetica@example.com';
const UNKNOWN = 'nadie@example.com';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECOVERY_URL = 'https://genera.example.cl/reset-password?token_hash=abc&type=recovery';

interface Options {
  profile?: { id: string; first_name: string } | null;
  linkOk?: boolean;
  delivery?: Record<string, unknown>;
  throwOnProfile?: boolean;
}

function setup(opts: Options = {}) {
  const audits: Array<Record<string, unknown>> = [];

  mockCreateServiceRoleClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn(async () => {
            if (opts.throwOnProfile) throw new Error('connection reset');
            return { data: opts.profile ?? null, error: null };
          }),
        };
        return chain;
      }
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          audits.push(row);
          return { error: null };
        }),
      };
    }),
  });

  mockGenerateRecoveryLink.mockImplementation(async () =>
    opts.linkOk === false
      ? { ok: false, reason: 'generate_failed' }
      : { ok: true, url: RECOVERY_URL }
  );

  mockSendPasswordRecoveryEmail.mockImplementation(async () =>
    opts.delivery ?? { sent: true, status: 'provider_accepted', providerMessageId: 'm1' }
  );

  return { audits };
}

async function post(body: unknown) {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req as never, res as never);
  return { res, json: res._getJSONData() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------

describe('the link is the one this application sends', () => {
  it('mints it with the shared helper and delivers it with the shared mailer', async () => {
    setup({ profile: { id: USER_ID, first_name: 'Ana' } });
    const { res } = await post({ email: KNOWN });

    expect(res._getStatusCode()).toBe(200);
    expect(mockGenerateRecoveryLink).toHaveBeenCalledTimes(1);
    expect(mockSendPasswordRecoveryEmail).toHaveBeenCalledWith({
      to: KNOWN,
      firstName: 'Ana',
      recoveryUrl: RECOVERY_URL,
    });
  });

  it('normalises the address, so a copy-paste with case and whitespace still matches', async () => {
    setup({ profile: { id: USER_ID, first_name: 'Ana' } });
    await post({ email: '  Sintetica@Example.COM  ' });

    expect(mockGenerateRecoveryLink.mock.calls[0][1]).toMatchObject({ email: KNOWN });
  });

  it('never returns the link', async () => {
    setup({ profile: { id: USER_ID, first_name: 'Ana' } });
    const { json } = await post({ email: KNOWN });

    expect(JSON.stringify(json)).not.toContain('token_hash');
    expect(JSON.stringify(json)).not.toContain(RECOVERY_URL);
  });
});

// ---------------------------------------------------------------------------

describe('anti-enumeration: the answer is identical on every path', () => {
  const cases: Array<[string, Options, unknown]> = [
    ['a known address', { profile: { id: USER_ID, first_name: 'Ana' } }, { email: KNOWN }],
    ['an address with no account', { profile: null, linkOk: false }, { email: UNKNOWN }],
    ['a malformed address', {}, { email: 'not-an-address' }],
    ['an empty address', {}, { email: '' }],
    ['a missing address', {}, {}],
    ['a non-string address', {}, { email: { evil: true } }],
    [
      'a provider that rejected the message',
      {
        profile: { id: USER_ID, first_name: 'Ana' },
        delivery: { sent: false, status: 'provider_rejected', reason: 'provider_rejected' },
      },
      { email: KNOWN },
    ],
    [
      'a link that could not be minted',
      { profile: { id: USER_ID, first_name: 'Ana' }, linkOk: false },
      { email: KNOWN },
    ],
    ['an internal failure', { throwOnProfile: true }, { email: KNOWN }],
  ];

  for (const [label, opts, body] of cases) {
    it(`answers identically for ${label}`, async () => {
      setup(opts);
      const { res, json } = await post(body);

      expect(res._getStatusCode()).toBe(200);
      expect(json).toEqual({ message: RECOVERY_REQUEST_ACKNOWLEDGEMENT });
    });
  }

  it('the acknowledgement is es-CL and commits to nothing', () => {
    expect(RECOVERY_REQUEST_ACKNOWLEDGEMENT).toMatch(/^Si existe una cuenta/);
    expect(RECOVERY_REQUEST_ACKNOWLEDGEMENT).not.toMatch(/\b(sent|error|not found)\b/i);
  });

  it('does not even attempt a send for a malformed address', async () => {
    setup();
    await post({ email: 'not-an-address' });

    expect(mockGenerateRecoveryLink).not.toHaveBeenCalled();
    expect(mockSendPasswordRecoveryEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('the audit trail', () => {
  it('records the request against the account, with the DELIVERY STATUS as observed', async () => {
    const { audits } = setup({ profile: { id: USER_ID, first_name: 'Ana' } });
    await post({ email: KNOWN });

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'password_recovery_requested',
      outcome: 'success',
      actor_user_id: USER_ID,
      target_user_id: USER_ID,
    });
    // `provider_accepted`, never `delivered`.
    expect((audits[0] as any).metadata.delivery_status).toBe('provider_accepted');
  });

  it('records a failure when the provider refused', async () => {
    const { audits } = setup({
      profile: { id: USER_ID, first_name: 'Ana' },
      delivery: { sent: false, status: 'provider_rejected', reason: 'provider_rejected' },
    });
    await post({ email: KNOWN });

    expect(audits[0]).toMatchObject({ outcome: 'failure' });
    expect((audits[0] as any).metadata.delivery_status).toBe('provider_rejected');
  });

  it('records a failure when the link could not be minted', async () => {
    const { audits } = setup({ profile: { id: USER_ID, first_name: 'Ana' }, linkOk: false });
    await post({ email: KNOWN });

    expect(audits[0]).toMatchObject({ outcome: 'failure' });
    expect((audits[0] as any).metadata.delivery_status).toBe('link_generation_failed');
  });

  it('writes NOTHING for an address with no account — there is no subject to attribute it to', async () => {
    const { audits } = setup({ profile: null, linkOk: false });
    await post({ email: UNKNOWN });

    expect(audits).toEqual([]);
  });

  it('never puts the address or the link in the trail', async () => {
    const { audits } = setup({ profile: { id: USER_ID, first_name: 'Ana' } });
    await post({ email: KNOWN });

    const serialised = JSON.stringify(audits);
    expect(serialised).not.toContain(KNOWN);
    expect(serialised).not.toContain('token_hash');
  });
});

describe('method handling', () => {
  it('refuses a non-POST in es-CL', async () => {
    setup();
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as never, res as never);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().error).toBe('Método no permitido');
  });
});
