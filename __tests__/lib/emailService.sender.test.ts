// @vitest-environment node
/**
 * SM-26 / NOTIF-13 — the one EMAIL_FROM_ADDRESS sender contract.
 *
 * lib/emailService.js (meeting summary), lib/email/expenseNotifications.ts and
 * lib/email/notifications.ts all take their sender from lib/email/provider.ts;
 * invitation/recovery mail is covered in __tests__/lib/email/invitations.test.ts.
 * A caller that passes its own `from` (contact, pasantías) gets the same rule.
 *
 * The real deliverOutboundEmail runs; only the Resend SDK is intercepted, so
 * each assertion is on the exact message the provider would receive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));

import * as emailService from '../../lib/emailService';
import { sendMeetingSummary } from '../../lib/emailService';
import { meetingSummaryTemplate, type MeetingSummaryEmailData } from '../../lib/emailTemplates';
import { sendExpenseSubmissionNotification } from '../../lib/email/expenseNotifications';
import { sendNotificationEmail } from '../../lib/email/notifications';
import { PUBLIC_OUTBOUND_EMAIL } from '../../lib/email/outbound-policy';
import { deliverOutboundEmail } from '../../lib/email/provider';
import { sendLeadAutoReply } from '../../lib/pasantias/emails';

const ALLOW = { kind: 'allow', scope: 'client', schoolId: 1 } as const;

const templateData: MeetingSummaryEmailData = {
  title: 'Reunión sintética',
  communityName: 'Comunidad Sintética',
  meetingDates: [new Date('2026-04-20T16:00:00Z')],
  facilitatorName: 'Persona Facilitadora',
  finalizerName: 'Persona Finalizadora',
  audience: 'with_access',
  attendees: [{ name: 'Persona Asistente', attended: true, role: 'participant' }],
  summaryHtml: '<p>Resumen</p>',
  notesHtml: '',
  agreementsHtml: '',
  commitmentsHtml: '',
  meetingUrl: 'https://app.example.org/meetings/1',
};
const recipient = { id: 'r-1', email: 'destino@example.org', name: 'Destino' };

let savedFrom: string | undefined;
let savedKey: string | undefined;

function configureSender(value: string | undefined) {
  if (value === undefined) delete process.env.EMAIL_FROM_ADDRESS;
  else process.env.EMAIL_FROM_ADDRESS = value;
}

function sentMessage() {
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0][0];
}

function expectedMessage(from: string) {
  return {
    from,
    to: recipient.email,
    subject: (meetingSummaryTemplate.subject as (d: MeetingSummaryEmailData) => string)(templateData),
    html: meetingSummaryTemplate.generateHTML(templateData),
    text: meetingSummaryTemplate.generateText!(templateData),
    headers: { 'X-Notification-Type': 'meeting_finalized' },
  };
}

const INVALID_SENDER = [{ email: recipient.email, error: 'not_configured' }];
const DEFAULT_SENDER = 'Genera <notificaciones@nuevaeducacion.org>';

const SENDER_CASES: Array<[string, string | undefined, string]> = [
  ['named', 'Genera <hola@example.org>', 'Genera <hola@example.org>'],
  ['bare', 'hola@example.org', 'Genera <hola@example.org>'],
  ['absent (default)', undefined, DEFAULT_SENDER],
  ['empty (default)', '', DEFAULT_SENDER],
];

const MALFORMED_SENDERS: Record<string, string> = {
  'doubled brackets': 'Genera <<hola@example.org>>',
  'unclosed bracket': 'Genera <hola@example.org',
  'no display name': '<hola@example.org>',
  'no host': 'hola@',
  'no address': 'hola at example dot org',
  blank: '   ',
  CRLF: 'Genera\r\nBcc: otro@example.org <hola@example.org>',
  LF: 'Genera\nX-Test: injected <hola@example.org>',
  CR: 'Genera\rBcc: otro@example.org <hola@example.org>',
};

function loggedText() {
  return JSON.stringify([
    ...vi.mocked(console.log).mock.calls,
    ...vi.mocked(console.error).mock.calls,
  ]);
}

/** A recipient with an address on file and no school: authorized as `unscoped_user`. */
function unscopedUserClient() {
  const rows = (data: unknown) => {
    const query: any = Promise.resolve({ data, error: null });
    query.eq = () => query;
    query.not = () => query;
    query.maybeSingle = () => Promise.resolve({ data, error: null });
    return query;
  };
  return {
    // A spy, so a test can count every read the sender makes.
    from: vi.fn((table: string) => ({
      select: () => rows(table === 'profiles' ? { email: recipient.email, school_id: null } : []),
    })),
  } as any;
}

