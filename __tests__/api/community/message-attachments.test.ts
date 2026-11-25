// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// F26b (EC-F3): GET /api/community/message-attachments/<id> shows, opens or
// downloads a message's attached file through a link signed for five minutes,
// for a person who may read the message_attachments row. The row is read WITH
// THE CALLER'S SESSION: the fake session client below answers only the rows
// the table's read rules would show that caller (attachments of messages of
// conversations they may read). Signing uses the service client's storage
// only. Replaced edges, as in the document link's test: requireVerifiedCaller,
// createApiSupabaseClient and createServiceRoleClient from lib/api-auth. All
// people, ids and files are invented.

const HOST = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_URL = HOST;

const MEMBER_A = '11111111-1111-4111-8111-111111111111';
const MEMBER_B = '22222222-2222-4222-8222-222222222222';
const WS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MSG_A = 'e0000000-0000-4000-8000-00000000000a';
const MSG_A2 = 'e0000000-0000-4000-8000-00000000000c';
const MSG_B = 'e0000000-0000-4000-8000-00000000000b';
const A_NEW = 'f1000000-0000-4000-8000-000000000001';
const A_OLD_ADDRESS = 'f1000000-0000-4000-8000-000000000002';
const A_OF_B = 'f1000000-0000-4000-8000-000000000003';
const A_INACTIVE = 'f1000000-0000-4000-8000-000000000004';
const A_OTHER_MESSAGE = 'f1000000-0000-4000-8000-000000000005';
const A_OTHER_STORE = 'f1000000-0000-4000-8000-000000000006';
const A_FOREIGN_HOST = 'f1000000-0000-4000-8000-000000000007';
const A_DOTS = 'f1000000-0000-4000-8000-000000000008';
const A_PERCENT = 'f1000000-0000-4000-8000-000000000009';
const A_TOO_DEEP = 'f1000000-0000-4000-8000-00000000000a';
const A_TOO_SHALLOW = 'f1000000-0000-4000-8000-00000000000b';
const A_ADDRESS_OTHER_MESSAGE = 'f1000000-0000-4000-8000-00000000000c';
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

import handler from '../../../pages/api/community/message-attachments/[id]';

// Which conversations each person may read (what access_message decides), and
// the conversation of each message. The read rule does not look at is_active.
const READS: Record<string, string[]> = { [MEMBER_A]: [WS_A], [MEMBER_B]: [WS_B] };
const MESSAGE_WS: Record<string, string> = { [MSG_A]: WS_A, [MSG_A2]: WS_A, [MSG_B]: WS_B };

