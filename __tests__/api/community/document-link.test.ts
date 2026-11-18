// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// F12d (EC-S3): GET /api/community/documents/<id>/link signs a five-minute
// link to a community document's file for a person who may read the
// document's record. The record is read WITH THE CALLER'S SESSION: the fake
// session client below answers only the rows the table's read rule would
// show that caller (active documents of workspaces they may enter). Signing
// uses the service client's storage only. Replaced edges, as in the invoice
// link's test: requireVerifiedCaller, createApiSupabaseClient and
// createServiceRoleClient from lib/api-auth. All people, ids and files are
// invented.

const HOST = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_URL = HOST;

const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_B = '22222222-2222-4222-8222-222222222222';
const WS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOC_NEW = 'd0000000-0000-4000-8000-000000000001';
const DOC_OLD_KEY = 'd0000000-0000-4000-8000-000000000002';
const DOC_OLD_ADDRESS = 'd0000000-0000-4000-8000-000000000003';
const DOC_HIDDEN = 'd0000000-0000-4000-8000-000000000004';
const DOC_OF_B = 'd0000000-0000-4000-8000-000000000005';
const DOC_POINTS_TO_B = 'd0000000-0000-4000-8000-000000000006';
const DOC_ADDRESS_TO_B = 'd0000000-0000-4000-8000-000000000007';
const DOC_DOTS = 'd0000000-0000-4000-8000-000000000008';
const DOC_OTHER_STORE = 'd0000000-0000-4000-8000-000000000009';
const DOC_FOREIGN_HOST = 'd0000000-0000-4000-8000-00000000000a';
const DOC_LESSON_PATH = 'd0000000-0000-4000-8000-00000000000b';
const DOC_ADDRESS_OTHER_BUCKET = 'd0000000-0000-4000-8000-00000000000c';
const DOC_STRANGE_NAME = 'd0000000-0000-4000-8000-00000000000d';
const DOC_PERCENT = 'd0000000-0000-4000-8000-00000000000e';
const VERSION_1 = 'e0000000-0000-4000-8000-000000000001';
const VERSION_OF_OTHER_DOC = 'e0000000-0000-4000-8000-000000000002';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const NOT_FOUND = { error: 'Documento no encontrado' };

const { mockRequireVerifiedCaller, mockCreateApiSupabaseClient, mockCreateServiceRoleClient, mockCreateSignedUrl, mockStorageFrom, db } =
  vi.hoisted(() => ({
    mockRequireVerifiedCaller: vi.fn(),
    mockCreateApiSupabaseClient: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockCreateSignedUrl: vi.fn(),
    mockStorageFrom: vi.fn(),
    db: { caller: '', tables: {} as Record<string, Array<Record<string, unknown>>>, reads: [] as string[] },
  }));

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler from '../../../pages/api/community/documents/[id]/link';

// Which workspaces each person may enter (what get_user_workspace_role decides).
const ENTERS: Record<string, string[]> = { [MEMBER_A]: [WS_A], [MEMBER_B]: [WS_B] };

// The read rules of community_documents and document_versions, as the caller.
function visible(table: string): Array<Record<string, unknown>> {
  const enters = ENTERS[db.caller] ?? [];
  const docs = (db.tables.community_documents ?? []).filter(
    (d) => enters.includes(d.workspace_id as string) && d.is_active === true
  );
  if (table === 'community_documents') return docs;
  if (table === 'document_versions') {
    const ids = new Set(docs.map((d) => d.id));
    return (db.tables.document_versions ?? []).filter((v) => ids.has(v.document_id));
  }
  return [];
}

function makeSessionClient() {
  return {
    from(table: string) {
      db.reads.push(table);
      const filters: Array<[string, unknown]> = [];
      const rows = () => visible(table).filter((r) => filters.every(([c, v]) => r[c] === v));
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => (filters.push([column, value]), chain),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      };
      return chain;
    },
  };
}

