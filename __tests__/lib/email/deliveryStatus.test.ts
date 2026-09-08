// @vitest-environment node
/**
 * What a send result is allowed to CLAIM.
 *
 * The review's finding, in one sentence: handing a message to a provider's API
 * and getting a 200 back means the provider ACCEPTED it, and the previous code
 * called that `sent: true` with the toast "Correo enviado correctamente." It does
 * not mean the recipient's mail server accepted it, that it survived a spam
 * filter, or that it did not bounce twenty minutes later. Only a provider webhook
 * can say that, and this platform has none.
 *
 * So this suite is about honesty rather than behaviour:
 *
 *   * the accepted state is NAMED `provider_accepted`;
 *   * `delivered` and `bounced` exist in the type so that nothing quietly reads
 *     "accepted" as "delivered" — and NO CODE PATH IN THIS REPOSITORY PRODUCES
 *     EITHER, which is asserted below by driving every reachable outcome;
 *   * the administrator-facing sentence does not say "entregado".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DELIVERY_MESSAGES,
  DELIVERY_SUCCESS_MESSAGE,
  WEBHOOK_ONLY_STATUSES,
  deliveryMessage,
  linkGenerationFailed,
  sendPasswordSetupEmail as sendPasswordSetupEmailRaw,
  sendPasswordRecoveryEmail as sendPasswordRecoveryEmailRaw,
  sendAccessGrantedEmail as sendAccessGrantedEmailRaw,
  type DeliveryResult,
  type EmailTransport,
} from '../../../lib/email/invitations';
import { PUBLIC_OUTBOUND_EMAIL } from '../../../lib/email/outbound-policy';

const sendPasswordSetupEmail = (params: any, transport?: EmailTransport) =>
  sendPasswordSetupEmailRaw({ ...params, authorization: PUBLIC_OUTBOUND_EMAIL }, transport);
const sendPasswordRecoveryEmail = (params: any, transport?: EmailTransport) =>
  sendPasswordRecoveryEmailRaw({ ...params, authorization: PUBLIC_OUTBOUND_EMAIL }, transport);
const sendAccessGrantedEmail = (params: any, transport?: EmailTransport) =>
  sendAccessGrantedEmailRaw({ ...params, authorization: PUBLIC_OUTBOUND_EMAIL }, transport);

const RECOVERY_URL = 'https://genera.example.cl/reset-password?token_hash=abc&type=recovery';

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-key');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Drives every outcome a send can actually reach in this codebase. */
async function everyReachableOutcome(): Promise<DeliveryResult[]> {
  const accepted: EmailTransport = async () => ({ data: { id: 'provider-msg-1' }, error: null });
  const acceptedNoId: EmailTransport = async () => ({ error: null });
  const rejected: EmailTransport = async () => ({ error: { message: 'Invalid `to` field' } });
  const threw: EmailTransport = async () => {
    throw new Error('ECONNRESET');
  };

  const params = { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL };

  const results: DeliveryResult[] = [
    await sendPasswordSetupEmail({ ...params, bodyLine: 'x' }, accepted),
    await sendPasswordSetupEmail({ ...params, bodyLine: 'x' }, acceptedNoId),
    await sendPasswordSetupEmail({ ...params, bodyLine: 'x' }, rejected),
    await sendPasswordSetupEmail({ ...params, bodyLine: 'x' }, threw),
    await sendPasswordRecoveryEmail(params, accepted),
    await sendPasswordRecoveryEmail(params, rejected),
    await sendAccessGrantedEmail(
      { to: params.to, firstName: 'Ana', loginUrl: 'https://genera.example.cl/login', bodyLine: 'x' },
      accepted
    ),
    linkGenerationFailed(),
  ];

  vi.stubEnv('RESEND_API_KEY', '');
  results.push(await sendPasswordSetupEmail({ ...params, bodyLine: 'x' }));
  vi.stubEnv('RESEND_API_KEY', 'synthetic-key');

  return results;
}