const notificationInput = {
  userId: 'synthetic-user',
  title: 'Aviso sintético',
  description: 'Cuerpo sintético.',
  relatedUrl: '/notifications',
};

const expenseSubmission = {
  reportName: 'Gastos sintéticos',
  submitterName: 'Persona Sintética',
  submitterEmail: 'persona@example.org',
  totalAmount: 1000,
  startDate: '2026-06-01',
  endDate: '2026-06-30',
};

beforeEach(() => {
  savedFrom = process.env.EMAIL_FROM_ADDRESS;
  savedKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_test_not_real';
  send.mockReset().mockResolvedValue({ data: { id: 'msg-1' }, error: null });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  configureSender(savedFrom);
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
  vi.restoreAllMocks();
});

describe('NOTIF-11 D2 — the retired EmailNotificationService class is gone', () => {
  it('lib/emailService exports only the live meeting-summary sender', () => {
    expect(Object.keys(emailService)).toEqual(['sendMeetingSummary']);
  });
});

describe('D3 — meeting summary: named, bare and default sender', () => {
  for (const [label, configured, expectedFrom] of SENDER_CASES) {
    it(`${label}: provider receives the exact from, subject, html, text and headers`, async () => {
      configureSender(configured);
      const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
      expect(result).toEqual({ sent: 1, failed: 0, errors: [] });
      const message = sentMessage();
      expect(message).toEqual(expectedMessage(expectedFrom));
      expect(message.from).not.toContain('<<');
    });
  }

  it('counts every accepted recipient once', async () => {
    configureSender('Genera <hola@example.org>');
    const second = { id: 'r-2', email: 'otra@example.org', name: 'Otra' };
    const result = await sendMeetingSummary(templateData, [recipient, second], ALLOW);
    expect(result).toEqual({ sent: 2, failed: 0, errors: [] });
    expect(send.mock.calls.map(([message]) => message.to)).toEqual([recipient.email, second.email]);
  });
});

describe('D4 — meeting summary: a malformed sender fails before provider delivery', () => {
  const withOtherControlCharacters = {
    ...MALFORMED_SENDERS,
    TAB: 'Genera\tSintético <hola@example.org>',
    ESC: 'Genera\u001b <hola@example.org>',
    DEL: 'Genera\u007f <hola@example.org>',
    'US in bare address': 'hola\u001f@example.org',
  };

  for (const [label, value] of Object.entries(withOtherControlCharacters)) {
    it(`${label} counts the recipient as failed without reaching the provider`, async () => {
      configureSender(value);
      const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, failed: 1, errors: INVALID_SENDER });
      expect(loggedText()).not.toContain('Bcc');
    });
  }
});

describe('NOTIF-13 D2 — expense mail follows the same sender contract', () => {
  for (const [label, configured, expectedFrom] of SENDER_CASES) {
    it(`${label}: provider receives ${expectedFrom}`, async () => {
      configureSender(configured);
      const result = await sendExpenseSubmissionNotification(expenseSubmission, PUBLIC_OUTBOUND_EMAIL);
      expect(result).toEqual({ sent: true });
      expect(sentMessage().from).toBe(expectedFrom);
    });
  }

  for (const [label, value] of Object.entries(MALFORMED_SENDERS)) {
    it(`${label} is reported as a failure without reaching the provider`, async () => {
      configureSender(value);
      const result = await sendExpenseSubmissionNotification(expenseSubmission, PUBLIC_OUTBOUND_EMAIL);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: false, error: 'invalid_sender' });
      expect(loggedText()).not.toContain('Bcc');
    });
  }
});

describe('NOTIF-13 D2 — notification mail follows the same sender contract', () => {
  function transportDouble() {
    return vi.fn<[{ from: string }], Promise<{ data: { id: string }; error: null }>>(
      async () => ({ data: { id: 'msg-1' }, error: null })
    );
  }

  for (const [label, configured, expectedFrom] of SENDER_CASES) {
    it(`${label}: provider receives ${expectedFrom}`, async () => {
      configureSender(configured);
      const transport = transportDouble();
      const client = unscopedUserClient();
      const result = await sendNotificationEmail(client, notificationInput, transport);
      expect(result).toEqual({ sent: true, status: 'provider_accepted', providerMessageId: 'msg-1' });
      expect(client.from).toHaveBeenCalledWith('profiles');
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0][0].from).toBe(expectedFrom);
    });
  }

  for (const [label, value] of Object.entries(MALFORMED_SENDERS)) {
    it(`${label} reports not_configured without a recipient read or a transport call`, async () => {
      configureSender(value);
      const transport = transportDouble();
      const client = unscopedUserClient();
      const result = await sendNotificationEmail(client, notificationInput, transport);
      expect(client.from).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: false, status: 'not_configured', detail: 'invalid_sender' });
      expect(loggedText()).not.toContain('Bcc');
    });
  }
});

