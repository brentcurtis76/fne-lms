// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// F26 (N146): GET /api/contracts/contract-link?contratoId=<uuid> signs a
// five-minute link to a contract's document (a signed contract or an imported
// PDF) for an active admin only. Modelled on invoice-link.test.ts: the caller
// check (requireVerifiedCaller) and the service client (createServiceRoleClient)
// from lib/api-auth are replaced; the service client is an in-memory fake whose
// queries honour their .eq() filters. All people, ids and files are invented.

const ADMIN = '22222222-2222-4222-8222-222222222222';
const INACTIVE_ADMIN = '33333333-3333-4333-8333-333333333333';
const CONSULTOR = '44444444-4444-4444-8444-444444444444';
const DOCENTE = '66666666-6666-4666-8666-666666666666';
const C_NAME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C_ADDRESS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C_FOLDER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const C_OTHER_STORE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const C_DOTS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const C_ENCODED_SLASH = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const C_QUESTION = '77777777-7777-4777-8777-777777777777';
const C_HASH = '88888888-8888-4888-8888-888888888888';
const C_EMPTY = '12121212-1212-4212-8212-121212121212';
const C_NULL = '13131313-1313-4313-8313-131313131313';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const HOST = 'https://example-project.supabase.co';
const NOT_FOUND = { error: 'Contrato no encontrado' };
const NAME = `contrato_${C_NAME}_1700000000000.pdf`;
const OLD_NAME = 'C-001_1700000000001.pdf';
const FOLDER_KEY = 'e2e-5eed0050/FNE-2026-03-901_firmado.pdf';

const { mockRequireVerifiedCaller, mockCreateServiceRoleClient, mockCreateSignedUrl, mockStorageFrom, db } = vi.hoisted(
  () => ({
    mockRequireVerifiedCaller: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockCreateSignedUrl: vi.fn(),
    mockStorageFrom: vi.fn(),
    db: { tables: {} as Record<string, Array<Record<string, unknown>>>, failRead: false },
  })
);

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createServiceRoleClient: mockCreateServiceRoleClient,
  createApiSupabaseClient: vi.fn(() => {
    throw new Error('the contract link must never use the caller session client');
  }),
}));

import handler from '../../../pages/api/contracts/contract-link';

