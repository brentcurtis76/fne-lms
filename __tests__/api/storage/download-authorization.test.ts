// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMocks } from 'node-mocks-http';

// EC-S1: /api/storage/download and /api/storage/download-url read storage with
// the service key, so the route itself must tie the file to the caller. The
// caller check (requireVerifiedCaller) and the user-bound client
// (createApiSupabaseClient) are mocked from lib/api-auth; the module-level
// service client (storage read) is mocked through @supabase/supabase-js.
// All people, ids and files are invented.

const SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
delete process.env.NEXT_PUBLIC_STORAGE_BUCKET;

const {
  mockRequireVerifiedCaller,
  mockCreateApiSupabaseClient,
  mockDownload,
  mockCreateSignedUrl,
  mockStorageFrom,
  mockGetUser,
} = vi.hoisted(() => ({
  mockRequireVerifiedCaller: vi.fn(),
  mockCreateApiSupabaseClient: vi.fn(),
  mockDownload: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('../../../lib/api-auth', () => ({
  requireVerifiedCaller: mockRequireVerifiedCaller,
  createApiSupabaseClient: mockCreateApiSupabaseClient,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    storage: { from: mockStorageFrom },
  }),
}));

import downloadHandler from '../../../pages/api/storage/download';
import downloadUrlHandler from '../../../pages/api/storage/download-url';
import { isSafeStoragePath, authorizeStorageDownload } from '../../../lib/storage/download-authorization';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WS_MEMBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WS_OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COURSE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PUBLIC = `${SUPABASE_URL}/storage/v1/object/public`;
const BYTES = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

/** User-bound client: rpc('can_access_workspace') and from('message_attachments'). */
let rpcCalls: Array<[string, unknown]>;
let inCalls: Array<[string, unknown[]]>;
let likeCalls: unknown[];
let workspaceAccess: Record<string, boolean>;
let attachmentRows: unknown[];

function makeUserClient() {
  const chain: any = {
    select: () => chain,
    in: (column: string, values: unknown[]) => {
      inCalls.push([column, values]);
      return chain;
    },
    like: (...args: unknown[]) => {
      likeCalls.push(args);
      return chain;
    },
    ilike: (...args: unknown[]) => {
      likeCalls.push(args);
      return chain;
    },
    limit: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ data: attachmentRows, error: null }),
  };
  return {
    rpc: vi.fn(async (fn: string, args: { p_workspace_id: string }) => {
      rpcCalls.push([fn, args]);
      return { data: workspaceAccess[args.p_workspace_id] === true, error: null };
    }),
    from: vi.fn(() => chain),
  };
}

function storageWasTouched() {
  return mockDownload.mock.calls.length + mockCreateSignedUrl.mock.calls.length > 0;
}

async function callDownload(url: string) {
  const { req, res } = createMocks({
    method: 'GET',
    headers: { authorization: 'Bearer test-token' },
    // As Next hands it over: the caller's encodeURIComponent(url) decoded once.
    query: { url, filename: 'archivo.pdf' },
  });
  await downloadHandler(req as any, res as any);
  return res;
}

async function callDownloadUrl(fileUrl: string, bucket?: string) {
  const { req, res } = createMocks({
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: bucket === undefined ? { fileUrl } : { fileUrl, bucket },
  });
  await downloadUrlHandler(req as any, res as any);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls = [];
  inCalls = [];
  likeCalls = [];
  workspaceAccess = { [WS_MEMBER]: true };
  attachmentRows = [];
  mockRequireVerifiedCaller.mockResolvedValue({ user: { id: USER_ID }, status: null, body: null });
  mockCreateApiSupabaseClient.mockImplementation(async () => makeUserClient());
  // The pre-fix routes check the token themselves with the service client.
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  mockDownload.mockImplementation(async () => ({
    data: new Blob([BYTES], { type: 'application/pdf' }),
    error: null,
  }));
  mockCreateSignedUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `${SUPABASE_URL}/signed/${path}` },
    error: null,
  }));
  mockStorageFrom.mockImplementation(() => ({ download: mockDownload, createSignedUrl: mockCreateSignedUrl }));
});

