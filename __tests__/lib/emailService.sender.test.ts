// @vitest-environment node
/**
 * SM-26 — EMAIL_FROM_ADDRESS sender contract for lib/emailService.js.
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

const ALLOW = { kind: 'allow', scope: 'client', schoolId: 1 } as const;

const templateData: MeetingSummaryEmailData = {
  title: 'Reunión sintética',
  communityName: 'Comunidad Sintética',
  meetingDates: [new Date('2026-04-20T16:00:00Z')],
  facilitatorName: 'Persona Facilitadora',
  finalizerName: 'Persona Finalizadora',
  audience: 'community',
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

const INVALID_SENDER = [{ email: recipient.email, error: 'EMAIL_FROM_ADDRESS is not a valid sender' }];

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
  const cases: Array<[string, string | undefined, string]> = [
    ['named', 'Genera <hola@example.org>', 'Genera <hola@example.org>'],
    ['bare', 'hola@example.org', 'Genera <hola@example.org>'],
    ['absent (default)', undefined, 'Genera <notificaciones@fne-lms.com>'],
  ];

  for (const [label, configured, expectedFrom] of cases) {
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

describe('D4 — meeting summary: malformed sender fails before provider delivery', () => {
  const malformed = [
    'Genera <<hola@example.org>>',
    'Genera <hola@example.org',
    '<hola@example.org>',
    'hola@',
    'hola at example dot org',
    '   ',
  ];

  for (const value of malformed) {
    it(`"${value}" counts the recipient as failed without reaching the provider`, async () => {
      configureSender(value);
      const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, failed: 1, errors: INVALID_SENDER });
    });
  }
});

describe('D4 — meeting summary: control characters in EMAIL_FROM_ADDRESS fail before provider delivery', () => {
  const withControlCharacters = {
    CRLF: 'Genera\r\nBcc: otro@example.org <hola@example.org>',
    LF: 'Genera\nX-Test: injected <hola@example.org>',
    CR: 'Genera\rBcc: otro@example.org <hola@example.org>',
    TAB: 'Genera\tSintético <hola@example.org>',
    ESC: 'Genera\u001b <hola@example.org>',
    DEL: 'Genera\u007f <hola@example.org>',
    'US in bare address': 'hola\u001f@example.org',
  };

  for (const [label, value] of Object.entries(withControlCharacters)) {
    it(`${label} counts the recipient as failed without reaching the provider`, async () => {
      configureSender(value);
      const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({ sent: 0, failed: 1, errors: INVALID_SENDER });
      expect(console.error).toHaveBeenCalledWith(
        'sendMeetingSummary: failed to send to',
        recipient.email,
        expect.any(Error)
      );
    });
  }
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
