// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// GES-1.5b: GET /api/expense-reports/receipt-link?itemId=<uuid> signs a
// five-minute link to a receipt for the report's filer or an active admin only.
// Replaced edges: the caller check (requireVerifiedCaller) and the service
// client (createServiceRoleClient) from lib/api-auth; the service client is an
// in-memory fake whose queries honour their .eq() filters. All people, ids and
// files are invented.

const FILER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const INACTIVE_ADMIN = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const REPORT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_PLACE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ITEM_OLD_LINK = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM_OTHER_STORE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ITEM_DOTS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ITEM_NO_PLACE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const HOST = 'https://example-project.supabase.co';

const { mockRequireVerifiedCaller, mockCreateServiceRoleClient, mockCreateSignedUrl, mockStorageFrom, db } =
  vi.hoisted(() => ({
    mockRequireVerifiedCaller: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockCreateSignedUrl: vi.fn(),
    mockStorageFrom: vi.fn(),
    db: { tables: {} as Record<string, Array<Record<string, unknown>>>, reads: [] as string[] },
  }));

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler from '../../../pages/api/expense-reports/receipt-link';

function makeServiceClient() {
  return {
    from(table: string) {
      db.reads.push(table);
      const filters: Array<[string, unknown]> = [];
      const rows = () => (db.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => {
          const found = rows();
          return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: 'PGRST116' } };
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      };
      return chain;
    },
    storage: { from: mockStorageFrom },
  };
}

function signedIn(userId: string) {
  mockRequireVerifiedCaller.mockResolvedValue({ user: { id: userId }, status: null, body: null });
}

async function call(itemId: unknown, method: 'GET' | 'POST' = 'GET') {
  const { req, res } = createMocks({ method, query: itemId === undefined ? {} : { itemId } as any });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getData() ? JSON.parse(res._getData()) : null, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reads = [];
  db.tables = {
    expense_reports: [{ id: REPORT, submitted_by: FILER }],
    expense_items: [
      { id: ITEM_PLACE, report_id: REPORT, receipt_url: 'boletas/receipt_1700000000000_ab12cd.pdf' },
      {
        id: ITEM_OLD_LINK,
        report_id: REPORT,
        receipt_url: `${HOST}/storage/v1/object/sign/boletas/receipt_1600000000000_old.pdf?token=invented.year.token`,
      },
      {
        id: ITEM_OTHER_STORE,
        report_id: REPORT,
        receipt_url: `${HOST}/storage/v1/object/sign/resources/someone-elses.pdf?token=t`,
      },
      { id: ITEM_DOTS, report_id: REPORT, receipt_url: 'boletas/../resources/x.pdf' },
      { id: ITEM_NO_PLACE, report_id: REPORT, receipt_url: null },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: 'admin', is_active: true },
      { user_id: INACTIVE_ADMIN, role_type: 'admin', is_active: false },
      { user_id: OTHER, role_type: 'docente', is_active: true },
    ],
  };
  mockCreateServiceRoleClient.mockImplementation(makeServiceClient);
  mockStorageFrom.mockImplementation(() => ({ createSignedUrl: mockCreateSignedUrl }));
  mockCreateSignedUrl.mockImplementation(async (path: string, expiresIn: number) => ({
    data: { signedUrl: `${HOST}/storage/v1/object/sign/boletas/${path}?token=fresh-${expiresIn}` },
    error: null,
  }));
});

describe('GET /api/expense-reports/receipt-link', () => {
  it('POST → 405', async () => {
    signedIn(FILER);
    const { status } = await call(ITEM_PLACE, 'POST');
    expect(status).toBe(405);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('no sign-in → 401 and the service client is never asked', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, body } = await call(ITEM_PLACE);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('a caller who must change their password gets the helper answer as it is', async () => {
    const forced = { error: 'Debe cambiar su contraseña', code: 'PASSWORD_CHANGE_REQUIRED' };
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 403, body: forced });
    const { status, body } = await call(ITEM_PLACE);
    expect(status).toBe(403);
    expect(body).toEqual(forced);
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('a malformed id → 400', async () => {
    signedIn(FILER);
    for (const bad of ['not-a-uuid', `${ITEM_PLACE}x`, '', [ITEM_PLACE, ITEM_PLACE], undefined]) {
      const { status } = await call(bad);
      expect(status).toBe(400);
    }
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('an unknown item → 404', async () => {
    signedIn(FILER);
    const { status } = await call(UNKNOWN);
    expect(status).toBe(404);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('the filer → 200, a five-minute link, signed with the bare file name, not cached', async () => {
    signedIn(FILER);
    const { status, body, res } = await call(ITEM_PLACE);
    expect(status).toBe(200);
    expect(body.expiresIn).toBe(300);
    expect(body.url).toContain('receipt_1700000000000_ab12cd.pdf');
    expect(mockStorageFrom).toHaveBeenCalledWith('boletas');
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('receipt_1700000000000_ab12cd.pdf', 300);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('an active admin who is not the filer → 200', async () => {
    signedIn(ADMIN);
    const { status, body } = await call(ITEM_PLACE);
    expect(status).toBe(200);
    expect(body.expiresIn).toBe(300);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('receipt_1700000000000_ab12cd.pdf', 300);
  });

  it('an inactive admin role → 404, nothing signed', async () => {
    signedIn(INACTIVE_ADMIN);
    const { status } = await call(ITEM_PLACE);
    expect(status).toBe(404);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('another signed-in person → 404 with the same body as an unknown item, nothing signed', async () => {
    signedIn(OTHER);
    const unknown = await call(UNKNOWN);
    const other = await call(ITEM_PLACE);
    expect(other.status).toBe(404);
    expect(other.body).toEqual(unknown.body);
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('a stored old long-lived link → the file name is extracted and a fresh link signed', async () => {
    signedIn(FILER);
    const { status, body } = await call(ITEM_OLD_LINK);
    expect(status).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('receipt_1600000000000_old.pdf', 300);
    expect(body.url).not.toContain('invented.year.token');
  });

  it('a stored value pointing to another store → 404, nothing signed', async () => {
    signedIn(FILER);
    const { status, body } = await call(ITEM_OTHER_STORE);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Esta rendición no tiene boleta disponible' });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('a stored value with .. → 404, nothing signed', async () => {
    signedIn(ADMIN);
    const { status, body } = await call(ITEM_DOTS);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Esta rendición no tiene boleta disponible' });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('a file name but no stored place → 404, nothing listed or signed', async () => {
    signedIn(FILER);
    const { status, body } = await call(ITEM_NO_PLACE);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Esta rendición no tiene boleta disponible' });
    expect(mockCreateSignedUrl).not.toHaveBeenCalled();
  });

  it('a signing error → 404 with the no-receipt body', async () => {
    signedIn(FILER);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const { status, body } = await call(ITEM_PLACE);
    expect(status).toBe(404);
    expect(body).toEqual({ error: 'Esta rendición no tiene boleta disponible' });
  });

  it('never logs the stored value or the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signedIn(FILER);
    await call(ITEM_OLD_LINK);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await call(ITEM_PLACE);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(' ');
    expect(printed).not.toContain('receipt_');
    expect(printed).not.toContain('token');
    log.mockRestore();
    error.mockRestore();
  });
});
