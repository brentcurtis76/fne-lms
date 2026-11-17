// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// GES-1.4 (F2c, A1): GET /api/contracts/invoice-link?cuotaId=<uuid> signs a
// five-minute link to an instalment's invoice for an active admin only.
// Replaced edges, as in the receipt link's test: the caller check
// (requireVerifiedCaller) and the service client (createServiceRoleClient)
// from lib/api-auth; the service client is an in-memory fake whose queries
// honour their .eq() filters. All people, ids and files are invented.

const ADMIN = '22222222-2222-4222-8222-222222222222';
const INACTIVE_ADMIN = '33333333-3333-4333-8333-333333333333';
const CONSULTOR = '44444444-4444-4444-8444-444444444444';
const DIRECTIVO = '55555555-5555-4555-8555-555555555555';
const DOCENTE = '66666666-6666-4666-8666-666666666666';
const CUOTA_ADDRESS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CUOTA_NAME = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUOTA_NONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUOTA_OTHER_STORE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CUOTA_DOTS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CUOTA_ENCODED_SLASH = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CUOTA_NULL_FILENAME = '77777777-7777-4777-8777-777777777777';
const CUOTA_ODD_FILENAME = '88888888-8888-4888-8888-888888888888';
const CUOTA_LONG_FILENAME = '12121212-1212-4212-8212-121212121212';
const CUOTA_EMPTY_CLEAN = '13131313-1313-4313-8313-131313131313';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const HOST = 'https://example-project.supabase.co';
const NOT_FOUND = { error: 'Factura no encontrada' };

const { mockRequireVerifiedCaller, mockCreateServiceRoleClient, mockCreateSignedUrl, mockStorageFrom, db } = vi.hoisted(
  () => ({
    mockRequireVerifiedCaller: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockCreateSignedUrl: vi.fn(),
    mockStorageFrom: vi.fn(),
    db: { tables: {} as Record<string, Array<Record<string, unknown>>> },
  })
);

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createServiceRoleClient: mockCreateServiceRoleClient,
  createApiSupabaseClient: vi.fn(() => {
    throw new Error('the invoice link must never use the caller session client');
  }),
}));

import handler from '../../../pages/api/contracts/invoice-link';