function makeServiceClient() {
  return {
    from() {
      throw new Error('the document link reads records only with the caller session');
    },
    storage: { from: mockStorageFrom },
  };
}

function signedIn(userId: string) {
  db.caller = userId;
  mockRequireVerifiedCaller.mockResolvedValue({ user: { id: userId }, status: null, body: null });
}

async function call(id: unknown, extra: Record<string, unknown> = {}, method: 'GET' | 'POST' = 'GET') {
  const { req, res } = createMocks({ method, query: { ...(id === undefined ? {} : { id }), ...extra } as any });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getData() ? JSON.parse(res._getData()) : null, res };
}

function doc(id: string, ws: string, storage_path: string, storage_bucket: string | null, more: Record<string, unknown> = {}) {
  return { id, workspace_id: ws, storage_path, storage_bucket, file_name: 'acta.pdf', mime_type: 'application/pdf', is_active: true, ...more };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reads = [];
  db.tables = {
    community_documents: [
      doc(DOC_NEW, WS_A, `documents/${WS_A}/root/1700000000000-acta.pdf`, 'community-documents', { file_name: 'Acta de reunión.pdf' }),
      doc(DOC_OLD_KEY, WS_A, `documents/${WS_A}/root/1600000000000-plan.pdf`, null),
      doc(DOC_OLD_ADDRESS, WS_A, `${HOST}/storage/v1/object/public/resources/documents/${WS_A}/folder-x/1500000000000-gu%C3%ADa%20uno.pdf`, null),
      doc(DOC_HIDDEN, WS_A, `documents/${WS_A}/root/1700000000001-oculto.pdf`, 'community-documents', { is_active: false }),
      doc(DOC_OF_B, WS_B, `documents/${WS_B}/root/1700000000002-b.pdf`, 'community-documents'),
      doc(DOC_POINTS_TO_B, WS_A, `documents/${WS_B}/root/1700000000002-b.pdf`, 'community-documents'),
      doc(DOC_ADDRESS_TO_B, WS_A, `${HOST}/storage/v1/object/public/resources/documents/${WS_B}/root/b.pdf`, null),
      doc(DOC_DOTS, WS_A, `documents/${WS_A}/../${WS_B}/root/b.pdf`, 'community-documents'),
      doc(DOC_OTHER_STORE, WS_A, `documents/${WS_A}/root/x.pdf`, 'boletas'),
      doc(DOC_FOREIGN_HOST, WS_A, `https://evil.example/storage/v1/object/public/resources/documents/${WS_A}/root/x.pdf`, null),
      doc(DOC_LESSON_PATH, WS_A, `downloads/curso-1/guia.pdf`, null),
      doc(DOC_ADDRESS_OTHER_BUCKET, WS_A, `${HOST}/storage/v1/object/public/community-documents/documents/${WS_A}/root/x.pdf`, null),
      doc(DOC_STRANGE_NAME, WS_A, `documents/${WS_A}/root/1700000000003-x.pdf`, 'community-documents', { file_name: 'Pago&download=otro?x=1 #2.pdf' }),
      doc(DOC_PERCENT, WS_A, `documents/${WS_A}/root/a%2e%2e.pdf`, 'community-documents'),
    ],
    document_versions: [
      { id: VERSION_1, document_id: DOC_NEW, storage_path: `documents/${WS_A}/root/1690000000000-acta-v1.pdf`, storage_bucket: null },
      { id: VERSION_OF_OTHER_DOC, document_id: DOC_OLD_KEY, storage_path: `documents/${WS_A}/root/1600000000000-plan.pdf`, storage_bucket: null },
    ],
  };
  mockCreateApiSupabaseClient.mockImplementation(async () => makeSessionClient());
  mockCreateServiceRoleClient.mockImplementation(makeServiceClient);
  mockStorageFrom.mockImplementation((bucket: string) => ({
    createSignedUrl: (...args: unknown[]) => mockCreateSignedUrl(bucket, ...args),
  }));
  mockCreateSignedUrl.mockImplementation(async (bucket: string, path: string, expiresIn: number) => ({
    data: { signedUrl: `${HOST}/storage/v1/object/sign/${bucket}/${path}?token=fresh-${expiresIn}` },
    error: null,
  }));
});

