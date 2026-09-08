// @vitest-environment node
/**
 * lib/email/expenseNotifications — B1a.
 *
 * These templates used to be built in the browser and shipped to a relay as
 * `{to, subject, html}`. Now the recipient is decided here (submission) or
 * passed in from the report record (decision), and every interpolated value is
 * escaped before it reaches an e-mail body.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSend, ResendMock } = vi.hoisted(() => {
  const send = vi.fn();
  return {
    mockSend: send,
    ResendMock: vi.fn().mockImplementation(() => ({ emails: { send } })),
  };
});

vi.mock('resend', () => ({ Resend: ResendMock }));

import {
  buildExpenseDecisionMessage,
  buildExpenseSubmissionMessage,
  sendExpenseDecisionNotification,
  sendExpenseSubmissionNotification,
} from '../../../lib/email/expenseNotifications';
import { EXPENSE_APPROVER_EMAIL } from '../../../utils/expenseConfig';
import { PUBLIC_OUTBOUND_EMAIL } from '../../../lib/email/outbound-policy';

const sendSubmission = (input: typeof submission) =>
  sendExpenseSubmissionNotification(input, PUBLIC_OUTBOUND_EMAIL);
const sendDecision = (input: typeof decision) =>
  sendExpenseDecisionNotification(input, PUBLIC_OUTBOUND_EMAIL);

const submission = {
  reportName: 'Gastos junio 2026',
  submitterName: 'Ana Pérez',
  submitterEmail: 'ana@escuela.cl',
  totalAmount: 57690,
  startDate: '2026-06-01',
  endDate: '2026-06-30',
};

const decision = {
  recipientEmail: 'ana@escuela.cl',
  reportName: 'Gastos junio 2026',
  status: 'approved' as const,
  reviewerName: 'Gonzalo Naranjo',
  totalAmount: 57690,
};

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({ data: { id: 'email_1' }, error: null });
  ResendMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('message building', () => {
  it('always addresses the configured approver for a submission', () => {
    const message = buildExpenseSubmissionMessage(submission);
    expect(message.to).toBe(EXPENSE_APPROVER_EMAIL);
    expect(message.subject).toContain('Gastos junio 2026');
    expect(message.html).toContain('Ana Pérez');
  });

  it('escapes report and submitter values before they reach the body', () => {
    const message = buildExpenseSubmissionMessage({
      ...submission,
      reportName: '<script>alert(1)</script>',
      submitterName: 'Ana "La Jefa" <b>Pérez</b>',
    });
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('&quot;La Jefa&quot;');
  });

  it('addresses the decision message to the supplied owner address', () => {
    const message = buildExpenseDecisionMessage(decision);
    expect(message.to).toBe('ana@escuela.cl');
    expect(message.subject).toContain('Aprobado');
    expect(message.html).toContain('Gonzalo Naranjo');
  });

  it('renders a rejection with escaped reviewer comments', () => {
    const message = buildExpenseDecisionMessage({
      ...decision,
      status: 'rejected',
      comments: 'Falta la boleta <img src=x onerror=alert(1)>',
    });
    expect(message.subject).toContain('Rechazado');
    expect(message.html).toContain('Comentarios del Revisor');
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).toContain('&lt;img src=x');
  });

  it('omits the comments block when there are none', () => {
    const message = buildExpenseDecisionMessage(decision);
    expect(message.html).not.toContain('Comentarios del Revisor');
  });
});

describe('delivery', () => {
  it('soft-fails without RESEND_API_KEY and never constructs a client', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const result = await sendSubmission(submission);
    expect(result).toEqual({ sent: false, skipped: true });
    expect(ResendMock).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends with the configured sender and a server-built payload', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('EMAIL_FROM_ADDRESS', 'Genera <notificaciones@nuevaeducacion.org>');

    const result = await sendSubmission(submission);

    expect(result).toEqual({ sent: true });
    expect(ResendMock).toHaveBeenCalledWith('re_test_key');
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Genera <notificaciones@nuevaeducacion.org>',
      to: EXPENSE_APPROVER_EMAIL,
      subject: expect.stringContaining('Gastos junio 2026'),
      html: expect.stringContaining('Ana Pérez'),
    });
  });

  it('reports a Resend error as a value without throwing', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    mockSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });

    const result = await sendDecision(decision);

    expect(result).toEqual({ sent: false, error: 'domain not verified' });
  });

  it('reports a thrown transport failure as a value without throwing', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    mockSend.mockRejectedValue(new Error('network down'));

    const result = await sendDecision(decision);

    expect(result).toEqual({ sent: false, error: 'network down' });
  });

  it('refuses to send a decision with no recipient', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');

    const result = await sendDecision({ ...decision, recipientEmail: '' });

    expect(result).toEqual({ sent: false, error: 'missing_recipient' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