function makeSessionClient() {
  return {
    from(table: string) {
      db.reads.push(table);
      const filters: Array<[string, unknown]> = [];
      const rows = () =>
        table !== 'message_attachments'
          ? []
          : db.rows
              .filter((r) => (READS[db.caller] ?? []).includes(MESSAGE_WS[r.message_id as string]))
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
      throw new Error('the attachment link reads rows only with the caller session');
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

function attachment(id: string, message_id: string, storage_path: string, more: Record<string, unknown> = {}) {
  return { id, message_id, storage_path, file_name: 'acta.pdf', is_active: true, ...more };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reads = [];
  db.selects = [];
  db.rows = [
    attachment(A_NEW, MSG_A, `${WS_A}/${MSG_A}/1700000000000_ab12.pdf`, { file_name: 'Acta de reunión.pdf' }),
    attachment(A_OLD_ADDRESS, MSG_A, `${HOST}/storage/v1/object/public/message-attachments/${WS_A}/${MSG_A}/1600000000000_cd34.png`),
    attachment(A_OF_B, MSG_B, `${WS_B}/${MSG_B}/1700000000001_ef56.pdf`),
    attachment(A_INACTIVE, MSG_A, `${WS_A}/${MSG_A}/1700000000002_gh78.pdf`, { is_active: false }),
    attachment(A_OTHER_MESSAGE, MSG_A, `${WS_A}/${MSG_A2}/1700000000003_ij90.pdf`),
    attachment(A_OTHER_STORE, MSG_A, `${HOST}/storage/v1/object/public/post-media/${WS_A}/${MSG_A}/x.pdf`),
    attachment(A_FOREIGN_HOST, MSG_A, `https://evil.example/storage/v1/object/public/message-attachments/${WS_A}/${MSG_A}/x.pdf`),
    attachment(A_DOTS, MSG_A, `${WS_A}/${MSG_A}/../${MSG_A2}/x.pdf`),
    attachment(A_PERCENT, MSG_A, `${WS_A}/${MSG_A}/x%2F..%2Fy.pdf`),
    attachment(A_TOO_DEEP, MSG_A, `${WS_A}/${MSG_A}/sub/x.pdf`),
    attachment(A_TOO_SHALLOW, MSG_A, `${MSG_A}/x.pdf`),
    attachment(A_ADDRESS_OTHER_MESSAGE, MSG_A, `${HOST}/storage/v1/object/public/message-attachments/${WS_B}/${MSG_B}/1700000000001_ef56.pdf`),
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

describe('GET /api/community/message-attachments/[id] — who gets the file', () => {
  it('another method → 405, never signed', async () => {
    signedIn(MEMBER_A);
    const { status, res } = await call(A_NEW, {}, 'POST');
    expect(status).toBe(405);
    expect(res.getHeader('Allow')).toBe('GET');
    neverSigned();
  });

  it("no sign-in → the caller check's answer, no row read, never signed", async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, body } = await call(A_NEW);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'No autorizado' });
    expect(mockCreateApiSupabaseClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a malformed id → 404, no row read, never signed', async () => {
    signedIn(MEMBER_A);
    for (const id of ['att-1', `${A_NEW}x`, undefined, ['a', 'b']]) {
      const { status, body } = await call(id);
      expect(status).toBe(404);
      expect(body).toEqual(NOT_FOUND);
    }
    expect(mockCreateApiSupabaseClient).not.toHaveBeenCalled();
    neverSigned();
  });

  it('a row the caller cannot read (another conversation, unknown) → the same 404, never signed', async () => {
    signedIn(MEMBER_A);
    for (const id of [A_OF_B, UNKNOWN]) {
      const { status, body } = await call(id);
      expect(status).toBe(404);
      expect(body).toEqual(NOT_FOUND);
    }
    neverSigned();
  });

  it('an inactive row → the same 404, never signed', async () => {
    signedIn(MEMBER_A);
    const { status, body } = await call(A_INACTIVE);
    expect(status).toBe(404);
    expect(body).toEqual(NOT_FOUND);
    neverSigned();
  });

  it('a new row with the key → 302 to the signed link of exactly that key in message-attachments, 300 s, never stored by a browser or a cache', async () => {
    signedIn(MEMBER_A);
    const { status, redirect, res } = await call(A_NEW);
    expect(status).toBe(302);
    expect(redirect).toBe(`${HOST}/storage/v1/object/sign/message-attachments/${WS_A}/${MSG_A}/1700000000000_ab12.pdf?token=fresh-300`);
    expect(mockStorageFrom).toHaveBeenCalledTimes(1);
    expect(mockStorageFrom).toHaveBeenCalledWith('message-attachments');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('message-attachments', `${WS_A}/${MSG_A}/1700000000000_ab12.pdf`, 300);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(db.reads).toEqual(['message_attachments']);
    expect(db.selects).toEqual(['id, message_id, storage_path, file_name, is_active']);
  });

  it("the member of B gets B's attachment and not A's", async () => {
    signedIn(MEMBER_B);
    expect((await call(A_OF_B)).status).toBe(302);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('message-attachments', `${WS_B}/${MSG_B}/1700000000001_ef56.pdf`, 300);
    vi.clearAllMocks();
    signedIn(MEMBER_B);
    expect((await call(A_NEW)).status).toBe(404);
    neverSigned();
  });

  it('an old row holding a full public address of message-attachments → the key inside it', async () => {
    signedIn(MEMBER_A);
    const { status } = await call(A_OLD_ADDRESS);
    expect(status).toBe(302);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('message-attachments', `${WS_A}/${MSG_A}/1600000000000_cd34.png`, 300);
  });

  it("a key of another message, another store's or another host's address, '..', '%2F', more or fewer than three segments → 404, never signed", async () => {
    signedIn(MEMBER_A);
    for (const id of [A_OTHER_MESSAGE, A_ADDRESS_OTHER_MESSAGE, A_OTHER_STORE, A_FOREIGN_HOST, A_DOTS, A_PERCENT, A_TOO_DEEP, A_TOO_SHALLOW]) {
      const { status, body } = await call(id);
      expect(status, id).toBe(404);
      expect(body).toEqual(NOT_FOUND);
    }
    neverSigned();
  });
});

describe('GET /api/community/message-attachments/[id] — the answer', () => {
  it('download=1 → JSON { url, expiresIn: 300 } whose link carries download=<file_name>, not cached', async () => {
    signedIn(MEMBER_A);
    const { status, body, redirect, res } = await call(A_NEW, { download: '1' });
    expect(status).toBe(200);
    expect(redirect).toBe('');
    expect(body.expiresIn).toBe(300);
    const link = new URL(body.url);
    expect(link.pathname).toBe(`/storage/v1/object/sign/message-attachments/${WS_A}/${MSG_A}/1700000000000_ab12.pdf`);
    expect(link.searchParams.get('token')).toBe('fresh-300');
    expect(link.searchParams.get('download')).toBe('Acta de reunión.pdf');
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
  });

  it('a signing error → the same 404', async () => {
    signedIn(MEMBER_A);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const { status, body } = await call(A_NEW);
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
    const { status } = await call(A_NEW);
    expect(status).toBe(500);
    neverSigned();
  });

  it('never logs the stored value or the link', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    signedIn(MEMBER_A);
    await call(A_NEW);
    await call(A_NEW, { download: '1' });
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    await call(A_OLD_ADDRESS);
    const printed = [...log.mock.calls, ...error.mock.calls].flat().map(String).join(' ');
    expect(printed).not.toContain(MSG_A);
    expect(printed).not.toContain('token');
    log.mockRestore();
    error.mockRestore();
  });
});

// F26b send-back 1, point 2: a browser reused Líder A's redirect for Miembro B
// and for a signed-out visitor in the same browser. No answer of this route
// may be stored or reused by a browser or by anything between: the redirect
// and every refusal carry exactly `Cache-Control: private, no-store`.
describe('GET /api/community/message-attachments/[id] — no answer is stored (send-back 1)', () => {
  const NO_STORE = 'private, no-store';

  it('the 302 to the signed link', async () => {
    signedIn(MEMBER_A);
    const { status, res } = await call(A_NEW);
    expect(status).toBe(302);
    expect(res.getHeader('Cache-Control')).toBe(NO_STORE);
  });

  it('the 401 of a signed-out visitor', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const { status, res } = await call(A_NEW);
    expect(status).toBe(401);
    expect(res.getHeader('Cache-Control')).toBe(NO_STORE);
  });

  it('the 404 of a person who may not see the file, of an unknown row and of a malformed id', async () => {
    signedIn(MEMBER_A);
    for (const id of [A_OF_B, UNKNOWN, 'not-a-uuid']) {
      const { status, res } = await call(id);
      expect(status, id).toBe(404);
      expect(res.getHeader('Cache-Control'), id).toBe(NO_STORE);
    }
  });

  it('the 404 of a signing error, the 405 and the download JSON', async () => {
    signedIn(MEMBER_A);
    mockCreateSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } });
    const refused = await call(A_NEW);
    expect(refused.status).toBe(404);
    expect(refused.res.getHeader('Cache-Control')).toBe(NO_STORE);
    const wrongMethod = await call(A_NEW, {}, 'POST');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.res.getHeader('Cache-Control')).toBe(NO_STORE);
    const download = await call(A_NEW, { download: '1' });
    expect(download.status).toBe(200);
    expect(download.res.getHeader('Cache-Control')).toBe(NO_STORE);
  });
});