describe('download.ts refuses what the caller may not see', () => {
  it.each([
    ['a file in meeting-documents', `${PUBLIC}/meeting-documents/m1/acta.pdf`],
    ['a file in pasantias-documents', `${PUBLIC}/pasantias-documents/p1/carta.pdf`],
    ['a file in boletas', `${PUBLIC}/boletas/b1/boleta.pdf`],
    ['a file in contracts', `${PUBLIC}/contracts/c1/contrato.pdf`],
    ['a community document of a workspace the caller cannot enter', `${PUBLIC}/resources/documents/${WS_OTHER}/f.pdf`],
    ['a message attachment the caller cannot read', `${PUBLIC}/message-attachments/t1/foto.png`],
    ['a capital-D Documents path in resources', `${PUBLIC}/resources/Documents/${WS_OTHER}/f.pdf`],
  ])('%s → 403, storage never called', async (_label, url) => {
    const res = await callDownload(url);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes acceso a este archivo' });
    expect(storageWasTouched()).toBe(false);
  });

  // The brief's trick, as the handler receives it: the route's decodeURIComponent
  // turns %252e into %2e, and new URL() then resolves the dots itself, so the
  // route sees bucket meeting-documents → refused as a bucket (403).
  it('encoded-dot trick %252e%252e (brief literal) → refused, storage never called', async () => {
    const res = await callDownload(
      `${PUBLIC}/resources/downloads/%252e%252e/%252e%252e/meeting-documents/x.pdf`
    );
    expect(res._getStatusCode()).toBe(403);
    expect(storageWasTouched()).toBe(false);
  });

  // One encoding level deeper, %2e survives into the decoded path the storage
  // client would put into its address unencoded → 400.
  it('encoded-dot trick that survives the URL parser (%25252e) → 400, storage never called', async () => {
    const res = await callDownload(
      `${PUBLIC}/resources/downloads/%25252e%25252e/%25252e%25252e/meeting-documents/x.pdf`
    );
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Ruta de archivo no válida' });
    expect(storageWasTouched()).toBe(false);
  });

  // Encoded so that the route's own decoding leaves the path as document%73/…
  it('document%73/<uuid>/f in resources → 400', async () => {
    const res = await callDownload(`${PUBLIC}/resources/document%252573/${WS_OTHER}/f.pdf`);
    expect(res._getStatusCode()).toBe(400);
    expect(storageWasTouched()).toBe(false);
  });

  it('bucket Resources (capital R) → refused, never served', async () => {
    const res = await callDownload(`${PUBLIC}/Resources/downloads/${COURSE_ID}/f.pdf`);
    expect([400, 403]).toContain(res._getStatusCode());
    expect(storageWasTouched()).toBe(false);
  });

  it('a caller refused by requireVerifiedCaller → its status and body, storage never called', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 403, body: { error: 'Debes cambiar tu contraseña' } });
    const res = await callDownload(`${PUBLIC}/resources/downloads/${COURSE_ID}/f.pdf`);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Debes cambiar tu contraseña' });
    expect(storageWasTouched()).toBe(false);
  });

  it('an unauthenticated caller → 401 from requireVerifiedCaller, storage never called', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 401, body: { error: 'No autorizado' } });
    const res = await callDownload(`${PUBLIC}/resources/downloads/${COURSE_ID}/f.pdf`);
    expect(res._getStatusCode()).toBe(401);
    expect(storageWasTouched()).toBe(false);
  });
});

describe('download.ts still serves the real callers', () => {
  async function expectServed(res: any, bucket: string, path: string) {
    expect(res._getStatusCode()).toBe(200);
    expect(mockStorageFrom).toHaveBeenCalledWith(bucket);
    expect(mockDownload).toHaveBeenCalledWith(path);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(res.getHeader('Content-Disposition')).toBe('attachment; filename="archivo.pdf"');
    expect(res.getHeader('Content-Length')).toBe(BYTES.byteLength);
    expect(res.getHeader('Cache-Control')).toBe('private, max-age=3600');
    expect(Buffer.from(res._getData())).toEqual(Buffer.from(BYTES));
  }

  it('a member\'s community document → 200', async () => {
    const res = await callDownload(`${PUBLIC}/resources/documents/${WS_MEMBER}/plan.pdf`);
    await expectServed(res, 'resources', `documents/${WS_MEMBER}/plan.pdf`);
    expect(rpcCalls).toEqual([['can_access_workspace', { p_user_id: USER_ID, p_workspace_id: WS_MEMBER }]]);
  });

  it('a message attachment the caller can read → 200, exact stored URL among the candidates, no like filter', async () => {
    const stored = `${PUBLIC}/message-attachments/thread-1/Informe%20final.pdf`;
    attachmentRows = [{ id: 'att-1' }];
    const res = await callDownload(stored);
    await expectServed(res, 'message-attachments', 'thread-1/Informe final.pdf');
    expect(inCalls).toHaveLength(1);
    expect(inCalls[0][0]).toBe('storage_path');
    expect(inCalls[0][1]).toContain(stored);
    expect(inCalls[0][1]).toContain(`${PUBLIC}/message-attachments/thread-1/Informe final.pdf`);
    expect(likeCalls).toEqual([]);
  });

  it('a message attachment not readable (no row) → 403', async () => {
    attachmentRows = [];
    const res = await callDownload(`${PUBLIC}/message-attachments/thread-1/foto.png`);
    expect(res._getStatusCode()).toBe(403);
    expect(storageWasTouched()).toBe(false);
  });

  it('a lesson file with spaces and accents, percent-encoded → 200, storage gets the plain name', async () => {
    const res = await callDownload(`${PUBLIC}/resources/downloads/${COURSE_ID}/Gu%C3%ADa%20de%20trabajo.pdf`);
    await expectServed(res, 'resources', `downloads/${COURSE_ID}/Guía de trabajo.pdf`);
  });
});