describe('acceptance is not delivery', () => {
  it('a 200 from the provider is reported as provider_accepted', async () => {
    const transport: EmailTransport = async () => ({ data: { id: 'm1' }, error: null });
    const result = await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      transport
    );

    expect(result.status).toBe('provider_accepted');
    expect(result.sent).toBe(true);
  });

  it('NO code path in this repository ever returns "delivered" or "bounced"', async () => {
    const statuses = (await everyReachableOutcome()).map((r) => r.status);

    expect(statuses.length).toBeGreaterThan(5);
    for (const webhookOnly of WEBHOOK_ONLY_STATUSES) {
      expect(statuses, `${webhookOnly} requires provider webhook evidence`).not.toContain(
        webhookOnly
      );
    }
  });

  it('every reachable status is one of the observable ones', async () => {
    const statuses = new Set((await everyReachableOutcome()).map((r) => r.status));
    expect([...statuses].sort()).toEqual([
      'link_generation_failed',
      'not_configured',
      'provider_accepted',
      'provider_rejected',
      'transport_error',
    ]);
  });

  it('the success sentence does not claim delivery', () => {
    expect(DELIVERY_SUCCESS_MESSAGE).toContain('aceptó el mensaje');
    expect(DELIVERY_SUCCESS_MESSAGE).not.toMatch(/entregad/i);
    expect(deliveryMessage({ sent: true, status: 'provider_accepted' })).toBe(
      DELIVERY_SUCCESS_MESSAGE
    );
  });
});

describe('the failure states are distinguished', () => {
  it('not configured is not the same as a provider rejection', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const notConfigured = await sendPasswordSetupEmail({
      to: 'sintetica@example.com',
      firstName: 'Ana',
      recoveryUrl: RECOVERY_URL,
      bodyLine: 'x',
    });
    expect(notConfigured).toMatchObject({
      sent: false,
      status: 'not_configured',
      reason: 'not_configured',
    });
    expect(deliveryMessage(notConfigured)).toBe(DELIVERY_MESSAGES.not_configured);
  });

  it('a link that could not be minted is its own state — retrying the SEND would not help', () => {
    const result = linkGenerationFailed();
    expect(result).toEqual({
      sent: false,
      status: 'link_generation_failed',
      reason: 'link_generation_failed',
    });
    expect(deliveryMessage(result)).toBe(DELIVERY_MESSAGES.link_generation_failed);
  });

  it('a provider rejection keeps the operator detail and loses nothing else', async () => {
    const rejected: EmailTransport = async () => ({ error: { message: 'Invalid `to` field' } });
    const result = await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      rejected
    );

    expect(result).toMatchObject({
      sent: false,
      status: 'provider_rejected',
      reason: 'provider_rejected',
      detail: 'Invalid `to` field',
    });
  });

  it('a thrown transport is a transport_error, not an exception', async () => {
    const threw: EmailTransport = async () => {
      throw new Error('ECONNRESET');
    };
    const result = await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      threw
    );

    expect(result).toMatchObject({ sent: false, status: 'transport_error' });
  });

  it('every administrator-facing sentence is es-CL', () => {
    for (const message of Object.values(DELIVERY_MESSAGES)) {
      expect(message).toMatch(/^No se/);
    }
  });
});

describe('the provider message id', () => {
  it('is preserved when the provider gives one', async () => {
    const transport: EmailTransport = async () => ({ data: { id: 'resend-abc123' }, error: null });
    const result = await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      transport
    );

    expect(result.providerMessageId).toBe('resend-abc123');
  });

  it('is simply absent when it does not', async () => {
    const transport: EmailTransport = async () => ({ error: null });
    const result = await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      transport
    );

    expect(result.providerMessageId).toBeUndefined();
    expect(result.status).toBe('provider_accepted');
  });
});

describe('the self-service recovery message', () => {
  it('carries the URL in both the button and the visible fallback', async () => {
    let captured = '';
    const transport: EmailTransport = async (m) => {
      captured = m.html;
      return { error: null };
    };

    await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      transport
    );

    // Once in the href, once as selectable text — several school-managed mail
    // clients strip the anchor.
    const occurrences = captured.split('token_hash=abc').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('is Chilean Spanish, and tells a recipient who did not ask that nothing changed', async () => {
    let captured = '';
    const transport: EmailTransport = async (m) => {
      captured = m.html;
      return { error: null };
    };

    await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      transport
    );

    expect(captured).toContain('Restablece tu contraseña');
    expect(captured).toContain('Si no solicitaste este cambio');
  });

  it('never returns the recovery URL to its caller', async () => {
    const transport: EmailTransport = async () => ({ data: { id: 'm' }, error: null });
    const result = await sendPasswordRecoveryEmail(
      { to: 'sintetica@example.com', firstName: 'Ana', recoveryUrl: RECOVERY_URL },
      transport
    );

    expect(JSON.stringify(result)).not.toContain('token_hash');
    expect(JSON.stringify(result)).not.toContain('sintetica@example.com');
  });
});
