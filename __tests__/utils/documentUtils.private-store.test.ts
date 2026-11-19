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
  uploadFailFor: [] as string[],
  versionInsertError: null as null | { message: string },
  // send-back 1: queued answers of the record insert, the stored objects, and what a re-read finds
  documentInsertAnswers: [] as Array<{ data: unknown; error: unknown }>,
  storedObjects: new Set<string>(),
  storedDocument: null as null | Record<string, unknown>,
  storedVersions: [] as Array<{ id: string }>,
  session: { access_token: 'synthetic-token' } as null | { access_token: string },
}));

function builder(table: string) {
  let inserting = false;
  const chain: any = {
    insert: (arg: unknown) => ((inserting = true), state.calls.push({ table, op: 'insert', arg }), chain),
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    single: async () => {
      if (table === 'community_documents' && state.documentInsertAnswers.length > 0) {
        return state.documentInsertAnswers.shift();
      }
      return table === 'community_documents' && state.documentInsertError
        ? { data: null, error: state.documentInsertError }
        : { data: { id: 'doc-new', ...(state.calls.filter((c) => c.table === table).pop()?.arg as object) }, error: null };
    },
    maybeSingle: async () => (state.calls.push({ table, op: 'read' }), { data: state.storedDocument, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      if (table === 'document_versions' && !inserting) {
        state.calls.push({ table, op: 'read' });
        return Promise.resolve({ data: state.storedVersions, error: null }).then(resolve);
      }
      return Promise.resolve({ data: null, error: table === 'document_versions' ? state.versionInsertError : null }).then(resolve);
    },
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
        upload: async (path: string) => {
          state.storage.push({ bucket, op: 'upload', path });
          if (state.uploadFailFor.some((n) => path.toLowerCase().endsWith(n.toLowerCase()))) {
            return { data: null, error: { message: 'store refused' } };
          }
          if (state.storedObjects.has(path)) {
            // the storage client's StorageApiError for the store's duplicate answer
            return { data: null, error: { name: 'StorageApiError', message: 'The resource already exists', status: 409, statusCode: '409' } };
          }
          state.storedObjects.add(path);
          return { data: { path }, error: null };
        },
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
  state.uploadFailFor = [];
  state.versionInsertError = null;
  state.documentInsertAnswers = [];
  state.storedObjects = new Set();
  state.storedDocument = null;
  state.storedVersions = [];
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

  it('a record that cannot be written after the file was stored: the file is reported as failed (F18e: no longer thrown), the stored file is not removed, no version is written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.documentInsertError = { message: 'insert refused' };
    const result = await documentUtils.uploadDocument(WS, { files: [file()], tags: [] } as any, USER);
    expect(result.uploaded).toEqual([]);
    expect(result.failed).toEqual([{ fileName: 'Acta de reunión.pdf', message: RECORD_FAILED }]);
    expect(state.storage.map((s) => `${s.bucket}:${s.op}`)).toEqual(['community-documents:upload']);
    expect(state.calls.some((c) => c.table === 'document_versions')).toBe(false);
  });
});

// F18e (EC-D7, EC-D8): each file of an upload succeeds or fails for itself.
const RECORD_FAILED = 'El archivo se subió, pero el documento no se pudo guardar. Inténtalo de nuevo.';
const VERSION_WARNING = 'El documento se guardó, pero no su historial de versiones.';
const named = (name: string, type = 'application/pdf') => new File([new Uint8Array([37, 80, 68, 70])], name, { type });

