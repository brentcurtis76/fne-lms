// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { has, opArgs, type RecordedRequest } from '../../helpers/recordingSupabase';

/**
 * EC-V7 (GENERA fixes F18 build D): a feed post with files is written only
 * after every file is in the `post-media` store, and one composition id makes
 * at most one post. The database client and the file store are fakes;
 * synthetic ids, names and text only.
 */

const fake = vi.hoisted(() => ({ ref: null as any, store: null as any }));
vi.mock('../../../lib/supabase-wrapper', async () => {
  const { createRecordingSupabase } = await import('../../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  const store = {
    uploads: [] as Array<{ bucket: string; path: string; name: string }>,
    /** path → the store's answer for an upload of that path (default: stored). */
    answers: {} as Record<string, { data: unknown; error: unknown }>,
  };
  fake.store = store;
  fake.ref.client.storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: File) => {
        store.uploads.push({ bucket, path, name: file.name });
        return store.answers[path] ?? { data: { path, id: `obj-${path}`, fullPath: `${bucket}/${path}` }, error: null };
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.invalid/${bucket}/${path}` } }),
    }),
  };
  return { supabase: fake.ref.client };
});
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { FeedService } from '../../../lib/services/feedService';

const SELF = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const COMPOSITION = '66666666-6666-4666-8666-666666666666';

type Answer = { data: unknown; error: unknown };
const db = fake.ref.state as {
  requests: RecordedRequest[];
  respond: (req: RecordedRequest, terminal: string) => Answer;
  userId: string | null;
};
const store = fake.store as {
  uploads: Array<{ bucket: string; path: string; name: string }>;
  answers: Record<string, Answer>;
};

/** What the fake database answers; each test overrides what it needs. */
let world: {
  postInsert: (row: Record<string, unknown>) => Answer;
  existingPost: Record<string, unknown> | null;
  existingMedia: Array<{ order_index: number }>;
  mediaInsert: Answer;
  /** The answer to `delete().eq(...).select('id')` on community_posts (the removed rows). */
  postDelete: Answer;
};

function install() {
  db.respond = (req, terminal) => {
    if (req.kind === 'rpc') return { data: true, error: null };
    if (req.target === 'community_posts' && has(req, 'insert')) {
      return world.postInsert((opArgs(req, 'insert')?.[0] ?? {}) as Record<string, unknown>);
    }
    if (req.target === 'community_posts' && has(req, 'delete')) return world.postDelete;
    if (req.target === 'community_posts') return { data: world.existingPost, error: null };
    if (req.target === 'post_media' && has(req, 'insert')) return world.mediaInsert;
    if (req.target === 'post_media') return { data: world.existingMedia, error: null };
    if (terminal === 'await') return { data: [], error: null };
    return { data: null, error: null };
  };
}

const posted = (row: Record<string, unknown>): Answer => ({ data: { ...row, created_at: '2026-11-19T10:00:00Z' }, error: null });
const postInserts = () => db.requests.filter((r) => r.target === 'community_posts' && has(r, 'insert'));
const postDeletes = () => db.requests.filter((r) => r.target === 'community_posts' && has(r, 'delete'));
const mediaInserts = () => db.requests.filter((r) => r.target === 'post_media' && has(r, 'insert'));
const insertedMediaRows = () => mediaInserts().flatMap((r) => (opArgs(r, 'insert')?.[0] ?? []) as Array<Record<string, unknown>>);

const image = (name: string) => new File(['synthetic-bytes'], name, { type: 'image/png' });
const doc = (name: string) => new File(['synthetic-bytes'], name, { type: 'application/pdf' });
const STORE_ERROR = { name: 'StorageApiError', message: 'SYNTHETIC upstream storage failure', status: 500, statusCode: '500' };
const DUPLICATE = { name: 'StorageApiError', message: 'The resource already exists', status: 409, statusCode: '409' };

beforeEach(() => {
  db.requests.length = 0;
  db.userId = SELF;
  store.uploads.length = 0;
  store.answers = {};
  world = { postInsert: posted, existingPost: null, existingMedia: [], mediaInsert: { data: null, error: null }, postDelete: { data: [{ id: COMPOSITION }], error: null } };
  install();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('FeedService.createPost — files first, one post per composition (EC-V7)', () => {
  it('(1) one image whose upload fails: no post row, and a Spanish error naming the file', async () => {
    store.answers[`${COMPOSITION}/0.png`] = { data: null, error: STORE_ERROR };
    const input = { type: 'image' as const, content: { text: 'Foto del taller' }, media: [image('taller.png')] };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('No se pudo subir «taller.png». La publicación no se guardó; inténtalo de nuevo.');
    expect(postInserts()).toHaveLength(0);
    expect(mediaInserts()).toHaveLength(0);
  });

  it('(2) two files, the second upload fails: no post, no post_media row', async () => {
    store.answers[`${COMPOSITION}/1.pdf`] = { data: null, error: STORE_ERROR };
    const input = { type: 'document' as const, content: { text: 'Actas' }, media: [doc('acta-1.pdf'), doc('acta-2.pdf')] };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error.message).toBe('No se pudo subir «acta-2.pdf». La publicación no se guardó; inténtalo de nuevo.');
    expect(store.uploads.map((u) => u.path).sort()).toEqual([`${COMPOSITION}/0.pdf`, `${COMPOSITION}/1.pdf`]);
    expect(postInserts()).toHaveLength(0);
    expect(mediaInserts()).toHaveLength(0);
  });

  it('(3) the same composition again, index 0 already in the store: ONE post with that id and two media rows', async () => {
    store.answers[`${COMPOSITION}/0.pdf`] = { data: null, error: DUPLICATE };
    const input = { type: 'document' as const, content: { text: 'Actas' }, media: [doc('acta-1.pdf'), doc('acta-2.pdf')] };

    const post = await FeedService.createPost(WORKSPACE, input, COMPOSITION);

    expect(post.id).toBe(COMPOSITION);
    expect(postInserts()).toHaveLength(1);
    expect((opArgs(postInserts()[0], 'insert')?.[0] as Record<string, unknown>).id).toBe(COMPOSITION);
    const rows = insertedMediaRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.order_index, r.storage_path, r.post_id])).toEqual([
      [0, `${COMPOSITION}/0.pdf`, COMPOSITION],
      [1, `${COMPOSITION}/1.pdf`, COMPOSITION],
    ]);
    expect((rows[0].metadata as Record<string, unknown>).name).toBe('acta-1.pdf');
  });

  it('every upload happens before the post is inserted', async () => {
    const order: string[] = [];
    world.postInsert = (row) => {
      order.push(`post:${store.uploads.length}`);
      return posted(row);
    };
    const input = { type: 'image' as const, content: { text: 'Dos fotos' }, media: [image('a.png'), image('b.png')] };

    await FeedService.createPost(WORKSPACE, input, COMPOSITION);

    expect(order).toEqual(['post:2']);
  });

  it('a refusal that is not the store\'s "already exists" answer is not treated as uploaded', async () => {
    store.answers[`${COMPOSITION}/0.png`] = {
      data: null,
      error: { name: 'StorageApiError', message: 'new row violates row-level security policy', status: 403, statusCode: '403' },
    };
    const input = { type: 'image' as const, content: { text: 'Foto' }, media: [image('foto.png')] };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error.message).toBe('No se pudo subir «foto.png». La publicación no se guardó; inténtalo de nuevo.');
    expect(postInserts()).toHaveLength(0);
  });

  it('(4) the uploads work but the post_media insert fails: the post is deleted again by its id and a Spanish error is thrown', async () => {
    world.mediaInsert = { data: null, error: { code: '42501', message: 'SYNTHETIC permission denied for post_media' } };
    const input = { type: 'image' as const, content: { text: 'Foto' }, media: [image('foto.png')] };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error.message).toBe('No se pudo guardar la publicación con sus archivos. Inténtalo de nuevo.');
    expect(postDeletes()).toHaveLength(1);
    expect(postDeletes()[0].ops.filter((o) => o.method === 'eq').map((o) => o.args)).toContainEqual(['id', COMPOSITION]);
  });

  describe('send-back 2: the removal after a failed post_media insert is checked', () => {
    const SAVED_WITHOUT_FILES = 'La publicación se guardó sin sus archivos. Elimínala desde el feed e inténtalo de nuevo.';
    const input = () => ({ type: 'image' as const, content: { text: 'Foto' }, media: [image('foto.png')] });
    beforeEach(() => {
      world.mediaInsert = { data: null, error: { code: '42501', message: 'SYNTHETIC permission denied for post_media' } };
    });

    it('the delete returns an error: the person is told the post was saved without its files', async () => {
      world.postDelete = { data: null, error: { code: 'XX000', message: 'SYNTHETIC delete failure' } };

      const error = await FeedService.createPost(WORKSPACE, input(), COMPOSITION).catch((e) => e);

      expect(error.message).toBe(SAVED_WITHOUT_FILES);
      expect(error.compositionFinished).toBe(true);
      expect(postDeletes()).toHaveLength(1);
    });

    it('the delete removes no row: the same sentence', async () => {
      world.postDelete = { data: [], error: null };

      const error = await FeedService.createPost(WORKSPACE, input(), COMPOSITION).catch((e) => e);

      expect(error.message).toBe(SAVED_WITHOUT_FILES);
      expect(error.compositionFinished).toBe(true);
      expect(postDeletes()[0].ops.some((o) => o.method === 'select')).toBe(true);
    });

    it('the delete works (one row back): the existing sentence, and the composition is not finished', async () => {
      const error = await FeedService.createPost(WORKSPACE, input(), COMPOSITION).catch((e) => e);

      expect(error.message).toBe('No se pudo guardar la publicación con sus archivos. Inténtalo de nuevo.');
      expect(error.compositionFinished).not.toBe(true);
    });
  });

  it('(5) the post insert answers a duplicate key for the composition id: already published, no second insert, media rows not doubled', async () => {
    world.postInsert = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "community_posts_pkey"' } });
    world.existingPost = { id: COMPOSITION, author_id: SELF, workspace_id: WORKSPACE, type: 'document', content: { text: 'Actas' } };
    world.existingMedia = [{ order_index: 0 }];
    store.answers[`${COMPOSITION}/0.pdf`] = { data: null, error: DUPLICATE };
    store.answers[`${COMPOSITION}/1.pdf`] = { data: null, error: DUPLICATE };
    const input = { type: 'document' as const, content: { text: 'Actas' }, media: [doc('acta-1.pdf'), doc('acta-2.pdf')] };

    const post = await FeedService.createPost(WORKSPACE, input, COMPOSITION);

    expect(post.id).toBe(COMPOSITION);
    expect(postInserts()).toHaveLength(1);
    expect(postDeletes()).toHaveLength(0);
    expect(insertedMediaRows().map((r) => r.order_index)).toEqual([1]);
    const lookup = db.requests.find((r) => r.target === 'community_posts' && !has(r, 'insert'));
    const filters = lookup!.ops.filter((o) => o.method === 'eq').map((o) => o.args);
    expect(filters).toEqual(expect.arrayContaining([['id', COMPOSITION], ['author_id', SELF], ['workspace_id', WORKSPACE]]));
  });

  it('a duplicate key whose row is not the caller\'s own post in this workspace is refused in Spanish', async () => {
    world.postInsert = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    world.existingPost = null;
    const input = { type: 'text' as const, content: { text: 'Hola' } };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error.message).toBe('No se pudo publicar. Inténtalo de nuevo.');
    expect(mediaInserts()).toHaveLength(0);
  });

  it('(6) a text post: one insert, no upload, as today (and an id is made when none is given)', async () => {
    const input = { type: 'text' as const, content: { text: 'Solo texto' } };

    const post = await FeedService.createPost(WORKSPACE, input);

    expect(store.uploads).toHaveLength(0);
    expect(postInserts()).toHaveLength(1);
    expect(mediaInserts()).toHaveLength(0);
    const row = opArgs(postInserts()[0], 'insert')?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({ workspace_id: WORKSPACE, author_id: SELF, type: 'text', content: { text: 'Solo texto' }, visibility: 'community' });
    expect(String(row.id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.id).toBe(row.id);
  });

  it('(7) mentions and hashtags are written after the post exists, as today', async () => {
    const MENTIONED = '22222222-2222-4222-8222-222222222222';
    const input = { type: 'image' as const, content: { text: 'Hola' }, media: [image('foto.png')], mentions: [MENTIONED], hashtags: ['#Taller'] };

    await FeedService.createPost(WORKSPACE, input, COMPOSITION);

    const index = (target: string) => db.requests.findIndex((r) => r.target === target && has(r, 'insert'));
    expect(index('community_posts')).toBeGreaterThanOrEqual(0);
    expect(index('post_hashtags')).toBeGreaterThan(index('community_posts'));
    expect(index('post_mentions')).toBeGreaterThan(index('community_posts'));
    expect(opArgs(db.requests[index('post_hashtags')], 'insert')?.[0]).toEqual([{ post_id: COMPOSITION, hashtag: 'taller' }]);
    expect(opArgs(db.requests[index('post_mentions')], 'insert')?.[0]).toEqual([{ post_id: COMPOSITION, mentioned_user_id: MENTIONED }]);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({ discussion_id: COMPOSITION });
  });

  it('the community check still comes first: no upload and no post when the person may not post here', async () => {
    db.respond = (req) => (req.kind === 'rpc' ? { data: false, error: null } : { data: null, error: null });
    const input = { type: 'image' as const, content: { text: 'Foto' }, media: [image('foto.png')] };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error.message).toBe('No tienes permisos para publicar en esta comunidad. Verifica que estés asignado a la comunidad.');
    expect(store.uploads).toHaveLength(0);
    expect(postInserts()).toHaveLength(0);
  });

  it('a raw database error on the post insert reaches the person as a Spanish sentence', async () => {
    world.postInsert = () => ({ data: null, error: { code: 'XX000', message: 'SYNTHETIC internal error text' } });
    const input = { type: 'text' as const, content: { text: 'Hola' } };

    const error = await FeedService.createPost(WORKSPACE, input, COMPOSITION).catch((e) => e);

    expect(error.message).toBe('No se pudo publicar. Inténtalo de nuevo.');
  });
});