describe('NOTIF-13 D2 — an explicit from obeys the same sender contract', () => {
  const message = { to: recipient.email, subject: 'Asunto sintético', html: '<p>Cuerpo</p>' };

  it.each([
    ['named', 'FNE <hola@example.org>', 'FNE <hola@example.org>'],
    ['bare', 'hola@example.org', 'Genera <hola@example.org>'],
  ])('%s: the provider receives the normalized sender', async (_label, from, expectedFrom) => {
    // The explicit value wins over the environment, even an invalid one.
    configureSender(MALFORMED_SENDERS.CRLF);
    const result = await deliverOutboundEmail({
      authorization: PUBLIC_OUTBOUND_EMAIL,
      message: { ...message, from },
    });
    expect(result).toEqual({ status: 'provider_accepted', providerMessageId: 'msg-1' });
    expect(sentMessage()).toEqual({ ...message, from: expectedFrom });
  });

  it('an empty from falls back to EMAIL_FROM_ADDRESS, then to the default', async () => {
    configureSender('hola@example.org');
    await deliverOutboundEmail({ authorization: PUBLIC_OUTBOUND_EMAIL, message: { ...message, from: '' } });
    configureSender(undefined);
    await deliverOutboundEmail({ authorization: PUBLIC_OUTBOUND_EMAIL, message: { ...message, from: '' } });
    expect(send.mock.calls.map(([sent]) => sent.from)).toEqual(['Genera <hola@example.org>', DEFAULT_SENDER]);
  });

  for (const [label, from] of Object.entries(MALFORMED_SENDERS)) {
    it(`${label} never reaches the provider`, async () => {
      configureSender('Genera <hola@example.org>');
      const result = await deliverOutboundEmail({
        authorization: PUBLIC_OUTBOUND_EMAIL,
        message: { ...message, from },
      });
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({ status: 'not_configured', detail: 'invalid_sender' });
    });
  }

  describe('through a real caller that passes EMAIL_FROM_ADDRESS itself (pasantías auto-reply)', () => {
    const autoReply = { to: recipient.email, firstName: 'Ana', brochureUrl: 'https://app.example.org/folleto' };

    it('a bare address gets the Genera display name', async () => {
      configureSender('hola@example.org');
      expect(await sendLeadAutoReply(autoReply)).toEqual({ sent: true });
      expect(sentMessage().from).toBe('Genera <hola@example.org>');
    });

    it('a CRLF value is a failed send that never reaches the provider', async () => {
      configureSender(MALFORMED_SENDERS.CRLF);
      const result = await sendLeadAutoReply(autoReply);
      expect(send).not.toHaveBeenCalled();
      expect(result).toMatchObject({ sent: false, failure: 'not_configured' });
      expect(loggedText()).not.toContain('Bcc');
    });
  });
});

describe('D4 — meeting summary: missing recipient and refused/suppressed delivery', () => {
  beforeEach(() => configureSender('Genera <hola@example.org>'));

  it('skips recipients without an email', async () => {
    const result = await sendMeetingSummary(templateData, [{ id: 'r-2', email: '', name: 'Sin correo' }], ALLOW);
    expect(result).toEqual({ sent: 0, failed: 1, errors: [{ email: 'unknown', error: 'missing_email' }] });
    expect(send).not.toHaveBeenCalled();
  });

  it('counts provider rejection as a failure', async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } });
    expect(await sendMeetingSummary(templateData, [recipient], ALLOW)).toEqual({
      sent: 0,
      failed: 1,
      errors: [{ email: recipient.email, error: 'provider_rejected' }],
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('counts refusal and QA suppression as failures without reaching the provider', async () => {
    expect(
      await sendMeetingSummary(templateData, [recipient], { kind: 'refuse', reason: 'invalid_school' })
    ).toEqual({ sent: 0, failed: 1, errors: [{ email: recipient.email, error: 'refused' }] });

    expect(
      await sendMeetingSummary(templateData, [recipient], {
        kind: 'suppressed_qa',
        schoolId: 9,
        reason: 'qa_tenant',
      })
    ).toEqual({ sent: 0, failed: 1, errors: [{ email: recipient.email, error: 'suppressed_qa' }] });

    expect(send).not.toHaveBeenCalled();
  });
});