describe('uploadDocument: each file reports for itself (F18e)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('three files, the second upload fails: files 1 and 3 are uploaded with their record and one version each, file 2 failed, nothing thrown', async () => {
    state.uploadFailFor = ['Dos.pdf'];
    const result = await documentUtils.uploadDocument(
      WS, { files: [named('Uno.pdf'), named('Dos.pdf'), named('Tres.pdf')], title: 'Actas', tags: [] } as any, USER
    );
    expect(result.uploaded.map((d) => d.file_name)).toEqual(['Uno.pdf', 'Tres.pdf']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].fileName).toBe('Dos.pdf');
    expect(result.failed[0].message).toMatch(/^No se pudo subir el archivo/);
    expect(result.warnings).toEqual([]);
    const records = state.calls.filter((c) => c.table === 'community_documents' && c.op === 'insert');
    expect(records.map((c) => (c.arg as any).file_name)).toEqual(['Uno.pdf', 'Tres.pdf']);
    expect(state.calls.filter((c) => c.table === 'document_versions')).toHaveLength(2);
  });

  it('the upload works but the record cannot be written: failed with the not-saved message, the stored file stays, no version', async () => {
    state.documentInsertError = { message: 'value too long' };
    const result = await documentUtils.uploadDocument(WS, { files: [named('Uno.pdf')], title: 'Acta', tags: [] } as any, USER);
    expect(result.uploaded).toEqual([]);
    expect(result.failed).toEqual([{ fileName: 'Uno.pdf', message: RECORD_FAILED }]);
    expect(state.storage.filter((s) => s.op === 'remove')).toEqual([]);
    expect(state.calls.some((c) => c.table === 'document_versions')).toBe(false);
  });

  it('the record works but the version insert fails: the document counts as uploaded and carries a warning', async () => {
    state.versionInsertError = { message: 'version refused' };
    const result = await documentUtils.uploadDocument(WS, { files: [named('Uno.pdf')], title: 'Acta', tags: [] } as any, USER);
    expect(result.uploaded.map((d) => d.file_name)).toEqual(['Uno.pdf']);
    expect(result.failed).toEqual([]);
    expect(result.warnings).toEqual([{ fileName: 'Uno.pdf', message: VERSION_WARNING }]);
  });

  it.each([
    ['a title of 201 characters', { title: 'T'.repeat(201), file: () => named('Uno.pdf') }, /título/],
    ['a file name of 256 characters', { title: 'Acta', file: () => named(`${'n'.repeat(252)}.pdf`) }, /nombre del archivo/],
    ['a file type of 101 characters', { title: 'Acta', file: () => named('Uno.pdf', `application/${'x'.repeat(89)}`) }, /tipo del archivo/],
  ])('%s: that file fails with a Spanish sentence and no upload is attempted', async (_label, input, sentence) => {
    const f = input.file();
    const result = await documentUtils.uploadDocument(WS, { files: [f], title: input.title, tags: [] } as any, USER);
    expect(result.uploaded).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].fileName).toBe(f.name);
    expect(result.failed[0].message).toMatch(sentence);
    expect(state.storage.filter((s) => s.op === 'upload')).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it('a title of exactly 200 characters, a name of 255 and a type within 100 still upload', async () => {
    const f = named(`${'n'.repeat(251)}.pdf`);
    const result = await documentUtils.uploadDocument(WS, { files: [f], title: 'T'.repeat(200), tags: [] } as any, USER);
    expect(result.failed).toEqual([]);
    expect(result.uploaded).toHaveLength(1);
  });

  it('every file fails: an empty uploaded list, nothing thrown', async () => {
    state.uploadFailFor = ['Uno.pdf', 'Dos.pdf'];
    const result = await documentUtils.uploadDocument(
      WS, { files: [named('Uno.pdf'), named('Dos.pdf')], title: 'Actas', tags: [] } as any, USER
    );
    expect(result.uploaded).toEqual([]);
    expect(result.failed.map((f) => f.fileName)).toEqual(['Uno.pdf', 'Dos.pdf']);
  });

  it('an unsupported type is still refused with its message, now as that file\'s failure', async () => {
    const result = await documentUtils.uploadDocument(
      WS, { files: [named('Uno.exe', 'application/x-msdownload')], title: 'Acta', tags: [] } as any, USER
    );
    expect(result.failed).toEqual([{ fileName: 'Uno.exe', message: 'Tipo de archivo no soportado: application/x-msdownload' }]);
    expect(state.storage).toEqual([]);
  });
});

