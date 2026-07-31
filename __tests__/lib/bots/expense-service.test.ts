// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHasAdminPrivileges, mockConvertToCLP, mockSendSubmissionNotification } = vi.hoisted(() => ({
  mockHasAdminPrivileges: vi.fn(),
  mockConvertToCLP: vi.fn(),
  mockSendSubmissionNotification: vi.fn()
}));

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, hasAdminPrivileges: mockHasAdminPrivileges };
});

vi.mock('../../../lib/currency-service', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, convertToCLP: mockConvertToCLP };
});

// B1a: the bot no longer POSTs `{to, subject, html}` to /api/send-email — it
// calls the server-side notification module directly.
vi.mock('../../../lib/email/expenseNotifications', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, sendExpenseSubmissionNotification: mockSendSubmissionNotification };
});

import { ExpenseService, newReportDefaults, BotExpenseError } from '../../../lib/bots/expense-service';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPORT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

interface TableResult {
  data?: unknown;
  error?: unknown;
  count?: number;
}

/** Chainable thenable fake: returns queued results per table, FIFO. */
function buildClient(resultsByTable: Record<string, TableResult[]>) {
  const indices: Record<string, number> = {};
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const storageCalls: Array<{ op: string; args: unknown[] }> = [];
  let uploadResult: { error: unknown } = { error: null };
  const rpcResults: Array<{ data?: unknown; error?: unknown }> = [];

  const client = {
    from: vi.fn((table: string) => {
      const idx = indices[table] ?? 0;
      indices[table] = idx + 1;
      const result = resultsByTable[table]?.[idx] ?? { data: null, error: null };
      const resolved = { data: result.data ?? null, error: result.error ?? null, count: result.count };

      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolved);
          }
          if (prop === 'maybeSingle' || prop === 'single') {
            return () => Promise.resolve(resolved);
          }
          return () => new Proxy({}, handler);
        }
      };
      return new Proxy({}, handler);
    }),
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResults.shift() ?? { data: REPORT_ID, error: null });
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn((...args: unknown[]) => {
          storageCalls.push({ op: 'upload', args });
          return Promise.resolve(uploadResult);
        }),
        remove: vi.fn((...args: unknown[]) => {
          storageCalls.push({ op: 'remove', args });
          return Promise.resolve({ error: null });
        })
      }))
    }
  };

  return {
    client,
    rpcCalls,
    storageCalls,
    setUploadResult: (r: { error: unknown }) => { uploadResult = r; },
    queueRpcResult: (r: { data?: unknown; error?: unknown }) => { rpcResults.push(r); }
  };
}

beforeEach(() => {
  mockSendSubmissionNotification.mockReset().mockResolvedValue({ sent: true });
  mockHasAdminPrivileges.mockReset().mockResolvedValue(false);
  mockConvertToCLP.mockReset().mockResolvedValue({
    originalAmount: 12990,
    originalCurrency: 'CLP',
    convertedAmount: 12990,
    conversionRate: 1,
    conversionDate: '2026-06-09'
  });
});