function makeServiceClient() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const rows = () => (db.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
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

async function call(cuotaId: unknown, method: 'GET' | 'POST' | 'DELETE' = 'GET', extra: Record<string, unknown> = {}) {
  const { req, res } = createMocks({
    method,
    query: { ...(cuotaId === undefined ? {} : { cuotaId }), ...extra } as any,
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getData() ? JSON.parse(res._getData()) : null, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.tables = {
    cuotas: [
      {
        id: CUOTA_ADDRESS,
        factura_url: `${HOST}/storage/v1/object/public/facturas/invoice_${CUOTA_ADDRESS}_1700000000000.pdf`,
        factura_filename: 'Factura marzo 2026.pdf',
      },
      { id: CUOTA_NAME, factura_url: `cuota_${CUOTA_NAME}_1700000000001.png`, factura_filename: '' },
      { id: CUOTA_NULL_FILENAME, factura_url: `cuota_${CUOTA_NULL_FILENAME}_1700000000002.pdf`, factura_filename: null },
      {
        id: CUOTA_ODD_FILENAME,
        factura_url: `invoice_${CUOTA_ODD_FILENAME}_1700000000003.pdf`,
        factura_filename: 'C:\\Users\\x\\sub/"Fact\'ura"\u0007\n.pdf',
      },
      {
        id: CUOTA_LONG_FILENAME,
        factura_url: `invoice_${CUOTA_LONG_FILENAME}_1700000000004.pdf`,
        factura_filename: 'f'.repeat(200) + '.pdf',
      },
      { id: CUOTA_EMPTY_CLEAN, factura_url: `invoice_${CUOTA_EMPTY_CLEAN}_1700000000005.pdf`, factura_filename: 'docs/"\'\u0001' },
      { id: CUOTA_NONE, factura_url: null },
      { id: CUOTA_OTHER_STORE, factura_url: `${HOST}/storage/v1/object/public/resources/someone-elses.pdf` },
      { id: CUOTA_DOTS, factura_url: `${HOST}/storage/v1/object/public/facturas/../boletas/x.pdf` },
      { id: CUOTA_ENCODED_SLASH, factura_url: `${HOST}/storage/v1/object/public/facturas/a%2Fb.pdf` },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: 'admin', is_active: true },
      { user_id: INACTIVE_ADMIN, role_type: 'admin', is_active: false },
      { user_id: CONSULTOR, role_type: 'consultor', is_active: true },
      { user_id: DIRECTIVO, role_type: 'equipo_directivo', is_active: true },
      { user_id: DOCENTE, role_type: 'docente', is_active: true },
    ],
  };
  mockCreateServiceRoleClient.mockImplementation(makeServiceClient);
  mockStorageFrom.mockImplementation(() => ({ createSignedUrl: mockCreateSignedUrl }));
  mockCreateSignedUrl.mockImplementation(async (path: string, expiresIn: number) => ({
    data: { signedUrl: `${HOST}/storage/v1/object/sign/facturas/${path}?token=fresh-${expiresIn}` },
    error: null,
  }));
});

function neverSigned() {
  expect(mockStorageFrom).not.toHaveBeenCalled();
  expect(mockCreateSignedUrl).not.toHaveBeenCalled();
}

describe('GET /api/contracts/invoice-link', () => {
  it('another method → 405', async () => {
    signedIn(ADMIN);
    for (const method of ['POST', 'DELETE'] as const) {
      const { status, res } = await call(CUOTA_NAME, method);
      expect(status).toBe(405);
      expect(res.getHeader('Allow')).toBe('GET');
    }
    neverSigned();
  });

  it('no sign-in → 401 and the service client is never asked', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, body } = await call(CUOTA_NAME);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a malformed id → 400', async () => {
    signedIn(ADMIN);
    for (const bad of ['not-a-uuid', `${CUOTA_NAME}x`, '', [CUOTA_NAME, CUOTA_NAME], undefined]) {
      const { status } = await call(bad);
      expect(status).toBe(400);
    }
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it.each([
    ['a consultor', CONSULTOR],
    ['a directivo', DIRECTIVO],
    ['a docente', DOCENTE],
    ['an inactive admin', INACTIVE_ADMIN],
  ])('%s → 404 «Factura no encontrada», the same answer as an unknown instalment, never signed', async (_l, user) => {
    signedIn(user);
    const asked = await call(CUOTA_NAME);
    const unknown = await call(UNKNOWN);
    expect(asked.status).toBe(404);
    expect(asked.body).toEqual(NOT_FOUND);
    expect(unknown.body).toEqual(asked.body);
    neverSigned();
  });

  it('an admin, stored full address → 200, signed for exactly that file name in facturas for 300 s, not cached', async () => {
    signedIn(ADMIN);
    const { status, body, res } = await call(CUOTA_ADDRESS);
    expect(status).toBe(200);
    expect(body).toEqual({
      url: `${HOST}/storage/v1/object/sign/facturas/invoice_${CUOTA_ADDRESS}_1700000000000.pdf?token=fresh-300`,
      expiresIn: 300,
    });
    expect(mockStorageFrom).toHaveBeenCalledTimes(1);
    expect(mockStorageFrom).toHaveBeenCalledWith('facturas');
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`invoice_${CUOTA_ADDRESS}_1700000000000.pdf`, 300);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('an admin, stored bare name → 200, signed for exactly that name in facturas for 300 s', async () => {
    signedIn(ADMIN);
    const { status, body, res } = await call(CUOTA_NAME);
    expect(status).toBe(200);
    expect(body.expiresIn).toBe(300);
    expect(mockStorageFrom).toHaveBeenCalledWith('facturas');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`cuota_${CUOTA_NAME}_1700000000001.png`, 300);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['an unknown instalment', UNKNOWN],
    ['an instalment without invoice', CUOTA_NONE],
    ['a stored value of another store', CUOTA_OTHER_STORE],
    ['a stored value with ..', CUOTA_DOTS],
    ['a stored value with an encoded slash', CUOTA_ENCODED_SLASH],
  ])('an admin, %s → 404 «Factura no encontrada», never signed', async (_l, cuota) => {
    signedIn(ADMIN);
    const { status, body } = await call(cuota);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    neverSigned();
  });

  it('a signing error → 404 «Factura no encontrada»', async () => {
    signedIn(ADMIN);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const { status, body } = await call(CUOTA_NAME);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
  });

  it('never logs the stored value or the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signedIn(ADMIN);
    await call(CUOTA_ADDRESS);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await call(CUOTA_NAME);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(' ');
    expect(printed).not.toContain('invoice_');
    expect(printed).not.toContain('cuota_');
    expect(printed).not.toContain('token');
    log.mockRestore();
    error.mockRestore();
  });

  // GES-1.4 (F2c, send-back 2): «Descargar factura» asks with download=1 and
  // the link is signed with the storage client's download option, so the store
  // answers "save this file" under the instalment's own file name.
  describe('download=1', () => {
    it('an admin → signed with the download option set to the stored file name', async () => {
      signedIn(ADMIN);
      const { status, body, res } = await call(CUOTA_ADDRESS, 'GET', { download: '1' });
      expect(status).toBe(200);
      expect(body.expiresIn).toBe(300);
      expect(mockStorageFrom).toHaveBeenCalledWith('facturas');
      expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(`invoice_${CUOTA_ADDRESS}_1700000000000.pdf`, 300, {
        download: 'Factura marzo 2026.pdf',
      });
      expect(res.getHeader('Cache-Control')).toBe('no-store');
    });

    it.each([
      ['an empty file name', CUOTA_NAME, `cuota_${CUOTA_NAME}_1700000000001.png`],
      ['no file name', CUOTA_NULL_FILENAME, `cuota_${CUOTA_NULL_FILENAME}_1700000000002.pdf`],
      ['a file name with nothing usable left', CUOTA_EMPTY_CLEAN, `invoice_${CUOTA_EMPTY_CLEAN}_1700000000005.pdf`],
    ])('%s → the download option is the object\'s own name', async (_l, cuota, objectName) => {
      signedIn(ADMIN);
      const { status } = await call(cuota, 'GET', { download: '1' });
      expect(status).toBe(200);
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(objectName, 300, { download: objectName });
    });

    it('a file name with a path, quotes and control characters → its last segment, cleaned', async () => {
      signedIn(ADMIN);
      await call(CUOTA_ODD_FILENAME, 'GET', { download: '1' });
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(`invoice_${CUOTA_ODD_FILENAME}_1700000000003.pdf`, 300, {
        download: 'Factura.pdf',
      });
    });

    it('a very long file name → at most 150 characters', async () => {
      signedIn(ADMIN);
      await call(CUOTA_LONG_FILENAME, 'GET', { download: '1' });
      const options = mockCreateSignedUrl.mock.calls[0][2];
      expect(options.download).toBe('f'.repeat(150));
    });

    it.each([
      ['no download value', {}],
      ['download=0', { download: '0' }],
      ['download=true', { download: 'true' }],
      ['an empty download', { download: '' }],
      ['download given twice', { download: ['1', '1'] }],
    ])('%s → signed exactly as without it', async (_l, extra) => {
      signedIn(ADMIN);
      const { status } = await call(CUOTA_ADDRESS, 'GET', extra);
      expect(status).toBe(200);
      expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockCreateSignedUrl.mock.calls[0]).toEqual([`invoice_${CUOTA_ADDRESS}_1700000000000.pdf`, 300]);
    });

    it('a non-admin with download=1 → 404, never signed', async () => {
      signedIn(CONSULTOR);
      const { status, body } = await call(CUOTA_ADDRESS, 'GET', { download: '1' });
      expect(status).toBe(404);
      expect(body).toEqual(NOT_FOUND);
      neverSigned();
    });
  });
});