describe('download-url.ts refuses what the caller may not see', () => {
  it.each([
    ['a file in meeting-documents', `${PUBLIC}/meeting-documents/m1/acta.pdf`, undefined],
    ['a file in pasantias-documents', `${PUBLIC}/pasantias-documents/p1/carta.pdf`, undefined],
    ['a community document of a workspace the caller cannot enter', `${PUBLIC}/resources/documents/${WS_OTHER}/f.pdf`, undefined],
    ['a message attachment the caller cannot read', `${PUBLIC}/message-attachments/t1/foto.png`, undefined],
    ['a raw path in another store', 'm1/acta.pdf', 'meeting-documents'],
    ['a raw community document path of another workspace', `documents/${WS_OTHER}/f.pdf`, undefined],
  ])('%s → 403, never signed', async (_label, fileUrl, bucket) => {
    const res = await callDownloadUrl(fileUrl, bucket);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'No tienes acceso a este archivo' });
    expect(storageWasTouched()).toBe(false);
  });

  // The brief's trick: new URL() resolves %2e%2e before the route splits the
  // path, so the route checks documents/<uuid>/f.pdf itself → 403 (no access).
  it('encoded-dot trick %2e%2e in a public URL (brief literal) → refused, never signed', async () => {
    const res = await callDownloadUrl(`${PUBLIC}/resources/downloads/%2e%2e/documents/${WS_OTHER}/f.pdf`);
    expect(res._getStatusCode()).toBe(403);
    expect(storageWasTouched()).toBe(false);
  });

  it.each([
    ['raw path branch', `downloads/%2e%2e/documents/${WS_OTHER}/f.pdf`],
    ['regex fallback branch (dots climb out of /public/)', `${PUBLIC}/resources/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/x/y.pdf`],
    ['sign URL that falls to the raw branch', `${SUPABASE_URL}/storage/v1/object/sign/resources/downloads/%2e%2e/documents/${WS_OTHER}/f.pdf`],
    ['double-encoded dots in a public URL', `${PUBLIC}/resources/downloads/%252e%252e/documents/${WS_OTHER}/f.pdf`],
    ['a path that does not decode', 'downloads/%E0%A4%A/f.pdf'],
  ])('encoded-path trick via %s → 400, never signed', async (_label, fileUrl) => {
    const res = await callDownloadUrl(fileUrl);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'Ruta de archivo no válida' });
    expect(storageWasTouched()).toBe(false);
  });

  it('a caller refused by requireVerifiedCaller → its status, never signed', async () => {
    mockRequireVerifiedCaller.mockResolvedValue({ user: null, status: 403, body: { error: 'Debes cambiar tu contraseña' } });
    const res = await callDownloadUrl(`${PUBLIC}/resources/downloads/${COURSE_ID}/f.pdf`);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({ error: 'Debes cambiar tu contraseña' });
    expect(storageWasTouched()).toBe(false);
  });
});

describe('download-url.ts still signs allowed files, with the decoded path', () => {
  it('a lesson file with accents → 200, signs the decoded path', async () => {
    const res = await callDownloadUrl(`${PUBLIC}/resources/downloads/${COURSE_ID}/Gu%C3%ADa%20de%20trabajo.pdf`);
    expect(res._getStatusCode()).toBe(200);
    expect(mockStorageFrom).toHaveBeenCalledWith('resources');
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`downloads/${COURSE_ID}/Guía de trabajo.pdf`, 3600);
  });

  it('a member\'s community document → 200', async () => {
    const res = await callDownloadUrl(`${PUBLIC}/resources/documents/${WS_MEMBER}/plan.pdf`);
    expect(res._getStatusCode()).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`documents/${WS_MEMBER}/plan.pdf`, 3600);
  });

  it('a readable message attachment → 200 in its own store', async () => {
    attachmentRows = [{ id: 'att-1' }];
    const res = await callDownloadUrl(`${PUBLIC}/message-attachments/thread-1/foto.png`);
    expect(res._getStatusCode()).toBe(200);
    expect(mockStorageFrom).toHaveBeenCalledWith('message-attachments');
    expect(inCalls[0][1]).toContain(`${PUBLIC}/message-attachments/thread-1/foto.png`);
  });

  it('a raw lesson path → 200', async () => {
    const res = await callDownloadUrl(`downloads/${COURSE_ID}/f.pdf`);
    expect(res._getStatusCode()).toBe(200);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`downloads/${COURSE_ID}/f.pdf`, 3600);
  });
});