describe('newReportDefaults', () => {
  it('builds a month-anchored Spanish name and range', () => {
    const d = newReportDefaults('2026-06-05');
    expect(d.name.toLowerCase()).toBe('gastos junio 2026');
    expect(d.startDate).toBe('2026-06-01');
    expect(d.endDate).toBe('2026-06-30');
  });

  it('handles December and leap February', () => {
    expect(newReportDefaults('2026-12-15').endDate).toBe('2026-12-31');
    expect(newReportDefaults('2028-02-10').endDate).toBe('2028-02-29');
  });

  it('falls back to the current month when no date', () => {
    const d = newReportDefaults(null);
    expect(d.startDate).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('resolveActor', () => {
  it('returns null for unlinked identities', async () => {
    const { client } = buildClient({ bot_identities: [{ data: null }] });
    const service = new ExpenseService(client as never);
    expect(await service.resolveActor('telegram', '555')).toBeNull();
  });

  it('grants canSubmit via expense_report_access', async () => {
    const { client } = buildClient({
      bot_identities: [{ data: { user_id: USER_ID } }],
      profiles: [{ data: { first_name: 'Bren', name: 'Bren Curtis', email: 'b@test.cl' } }],
      expense_report_access: [{ data: { can_submit: true } }]
    });
    const service = new ExpenseService(client as never);
    const actor = await service.resolveActor('telegram', '555');
    expect(actor).toMatchObject({ userId: USER_ID, canSubmit: true, firstName: 'Bren' });
    expect(mockHasAdminPrivileges).not.toHaveBeenCalled();
  });

  it('falls back to the admin check when access is missing', async () => {
    mockHasAdminPrivileges.mockResolvedValue(true);
    const { client } = buildClient({
      bot_identities: [{ data: { user_id: USER_ID } }],
      profiles: [{ data: { first_name: 'Adm', name: 'Adm In', email: 'a@test.cl' } }],
      expense_report_access: [{ data: null }]
    });
    const service = new ExpenseService(client as never);
    expect((await service.resolveActor('telegram', '555'))?.canSubmit).toBe(true);
  });

  it('denies users without access or admin role', async () => {
    const { client } = buildClient({
      bot_identities: [{ data: { user_id: USER_ID } }],
      profiles: [{ data: { first_name: 'Sin', name: 'Sin Acceso', email: 's@test.cl' } }],
      expense_report_access: [{ data: null }]
    });
    const service = new ExpenseService(client as never);
    expect((await service.resolveActor('telegram', '555'))?.canSubmit).toBe(false);
  });
});

const ITEM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const saveInput = {
  userId: USER_ID,
  itemId: ITEM_ID,
  platform: 'telegram' as const,
  reportId: REPORT_ID,
  categoryId: CATEGORY_ID,
  description: 'Almuerzo equipo',
  amount: 12990,
  currency: 'CLP' as const,
  expenseDate: '2026-06-05',
  vendor: 'Líder Express',
  expenseNumber: '158291',
  notes: 'Ingresado vía Telegram',
  file: { buffer: Buffer.from('img'), mime: 'image/jpeg', fileName: 'boleta.jpg' }
};

describe('saveExpenseItem', () => {
  it('uploads then calls the RPC with converted amounts and a stable path', async () => {
    const fake = buildClient({
      expense_reports: [
        { data: { report_name: 'Gastos junio 2026', total_amount: 45230, expense_items: [{ count: 3 }] } }
      ]
    });
    const service = new ExpenseService(fake.client as never);
    const result = await service.saveExpenseItem(saveInput);

    expect(fake.storageCalls[0].op).toBe('upload');
    const rpc = fake.rpcCalls[0];
    expect(rpc.fn).toBe('bot_save_expense_item');
    expect(rpc.args.p_user_id).toBe(USER_ID);
    expect(rpc.args.p_report_id).toBe(REPORT_ID);
    expect(rpc.args.p_amount).toBe(12990);
    expect(rpc.args.p_category_id).toBe(CATEGORY_ID);
    expect(rpc.args.p_report_description).toBe('Creado desde Telegram');
    expect(String(rpc.args.p_receipt_url)).toMatch(/^boletas\/receipt_\d+_[a-z0-9]+\.jpg$/);
    expect(result).toMatchObject({ reportName: 'Gastos junio 2026', totalAmount: 45230, itemCount: 3 });
  });

  it('passes GBP through the RPC with the converted CLP amount, original amount and rate', async () => {
    mockConvertToCLP.mockResolvedValueOnce({
      originalAmount: 12.5,
      originalCurrency: 'GBP',
      convertedAmount: 15375,
      conversionRate: 1230,
      conversionDate: '2026-06-22'
    });
    const fake = buildClient({
      expense_reports: [
        { data: { report_name: 'Gastos junio 2026', total_amount: 15375, expense_items: [{ count: 1 }] } }
      ]
    });
    const service = new ExpenseService(fake.client as never);
    await service.saveExpenseItem({ ...saveInput, currency: 'GBP', amount: 12.5 });

    expect(mockConvertToCLP).toHaveBeenCalledWith(12.5, 'GBP');
    const rpc = fake.rpcCalls[0];
    expect(rpc.args.p_currency).toBe('GBP');
    expect(rpc.args.p_amount).toBe(15375);
    expect(rpc.args.p_original_amount).toBe(12.5);
    expect(rpc.args.p_conversion_rate).toBe(1230);
  });

  it('deletes the uploaded file when the RPC fails', async () => {
    const fake = buildClient({});
    fake.queueRpcResult({ data: null, error: { message: 'boom' } });
    const service = new ExpenseService(fake.client as never);

    await expect(service.saveExpenseItem(saveInput)).rejects.toMatchObject({ code: 'SAVE_FAILED' });
    const remove = fake.storageCalls.find((c) => c.op === 'remove');
    expect(remove).toBeTruthy();
    const uploadedName = (fake.storageCalls[0].args[0] as string);
    expect((remove!.args[0] as string[])[0]).toBe(uploadedName);
  });

  it('logs a structured rpc failure (stage/code/currency/itemId) for the GBP check_violation, without leaking internals to the user', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const fake = buildClient({});
      // Mirrors the real production Postgres error: GBP rejected by the
      // expense_items_currency_check constraint.
      fake.queueRpcResult({
        data: null,
        error: {
          code: '23514',
          message: 'new row for relation "expense_items" violates check constraint "expense_items_currency_check"',
          details: null,
          hint: null
        }
      });
      const service = new ExpenseService(fake.client as never);

      // User-facing failure stays the generic typed code — no Supabase internals.
      await expect(service.saveExpenseItem({ ...saveInput, currency: 'GBP', amount: 12.5 }))
        .rejects.toMatchObject({ code: 'SAVE_FAILED' });

      const logged = errorSpy.mock.calls.find((c) => c[0] === '[Bot] save failure');
      expect(logged).toBeTruthy();
      const record = JSON.parse(logged![1] as string);
      expect(record).toMatchObject({
        event: 'bot_save_failure',
        stage: 'rpc',
        code: '23514',
        currency: 'GBP',
        itemId: ITEM_ID
      });
      expect(record.message).toContain('expense_items_currency_check');
      // Orphan upload still cleaned up after the failure.
      expect(fake.storageCalls.some((c) => c.op === 'remove')).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('maps REPORT_NOT_EDITABLE RPC errors to a typed error', async () => {
    const fake = buildClient({});
    fake.queueRpcResult({ data: null, error: { message: 'REPORT_NOT_EDITABLE' } });
    const service = new ExpenseService(fake.client as never);
    await expect(service.saveExpenseItem(saveInput)).rejects.toMatchObject({ code: 'REPORT_NOT_EDITABLE' });
  });

  it('does not call the RPC when the upload fails', async () => {
    const fake = buildClient({});
    fake.setUploadResult({ error: { message: 'storage down' } });
    const service = new ExpenseService(fake.client as never);
    await expect(service.saveExpenseItem(saveInput)).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    expect(fake.rpcCalls).toHaveLength(0);
  });
});

describe('findDuplicate', () => {
  /** Records the .eq()/.or() filter chain so we can assert which columns are matched. */
  function buildDuplicateClient(rows: unknown[]) {
    const eqCalls: Array<[string, unknown]> = [];
    const orCalls: string[] = [];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => { eqCalls.push([col, val]); return builder; },
      or: (expr: string) => { orCalls.push(expr); return builder; },
      limit: () => Promise.resolve({ data: rows, error: null })
    };
    return { client: { from: () => builder }, eqCalls, orCalls };
  }

  const HIT = [{ id: 'i1', expense_reports: { report_name: 'Gastos junio 2026' } }];

  it('matches a CLP receipt against the amount column, scoped to CLP/legacy-null rows', async () => {
    const { client, eqCalls, orCalls } = buildDuplicateClient(HIT);
    const service = new ExpenseService(client as never);
    const result = await service.findDuplicate(USER_ID, 'Líder Express', '2026-06-05', 12990, 'CLP');
    expect(result).toEqual({ reportName: 'Gastos junio 2026' });
    expect(eqCalls).toContainEqual(['amount', 12990]);
    expect(eqCalls.some(([c]) => c === 'original_amount')).toBe(false);
    // Currency scoping is an .or() (CLP or legacy null), not an .eq(), so a CLP
    // receipt can't false-match a foreign row with an equal converted CLP amount.
    expect(orCalls).toContain('currency.is.null,currency.eq.CLP');
  });

  it('matches a GBP receipt against currency + original_amount, not the CLP amount column', async () => {
    const { client, eqCalls, orCalls } = buildDuplicateClient(HIT);
    const service = new ExpenseService(client as never);
    const result = await service.findDuplicate(USER_ID, 'Tesco', '2026-06-05', 12.5, 'GBP');
    expect(result).toEqual({ reportName: 'Gastos junio 2026' });
    expect(eqCalls).toContainEqual(['currency', 'GBP']);
    expect(eqCalls).toContainEqual(['original_amount', 12.5]);
    expect(eqCalls.some(([c]) => c === 'amount')).toBe(false);
    expect(orCalls).toHaveLength(0);
  });

  it('defaults to CLP matching when no currency is given', async () => {
    const { client, eqCalls, orCalls } = buildDuplicateClient(HIT);
    const service = new ExpenseService(client as never);
    await service.findDuplicate(USER_ID, 'Líder Express', '2026-06-05', 12990);
    expect(eqCalls).toContainEqual(['amount', 12990]);
    expect(orCalls).toContain('currency.is.null,currency.eq.CLP');
  });

  it('returns null without querying when required fields are missing', async () => {
    const { client, eqCalls } = buildDuplicateClient(HIT);
    const service = new ExpenseService(client as never);
    expect(await service.findDuplicate(USER_ID, null, '2026-06-05', 12.5, 'GBP')).toBeNull();
    expect(eqCalls).toHaveLength(0);
  });
});

describe('submitReport', () => {
  const actor = {
    userId: USER_ID,
    firstName: 'Bren',
    fullName: 'Bren Curtis',
    email: 'b@test.cl',
    canSubmit: true
  };

  it('throws SUBMIT_CONFLICT when the conditioned update matches nothing', async () => {
    const { client } = buildClient({ expense_reports: [{ data: [] }] });
    const service = new ExpenseService(client as never);
    await expect(service.submitReport(actor, REPORT_ID)).rejects.toMatchObject({ code: 'SUBMIT_CONFLICT' });
  });

  function submittedReportClient() {
    return buildClient({
      expense_reports: [
        {
          data: [
            {
              id: REPORT_ID,
              report_name: 'Gastos junio 2026',
              total_amount: 57690,
              start_date: '2026-06-01',
              end_date: '2026-06-30',
              expense_items: [{ count: 4 }]
            }
          ]
        }
      ]
    });
  }

  it('logs a failed notification without failing the committed submit', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSendSubmissionNotification.mockResolvedValue({ sent: false, error: 'smtp down' });
    try {
      const { client } = submittedReportClient();
      const service = new ExpenseService(client as never);
      const result = await service.submitReport(actor, REPORT_ID);
      expect(result.reportName).toBe('Gastos junio 2026'); // submit survives email failure
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('smtp down'));
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('does not log an error when the notification is skipped for a missing API key', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSendSubmissionNotification.mockResolvedValue({ sent: false, skipped: true });
    try {
      const { client } = submittedReportClient();
      const service = new ExpenseService(client as never);
      await service.submitReport(actor, REPORT_ID);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('submits and sends the approver notification server-side (no relay fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { client } = submittedReportClient();
      const service = new ExpenseService(client as never);
      const result = await service.submitReport(actor, REPORT_ID);
      expect(result).toMatchObject({ reportName: 'Gastos junio 2026', itemCount: 4 });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockSendSubmissionNotification).toHaveBeenCalledTimes(1);
      // No recipient/subject/HTML crosses this boundary — only report facts.
      const payload = mockSendSubmissionNotification.mock.calls[0][0];
      expect(payload).toEqual({
        reportName: 'Gastos junio 2026',
        submitterName: 'Bren Curtis',
        submitterEmail: 'b@test.cl',
        totalAmount: 57690,
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
