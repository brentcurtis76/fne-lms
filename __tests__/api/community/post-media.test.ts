// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// F26b (EC-F2): GET /api/community/post-media/<id> shows or downloads a feed
// post's file through a link signed for five minutes, for a person who may
// read the post_media row. The row is read WITH THE CALLER'S SESSION: the fake
// session client below answers only the rows the table's read rule would show
// that caller (files of posts of workspaces they may enter). Signing uses the
// service client's storage only. Replaced edges, as in the document link's
// test: requireVerifiedCaller, createApiSupabaseClient and
// createServiceRoleClient from lib/api-auth. All people, ids and files are
// invented.

const HOST = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_URL = HOST;

const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_B = '22222222-2222-4222-8222-222222222222';
const WS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const POST_A = 'c0000000-0000-4000-8000-00000000000a';
const POST_B = 'c0000000-0000-4000-8000-00000000000b';
const M_NEW = 'f0000000-0000-4000-8000-000000000001';
const M_OLD_ADDRESS = 'f0000000-0000-4000-8000-000000000002';
const M_OF_B = 'f0000000-0000-4000-8000-000000000003';
const M_POINTS_TO_B = 'f0000000-0000-4000-8000-000000000004';
const M_OTHER_STORE = 'f0000000-0000-4000-8000-000000000005';
const M_FOREIGN_HOST = 'f0000000-0000-4000-8000-000000000006';
const M_DOTS = 'f0000000-0000-4000-8000-000000000007';
const M_PERCENT = 'f0000000-0000-4000-8000-000000000008';
const M_DOCUMENT = 'f0000000-0000-4000-8000-000000000009';
const M_ADDRESS_TO_B = 'f0000000-0000-4000-8000-00000000000a';
const M_BARE_POST = 'f0000000-0000-4000-8000-00000000000b';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const NOT_FOUND = { error: 'Archivo no encontrado' };

const { mockRequireVerifiedCaller, mockCreateApiSupabaseClient, mockCreateServiceRoleClient, mockCreateSignedUrl, mockStorageFrom, db } =
  vi.hoisted(() => ({
    mockRequireVerifiedCaller: vi.fn(),
    mockCreateApiSupabaseClient: vi.fn(),
    mockCreateServiceRoleClient: vi.fn(),
    mockCreateSignedUrl: vi.fn(),
    mockStorageFrom: vi.fn(),
    db: { caller: '', rows: [] as Array<Record<string, unknown>>, reads: [] as string[], selects: [] as string[] },
  }));

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
  createServiceRoleClient: mockCreateServiceRoleClient,
}));

import handler from '../../../pages/api/community/post-media/[id]';

// Which workspaces each person may enter (what can_access_workspace decides),
// and the workspace of each post.
const ENTERS: Record<string, string[]> = { [MEMBER_A]: [WS_A], [MEMBER_B]: [WS_B] };
const POST_WS: Record<string, string> = { [POST_A]: WS_A, [POST_B]: WS_B };

