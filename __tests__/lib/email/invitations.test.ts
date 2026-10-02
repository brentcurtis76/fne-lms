// @vitest-environment node
/**
 * The invitation e-mails: rendering, escaping, and the transport contract.
 *
 * TWO DEFECTS this covers, both from `pages/api/admin/tractor-signups/grant.ts`:
 *
 *   - No fallback for the button. The copy under it read "copia y pega el enlace
 *     de recuperación desde tu correo en el navegador" — circular advice: the
 *     reader IS in their correo, and the link appeared nowhere they could copy
 *     it from. A mail client that strips or fails to render the anchor (several
 *     school-managed Outlook configurations do) made the invitation unusable
 *     with no way to proceed.
 *   - No e-mail at all when a grant attached roles to an EXISTING profile (S8).
 *
 * And the invariant the rest of the remediation depends on: the action link
 * never leaves this module — not in the result, not in a log line.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DELIVERY_MESSAGES,
  DELIVERY_SUCCESS_MESSAGE,
  deliveryMessage,
  escapeHtml,
  sendAccessGrantedEmail as sendAccessGrantedEmailRaw,
  sendPasswordRecoveryEmail as sendPasswordRecoveryEmailRaw,
  sendPasswordSetupEmail as sendPasswordSetupEmailRaw,
  type EmailTransport,
} from '../../../lib/email/invitations';
import { buildNotificationEmail } from '../../../lib/email/notifications';
import { PUBLIC_OUTBOUND_EMAIL } from '../../../lib/email/outbound-policy';

const sendPasswordSetupEmail = (params: any, transport?: EmailTransport) =>
  sendPasswordSetupEmailRaw({ ...params, authorization: PUBLIC_OUTBOUND_EMAIL }, transport);
const sendPasswordRecoveryEmail = (params: any, transport?: EmailTransport) =>
  sendPasswordRecoveryEmailRaw({ ...params, authorization: PUBLIC_OUTBOUND_EMAIL }, transport);
const sendAccessGrantedEmail = (params: any, transport?: EmailTransport) =>
  sendAccessGrantedEmailRaw({ ...params, authorization: PUBLIC_OUTBOUND_EMAIL }, transport);

// The URL the application itself builds from `generateLink().properties.hashed_token`
// (lib/auth/recovery-link.ts) — not the provider's `action_link`, which used to be
// e-mailed and landed in whatever shape the project's dashboard settings produced.
const ACTION_LINK =
  'https://genera.example.org/reset-password?token_hash=synthetic-token&type=recovery';
const LOGIN_URL = 'https://genera.example.org/login';

function captureTransport(result: { error?: { message?: string } | null } = {}) {
  const sent: Array<{ from: string; to: string; subject: string; html: string }> = [];
  const transport: EmailTransport = async (message) => {
    sent.push(message);
    return { error: result.error ?? null };
  };
  return { transport, sent };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubEnv('RESEND_API_KEY', 'synthetic-key-not-a-real-credential');
  vi.stubEnv('EMAIL_FROM_ADDRESS', '');
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('escapeHtml', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
    ["'", '&#39;'],
  ])('escapes %s', (raw, escaped) => {
    expect(escapeHtml(raw)).toBe(escaped);
  });

  it('escapes ampersands before the rest, so an entity is not double-encoded wrongly', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});

describe('sendPasswordSetupEmail — the new-account invitation', () => {
  it('renders the button AND the complete URL as visible text', async () => {
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'Cuerpo.' },
      transport
    );

    const html = sent[0].html;
    // The button.
    expect(html).toContain('Establecer contraseña');
    // The fallback lead — and it no longer tells the reader to find the link in
    // an e-mail they are already reading.
    expect(html).toContain('copia y pega esta dirección completa en tu navegador');
    expect(html).not.toContain('desde tu correo');
    // The URL appears TWICE: once as the href, once as readable text.
    const escapedLink = escapeHtml(ACTION_LINK);
    expect(html.split(escapedLink).length - 1).toBe(2);
  });

  it('escapes the personalised name', async () => {
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      {
        to: 'persona@example.com',
        // Names come from a public sign-up form: attacker-controlled text.
        firstName: '<script>alert(1)</script>',
        recoveryUrl: ACTION_LINK,
        bodyLine: 'Cuerpo.',
      },
      transport
    );

    expect(sent[0].html).not.toContain('<script>');
    expect(sent[0].html).toContain('&lt;script&gt;');
  });

  it('escapes the body line and the link', async () => {
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      {
        to: 'persona@example.com',
        firstName: 'Ana',
        recoveryUrl: 'https://example.org/x?a=1&b="2"',
        bodyLine: 'Texto con <b>etiquetas</b> & símbolos',
      },
      transport
    );

    const html = sent[0].html;
    expect(html).not.toContain('<b>etiquetas</b>');
    expect(html).toContain('&lt;b&gt;etiquetas&lt;/b&gt;');
    // The `&` inside the href is entity-encoded, which is what an HTML
    // attribute requires; the browser decodes it back on click.
    expect(html).toContain('a=1&amp;b=&quot;2&quot;');
  });

  it('uses the configured sender when one is set', async () => {
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'Genera <hola@example.org>');
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );
    expect(sent[0].from).toBe('Genera <hola@example.org>');
  });

  it('falls back to the default sender when none is configured', async () => {
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );
    expect(sent[0].from).toBe('Genera <notificaciones@nuevaeducacion.org>');
  });

  it('gives a bare configured address the Genera display name', async () => {
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'hola@example.org');
    const { transport, sent } = captureTransport();
    await sendPasswordRecoveryEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK },
      transport
    );
    expect(sent[0].from).toBe('Genera <hola@example.org>');
  });

  it.each([
    ['doubled brackets', 'Genera <<hola@example.org>>'],
    ['no address', 'hola at example dot org'],
    ['blank', '   '],
    ['CRLF', 'Genera\r\nBcc: otro@example.org <hola@example.org>'],
    ['LF', 'Genera\nX-Test: injected <hola@example.org>'],
    ['CR', 'Genera\rBcc: otro@example.org <hola@example.org>'],
  ])('a malformed sender (%s) fails before the transport, as not_configured', async (_label, value) => {
    vi.stubEnv('EMAIL_FROM_ADDRESS', value);
    const { transport, sent } = captureTransport();

    const results = [
      await sendPasswordSetupEmail(
        { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
        transport
      ),
      await sendAccessGrantedEmail(
        { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'x' },
        transport
      ),
      await sendPasswordRecoveryEmail(
        { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK },
        transport
      ),
    ];

    expect(sent).toEqual([]);
    for (const result of results) {
      expect(result).toEqual({
        sent: false,
        status: 'not_configured',
        reason: 'not_configured',
        detail: 'invalid_sender',
      });
      expect(deliveryMessage(result)).toBe(DELIVERY_MESSAGES.not_configured);
    }
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('Bcc');
  });
});

describe('sendPasswordRecoveryEmail — self-service recovery', () => {
  it('renders the es-CL copy, the button and the complete URL as visible text', async () => {
    const { transport, sent } = captureTransport();
    const result = await sendPasswordRecoveryEmail(
      { to: 'persona@example.com', firstName: '<b>Ana</b>', recoveryUrl: ACTION_LINK },
      transport
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Restablece tu contraseña de Genera');
    const html = sent[0].html;
    expect(html).toContain('Hola &lt;b&gt;Ana&lt;/b&gt;,');
    expect(html).toContain('Recibimos una solicitud para restablecer tu contraseña.');
    expect(html).toContain('Restablecer contraseña');
    expect(html).toContain('copia y pega esta dirección completa en tu navegador');
    expect(html).toContain('tu contraseña actual sigue funcionando');
    expect(html.split(escapeHtml(ACTION_LINK)).length - 1).toBe(2);
    expect(JSON.stringify(result)).not.toContain('token_hash');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('token_hash');
  });
});

describe('the shared renderer (lib/email/render.ts)', () => {
  it('gives the invitation and the notification the same shell, button and fallback markup', async () => {
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: LOGIN_URL, bodyLine: 'Cuerpo.' },
      transport
    );
    const invitation = sent[0].html;
    const notification = buildNotificationEmail({
      title: 'Tu acceso está listo',
      description: 'Cuerpo.',
      url: LOGIN_URL,
    }).html;

    const shell = (html: string) => html.slice(0, html.indexOf('<p '));
    const fallbackUrl = (html: string) =>
      html.slice(html.indexOf('<p style="margin:0;color:#0a0a0a'), html.lastIndexOf('<p '));
    const button = (html: string) => html.slice(html.indexOf('<a href='), html.indexOf('">', html.indexOf('<a href=')));

    expect(shell(invitation)).toContain('Tu acceso está listo');
    expect(shell(notification)).toBe(shell(invitation));
    expect(button(notification)).toBe(button(invitation));
    expect(fallbackUrl(notification)).toBe(fallbackUrl(invitation));
    expect(fallbackUrl(invitation)).toContain(LOGIN_URL);
  });
});

describe('authorization boundary and the synchronous path', () => {
  let outboxDir: string;
  let outbox: string;

  beforeEach(() => {
    outboxDir = mkdtempSync(join(tmpdir(), 'notif13-outbox-'));
    outbox = join(outboxDir, 'outbox.jsonl');
    vi.stubEnv('E2E_MAIL_OUTBOX', outbox);
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    rmSync(outboxDir, { recursive: true, force: true });
  });

  it.each([
    ['QA tenant', { kind: 'suppressed_qa', schoolId: 257, reason: 'qa_tenant' }, 'suppressed_qa'],
    ['refused scope', { kind: 'refuse', reason: 'school_lookup_failed' }, 'refused'],
  ] as const)('%s: no transport call and no outbox mirror', async (_label, authorization, status) => {
    const { transport, sent } = captureTransport();
    const result = await sendPasswordSetupEmailRaw(
      {
        to: 'persona@example.com',
        firstName: 'Ana',
        recoveryUrl: ACTION_LINK,
        bodyLine: 'x',
        authorization,
      },
      transport
    );

    expect(result).toMatchObject({ sent: false, status, reason: status });
    expect(sent).toEqual([]);
    expect(existsSync(outbox)).toBe(false);
    expect(JSON.stringify(result)).not.toContain('token_hash');
  });

  it('an authorized call hands the transport exactly one message and mirrors exactly one', async () => {
    const { transport, sent } = captureTransport();
    const result = await sendAccessGrantedEmail(
      { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'x' },
      transport
    );

    expect(result).toEqual({ sent: true, status: 'provider_accepted' });
    expect(sent).toHaveLength(1);
    const mirrored = readFileSync(outbox, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(mirrored).toEqual([
      { to: 'persona@example.com', subject: sent[0].subject, html: sent[0].html },
    ]);
  });

  it.each([
    ['CRLF', 'Genera\r\nBcc: otro@example.org <hola@example.org>'],
    ['doubled brackets', 'Genera <<hola@example.org>>'],
  ])('an authorized call with a malformed sender (%s): no transport call and no outbox mirror', async (_label, value) => {
    vi.stubEnv('EMAIL_FROM_ADDRESS', value);
    const { transport, sent } = captureTransport();

    const results = [
      await sendPasswordSetupEmail(
        { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
        transport
      ),
      await sendAccessGrantedEmail(
        { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'x' },
        transport
      ),
      await sendPasswordRecoveryEmail(
        { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK },
        transport
      ),
    ];

    for (const result of results) {
      expect(result).toEqual({
        sent: false,
        status: 'not_configured',
        reason: 'not_configured',
        detail: 'invalid_sender',
      });
    }
    expect(sent).toEqual([]);
    expect(existsSync(outbox)).toBe(false);
  });

  it('without an API key (local test mode) an authorized message is still mirrored once', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const result = await sendPasswordSetupEmail({
      to: 'persona@example.com',
      firstName: 'Ana',
      recoveryUrl: ACTION_LINK,
      bodyLine: 'x',
    });

    expect(result).toEqual({ sent: false, status: 'not_configured', reason: 'not_configured' });
    const mirrored = readFileSync(outbox, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]).toMatchObject({ to: 'persona@example.com', subject: 'Activa tu acceso a Genera' });
  });
});

describe('sendAccessGrantedEmail — the existing-account notice (S8)', () => {
  it('sends the canonical LOGIN url, not a recovery link', async () => {
    // Mailing "restablece tu contraseña" to somebody whose password is fine
    // trains the exact habit phishing relies on, and needlessly invalidates a
    // working credential.
    const { transport, sent } = captureTransport();
    await sendAccessGrantedEmail(
      { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'Cuerpo.' },
      transport
    );

    const html = sent[0].html;
    expect(html).toContain(LOGIN_URL);
    expect(html).not.toContain('token_hash');
    expect(html).not.toContain('Establecer contraseña');
    expect(html).toContain('Ir a Genera');
  });

  it('tells the recipient to use the password they already have', async () => {
    const { transport, sent } = captureTransport();
    await sendAccessGrantedEmail(
      { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'x' },
      transport
    );
    expect(sent[0].html).toContain('Ingresa con la contraseña que ya usabas');
  });

  it('shows the login URL as visible fallback text too', async () => {
    const { transport, sent } = captureTransport();
    await sendAccessGrantedEmail(
      { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'x' },
      transport
    );
    expect(sent[0].html.split(LOGIN_URL).length - 1).toBe(2);
  });

  it('has a distinct subject from the invitation', async () => {
    const { transport, sent } = captureTransport();
    await sendAccessGrantedEmail(
      { to: 'persona@example.com', firstName: 'Ana', loginUrl: LOGIN_URL, bodyLine: 'x' },
      transport
    );
    expect(sent[0].subject).toBe('Tu acceso a Genera fue actualizado');
  });
});

describe('transport outcomes', () => {
  it('CONFIGURED and accepted → provider_accepted, NOT "delivered"', async () => {
    const { transport } = captureTransport();
    const result = await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );
    // `sent: true` now has a precise meaning: the provider ACCEPTED the message.
    // Nothing in this process knows whether it reached an inbox.
    expect(result).toEqual({ sent: true, status: 'provider_accepted' });
  });

  it('MISSING configuration → not_configured, and nothing is attempted', async () => {
    // The production state today: RESEND_API_KEY is absent from the Vercel
    // Production environment, so every invitation takes this branch.
    vi.stubEnv('RESEND_API_KEY', '');
    const result = await sendPasswordSetupEmail({
      to: 'persona@example.com',
      firstName: 'Ana',
      recoveryUrl: ACTION_LINK,
      bodyLine: 'x',
    });

    expect(result).toEqual({
      sent: false,
      status: 'not_configured',
      reason: 'not_configured',
    });
    expect(deliveryMessage(result)).toBe(DELIVERY_MESSAGES.not_configured);
  });

  it('PROVIDER REJECTION → provider_rejected, with operator detail', async () => {
    const { transport } = captureTransport({ error: { message: 'Invalid `to` field' } });
    const result = await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('provider_rejected');
    expect(result.detail).toBe('Invalid `to` field');
    expect(deliveryMessage(result)).toBe(DELIVERY_MESSAGES.provider_rejected);
  });

  it('a THROWN transport error → transport_error, not an exception', async () => {
    const transport: EmailTransport = async () => {
      throw new Error('ECONNRESET');
    };
    const result = await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );

    expect(result).toMatchObject({ sent: false, reason: 'transport_error' });
    expect(deliveryMessage(result)).toBe(DELIVERY_MESSAGES.transport_error);
  });

  it('every operator-facing message is es-CL', () => {
    for (const message of Object.values(DELIVERY_MESSAGES)) {
      expect(message).toMatch(/^No se/);
    }
    // Deliberately NOT "Correo enviado correctamente." An administrator reading
    // the toast should understand that the message left this platform and that
    // arrival is a separate fact nobody here has checked.
    expect(DELIVERY_SUCCESS_MESSAGE).toContain('aceptó el mensaje');
    expect(DELIVERY_SUCCESS_MESSAGE).not.toMatch(/entregad|delivered/i);
  });
});

describe('the action link never leaves the module', () => {
  it('never renders the legacy "Hola Hola," recovery greeting', async () => {
    const { transport, sent } = captureTransport();
    await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Hola', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );
    expect(sent[0].html).toContain('Hola,');
    expect(sent[0].html).not.toContain('Hola Hola,');
  });

  it('is absent from a successful result', async () => {
    const { transport } = captureTransport();
    const result = await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );
    expect(JSON.stringify(result)).not.toContain('token_hash');
    expect(JSON.stringify(result)).not.toContain(ACTION_LINK);
  });

  it('is absent from a failed result', async () => {
    const { transport } = captureTransport({ error: { message: 'nope' } });
    const result = await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );
    expect(JSON.stringify(result)).not.toContain('token_hash');
  });

  it('is absent from every log line, and so is the full recipient address', async () => {
    const { transport } = captureTransport({ error: { message: 'nope' } });
    await sendPasswordSetupEmail(
      { to: 'persona@example.com', firstName: 'Ana', recoveryUrl: ACTION_LINK, bodyLine: 'x' },
      transport
    );

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('token_hash');
    expect(logged).not.toContain('persona@example.com');
    expect(logged).not.toContain('example.com');
  });

  it('logs neither the address nor its domain when the key is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    await sendPasswordSetupEmail({
      to: 'persona@example.com',
      firstName: 'Ana',
      recoveryUrl: ACTION_LINK,
      bodyLine: 'x',
    });

    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('persona@example.com');
    expect(logged).not.toContain(ACTION_LINK);
  });
});

describe('durable recovery provider idempotency', () => {
  it('sends the stable key through Resend\'s documented Idempotency-Key header', async () => {
    const providerFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'provider-message-1' }),
    }));
    vi.stubGlobal('fetch', providerFetch);

    const result = await sendPasswordRecoveryEmail({
      to: 'persona@example.com',
      firstName: 'Ana',
      recoveryUrl: ACTION_LINK,
      idempotencyKey: 'password-recovery/22222222-2222-4222-8222-222222222222',
    });

    expect(result).toMatchObject({ sent: true, status: 'provider_accepted' });
    expect(providerFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'password-recovery/22222222-2222-4222-8222-222222222222',
        }),
      })
    );
  });

  it('classifies a network throw as retryable transport_error, not provider_rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('synthetic network failure');
    }));
    const result = await sendPasswordRecoveryEmail({
      to: 'persona@example.com',
      firstName: 'Ana',
      recoveryUrl: ACTION_LINK,
      idempotencyKey: 'password-recovery/22222222-2222-4222-8222-222222222222',
    });
    expect(result).toMatchObject({
      sent: false,
      status: 'transport_error',
      reason: 'transport_error',
    });
  });

  it.each([429, 500, 503])(
    'classifies provider HTTP %i as retryable transport_error',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: false,
        status,
        json: async () => ({ message: 'synthetic transient response' }),
      })));

      const result = await sendPasswordRecoveryEmail({
        to: 'persona@example.com',
        firstName: 'Ana',
        recoveryUrl: ACTION_LINK,
        idempotencyKey: 'password-recovery/22222222-2222-4222-8222-222222222222',
      });

      expect(result).toMatchObject({
        sent: false,
        status: 'transport_error',
        reason: 'transport_error',
      });
    }
  );

  it('keeps a provider HTTP 4xx refusal terminal and precise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ message: 'synthetic invalid recipient' }),
    })));

    const result = await sendPasswordRecoveryEmail({
      to: 'persona@example.com',
      firstName: 'Ana',
      recoveryUrl: ACTION_LINK,
      idempotencyKey: 'password-recovery/22222222-2222-4222-8222-222222222222',
    });

    expect(result).toMatchObject({
      sent: false,
      status: 'provider_rejected',
      reason: 'provider_rejected',
    });
  });
});
