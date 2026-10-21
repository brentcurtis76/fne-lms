/**
 * The two pieces of auto-reply dedup policy that live in `lib/pasantias/emails`.
 *
 * The route proves the behaviour end-to-end; this file pins the arithmetic and
 * the release rule directly, because neither is visible in an assertion made
 * against a mocked query chain.
 *
 * Since PASANT-B002b it also pins the January settlement mapping and copy, and
 * runs the senders through the real provider with an injected transport. Since
 * PASANT-B003 the January acknowledgement links the two shared documents (one
 * price-free ficha and one brochure, each for both programs), and a missing
 * production origin is a known not-sent result rather than a throw.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// No real provider client may exist in this suite. The default (non-injected)
// path constructs `Resend`; this stand-in refuses, so an accidental real send
// fails loudly instead of leaving the process.
const { ResendGuard, refuseResend } = vi.hoisted(() => {
  const refuse = () => {
    throw new Error('real Resend client must not be constructed in this suite');
  };
  // `unknown` return: one case swaps in an SDK stand-in that resolves an error value.
  return { ResendGuard: vi.fn<unknown[], unknown>(refuse), refuseResend: refuse };
});
vi.mock('resend', () => ({ Resend: ResendGuard }));

import { COHORT_LABEL } from '../../lib/pasantias/cohort-public';
import { JANUARY_PROGRAM_IDS } from '../../lib/pasantias/leads';
import {
  deliverOutboundEmail,
  type EmailTransport,
  type OutboundEmailMessage,
} from '../../lib/email/provider';
import { PUBLIC_OUTBOUND_EMAIL } from '../../lib/email/outbound-policy';
import {
  AUTO_REPLY_DEDUP_WINDOW_MS,
  BROCHURE_PATH,
  FICHA_PATH,
  JANUARY_COHORT_LABEL,
  JANUARY_PROGRAM_NAMES,
  LEAD_NOTIFICATION_RECIPIENT,
  autoReplyClaimCutoff,
  canReleaseAutoReplyClaim,
  programReplyOutcome,
  renderLeadNotificationHtml,
  renderLeadProgramAutoReplyHtml,
  sendLeadAutoReply,
  sendLeadNotification,
  sendLeadProgramAutoReply,
  type LeadEmailFailure,
  type LeadEmailPayload,
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

/* ------------------------------------------------ January 2027 (PASANT-B002b) */

describe('programReplyOutcome — how a January reply settles its claim', () => {
  it('provider acceptance settles provider_accepted, never anything that says delivered', () => {
    expect(programReplyOutcome({ sent: true })).toBe('provider_accepted');
  });

  it('known not-sent failures release the claim (not_sent)', () => {
    expect(programReplyOutcome({ sent: false, failure: 'not_configured' })).toBe('not_sent');
    expect(programReplyOutcome({ sent: false, failure: 'rejected' })).toBe('not_sent');
  });

  it('an unknown transport outcome keeps the claim (ambiguous)', () => {
    expect(programReplyOutcome({ sent: false, failure: 'unknown' })).toBe('ambiguous');
  });

  // Releasing is the risky direction, so a result that does not say why it
  // failed is not treated as known-not-sent.
  it('a failure without a kind is ambiguous, not released', () => {
    expect(programReplyOutcome({ sent: false })).toBe('ambiguous');
  });

  it('releases exactly when the October rule releases, for every known failure', () => {
    for (const failure of ['not_configured', 'rejected', 'unknown'] as LeadEmailFailure[]) {
      const result = { sent: false, failure };
      expect([failure, programReplyOutcome(result) === 'not_sent']).toEqual([
        failure,
        canReleaseAutoReplyClaim(result),
      ]);
    }
  });
});

/** The ratified contract's public facts, read from its fenced JSON block. */
function contractFact(program: string, field: string): unknown {
  const doc = readFileSync(path.join(process.cwd(), 'docs/plan/pasantias-january-contract.md'), 'utf8');
  const block = doc.match(/```json\n([\s\S]*?)\n```/);
  if (!block) throw new Error('contract: no fenced json block');
  const facts = JSON.parse(block[1]).facts as Array<{ program: string; field: string; value: unknown }>;
  return facts.find((fact) => fact.program === program && fact.field === field)?.value;
}

describe('January copy is the ratified contract verbatim', () => {
  it('cohort label and program names match the contract facts', () => {
    expect(JANUARY_COHORT_LABEL).toBe(contractFact('cohort', 'label'));
    for (const program of JANUARY_PROGRAM_IDS) {
      expect([program, JANUARY_PROGRAM_NAMES[program]]).toEqual([program, contractFact(program, 'name')]);
    }
  });

  it('names exactly the two ratified programs', () => {
    expect(Object.keys(JANUARY_PROGRAM_NAMES).sort()).toEqual([...JANUARY_PROGRAM_IDS].sort());
  });
});