function makeSessionClient() {
  return {
    from(table: string) {
      db.reads.push(table);
      const filters: Array<[string, unknown]> = [];
      const rows = () =>
        table !== 'post_media'
          ? []
          : db.rows
              .filter((r) => (ENTERS[db.caller] ?? []).includes(POST_WS[r.post_id as string]))
              .filter((r) => filters.every(([c, v]) => r[c] === v));
      const chain: any = {
        select: (columns: string) => (db.selects.push(columns), chain),
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
      throw new Error('the post-media link reads rows only with the caller session');
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
  const data = res._getData();
  return { status: res._getStatusCode(), body: data ? JSON.parse(data) : null, redirect: res._getRedirectUrl(), res };
}

function media(id: string, post_id: string, storage_path: string | null, url: string, more: Record<string, unknown> = {}) {
  return { id, post_id, storage_path, url, type: 'image', metadata: { name: 'foto.png', size: 10, type: 'image/png' }, ...more };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reads = [];
  db.selects = [];
  db.rows = [
    media(M_NEW, POST_A, `${POST_A}/0.png`, `${POST_A}/0.png`),
    media(M_OLD_ADDRESS, POST_A, null, `${HOST}/storage/v1/object/public/post-media/${POST_A}/1.png`),
    media(M_OF_B, POST_B, `${POST_B}/0.png`, `${POST_B}/0.png`),
    media(M_POINTS_TO_B, POST_A, `${POST_B}/0.png`, `${POST_B}/0.png`),
    media(M_OTHER_STORE, POST_A, '', `${HOST}/storage/v1/object/public/message-attachments/${POST_A}/0.png`),
    media(M_FOREIGN_HOST, POST_A, '', `https://evil.example/storage/v1/object/public/post-media/${POST_A}/0.png`),
    media(M_DOTS, POST_A, `${POST_A}/../${POST_B}/0.png`, 'x'),
    media(M_PERCENT, POST_A, `${POST_A}%2F..%2F${POST_B}/0.png`, 'x'),
    media(M_DOCUMENT, POST_A, `${POST_A}/2.pdf`, `${POST_A}/2.pdf`, {
      type: 'document',
      metadata: { name: 'Acta de reunión.pdf', size: 20, type: 'application/pdf' },
    }),
    media(M_ADDRESS_TO_B, POST_A, null, `${HOST}/storage/v1/object/public/post-media/${POST_B}/0.png`),
    media(M_BARE_POST, POST_A, `${POST_A}/`, `${POST_A}/`),
  ];
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

describe('GET /api/community/post-media/[id] — who gets the file', () => {
  it('another method → 405, never signed', async () => {
    signedIn(MEMBER_A);
    const { status, res } = await call(M_NEW, {}, 'POST');
    expect(status).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET');
    neverSigned();
  });

  it("no sign-in → the caller check's answer, no row read, never signed", async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, body } = await call(M_NEW);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'No autorizado' });
    expect(mockCreateApiSupabaseClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a malformed id → 404, no row read, never signed', async () => {
    signedIn(MEMBER_A);
    for (const id of ['abc', `${M_NEW}x`, undefined, ['a', 'b']]) {
      const { status, body } = await call(id);
      expect(status).toBe(404);
      expect(body).toEqual(NOT_FOUND);
    }
    expect(mockCreateApiSupabaseClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a row the caller cannot read (another community, unknown) → the same 404, never signed', async () => {
    signedIn(MEMBER_A);
    for (const id of [M_OF_B, UNKNOWN]) {
      const { status, body } = await call(id);
      expect(status).toBe(404);
      expect(body).toEqual(NOT_FOUND);
    }
    neverSigned();
  });

  it('a new row with the key → 302 to the signed link of exactly that key in post-media, 300 s, cached privately for 240 s', async () => {
    signedIn(MEMBER_A);
    const { status, redirect, res } = await call(M_NEW);
    expect(status).toBe(302);
    expect(redirect).toBe(`${HOST}/storage/v1/object/sign/post-media/${POST_A}/0.png?token=fresh-300`);
    expect(mockStorageFrom).toHaveBeenCalledTimes(1);
    expect(mockStorageFrom).toHaveBeenCalledWith('post-media');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('post-media', `${POST_A}/0.png`, 300);
    expect(res.getHeader('Cache-Control')).toBe('private, max-age=240');
    expect(db.reads).toEqual(['post_media']);
    expect(db.selects).toEqual(['id, post_id, url, storage_path, metadata']);
  });

  it('the member of B gets B\'s file and not A\'s', async () => {
    signedIn(MEMBER_B);
    expect((await call(M_OF_B)).status).toBe(302);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('post-media', `${POST_B}/0.png`, 300);
    vi.clearAllMocks();
    signedIn(MEMBER_B);
    expect((await call(M_NEW)).status).toBe(404);
    neverSigned();
  });

  it('an old row (storage_path empty, url an old public address of post-media) → the key inside it', async () => {
    signedIn(MEMBER_A);
    const { status } = await call(M_OLD_ADDRESS);
    expect(status).toBe(302);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('post-media', `${POST_A}/1.png`, 300);
  });

  it("a key outside the row's own post, another store's or another host's address, '..', '%2F', a bare folder → 404, never signed", async () => {
    signedIn(MEMBER_A);
    for (const id of [M_POINTS_TO_B, M_ADDRESS_TO_B, M_OTHER_STORE, M_FOREIGN_HOST, M_DOTS, M_PERCENT, M_BARE_POST]) {
      const { status, body } = await call(id);
      expect(status, id).toBe(404);
      expect(body).toEqual(NOT_FOUND);
    }
    neverSigned();
  });
});

describe('GET /api/community/post-media/[id] — the answer', () => {
  it('download=1 → JSON { url, expiresIn: 300 } whose link carries download=<metadata.name>, not cached', async () => {
    signedIn(MEMBER_A);
    const { status, body, redirect, res } = await call(M_DOCUMENT, { download: '1' });
    expect(status).toBe(200);
    expect(redirect).toBe('');
    expect(body.expiresIn).toBe(300);
    const link = new URL(body.url);
    expect(link.pathname).toBe(`/storage/v1/object/sign/post-media/${POST_A}/2.pdf`);
    expect(link.searchParams.get('token')).toBe('fresh-300');
    expect(link.searchParams.get('download')).toBe('Acta de reunión.pdf');
    expect(res.getHeader('Cache-Control')).toBe('no-store');
  });

  it('a signing error → the same 404', async () => {
    signedIn(MEMBER_A);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const { status, body } = await call(M_NEW);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
  });

  it('a row read error → 500, never signed', async () => {
    signedIn(MEMBER_A);
    mockCreateApiSupabaseClient.mockImplementationOnce(async () => ({
      from: () => {
        const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) };
        return chain;
      },
    }));
    const { status } = await call(M_NEW);
    expect(status).toBe(500);
    neverSigned();
  });

  it('never logs the stored value or the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signedIn(MEMBER_A);
    await call(M_NEW);
    await call(M_DOCUMENT, { download: '1' });
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await call(M_OLD_ADDRESS);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(' ');
    expect(printed).not.toContain(POST_A);
    expect(printed).not.toContain('token');
    log.mockRestore();
    error.mockRestore();
  });
});