// F18e send-back 1: a document keeps its identity (id and storage path) across tries.
describe('uploadDocument: a retry with the same identity never makes a second document (F18e send-back 1)', () => {
  const ID = 'd1111111-1111-4111-8111-111111111111';
  const PATH = `documents/${WS}/root/1795000000000-acta.pdf`;
  const identity = [{ documentId: ID, storagePath: PATH }];
  const LOST = { data: null, error: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } };
  const DUPLICATE = { data: null, error: { message: 'duplicate key value violates unique constraint "community_documents_pkey"', code: '23505', details: '', hint: '' } };
  const saved = (extra: Record<string, unknown> = {}) => ({
    id: ID, workspace_id: WS, uploaded_by: USER, file_name: 'Acta.pdf', storage_path: PATH, is_active: true, ...extra,
  });

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('the record is saved but its answer is lost; the retry gets 409 from the store and 23505 from the insert → ONE document uploaded, no second record', async () => {
    const data = { files: [named('Acta.pdf')], title: 'Acta', tags: [] } as any;
    state.documentInsertAnswers = [LOST];
    const first = await documentUtils.uploadDocument(WS, data, USER, identity);
    expect(first.uploaded).toEqual([]);
    expect(first.failed).toEqual([{ fileName: 'Acta.pdf', message: RECORD_FAILED }]);

    // what the database holds after the lost answer
    state.storedDocument = saved();
    state.storedVersions = [];
    state.documentInsertAnswers = [DUPLICATE];
    const second = await documentUtils.uploadDocument(WS, data, USER, identity);
    expect(second.failed).toEqual([]);
    expect(second.uploaded).toHaveLength(1);
    expect(second.uploaded[0].id).toBe(ID);

    const uploads = state.storage.filter((s) => s.op === 'upload').map((s) => s.path);
    expect(uploads).toEqual([PATH, PATH]);
    const records = state.calls.filter((c) => c.table === 'community_documents' && c.op === 'insert');
    expect(records).toHaveLength(2);
    expect(records.every((c) => (c.arg as any).id === ID && (c.arg as any).storage_path === PATH)).toBe(true);
    // no version existed: it is written once, on the retry
    const versions = state.calls.filter((c) => c.table === 'document_versions' && c.op === 'insert');
    expect(versions).toHaveLength(1);
    expect(versions[0].arg).toMatchObject({ document_id: ID, version_number: 1, storage_path: PATH });
  });

  it('a 23505 whose record already has its version: uploaded, and no second version row', async () => {
    state.storedObjects.add(PATH);
    state.storedDocument = saved();
    state.storedVersions = [{ id: 'v-1' }];
    state.documentInsertAnswers = [DUPLICATE];
    const result = await documentUtils.uploadDocument(WS, { files: [named('Acta.pdf')], title: 'Acta', tags: [] } as any, USER, identity);
    expect(result.uploaded.map((d) => d.id)).toEqual([ID]);
    expect(state.calls.some((c) => c.table === 'document_versions' && c.op === 'insert')).toBe(false);
  });

  it.each([
    ['belongs to another person', () => saved({ uploaded_by: '22222222-2222-4222-8222-222222222222' })],
    ['is in another workspace', () => saved({ workspace_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })],
    ['cannot be read', () => null],
  ])('a 23505 whose record %s → failed with the plain sentence, no version written', async (_label, row) => {
    state.storedDocument = row();
    state.documentInsertAnswers = [DUPLICATE];
    const result = await documentUtils.uploadDocument(WS, { files: [named('Acta.pdf')], title: 'Acta', tags: [] } as any, USER, identity);
    expect(result.uploaded).toEqual([]);
    expect(result.failed).toEqual([{ fileName: 'Acta.pdf', message: RECORD_FAILED }]);
    expect(state.calls.some((c) => c.table === 'document_versions')).toBe(false);
  });

  it('an identity given: the record is inserted WITH that id and the file stored at that path', async () => {
    const result = await documentUtils.uploadDocument(WS, { files: [named('Acta.pdf')], title: 'Acta', tags: [] } as any, USER, identity);
    expect(result.uploaded.map((d) => d.id)).toEqual([ID]);
    expect(state.storage.find((s) => s.op === 'upload')!.path).toBe(PATH);
    expect((state.calls.find((c) => c.table === 'community_documents')!.arg as any).id).toBe(ID);
  });

  it('no identity given: no id is sent, as before', async () => {
    await documentUtils.uploadDocument(WS, { files: [named('Acta.pdf')], title: 'Acta', tags: [] } as any, USER);
    expect('id' in (state.calls.find((c) => c.table === 'community_documents')!.arg as object)).toBe(false);
  });

  it('buildDocumentStoragePath keeps the shape documents/<ws>/<root|folder-id>/<ts>-<name>', () => {
    expect(documentUtils.buildDocumentStoragePath(WS, null, 'Acta.pdf', 1795000000000)).toBe(PATH);
    expect(documentUtils.buildDocumentStoragePath(WS, 'f1', 'Acta.pdf', 1795000000000)).toBe(`documents/${WS}/folder-f1/1795000000000-acta.pdf`);
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