/** Synthetic, already-resolved document URLs for render-level tests. */
const DOCUMENTS = {
  fichaUrl: 'https://app.example.org/api/pasantias/ficha',
  brochureUrl: 'https://app.example.org/api/pasantias/brochure',
};

/**
 * Wording that would promise an e-mail beyond this one, or claim a delivery
 * (contract §6, DEC-07). Typed here, independently of the template.
 */
const MAIL_PROMISE =
  /te (?:enviaremos|escribiremos|llegar[áa])|recibir[áa]s|se pondr[áa] en contacto|te contactar[áa]|entregad[oa]/i;

describe('renderLeadProgramAutoReplyHtml — the January acknowledgement', () => {
  for (const program of JANUARY_PROGRAM_IDS) {
    it(`for ${program}: names that program only and links both shared documents`, () => {
      const html = renderLeadProgramAutoReplyHtml({ firstName: 'Ana', program, ...DOCUMENTS });
      const other = JANUARY_PROGRAM_IDS.find((id) => id !== program) as (typeof JANUARY_PROGRAM_IDS)[number];

      expect(html).toContain(JANUARY_PROGRAM_NAMES[program]);
      expect(html).not.toContain(JANUARY_PROGRAM_NAMES[other]);
      expect(html).toContain(JANUARY_COHORT_LABEL);
      // One ficha and one brochure, each covering both programs — the same two
      // links whichever program the message is about.
      expect(html).toContain(`href="${DOCUMENTS.fichaUrl}"`);
      expect(html).toContain(`href="${DOCUMENTS.brochureUrl}"`);
      expect(html.match(/href="/g)).toHaveLength(2);
      expect(html).toContain('Ficha de los dos programas (PDF)');
      expect(html).toContain('Programa completo con valores (PDF)');
      expect(html).not.toMatch(/Octubre|octubre-2026/);
    });
  }

  it('confirms the registration and promises no further mail', () => {
    const html = renderLeadProgramAutoReplyHtml({ firstName: 'Ana', program: 'inspira', ...DOCUMENTS });
    expect(html).toContain('Registramos tu');
    expect(html).toContain('Los cupos de la cohorte de enero se confirman por orden de reserva.');
    expect(html).not.toMatch(MAIL_PROMISE);
  });

  it('carries no prices, currencies or dates — the brochure is linked, never inlined', () => {
    const html = renderLeadProgramAutoReplyHtml({ firstName: 'Ana', program: 'inspira', ...DOCUMENTS });
    expect(html).not.toMatch(/€|\bEUR\b|\bUSD\b|\bCLP\b|\$\s?\d/);
    expect(html).not.toMatch(/\b\d{1,2} de enero\b|2027-01-/);
    expect(html).not.toMatch(/2[.,]?500[.,]?000|ASESORÍA|al reservar/);
  });

  it('escapes the name and the document URLs', () => {
    const html = renderLeadProgramAutoReplyHtml({
      firstName: '<script>x</script>',
      program: 'inspira',
      fichaUrl: 'https://app.example.org/a"onmouseover="x',
      brochureUrl: DOCUMENTS.brochureUrl,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('"onmouseover="');
    expect(html).toContain('&quot;onmouseover=&quot;');
  });
});

describe('renderLeadNotificationHtml — program-aware without changing October', () => {
  const base: LeadEmailPayload = {
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    institution: 'Colegio Uno',
    phone: null,
    roleTitle: null,
    numPeople: null,
    message: null,
    marketingOptIn: false,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  };

  it('single-track (no program): no program row, and the public cohort label in the frame', () => {
    const withoutKey = renderLeadNotificationHtml({ lead: base, isNewLead: true });
    const withNull = renderLeadNotificationHtml({ lead: { ...base, program: null }, isNewLead: true });

    expect(withNull).toBe(withoutKey);
    expect(withoutKey).not.toContain('>Programa<');
    expect(withoutKey).toContain(COHORT_LABEL);
  });

  it('the public cohort label IS the January label since B003 — no October frame survives', () => {
    expect(COHORT_LABEL).toBe('Cohorte Enero 2027');
    expect(JANUARY_COHORT_LABEL).toBe(COHORT_LABEL);
    const html = renderLeadNotificationHtml({ lead: base, isNewLead: true });
    expect(html).not.toMatch(/Octubre 2026/);
  });

  it('January: names the program and the January cohort, not October', () => {
    const html = renderLeadNotificationHtml({
      lead: { ...base, program: 'mirada-profunda' },
      isNewLead: false,
    });

    expect(html).toContain('>Programa<');
    expect(html).toContain(JANUARY_PROGRAM_NAMES['mirada-profunda']);
    expect(html).toContain('INSPIRA Mirada Profunda');
    expect(html).toContain(JANUARY_COHORT_LABEL);
    expect(html).not.toMatch(/Octubre 2026/);
  });
});

/**
 * The REAL `deliverOutboundEmail` runs underneath every case here — sender
 * rule, configuration check and status mapping are the provider's own. Only the
 * transport is injected (the provider's existing `EmailTransport` seam), so no
 * message leaves the process. Sender and key are synthetic and restored after
 * each case.
 */
describe('senders through the real provider with an injected transport', () => {
  const SENDER = 'Pasantías Sintéticas <pasantias@example.org>';
  const TO = 'ana@example.org';
  const ack = { to: TO, firstName: 'Ana', program: 'inspira' as const, documents: DOCUMENTS };

  let delivered: OutboundEmailMessage[];
  const accepting: EmailTransport = async (message) => {
    delivered.push(message);
    return { data: { id: 'synthetic-1' }, error: null };
  };
  const rejecting: EmailTransport = async (message) => {
    delivered.push(message);
    return { data: null, error: { message: 'synthetic refusal', statusCode: 422 } };
  };
  const throwing: EmailTransport = async (message) => {
    delivered.push(message);
    throw new Error('synthetic socket hang up');
  };

  beforeEach(() => {
    delivered = [];
    ResendGuard.mockReset();
    ResendGuard.mockImplementation(refuseResend);
    vi.stubEnv('EMAIL_FROM_ADDRESS', SENDER);
    // No key: anything that is not the injected transport ends as
    // `not_configured`, never as a real send.
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('accepted: the provider sends the January message as built, and it settles provider_accepted', async () => {
    const result = await sendLeadProgramAutoReply(ack, { transport: accepting });

    expect(result).toEqual({ sent: true });
    expect(programReplyOutcome(result)).toBe('provider_accepted');
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ from: SENDER, to: TO });
    expect(delivered[0].subject).toContain(JANUARY_PROGRAM_NAMES.inspira);
    expect(delivered[0].subject).not.toMatch(/[\r\n]/);
    expect(delivered[0].html).toContain(DOCUMENTS.fichaUrl);
    expect(delivered[0].html).toContain(DOCUMENTS.brochureUrl);
    expect(delivered[0]).not.toHaveProperty('reply_to');
    expect(ResendGuard).not.toHaveBeenCalled();
  });

  it('resolves both document URLs from configuration, never from a request', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://pasantias.example.org');
    const withoutDocuments = { to: ack.to, firstName: ack.firstName, program: ack.program };
    const result = await sendLeadProgramAutoReply(withoutDocuments, { transport: accepting });

    expect(result).toEqual({ sent: true });
    expect(delivered[0].html).toContain(`href="https://pasantias.example.org${FICHA_PATH}"`);
    expect(delivered[0].html).toContain(`href="https://pasantias.example.org${BROCHURE_PATH}"`);
  });

  it('a missing production origin is known not-sent: nothing is built and it settles not_sent', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    const withoutDocuments = { to: ack.to, firstName: ack.firstName, program: ack.program };

    const result = await sendLeadProgramAutoReply(withoutDocuments, { transport: accepting });

    expect(result).toMatchObject({ sent: false, failure: 'not_configured' });
    expect(programReplyOutcome(result)).toBe('not_sent');
    expect(delivered).toHaveLength(0);
    expect(ResendGuard).not.toHaveBeenCalled();
  });

  it('rejected: a definite refusal is known-not-sent and settles not_sent', async () => {
    const result = await sendLeadProgramAutoReply(ack, { transport: rejecting });

    expect(result).toMatchObject({ sent: false, failure: 'rejected' });
    expect(programReplyOutcome(result)).toBe('not_sent');
    expect(delivered).toHaveLength(1);
  });

  it('thrown: an unknown outcome settles ambiguous and keeps the claim', async () => {
    const result = await sendLeadProgramAutoReply(ack, { transport: throwing });

    expect(result).toMatchObject({ sent: false, failure: 'unknown' });
    expect(programReplyOutcome(result)).toBe('ambiguous');
    expect(delivered).toHaveLength(1);
  });

  it('missing configuration WITHOUT a transport: nothing is built, settles not_sent', async () => {
    const result = await sendLeadProgramAutoReply(ack);

    expect(result).toMatchObject({ sent: false, failure: 'not_configured' });
    expect(programReplyOutcome(result)).toBe('not_sent');
    expect(ResendGuard).not.toHaveBeenCalled();
  });

  it('the injected transport does not bypass the sender rule', async () => {
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'Pasantías <pasantias@example.org>\r\nBcc: x@example.org');
    const result = await sendLeadProgramAutoReply(ack, { transport: accepting });

    expect(result).toMatchObject({ sent: false, failure: 'not_configured' });
    expect(delivered).toHaveLength(0);
  });

  it('without an injection the production default still builds the Resend transport', async () => {
    vi.stubEnv('RESEND_API_KEY', 'synthetic-key');
    const result = await sendLeadProgramAutoReply(ack);

    // The guard refuses construction, which the provider reports as a
    // transport failure — proof the default path is the Resend one.
    expect(ResendGuard).toHaveBeenCalledWith('synthetic-key');
    expect(result).toMatchObject({ sent: false, failure: 'unknown' });
    expect(delivered).toHaveLength(0);
  });

  it('the notification and the October auto-reply take the same injection', async () => {
    const notification = await sendLeadNotification(
      {
        lead: {
          firstName: 'Ana',
          lastName: 'Pérez',
          email: TO,
          institution: 'Colegio Uno',
          phone: null,
          roleTitle: null,
          numPeople: null,
          message: null,
          marketingOptIn: false,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          program: 'mirada-profunda',
        },
        isNewLead: true,
      },
      { transport: accepting }
    );
    const october = await sendLeadAutoReply(
      { to: TO, firstName: 'Ana', brochureUrl: 'https://app.example.org/api/pasantias/brochure' },
      { transport: accepting }
    );

    expect([notification, october]).toEqual([{ sent: true }, { sent: true }]);
    expect(delivered[0]).toMatchObject({ from: SENDER, to: LEAD_NOTIFICATION_RECIPIENT, reply_to: TO });
    expect(delivered[0].subject).toContain(JANUARY_COHORT_LABEL);
    expect(delivered[1]).toMatchObject({ from: SENDER, to: TO });
    expect(delivered[1].html).toContain('https://app.example.org/api/pasantias/brochure');
    expect(ResendGuard).not.toHaveBeenCalled();
  });
});

/**
 * BROWSER-RUNTIME-04. The Resend SDK installed here (3.5) never throws from
 * `emails.send`: a request that could not complete RESOLVES to an error value
 * with no status (`fetchRequest`'s catch), and an HTTP error resolves to the
 * API's JSON body, which carries `statusCode`. The values below are those
 * shapes, written out here rather than taken from the implementation.
 */
type SdkError = { name: string; message: string; statusCode?: number };

const SDK_FETCH_FAILURE: SdkError = {
  name: 'application_error',
  message: 'Unable to fetch data. The request could not be resolved.',
};
const SDK_503 = { statusCode: 503, name: 'application_error', message: 'Service unavailable' };
const SDK_429 = { statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests' };
const SDK_422 = { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field.' };

describe('Resend SDK error values: only a definite refusal releases a claim (BROWSER-RUNTIME-04)', () => {
  const SENDER = 'Pasantías Sintéticas <pasantias@example.org>';
  const TO = 'ana@example.org';
  const ack = { to: TO, firstName: 'Ana', program: 'inspira' as const, documents: DOCUMENTS };

  let delivered: OutboundEmailMessage[];
  /** A transport that resolves exactly what the SDK resolves, error value included. */
  const resolving =
    (error: SdkError): EmailTransport =>
    async (message) => {
      delivered.push(message);
      return { data: null, error };
    };

  beforeEach(() => {
    delivered = [];
    ResendGuard.mockReset();
    ResendGuard.mockImplementation(refuseResend);
    vi.stubEnv('EMAIL_FROM_ADDRESS', SENDER);
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const AMBIGUOUS: Array<[string, SdkError]> = [
    ['the request never completed (no status)', SDK_FETCH_FAILURE],
    ['503', SDK_503],
    ['429', SDK_429],
  ];
  for (const [label, error] of AMBIGUOUS) {
    it(`January: ${label} is unknown, settles ambiguous and keeps the claim`, async () => {
      const result = await sendLeadProgramAutoReply(ack, { transport: resolving(error) });

      expect(result).toMatchObject({ sent: false, failure: 'unknown' });
      expect(programReplyOutcome(result)).toBe('ambiguous');
      expect(delivered).toHaveLength(1);
    });
  }

  it('January: an explicit 422 refusal is known not-sent and settles not_sent', async () => {
    const result = await sendLeadProgramAutoReply(ack, { transport: resolving(SDK_422) });

    expect(result).toMatchObject({ sent: false, failure: 'rejected' });
    expect(programReplyOutcome(result)).toBe('not_sent');
  });

  it('October: the same values keep or release brochure_sent_at by the same rule', async () => {
    const october = (error: SdkError) =>
      sendLeadAutoReply(
        { to: TO, firstName: 'Ana', brochureUrl: 'https://app.example.org/api/pasantias/brochure' },
        { transport: resolving(error) }
      );

    expect(canReleaseAutoReplyClaim(await october(SDK_FETCH_FAILURE))).toBe(false);
    expect(canReleaseAutoReplyClaim(await october(SDK_503))).toBe(false);
    expect(canReleaseAutoReplyClaim(await october(SDK_429))).toBe(false);
    expect(canReleaseAutoReplyClaim(await october(SDK_422))).toBe(true);
  });

  it('the production default (no injection) builds Resend and holds on its resolved fetch failure', async () => {
    vi.stubEnv('RESEND_API_KEY', 'synthetic-key');
    const send = vi.fn(async () => ({ data: null, error: SDK_FETCH_FAILURE }));
    ResendGuard.mockImplementation(() => ({ emails: { send } }));

    const result = await sendLeadProgramAutoReply(ack);

    expect(ResendGuard).toHaveBeenCalledWith('synthetic-key');
    // Unkeyed: the SDK path, not the keyed fetch path.
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toHaveLength(1);
    expect(result).toMatchObject({ sent: false, failure: 'unknown' });
    expect(programReplyOutcome(result)).toBe('ambiguous');
  });

  it('the provider option is opt-in: callers that omit it keep the mapping they had', async () => {
    const deliver = (
      error: SdkError,
      extra: { idempotencyKey?: string; definiteRefusalOnly?: true } = {}
    ) =>
      deliverOutboundEmail({
        authorization: PUBLIC_OUTBOUND_EMAIL,
        message: { to: TO, subject: 'Sintético', html: '<p>Sintético</p>' },
        transport: resolving(error),
        ...extra,
      });
    const SDK_409 = { statusCode: 409, name: 'invalid_idempotent_request', message: 'Same key, other payload' };

    // Unkeyed, no option: every error value is the plain refusal it always was.
    expect(await deliver(SDK_FETCH_FAILURE)).toEqual({ status: 'provider_rejected', detail: SDK_FETCH_FAILURE.message });
    expect(await deliver(SDK_503)).toEqual({ status: 'provider_rejected', detail: SDK_503.message });
    expect(await deliver(SDK_422)).toEqual({ status: 'provider_rejected', detail: SDK_422.message });

    // Keyed, no option: the status is read as before, 409 still a conflict.
    expect(await deliver(SDK_503, { idempotencyKey: 'k-1' })).toEqual({ status: 'transport_error', detail: SDK_503.message });
    expect(await deliver(SDK_409, { idempotencyKey: 'k-1' })).toEqual({
      status: 'provider_rejected',
      detail: SDK_409.message,
      conflict: true,
    });

    // Opted in, unkeyed: only a 4xx other than 429 is a refusal, and no key means no conflict.
    const optIn = { definiteRefusalOnly: true as const };
    expect(await deliver(SDK_FETCH_FAILURE, optIn)).toEqual({ status: 'transport_error', detail: SDK_FETCH_FAILURE.message });
    expect(await deliver(SDK_503, optIn)).toEqual({ status: 'transport_error', detail: SDK_503.message });
    expect(await deliver(SDK_429, optIn)).toEqual({ status: 'transport_error', detail: SDK_429.message });
    expect(await deliver(SDK_422, optIn)).toEqual({ status: 'provider_rejected', detail: SDK_422.message });
    expect(await deliver(SDK_409, optIn)).toEqual({ status: 'provider_rejected', detail: SDK_409.message });

    // Opted in and keyed: a status-less value is not a refusal either; 409 stays a conflict.
    expect(await deliver(SDK_FETCH_FAILURE, { ...optIn, idempotencyKey: 'k-2' })).toEqual({
      status: 'transport_error',
      detail: SDK_FETCH_FAILURE.message,
    });
    expect(await deliver(SDK_409, { ...optIn, idempotencyKey: 'k-2' })).toEqual({
      status: 'provider_rejected',
      detail: SDK_409.message,
      conflict: true,
    });
  });
});