function neverSigned() {
  expect(mockStorageFrom).not.toHaveBeenCalled();
  expect(mockCreateSignedUrl).not.toHaveBeenCalled();
}

describe('GET /api/community/documents/[id]/link — who gets a link', () => {
  it('another method → 405, never signed', async () => {
    signedIn(MEMBER_A);
    const { status, res } = await call(DOC_NEW, {}, 'POST');
    expect(status).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET');
    neverSigned();
  });

  it('no sign-in → the caller check\'s answer, no record read, never signed', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, body } = await call(DOC_NEW);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'No autorizado' });
    expect(mockCreateApiSupabaseClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a member, a new document → 200, signed in community-documents for exactly its key, 300 s, not cached', async () => {
    signedIn(MEMBER_A);
    const { status, body, res } = await call(DOC_NEW);
    expect(status).toBe(200);
    expect(body).toEqual({
      url: `${HOST}/storage/v1/object/sign/community-documents/documents/${WS_A}/root/1700000000000-acta.pdf?token=fresh-300`,
      expiresIn: 300,
    });
    expect(mockStorageFrom).toHaveBeenCalledTimes(1);
    expect(mockStorageFrom).toHaveBeenCalledWith('community-documents');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('community-documents', `documents/${WS_A}/root/1700000000000-acta.pdf`, 300);
    expect(res.getHeader('Cache-Control')).toBe('no-store');
    expect(db.reads).toEqual(['community_documents']);
  });

  it('a member, an old document with a key and no store → signed in resources', async () => {
    signedIn(MEMBER_A);
    const { status } = await call(DOC_OLD_KEY);
    expect(status).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('resources', `documents/${WS_A}/root/1600000000000-plan.pdf`, 300);
  });

  it('a member, an old document holding a full public address → signed in resources for the key inside it (decoded)', async () => {
    signedIn(MEMBER_A);
    const { status } = await call(DOC_OLD_ADDRESS);
    expect(status).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('resources', `documents/${WS_A}/folder-x/1500000000000-guía uno.pdf`, 300);
  });

  it('hidden, another community\'s and missing documents → the same 404 body, never signed', async () => {
    signedIn(MEMBER_A);
    const hidden = await call(DOC_HIDDEN);
    const foreign = await call(DOC_OF_B);
    const missing = await call(UNKNOWN);
    for (const answer of [hidden, foreign, missing]) {
      expect(answer.status).toBe(404);
      expect(answer.body).toEqual(NOT_FOUND);
    }
    neverSigned();
  });

  it('the member of B gets B\'s document and not A\'s', async () => {
    signedIn(MEMBER_B);
    expect((await call(DOC_OF_B)).status).toBe(200);
    const a = await call(DOC_NEW);
    expect(a.status).toBe(404);
    expect(a.body).toEqual(NOT_FOUND);
  });

  it.each([
    ['not a uuid', 'not-a-uuid'],
    ['a uuid with a tail', `${DOC_NEW}x`],
    ['empty', ''],
    ['given twice', [DOC_NEW, DOC_NEW]],
  ])('an id that is %s → the same 404, no record read', async (_l, id) => {
    signedIn(MEMBER_A);
    const { status, body } = await call(id);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    expect(db.reads).toEqual([]);
    neverSigned();
  });
});