function makeServiceClient() {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const rows = () => (db.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
        maybeSingle: async () =>
          db.failRead && table === 'contratos'
            ? { data: null, error: { message: 'read failed' } }
            : { data: rows()[0] ?? null, error: null },
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

async function call(contratoId: unknown, method: 'GET' | 'POST' | 'DELETE' = 'GET', extra: Record<string, unknown> = {}) {
  const { req, res } = createMocks({
    method,
    query: { ...(contratoId === undefined ? {} : { contratoId }), ...extra } as any,
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getData() ? JSON.parse(res._getData()) : null, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', HOST);
  db.failRead = false;
  db.tables = {
    contratos: [
      { id: C_NAME, contrato_url: NAME },
      { id: C_ADDRESS, contrato_url: `${HOST}/storage/v1/object/public/contracts/${OLD_NAME}` },
      { id: C_FOLDER, contrato_url: FOLDER_KEY },
      { id: C_OTHER_STORE, contrato_url: `${HOST}/storage/v1/object/public/facturas/invoice_x.pdf` },
      { id: C_DOTS, contrato_url: `${HOST}/storage/v1/object/public/contracts/../facturas/x.pdf` },
      { id: C_ENCODED_SLASH, contrato_url: 'a%2Fb.pdf' },
      { id: C_QUESTION, contrato_url: 'contrato?x=1.pdf' },
      { id: C_HASH, contrato_url: 'contrato#1.pdf' },
      { id: C_EMPTY, contrato_url: '' },
      { id: C_NULL, contrato_url: null },
    ],
    user_roles: [
      { user_id: ADMIN, role_type: 'admin', is_active: true },
      { user_id: INACTIVE_ADMIN, role_type: 'admin', is_active: false },
      { user_id: CONSULTOR, role_type: 'consultor', is_active: true },
      { user_id: DOCENTE, role_type: 'docente', is_active: true },
    ],
  };
  mockCreateServiceRoleClient.mockImplementation(makeServiceClient);
  mockStorageFrom.mockImplementation(() => ({ createSignedUrl: mockCreateSignedUrl }));
  mockCreateSignedUrl.mockImplementation(async (path: string, expiresIn: number) => ({
    data: { signedUrl: `${HOST}/storage/v1/object/sign/contracts/${path}?token=fresh-${expiresIn}` },
    error: null,
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function neverSigned() {
  expect(mockStorageFrom).not.toHaveBeenCalled();
  expect(mockCreateSignedUrl).not.toHaveBeenCalled();
}

describe('GET /api/contracts/contract-link', () => {
  it('another method → 405', async () => {
    signedIn(ADMIN);
    for (const method of ['POST', 'DELETE'] as const) {
      const { status, res } = await call(C_NAME, method);
      expect(status).toBe(405);
      expect(res.getHeader('Allow')).toBe('GET');
    }
    neverSigned();
  });

  it('no sign-in → 401 and the service client is never asked', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, body } = await call(C_NAME);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'No autorizado' });
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a malformed id → 400', async () => {
    signedIn(ADMIN);
    for (const bad of ['not-a-uuid', `${C_NAME}x`, '', [C_NAME, C_NAME], undefined]) {
      const { status } = await call(bad);
      expect(status).toBe(400);
    }
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it.each([
    ['a docente', DOCENTE],
    ['a consultor', CONSULTOR],
    ['an inactive admin', INACTIVE_ADMIN],
  ])('%s → 404 «Contrato no encontrado», the same answer as an unknown contract, never signed', async (_l, user) => {
    signedIn(user);
    const asked = await call(C_NAME);
    const unknown = await call(UNKNOWN);
    expect(asked.status).toBe(404);
    expect(asked.body).toEqual(NOT_FOUND);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(asked.body);
    neverSigned();
  });

  it('an admin, stored bare name → 200, signed in contracts for exactly that name for 300 s, not cached', async () => {
    signedIn(ADMIN);
    const { status, body, res } = await call(C_NAME);
    expect(status).toBe(200);
    expect(body).toEqual({
      url: `${HOST}/storage/v1/object/sign/contracts/${NAME}?token=fresh-300`,
      expiresIn: 300,
    });
    expect(mockStorageFrom).toHaveBeenCalledTimes(1);
    expect(mockStorageFrom).toHaveBeenCalledWith('contracts');
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl.mock.calls[0]).toEqual([NAME, 300]);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('an admin, stored old full address of the store → signed for the name inside', async () => {
    signedIn(ADMIN);
    const { status, res } = await call(C_ADDRESS);
    expect(status).toBe(200);
    expect(mockStorageFrom).toHaveBeenCalledWith('contracts');
    expect(mockCreateSignedUrl.mock.calls[0]).toEqual([OLD_NAME, 300]);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('an admin, stored one-folder key → signed for that key', async () => {
    signedIn(ADMIN);
    const { status } = await call(C_FOLDER);
    expect(status).toBe(200);
    expect(mockCreateSignedUrl.mock.calls[0]).toEqual([FOLDER_KEY, 300]);
  });

  it.each([
    ['an unknown contract', UNKNOWN],
    ['an address of another store', C_OTHER_STORE],
    ['a stored value with ..', C_DOTS],
    ['a stored value with %2F', C_ENCODED_SLASH],
    ['a stored value with ?', C_QUESTION],
    ['a stored value with #', C_HASH],
    ['an empty stored value', C_EMPTY],
    ['no stored value', C_NULL],
  ])('an admin, %s → 404 «Contrato no encontrado», never signed', async (_l, contrato) => {
    signedIn(ADMIN);
    const { status, body } = await call(contrato);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    neverSigned();
  });

  it('download=1 → signed with the download option exactly true', async () => {
    signedIn(ADMIN);
    const { status, body, res } = await call(C_NAME, 'GET', { download: '1' });
    expect(status).toBe(200);
    expect(body.expiresIn).toBe(300);
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrl.mock.calls[0]).toEqual([NAME, 300, { download: true }]);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it.each([
    ['download=0', { download: '0' }],
    ['download=true', { download: 'true' }],
    ['download given twice', { download: ['1', '1'] }],
  ])('%s → signed exactly as without it', async (_l, extra) => {
    signedIn(ADMIN);
    const { status } = await call(C_NAME, 'GET', extra);
    expect(status).toBe(200);
    expect(mockCreateSignedUrl.mock.calls[0]).toEqual([NAME, 300]);
  });

  it('a non-admin with download=1 → 404, never signed', async () => {
    signedIn(CONSULTOR);
    const { status, body } = await call(C_NAME, 'GET', { download: '1' });
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    neverSigned();
  });

  it('a signing error → 404 «Contrato no encontrado»', async () => {
    signedIn(ADMIN);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const { status, body } = await call(C_NAME);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
  });

  it('a read error → 500, never signed', async () => {
    signedIn(ADMIN);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failRead = true;
    const { status, body } = await call(C_NAME);
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Error interno del servidor' });
    neverSigned();
  });

  it('never logs the stored value or the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signedIn(ADMIN);
    await call(C_ADDRESS);
    await call(C_NAME);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await call(C_NAME);
    db.failRead = true;
    await call(C_NAME);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(' ');
    expect(printed).toContain('[contract-link]');
    expect(printed).not.toContain('contrato_');
    expect(printed).not.toContain('C-001');
    expect(printed).not.toContain('storage');
    expect(printed).not.toContain('token');
    log.mockRestore();
    error.mockRestore();
  });
});
