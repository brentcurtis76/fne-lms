// @vitest-environment node
/**
 * SM-26 — EMAIL_FROM_ADDRESS sender contract for lib/emailService.js.
 *
 * The real deliverOutboundEmail runs; only the Resend SDK is intercepted, so
 * each assertion is on the exact message the provider would receive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { send, authorizeUserEmail, preferences } = vi.hoisted(() => ({
  send: vi.fn(),
  authorizeUserEmail: vi.fn(),
  preferences: { current: null as any },
}));

vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));

vi.mock('../../lib/email/outbound-policy', () => ({
  authorizeUserEmail,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: preferences.current, error: null }),
        }),
      }),
    })),
  },
}));

import { sendMeetingSummary, EmailNotificationService } from '../../lib/emailService';
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
const user = { id: 'u-1', email: 'usuario@example.org', name: 'Usuario' };
const notification = {
  id: 'n-1',
  type: 'assignment_created',
  title: 'Nueva tarea',
  description: 'Descripción sintética',
  priority: 'high',
  related_url: '/tareas/1',
  created_at: '2026-04-20T16:00:00Z',
};

let savedFrom: string | undefined;
let savedKey: string | undefined;

function configureSender(value: string | undefined) {
  if (value === undefined) delete process.env.EMAIL_FROM_ADDRESS;
  else process.env.EMAIL_FROM_ADDRESS = value;
}

const senders = {
  'meeting summary': async () => {
    const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
    expect(result).toEqual({ sent: 1, failed: 0, errors: [] });
  },
  immediate: async () => {
    const result = await new EmailNotificationService().sendImmediateNotification(user, notification);
    expect(result).toEqual({ status: 'provider_accepted', providerMessageId: 'msg-1' });
  },
  digest: async () => {
    const result = await new EmailNotificationService().sendDigestEmail(user, [notification], 'daily');
    expect(result).toEqual({ status: 'provider_accepted', providerMessageId: 'msg-1' });
  },
};

function sentMessage() {
  expect(send).toHaveBeenCalledTimes(1);
  return send.mock.calls[0][0];
}

beforeEach(() => {
  savedFrom = process.env.EMAIL_FROM_ADDRESS;
  savedKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_test_not_real';
  send.mockReset().mockResolvedValue({ data: { id: 'msg-1' }, error: null });
  authorizeUserEmail.mockReset().mockResolvedValue(ALLOW);
  preferences.current = { email_enabled: true, notification_types: {} };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  configureSender(savedFrom);
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
  vi.restoreAllMocks();
});

describe('D1 — named EMAIL_FROM_ADDRESS reaches every sender unchanged', () => {
  for (const [name, run] of Object.entries(senders)) {
    it(`${name}: provider receives "Genera <hola@example.org>" exactly`, async () => {
      configureSender('Genera <hola@example.org>');
      await run();
      const { from } = sentMessage();
      expect(from).toBe('Genera <hola@example.org>');
      expect(from).not.toContain('<<');
    });
  }
});

describe('D2 — bare, absent and malformed EMAIL_FROM_ADDRESS', () => {
  for (const [name, run] of Object.entries(senders)) {
    it(`${name}: bare address gets the Genera display name`, async () => {
      configureSender('hola@example.org');
      await run();
      expect(sentMessage().from).toBe('Genera <hola@example.org>');
    });

    it(`${name}: absent configuration keeps the current default`, async () => {
      configureSender(undefined);
      await run();
      expect(sentMessage().from).toBe('Genera <notificaciones@fne-lms.com>');
    });
  }

  const malformed = [
    'Genera <<hola@example.org>>',
    'Genera <hola@example.org',
    '<hola@example.org>',
    'hola@',
    'hola at example dot org',
    '   ',
  ];

  for (const value of malformed) {
    it(`meeting summary: "${value}" fails before provider delivery`, async () => {
      configureSender(value);
      const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({
        sent: 0,
        failed: 1,
        errors: [{ email: recipient.email, error: 'EMAIL_FROM_ADDRESS is not a valid sender' }],
      });
    });

    it(`immediate and digest: "${value}" fails before provider delivery`, async () => {
      configureSender(value);
      const service = new EmailNotificationService();
      await expect(service.sendImmediateNotification(user, notification)).rejects.toThrow(
        'EMAIL_FROM_ADDRESS is not a valid sender'
      );
      await expect(service.sendDigestEmail(user, [notification], 'weekly')).rejects.toThrow(
        'EMAIL_FROM_ADDRESS is not a valid sender'
      );
      expect(send).not.toHaveBeenCalled();
    });
  }
});

describe('r1 D1 — control characters in EMAIL_FROM_ADDRESS fail before provider delivery', () => {
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
    it(`meeting summary: ${label} counts the recipient as failed without reaching the provider`, async () => {
      configureSender(value);
      const result = await sendMeetingSummary(templateData, [recipient], ALLOW);
      expect(send).not.toHaveBeenCalled();
      expect(result).toEqual({
        sent: 0,
        failed: 1,
        errors: [{ email: recipient.email, error: 'EMAIL_FROM_ADDRESS is not a valid sender' }],
      });
    });

    it(`immediate and digest: ${label} rejects through the existing error path`, async () => {
      configureSender(value);
      const service = new EmailNotificationService();
      await expect(service.sendImmediateNotification(user, notification)).rejects.toThrow(
        'EMAIL_FROM_ADDRESS is not a valid sender'
      );
      await expect(service.sendDigestEmail(user, [notification], 'daily')).rejects.toThrow(
        'EMAIL_FROM_ADDRESS is not a valid sender'
      );
      expect(send).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'Error sending immediate notification email:',
        expect.any(Error)
      );
      expect(console.error).toHaveBeenCalledWith('Error sending digest email:', expect.any(Error));
    });
  }
});

describe('D3 — other message fields and authorization outcomes are unchanged', () => {
  beforeEach(() => configureSender('Genera <hola@example.org>'));

  it('meeting summary sends the template subject, html, text and headers to the recipient', async () => {
    await senders['meeting summary']();
    expect(sentMessage()).toEqual({
      from: 'Genera <hola@example.org>',
      to: recipient.email,
      subject: (meetingSummaryTemplate.subject as (d: MeetingSummaryEmailData) => string)(templateData),
      html: meetingSummaryTemplate.generateHTML(templateData),
      text: meetingSummaryTemplate.generateText!(templateData),
      headers: { 'X-Notification-Type': 'meeting_finalized' },
    });
  });

  it('meeting summary counts provider rejection, refusal and QA suppression as failures', async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } });
    expect(await sendMeetingSummary(templateData, [recipient], ALLOW)).toEqual({
      sent: 0,
      failed: 1,
      errors: [{ email: recipient.email, error: 'provider_rejected' }],
    });

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

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('meeting summary still skips recipients without an email', async () => {
    const result = await sendMeetingSummary(templateData, [{ id: 'r-2', email: '', name: 'Sin correo' }], ALLOW);
    expect(result).toEqual({ sent: 0, failed: 1, errors: [{ email: 'unknown', error: 'missing_email' }] });
    expect(send).not.toHaveBeenCalled();
  });

  it('immediate notification keeps recipient, subject, template and headers', async () => {
    const service = new EmailNotificationService();
    await senders.immediate();
    expect(authorizeUserEmail).toHaveBeenCalledWith(expect.anything(), user.id);
    expect(sentMessage()).toEqual({
      from: 'Genera <hola@example.org>',
      to: user.email,
      subject: '🔔 Nueva tarea',
      html: await service.getEmailTemplate('immediate', notification, user),
      headers: {
        'X-Priority': service.getPriorityHeader('high'),
        'X-Notification-Type': 'assignment_created',
        'X-Notification-ID': 'n-1',
      },
    });
  });

  it('immediate notification is refused, or skipped by preference, without reaching the provider', async () => {
    authorizeUserEmail.mockResolvedValueOnce({ kind: 'refuse', reason: 'user_lookup_failed' });
    const service = new EmailNotificationService();
    expect(await service.sendImmediateNotification(user, notification)).toEqual({
      status: 'refused',
      detail: 'user_lookup_failed',
    });

    preferences.current = { email_enabled: false };
    expect(await service.sendImmediateNotification(user, notification)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('digest keeps recipient, subject, template and headers', async () => {
    const service = new EmailNotificationService();
    await senders.digest();
    expect(sentMessage()).toEqual({
      from: 'Genera <hola@example.org>',
      to: user.email,
      subject: '📊 Resumen diario - 1 notificaciones',
      html: await service.getDigestTemplate('daily', [notification], user),
      headers: { 'X-Digest-Type': 'daily', 'X-Notification-Count': '1' },
    });
  });

  it('digest reports provider rejection and refusal, and skips empty batches', async () => {
    const service = new EmailNotificationService();
    send.mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } });
    expect(await service.sendDigestEmail(user, [notification], 'weekly')).toEqual({
      status: 'provider_rejected',
      detail: 'domain not verified',
    });

    authorizeUserEmail.mockResolvedValueOnce({ kind: 'refuse', reason: 'invalid_school' });
    expect(await service.sendDigestEmail(user, [notification], 'weekly')).toEqual({
      status: 'refused',
      detail: 'invalid_school',
    });

    expect(await service.sendDigestEmail(user, [], 'daily')).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
