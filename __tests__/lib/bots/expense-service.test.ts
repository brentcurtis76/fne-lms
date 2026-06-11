// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockHasAdminPrivileges, mockConvertToCLP } = vi.hoisted(() => ({
  mockHasAdminPrivileges: vi.fn(),
  mockConvertToCLP: vi.fn()
}));

vi.mock('../../../utils/roleUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, hasAdminPrivileges: mockHasAdminPrivileges };
});

vi.mock('../../../lib/currency-service', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, convertToCLP: mockConvertToCLP };
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
    const service = new ExpenseService(client as never, 'https://app.test');
    expect(await service.resolveActor('telegram', '555')).toBeNull();
  });

  it('grants canSubmit via expense_report_access', async () => {
    const { client } = buildClient({
      bot_identities: [{ data: { user_id: USER_ID } }],
      profiles: [{ data: { first_name: 'Bren', name: 'Bren Curtis', email: 'b@test.cl' } }],
      expense_report_access: [{ data: { can_submit: true } }]
    });
    const service = new ExpenseService(client as never, 'https://app.test');
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
    const service = new ExpenseService(client as never, 'https://app.test');
    expect((await service.resolveActor('telegram', '555'))?.canSubmit).toBe(true);
  });

  it('denies users without access or admin role', async () => {
    const { client } = buildClient({
      bot_identities: [{ data: { user_id: USER_ID } }],
      profiles: [{ data: { first_name: 'Sin', name: 'Sin Acceso', email: 's@test.cl' } }],
      expense_report_access: [{ data: null }]
    });
    const service = new ExpenseService(client as never, 'https://app.test');
    expect((await service.resolveActor('telegram', '555'))?.canSubmit).toBe(false);
  });
});

const saveInput = {
  userId: USER_ID,
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
    const service = new ExpenseService(fake.client as never, 'https://app.test');
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

  it('deletes the uploaded file when the RPC fails', async () => {
    const fake = buildClient({});
    fake.queueRpcResult({ data: null, error: { message: 'boom' } });
    const service = new ExpenseService(fake.client as never, 'https://app.test');

    await expect(service.saveExpenseItem(saveInput)).rejects.toMatchObject({ code: 'SAVE_FAILED' });
    const remove = fake.storageCalls.find((c) => c.op === 'remove');
    expect(remove).toBeTruthy();
    const uploadedName = (fake.storageCalls[0].args[0] as string);
    expect((remove!.args[0] as string[])[0]).toBe(uploadedName);
  });

  it('maps REPORT_NOT_EDITABLE RPC errors to a typed error', async () => {
    const fake = buildClient({});
    fake.queueRpcResult({ data: null, error: { message: 'REPORT_NOT_EDITABLE' } });
    const service = new ExpenseService(fake.client as never, 'https://app.test');
    await expect(service.saveExpenseItem(saveInput)).rejects.toMatchObject({ code: 'REPORT_NOT_EDITABLE' });
  });

  it('does not call the RPC when the upload fails', async () => {
    const fake = buildClient({});
    fake.setUploadResult({ error: { message: 'storage down' } });
    const service = new ExpenseService(fake.client as never, 'https://app.test');
    await expect(service.saveExpenseItem(saveInput)).rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    expect(fake.rpcCalls).toHaveLength(0);
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
    const service = new ExpenseService(client as never, 'https://app.test');
    await expect(service.submitReport(actor, REPORT_ID)).rejects.toMatchObject({ code: 'SUBMIT_CONFLICT' });
  });

  it('logs non-2xx email responses without failing the committed submit', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'smtp down' });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { client } = buildClient({
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
      const service = new ExpenseService(client as never, 'https://app.test');
      const result = await service.submitReport(actor, REPORT_ID);
      expect(result.reportName).toBe('Gastos junio 2026'); // submit survives email failure
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('HTTP 500'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('smtp down'));
    } finally {
      vi.unstubAllGlobals();
      errorSpy.mockRestore();
    }
  });

  it('submits and fires the approver email at an absolute URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { client } = buildClient({
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
      const service = new ExpenseService(client as never, 'https://app.test');
      const result = await service.submitReport(actor, REPORT_ID);
      expect(result).toMatchObject({ reportName: 'Gastos junio 2026', itemCount: 4 });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://app.test/api/send-email',
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
      expect(body.to).toContain('@');
      expect(body.subject).toContain('Gastos junio 2026');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
