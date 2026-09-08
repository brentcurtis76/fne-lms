// @vitest-environment node
/**
 * POST /api/expense-reports/{id}/notify — B1a.
 *
 * The contract under test: the browser can name a report and nothing else.
 * Which notification is sent, who receives it, and what it says are all
 * derived from the stored report; each notification moment is authorized to
 * its own legitimate actor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';
import { TableResult, Tracker, buildClient, makeTracker } from '../../helpers/supabaseStub';

const {
  mockGetApiUser,
  mockCreateServiceRoleClient,
  mockHasAdminPrivileges,
  mockSendSubmission,
  mockSendDecision,
} = vi.hoisted(() => ({
  mockGetApiUser: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
  mockHasAdminPrivileges: vi.fn(),
  mockSendSubmission: vi.fn(),
  mockSendDecision: vi.fn(),
}));

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getApiUser: mockGetApiUser,
    createServiceRoleClient: mockCreateServiceRoleClient,
  };
});

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, hasAdminPrivileges: mockHasAdminPrivileges };
});

vi.mock('../../../lib/email/expenseNotifications', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sendExpenseSubmissionNotification: mockSendSubmission,
    sendExpenseDecisionNotification: mockSendDecision,
  };
});

import handler from '../../../pages/api/expense-reports/[id]/notify';
import { EXPENSE_APPROVER_EMAIL } from '../../../utils/expenseConfig';

const REPORT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APPROVER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STRANGER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const OWNER_EMAIL = 'dueña@escuela.cl';

// Each test gets its own client IP so the route's best-effort rate limiter
// (5/min per IP) cannot leak state between cases; one test drives a single IP
// deliberately to prove the limiter is wired.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    report_name: 'Gastos junio 2026',
    status: 'submitted',
    total_amount: 57690,
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    submitted_by: OWNER_ID,
    reviewed_by: null,
    review_comments: null,
    profiles: { first_name: 'Ana', last_name: 'Pérez', email: OWNER_EMAIL },
    ...overrides,
  };
}

let tracker: Tracker;

function stubTables(tables: Record<string, TableResult[]>) {
  tracker = makeTracker();
  const client = buildClient(tables, tracker);
  mockCreateServiceRoleClient.mockReturnValue(client);
  return client;
}

function asUser(id: string, email: string) {
  mockGetApiUser.mockResolvedValue({ user: { id, email }, error: null });
}

async function callHandler(options: {
  method?: string;
  id?: string;
  body?: Record<string, unknown>;
  ip?: string;
} = {}) {
  const { req, res } = createMocks({
    method: (options.method ?? 'POST') as 'POST',
    query: { id: options.id ?? REPORT_ID },
    body: options.body ?? {},
    headers: { 'x-forwarded-for': options.ip ?? nextIp() },
  });
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  mockGetApiUser.mockReset();
  mockCreateServiceRoleClient.mockReset();
  mockHasAdminPrivileges.mockReset().mockResolvedValue(false);
  mockSendSubmission.mockReset().mockResolvedValue({ sent: true });
  mockSendDecision.mockReset().mockResolvedValue({ sent: true });
});

describe('method and input guards', () => {
  it('rejects non-POST methods', async () => {
    const res = await callHandler({ method: 'GET' });
    expect(res._getStatusCode()).toBe(405);
    expect(mockGetApiUser).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller before touching the database', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('No active session') });
    const res = await callHandler();
    expect(res._getStatusCode()).toBe(401);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('rejects a malformed report id', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    const res = await callHandler({ id: 'not-a-uuid' });
    expect(res._getStatusCode()).toBe(400);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('404s an unknown report', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    stubTables({ expense_reports: [{ data: null }] });
    const res = await callHandler();
    expect(res._getStatusCode()).toBe(404);
    expect(mockSendSubmission).not.toHaveBeenCalled();
    expect(mockSendDecision).not.toHaveBeenCalled();
  });

  it('dampens repeated calls from one client', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    const ip = nextIp();
    const codes: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      stubTables({ expense_reports: [{ data: reportRow() }] });
      const res = await callHandler({ ip });
      codes.push(res._getStatusCode());
    }
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('submission notification', () => {
  it('sends to the configured approver with facts read from the report', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    stubTables({ expense_reports: [{ data: reportRow() }] });

    // Anything the browser tries to dictate is ignored — the body is not read.
    const res = await callHandler({
      body: { to: 'atacante@evil.example', subject: 'phish', html: '<b>x</b>' },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      data: { notification: 'submitted', sent: true },
    });
    expect(mockSendSubmission).toHaveBeenCalledTimes(1);
    expect(mockSendSubmission).toHaveBeenCalledWith({
      reportName: 'Gastos junio 2026',
      submitterName: 'Ana Pérez',
      submitterEmail: OWNER_EMAIL,
      totalAmount: 57690,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    }, expect.objectContaining({ kind: 'allow' }));
    // The route never forwards a recipient/subject/HTML choice.
    const payload = mockSendSubmission.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('to');
    expect(payload).not.toHaveProperty('subject');
    expect(payload).not.toHaveProperty('html');
    expect(JSON.stringify(payload)).not.toContain('evil.example');
  });

  it('reads the report by its id (no client-supplied recipient lookup)', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    stubTables({ expense_reports: [{ data: reportRow() }] });
    await callHandler();

    const call = tracker.fromCalls.find((c) => c.table === 'expense_reports');
    expect(call?.eqs).toEqual([{ col: 'id', val: REPORT_ID }]);
  });

  it('refuses a caller who is not the submitter, even a global admin', async () => {
    asUser(STRANGER_ID, 'otra@escuela.cl');
    mockHasAdminPrivileges.mockResolvedValue(true);
    stubTables({ expense_reports: [{ data: reportRow() }] });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(403);
    expect(mockSendSubmission).not.toHaveBeenCalled();
  });

  it('stays 200 when sending soft-fails without a Resend key', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    mockSendSubmission.mockResolvedValue({ sent: false, skipped: true });
    stubTables({ expense_reports: [{ data: reportRow() }] });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      data: { notification: 'submitted', sent: false, skipped: true },
    });
  });

  it('reports QA suppression explicitly instead of implying delivery', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    mockSendSubmission.mockResolvedValue({
      sent: false,
      skipped: true,
      status: 'suppressed_qa',
    });
    stubTables({ expense_reports: [{ data: reportRow() }] });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      data: {
        notification: 'submitted',
        sent: false,
        skipped: true,
        status: 'suppressed_qa',
      },
    });
  });
});

describe('decision notification', () => {
  it('sends the approval to the owner address stored on the report', async () => {
    asUser(APPROVER_ID, EXPENSE_APPROVER_EMAIL);
    stubTables({
      expense_reports: [{ data: reportRow({ status: 'approved', reviewed_by: APPROVER_ID }) }],
      profiles: [{ data: { first_name: 'Gonzalo', last_name: 'Naranjo' } }],
    });

    const res = await callHandler({ body: { to: 'atacante@evil.example' } });

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendDecision).toHaveBeenCalledWith({
      recipientEmail: OWNER_EMAIL,
      reportName: 'Gastos junio 2026',
      status: 'approved',
      reviewerName: 'Gonzalo Naranjo',
      totalAmount: 57690,
      comments: undefined,
    }, expect.objectContaining({ kind: 'allow' }));
  });

  it('takes rejection comments from the report, not from the request', async () => {
    asUser(APPROVER_ID, EXPENSE_APPROVER_EMAIL);
    stubTables({
      expense_reports: [
        {
          data: reportRow({
            status: 'rejected',
            reviewed_by: APPROVER_ID,
            review_comments: 'Falta la boleta de junio',
          }),
        },
      ],
      profiles: [{ data: { first_name: 'Gonzalo', last_name: 'Naranjo' } }],
    });

    const res = await callHandler({ body: { comments: 'texto inyectado' } });

    expect(res._getStatusCode()).toBe(200);
    expect(mockSendDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        recipientEmail: OWNER_EMAIL,
        comments: 'Falta la boleta de junio',
      }),
      expect.objectContaining({ kind: 'allow' })
    );
  });

  it('allows a global admin who is not the designated approver', async () => {
    asUser(STRANGER_ID, 'admin@fne.cl');
    mockHasAdminPrivileges.mockResolvedValue(true);
    stubTables({
      expense_reports: [{ data: reportRow({ status: 'approved', reviewed_by: APPROVER_ID }) }],
      profiles: [{ data: { first_name: 'Gonzalo', last_name: 'Naranjo' } }],
    });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(200);
    expect(mockSendDecision).toHaveBeenCalledTimes(1);
  });

  it('refuses the report owner — approving is not theirs to announce', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    stubTables({
      expense_reports: [{ data: reportRow({ status: 'approved', reviewed_by: APPROVER_ID }) }],
    });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(403);
    expect(mockSendDecision).not.toHaveBeenCalled();
  });

  it('falls back to a generic reviewer name when the lookup finds nobody', async () => {
    asUser(APPROVER_ID, EXPENSE_APPROVER_EMAIL);
    stubTables({
      expense_reports: [{ data: reportRow({ status: 'approved', reviewed_by: null }) }],
    });

    await callHandler();
    expect(mockSendDecision).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerName: 'Administrador' }),
      expect.objectContaining({ kind: 'allow' })
    );
  });

  it('sends nothing when the report has no owner address', async () => {
    asUser(APPROVER_ID, EXPENSE_APPROVER_EMAIL);
    stubTables({
      expense_reports: [
        { data: reportRow({ status: 'approved', profiles: { first_name: 'Ana', last_name: 'P', email: null } }) },
      ],
    });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      data: { notification: 'approved', sent: false, reason: 'recipient_missing' },
    });
    expect(mockSendDecision).not.toHaveBeenCalled();
  });

  it('treats a missing submitter as an absent tenant-authorizable recipient', async () => {
    asUser(APPROVER_ID, EXPENSE_APPROVER_EMAIL);
    stubTables({
      expense_reports: [{ data: reportRow({ status: 'approved', submitted_by: null }) }],
    });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      data: { notification: 'approved', sent: false, reason: 'recipient_missing' },
    });
    expect(mockSendDecision).not.toHaveBeenCalled();
  });
});

describe('states with no notification', () => {
  it('409s a draft report', async () => {
    asUser(OWNER_ID, OWNER_EMAIL);
    stubTables({ expense_reports: [{ data: reportRow({ status: 'draft' }) }] });

    const res = await callHandler();
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toContain('draft');
    expect(mockSendSubmission).not.toHaveBeenCalled();
    expect(mockSendDecision).not.toHaveBeenCalled();
  });
});
