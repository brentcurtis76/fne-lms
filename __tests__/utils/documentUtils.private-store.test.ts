// @vitest-environment jsdom
// GENERA fixes F12d (EC-S3): a community's documents are private files.
//   - uploadDocument stores a new file in the private store
//     `community-documents` (whatever NEXT_PUBLIC_STORAGE_BUCKET says) and
//     writes storage_bucket on the document and on its first version; when the
//     record cannot be written after the file was stored, the error is thrown
//     and nothing is removed (as before F12d)
//   - getDocumentLink asks /api/community/documents/<id>/link with the
//     person's session and answers the signed address, or a clear error
// Invented people and files only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; arg?: unknown }>,
  storage: [] as Array<{ bucket: string; op: string; path: string }>,
  documentInsertError: null as null | { message: string },
  session: { access_token: 'synthetic-token' } as null | { access_token: string },
}));

function builder(table: string) {
  const chain: any = {
    insert: (arg: unknown) => (state.calls.push({ table, op: 'insert', arg }), chain),
    select: () => chain,
    single: async () =>
      table === 'community_documents' && state.documentInsertError
        ? { data: null, error: state.documentInsertError }
        : { data: { id: 'doc-new', ...(state.calls.filter((c) => c.table === table).pop()?.arg as object) }, error: null },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
  };
  return chain;
}

vi.mock('../../lib/supabase-wrapper', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getSession: async () => ({ data: { session: state.session } }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => (state.storage.push({ bucket, op: 'upload', path }), { data: { path }, error: null }),
        remove: async (paths: string[]) => (state.storage.push({ bucket, op: 'remove', path: paths.join(',') }), { data: null, error: null }),
        getPublicUrl: (path: string) => (state.storage.push({ bucket, op: 'getPublicUrl', path }), { data: { publicUrl: `public/${path}` } }),
      }),
    },
  },
}));
vi.mock('../../utils/workspaceUtils', () => ({ getUserWorkspaceAccess: vi.fn() }));

import * as documentUtils from '../../utils/documentUtils';

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER = '11111111-1111-4111-8111-111111111111';
const file = () => new File([new Uint8Array([37, 80, 68, 70])], 'Acta de reunión.pdf', { type: 'application/pdf' });

beforeEach(() => {
  state.calls = [];
  state.storage = [];
  state.documentInsertError = null;
  state.session = { access_token: 'synthetic-token' };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('uploadDocument stores new documents in the private store', () => {
  it('uploads to community-documents at documents/<ws>/root/<ts>-<name>, even when NEXT_PUBLIC_STORAGE_BUCKET names another store', async () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BUCKET', 'resources');
    await documentUtils.uploadDocument(WS, { files: [file()], title: 'Acta', tags: [] } as any, USER);
    const uploads = state.storage.filter((s) => s.op === 'upload');
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe('community-documents');
    expect(uploads[0].path).toMatch(new RegExp(`^documents/${WS}/root/\\d+-`));
    expect(state.storage.some((s) => s.op === 'getPublicUrl')).toBe(false);
  });

  it('writes storage_bucket = community-documents and the key on the document and on its first version', async () => {
    await documentUtils.uploadDocument(WS, { files: [file()], folder_id: 'f1', tags: [] } as any, USER);
    const key = state.storage.find((s) => s.op === 'upload')!.path;
    expect(key).toMatch(new RegExp(`^documents/${WS}/folder-f1/`));
    const docInsert = state.calls.find((c) => c.table === 'community_documents' && c.op === 'insert')!.arg as Record<string, unknown>;
    expect(docInsert).toMatchObject({ workspace_id: WS, storage_path: key, storage_bucket: 'community-documents', uploaded_by: USER });
    const versionInsert = state.calls.find((c) => c.table === 'document_versions' && c.op === 'insert')!.arg as Record<string, unknown>;
    expect(versionInsert).toMatchObject({ document_id: 'doc-new', version_number: 1, storage_path: key, storage_bucket: 'community-documents' });
  });

  it('a record that cannot be written after the file was stored: the error is thrown, the stored file is not removed, no version is written (as before)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.documentInsertError = { message: 'insert refused' };
    await expect(documentUtils.uploadDocument(WS, { files: [file()], tags: [] } as any, USER)).rejects.toEqual({ message: 'insert refused' });
    expect(state.storage.map((s) => `${s.bucket}:${s.op}`)).toEqual(['community-documents:upload']);
    expect(state.calls.some((c) => c.table === 'document_versions')).toBe(false);
  });
});

describe('getDocumentLink', () => {
  it('asks the link route with the session and answers the signed address', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: 'https://store.test/sign/x?token=t', expiresIn: 300 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const url = await (documentUtils as any).getDocumentLink('d0000000-0000-4000-8000-000000000001');
    expect(url).toBe('https://store.test/sign/x?token=t');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [address, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(address).toBe('/api/community/documents/d0000000-0000-4000-8000-000000000001/link');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer synthetic-token');
  });

  it('download and version go into the query', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: 'https://store.test/sign/y', expiresIn: 300 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await (documentUtils as any).getDocumentLink('d1', { download: true, versionId: 'v1' });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/community/documents/d1/link?download=1&version=v1');
  });

  it('no session → a session error, and the route is not asked', async () => {
    state.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect((documentUtils as any).getDocumentLink('d1')).rejects.toMatchObject({ reason: 'session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a 404', () => new Response(JSON.stringify({ error: 'Documento no encontrado' }), { status: 404 })],
    ['an answer without url', () => new Response(JSON.stringify({ expiresIn: 300 }), { status: 200 })],
  ])('%s → a failed error', async (_l, answer) => {
    vi.stubGlobal('fetch', vi.fn(async () => answer()));
    await expect((documentUtils as any).getDocumentLink('d1')).rejects.toMatchObject({ reason: 'failed' });
  });

  it('a network failure → a failed error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect((documentUtils as any).getDocumentLink('d1')).rejects.toMatchObject({ reason: 'failed' });
  });
});