describe('the stored value must name a file inside the document\'s own workspace', () => {
  it.each([
    ['a key in another workspace', DOC_POINTS_TO_B],
    ['an old address in another workspace', DOC_ADDRESS_TO_B],
    ['a key with ..', DOC_DOTS],
    ['a store that is not a documents store', DOC_OTHER_STORE],
    ['an address on another host', DOC_FOREIGN_HOST],
    ['a path that is not a document (a lesson file)', DOC_LESSON_PATH],
    ['an address of another store than the record says', DOC_ADDRESS_OTHER_BUCKET],
    ['a key with a percent sign', DOC_PERCENT],
  ])('%s → the same 404, never signed', async (_l, id) => {
    signedIn(MEMBER_A);
    const { status, body } = await call(id);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    neverSigned();
  });
});

describe('download=1 and version=', () => {
  it('download=1 → signed for a download under the document\'s file name (encoded once for the store)', async () => {
    signedIn(MEMBER_A);
    const { status, body } = await call(DOC_NEW, { download: '1' });
    expect(status).toBe(200);
    expect(body.expiresIn).toBe(300);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('community-documents', `documents/${WS_A}/root/1700000000000-acta.pdf`, 300, {
      download: encodeURIComponent('Acta de reunión.pdf'),
    });
  });

  it('download=1 with &, ?, = and # in the file name → they stay inside the download value', async () => {
    signedIn(MEMBER_A);
    await call(DOC_STRANGE_NAME, { download: '1' });
    const option = mockCreateSignedUrl.mock.calls[0][3] as { download: string };
    expect(option.download).toBe(encodeURIComponent('Pago&download=otro?x=1 #2.pdf'));
    expect(option.download).not.toMatch(/[&?#= ]/);
  });

  it.each([['download=0', { download: '0' }], ['download=true', { download: 'true' }], ['download twice', { download: ['1', '1'] }]])(
    '%s → signed as without it',
    async (_l, extra) => {
      signedIn(MEMBER_A);
      await call(DOC_NEW, extra);
      expect(mockCreateSignedUrl.mock.calls[0]).toEqual(['community-documents', `documents/${WS_A}/root/1700000000000-acta.pdf`, 300]);
    }
  );

  it('version=<a version of this document> → that version\'s file, in its own store', async () => {
    signedIn(MEMBER_A);
    const { status } = await call(DOC_NEW, { version: VERSION_1 });
    expect(status).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('resources', `documents/${WS_A}/root/1690000000000-acta-v1.pdf`, 300);
    expect(db.reads).toEqual(['community_documents', 'document_versions']);
  });

  it.each([
    ['a version of another document', VERSION_OF_OTHER_DOC],
    ['an unknown version', UNKNOWN],
    ['a version that is not a uuid', 'v1'],
  ])('version=%s → the same 404, never signed', async (_l, version) => {
    signedIn(MEMBER_A);
    const { status, body } = await call(DOC_NEW, { version });
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    neverSigned();
  });

  it('a version of a hidden document → 404 (the document is read first)', async () => {
    db.tables.document_versions.push({ id: 'e0000000-0000-4000-8000-000000000003', document_id: DOC_HIDDEN, storage_path: `documents/${WS_A}/root/v.pdf`, storage_bucket: null });
    signedIn(MEMBER_A);
    const { status } = await call(DOC_HIDDEN, { version: 'e0000000-0000-4000-8000-000000000003' });
    expect(status).toBe(404);
    neverSigned();
  });
});

describe('failures', () => {
  it('a signing error → the same 404', async () => {
    signedIn(MEMBER_A);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const { status, body } = await call(DOC_NEW);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
  });

  it('a record read error → 500, never signed', async () => {
    signedIn(MEMBER_A);
    mockCreateApiSupabaseClient.mockImplementationOnce(async () => ({
      from: () => {
        const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) };
        return chain;
      },
    }));
    const { status } = await call(DOC_NEW);
    expect(status).toBe(500);
    neverSigned();
  });

  it('never logs the stored value or the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signedIn(MEMBER_A);
    await call(DOC_NEW);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await call(DOC_OLD_KEY);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(' ');
    expect(printed).not.toContain('documents/');
    expect(printed).not.toContain('token');
    log.mockRestore();
    error.mockRestore();
  });
});