describe('isSafeStoragePath', () => {
  it.each([
    ['a literal %', 'downloads/a%2e/f.pdf'],
    ['a backslash', 'downloads\\..\\f.pdf'],
    ['a ?', 'downloads/f.pdf?x=1'],
    ['a #', 'downloads/f.pdf#x'],
    ['a control character', 'downloads/f\u0001.pdf'],
    ['a newline', 'downloads/f\n.pdf'],
    ['DEL', 'downloads/f\u007f.pdf'],
    ['//', 'downloads//f.pdf'],
    ['a leading /', '/downloads/f.pdf'],
    ['a trailing /', 'downloads/'],
    ['a .. segment', 'downloads/../meeting-documents/f.pdf'],
    ['a . segment', 'downloads/./f.pdf'],
    ['document%73', `document%73/${WS_OTHER}/f`],
    ['empty', ''],
    ['too long', 'a'.repeat(1025)],
  ])('refuses %s', (_label, path) => {
    expect(isSafeStoragePath('resources', path)).toBe(false);
  });

  it.each(['Resources', '', '-x', 'a/b', 'a b', 'résources'])('refuses bucket %j', (bucket) => {
    expect(isSafeStoragePath(bucket, 'downloads/f.pdf')).toBe(false);
  });

  it.each([
    `downloads/${COURSE_ID}/Guía de trabajo.pdf`,
    `documents/${WS_MEMBER}/plan.pdf`,
    'thread-1/Informe final (v2).pdf',
    'a'.repeat(1024),
  ])('accepts %j', (path) => {
    expect(isSafeStoragePath('resources', path)).toBe(true);
  });
});

describe('authorizeStorageDownload', () => {
  it.each(['meeting-documents', 'pasantias-documents', 'boletas', 'contracts'])('bucket %s → 403', async (bucket) => {
    const client = makeUserClient();
    const decision = await authorizeStorageDownload(client as any, USER_ID, bucket, 'x/f.pdf');
    expect(decision).toEqual({ allowed: false, status: 403, error: 'No tienes acceso a este archivo' });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('bucket Resources (capital R) → 400', async () => {
    const decision = await authorizeStorageDownload(makeUserClient() as any, USER_ID, 'Resources', 'downloads/f.pdf');
    expect(decision).toEqual({ allowed: false, status: 400, error: 'Ruta de archivo no válida' });
  });

  it('document%73/<uuid>/f → 400', async () => {
    const decision = await authorizeStorageDownload(makeUserClient() as any, USER_ID, 'resources', `document%73/${WS_OTHER}/f`);
    expect(decision.allowed).toBe(false);
    expect((decision as any).status).toBe(400);
  });

  it('Documents/<uuid>/f (capital D) in resources → 403 without asking the database', async () => {
    const client = makeUserClient();
    const decision = await authorizeStorageDownload(client as any, USER_ID, 'resources', `Documents/${WS_MEMBER}/f`);
    expect(decision).toEqual({ allowed: false, status: 403, error: 'No tienes acceso a este archivo' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('documents/ with an upper-case uuid → 403', async () => {
    const decision = await authorizeStorageDownload(makeUserClient() as any, USER_ID, 'resources', `documents/${WS_MEMBER.toUpperCase()}/f`);
    expect((decision as any).status).toBe(403);
  });

  it('can_access_workspace error → 403', async () => {
    const client = makeUserClient();
    client.rpc.mockResolvedValueOnce({ data: true, error: { code: 'XX000' } } as any);
    const decision = await authorizeStorageDownload(client as any, USER_ID, 'resources', `documents/${WS_MEMBER}/f.pdf`);
    expect((decision as any).status).toBe(403);
  });

  it('message attachment candidates are exact values, duplicates removed, original URL included', async () => {
    attachmentRows = [{ id: 'att-1' }];
    const original = `${PUBLIC}/message-attachments/t/a%20b.pdf`;
    const decision = await authorizeStorageDownload(makeUserClient() as any, USER_ID, 'message-attachments', 't/a b.pdf', original);
    expect(decision).toEqual({ allowed: true });
    expect(inCalls).toEqual([
      ['storage_path', [`${PUBLIC}/message-attachments/t/a b.pdf`, `${PUBLIC}/message-attachments/t/a%20b.pdf`]],
    ]);
    expect(likeCalls).toEqual([]);
  });
});
