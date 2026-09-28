// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * /api/messaging/mention, driven through the real handler. Replaced edges: the
 * caller's identity (getApiUser), the service-role database (an in-memory fake)
 * and notificationService.triggerNotification. Synthetic ids and text only.
 */

const AUTHOR = '11111111-1111-4111-8111-111111111111';
const MENTIONED = '22222222-2222-4222-8222-222222222222';
const OUTSIDER = '33333333-3333-4333-8333-333333333333';
const POST = '44444444-4444-4444-8444-444444444444';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const SECRET_BODY = 'SYNTHETIC-POST-BODY-do-not-leak';
const RAW_DB_ERROR = 'relation "SYNTHETIC-INTERNAL-TABLE" permission denied';

const { state, fakeClient, mockGetApiUser, mockTrigger } = vi.hoisted(() => {
  type Query = {
    table: string;
    op: 'select' | 'insert' | 'update';
    columns?: string;
    payload?: any;
    filters: Array<[string, unknown]>;
  };
  const state = {
    post: null as Record<string, unknown> | null,
    postMentions: [] as Array<{ id: string }>,
    members: new Set<string>(),
    existingMentions: [] as Array<{ id: string }>,
    profile: { first_name: 'Autora', last_name: 'Sintética' } as Record<string, unknown> | null,
    mustChangePassword: false,
    faults: {} as Record<string, unknown>,
    inserts: [] as Query[],
    rpcCalls: [] as Array<{ fn: string; args: any }>,
  };

  function respond(q: Query): { data: unknown; error: unknown } {
    const fault = state.faults[`${q.table}.${q.op}`];
    if (fault) return { data: null, error: fault };
    switch (q.table) {
      case 'profiles':
        if (q.columns === 'must_change_password') {
          return { data: { must_change_password: state.mustChangePassword }, error: null };
        }
        return { data: state.profile, error: null };
      case 'community_posts':
        return { data: state.post, error: null };
      case 'post_mentions': {
        const forUser = q.filters.find(([c]) => c === 'mentioned_user_id')?.[1];
        return { data: forUser === MENTIONED ? state.postMentions : [], error: null };
      }
      case 'user_mentions':
        if (q.op === 'insert') {
          state.inserts.push(q);
          return { data: { id: 'mention-1' }, error: null };
        }
        return { data: state.existingMentions, error: null };
      default:
        throw new Error(`fake supabase: unexpected table "${q.table}"`);
    }
  }

  const fakeClient = {
    from(table: string) {
      const q: Query = { table, op: 'select', filters: [] };
      const resolve = () => Promise.resolve(respond(q));
      const builder: any = {
        select(columns?: string) {
          if (q.op === 'select') q.columns = columns;
          return builder;
        },
        insert(payload: unknown) {
          q.op = 'insert';
          q.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          q.filters.push([column, value]);
          return builder;
        },
        limit: () => builder,
        single: resolve,
        maybeSingle: resolve,
        then: (onFulfilled: any, onRejected?: any) => resolve().then(onFulfilled, onRejected),
      };
      return builder;
    },
    async rpc(fn: string, args: any) {
      state.rpcCalls.push({ fn, args });
      const fault = state.faults[`rpc.${fn}`];
      if (fault) return { data: null, error: fault };
      if (fn !== 'can_access_workspace') throw new Error(`fake supabase: unexpected rpc "${fn}"`);
      return { data: args.p_workspace_id === WORKSPACE && state.members.has(args.p_user_id), error: null };
    },
  };

  return { state, fakeClient, mockGetApiUser: vi.fn(), mockTrigger: vi.fn() };
});

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-auth')>();
  return { ...actual, getApiUser: mockGetApiUser, createServiceRoleClient: () => fakeClient };
});

vi.mock('../../../lib/notificationService', () => ({
  default: { triggerNotification: mockTrigger },
}));

// The feed composer's browser client, for the caller tests below.
const { browser, mockToastError } = vi.hoisted(() => {
  const browser = { session: true, mentionInserts: [] as unknown[] };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: '11111111-1111-4111-8111-111111111111' } } }),
      getSession: async () => ({
        data: { session: browser.session ? { access_token: 'synthetic-token' } : null },
      }),
    },
    rpc: async () => ({ data: true, error: null }),
    from(table: string) {
      const builder: any = {
        insert(payload: unknown) {
          if (table === 'post_mentions') {
            browser.mentionInserts.push(payload);
            return Promise.resolve({ error: null });
          }
          return builder;
        },
        select: () => builder,
        single: async () => ({
          data: { id: '44444444-4444-4444-8444-444444444444', workspace_id: '55555555-5555-4555-8555-555555555555' },
          error: null,
        }),
      };
      return builder;
    },
  };
  return { browser: Object.assign(browser, { client }), mockToastError: vi.fn() };
});

vi.mock('../../../lib/supabase-wrapper', () => ({ supabase: browser.client }));
vi.mock('react-hot-toast', () => ({ toast: { error: mockToastError } }));

import handler from '../../../pages/api/messaging/mention';
import { FeedService } from '../../../lib/services/feedService';

let logged: string[] = [];

async function call(body: Record<string, unknown>, method: 'POST' | 'GET' = 'POST') {
  const { req, res } = createMocks({ method, body, headers: { authorization: 'Bearer synthetic-token' } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

const validBody = { mentioned_user_id: MENTIONED, discussion_id: POST, context: 'community_post' };

function expectNothingWritten() {
  expect(state.inserts).toHaveLength(0);
  expect(mockTrigger).not.toHaveBeenCalled();
}

function expectCleanOutput(...outputs: unknown[]) {
  const text = [...logged, ...outputs.map((o) => JSON.stringify(o))].join('\n');
  for (const secret of [SECRET_BODY, RAW_DB_ERROR, 'synthetic-token', MENTIONED, 'SYNTHETIC-THROWN']) {
    expect(text).not.toContain(secret);
  }
}

beforeEach(() => {
  state.post = { id: POST, workspace_id: WORKSPACE, author_id: AUTHOR, is_archived: false };
  state.postMentions = [{ id: 'post-mention-1' }];
  state.members = new Set([AUTHOR, MENTIONED]);
  state.existingMentions = [];
  state.profile = { first_name: 'Autora', last_name: 'Sintética' };
  state.mustChangePassword = false;
  state.faults = {};
  state.inserts = [];
  state.rpcCalls = [];
  mockGetApiUser.mockReset().mockResolvedValue({ user: { id: AUTHOR }, error: null });
  mockTrigger.mockReset().mockResolvedValue({ success: true, notificationsCreated: 1 });
  logged = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('D1 · valid author and persisted mention', () => {
  it('saves the mention and notifies the persisted recipient with generic, server-derived content', async () => {
    const { status, body } = await call(validBody);

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, message: 'Mención registrada', mentionId: 'mention-1', notificationSent: true });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].payload).toEqual({
      author_id: AUTHOR,
      mentioned_user_id: MENTIONED,
      context: 'community_post',
      discussion_id: POST,
    });
    expect(state.rpcCalls).toEqual([
      { fn: 'can_access_workspace', args: { p_user_id: AUTHOR, p_workspace_id: WORKSPACE } },
      { fn: 'can_access_workspace', args: { p_user_id: MENTIONED, p_workspace_id: WORKSPACE } },
    ]);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockTrigger).toHaveBeenCalledWith('user_mentioned', {
      mention_id: 'mention-1',
      author_id: AUTHOR,
      mentioned_user_id: MENTIONED,
      author_name: 'Autora Sintética',
      context: 'community_post',
      discussion_id: POST,
      workspace_id: WORKSPACE,
      content_preview: 'Te mencionaron en una publicación',
    });
  });

  it('does not notify again for an already-recorded mention', async () => {
    state.existingMentions = [{ id: 'mention-0' }];
    const { status, body } = await call(validBody);
    expect(status).toBe(200);
    expect(body).toMatchObject({ success: true, mentionId: 'mention-0', notificationSent: false });
    expectNothingWritten();
  });
});

describe('D2 · unauthenticated, forged author, out-of-scope or nonmember recipient', () => {
  it('401 without a valid session', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('Invalid token') });
    const { status, body } = await call(validBody);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'Debes iniciar sesión' });
    expectNothingWritten();
  });

  it('holds a caller that must change their password', async () => {
    state.mustChangePassword = true;
    const { status } = await call(validBody);
    expect(status).toBe(403);
    expectNothingWritten();
  });

  it('403 when the caller is not the post author (forged author)', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: OUTSIDER }, error: null });
    state.members.add(OUTSIDER);
    const { status, body } = await call(validBody);
    expect(status).toBe(403);
    expect(body.error).toBe('Solo el autor de la publicación puede notificar sus menciones');
    expectNothingWritten();
  });

  it('403 when the author no longer has access to the post workspace', async () => {
    state.members.delete(AUTHOR);
    const { status, body } = await call(validBody);
    expect(status).toBe(403);
    expect(body.error).toBe('No tienes acceso a esta comunidad');
    expectNothingWritten();
  });

  it('403 when the mentioned user is inactive or outside the post community', async () => {
    state.members.delete(MENTIONED);
    const { status, body } = await call(validBody);
    expect(status).toBe(403);
    expect(body.error).toBe('El usuario mencionado no pertenece a esta comunidad');
    expectNothingWritten();
  });
});

describe('D3 · malformed input, absent records and failed reads/writes', () => {
  it.each([
    ['missing ids', {}],
    ['malformed mentioned_user_id', { ...validBody, mentioned_user_id: 'not-a-uuid' }],
    ['malformed discussion_id', { ...validBody, discussion_id: 42 }],
  ])('400 for %s', async (_label, body) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Identificadores de mención inválidos' });
    expectNothingWritten();
  });

  it('400 for an unsupported context', async () => {
    const res = await call({ ...validBody, context: 'admin_broadcast' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Tipo de mención no soportado' });
    expectNothingWritten();
  });

  it('405 for a non-POST method', async () => {
    const res = await call(validBody, 'GET');
    expect(res.status).toBe(405);
    expect(res.body).toEqual({ error: 'Método no permitido' });
  });

  it.each([
    ['absent', null],
    ['archived', { id: POST, workspace_id: WORKSPACE, author_id: AUTHOR, is_archived: true }],
  ])('404 for an %s post', async (_label, post) => {
    state.post = post;
    const res = await call(validBody);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Publicación no encontrada' });
    expectNothingWritten();
  });

  it.each([
    ['community_posts.select', 'No se pudo verificar la publicación'],
    ['post_mentions.select', 'No se pudo verificar la mención'],
    ['rpc.can_access_workspace', 'No se pudo verificar la membresía'],
    ['user_mentions.select', 'No se pudo registrar la mención'],
    ['user_mentions.insert', 'No se pudo registrar la mención'],
  ])('500 with a stable message when %s fails, without leaking the raw error', async (key, message) => {
    state.faults[key] = { message: RAW_DB_ERROR, details: `Key (id)=(${MENTIONED})` };
    const res = await call(validBody);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: message });
    expect(mockTrigger).not.toHaveBeenCalled();
    expectCleanOutput(res.body);
  });

  it('500 without leaking an unexpected exception', async () => {
    mockGetApiUser.mockRejectedValue(new Error('SYNTHETIC-THROWN synthetic-token'));
    const res = await call(validBody);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno del servidor' });
    expectNothingWritten();
    expectCleanOutput(res.body);
  });
});

describe('D4 · forged recipient, context and content after a valid save', () => {
  it('404 for a recipient with no persisted mention on the post, even inside the community', async () => {
    state.members.add(OUTSIDER);
    const res = await call({ ...validBody, mentioned_user_id: OUTSIDER });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Mención no encontrada' });
    expectNothingWritten();
  });

  it('ignores client preview, name and extra fields: the notification uses the generic template', async () => {
    const res = await call({
      ...validBody,
      content: SECRET_BODY,
      content_preview: SECRET_BODY,
      author_name: 'Forged Name',
      recipient_id: OUTSIDER,
      workspace_id: 'forged-workspace',
    });
    expect(res.status).toBe(200);
    const [, eventData] = mockTrigger.mock.calls[0];
    expect(eventData.mentioned_user_id).toBe(MENTIONED);
    expect(eventData.workspace_id).toBe(WORKSPACE);
    expect(eventData.content_preview).toBe('Te mencionaron en una publicación');
    expect(JSON.stringify(eventData)).not.toContain(SECRET_BODY);
    expect(JSON.stringify(eventData)).not.toContain('Forged');
    expect(JSON.stringify(eventData)).not.toContain(OUTSIDER);
    expect(JSON.stringify(state.inserts[0].payload)).not.toContain(SECRET_BODY);
    expectCleanOutput(res.body);
  });
});

describe('D5 · notification failure after a valid, authorized save', () => {
  it('keeps the save and reports notificationSent=false when the service reports failure', async () => {
    mockTrigger.mockResolvedValue({ success: false, error: RAW_DB_ERROR });
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, mentionId: 'mention-1', notificationSent: false });
    expect(state.inserts).toHaveLength(1);
    expectCleanOutput(res.body);
  });

  it('keeps the save and does not log the exception when the service throws', async () => {
    mockTrigger.mockRejectedValue(new Error(`SYNTHETIC-THROWN ${SECRET_BODY}`));
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, mentionId: 'mention-1', notificationSent: false });
    expectCleanOutput(res.body);
  });

  it('reports notificationSent=false when no notification row was created', async () => {
    mockTrigger.mockResolvedValue({ success: true, notificationsCreated: 0 });
    const res = await call(validBody);
    expect(res.status).toBe(200);
    expect(res.body.notificationSent).toBe(false);
  });
});

describe('UI2 · feed composer caller after the post is saved', () => {
  const SAVED_NOTICE = 'Tu publicación se guardó, pero no pudimos enviar la notificación de mención.';
  const postInput = { type: 'text' as const, content: { text: SECRET_BODY }, mentions: [MENTIONED] };

  beforeEach(() => {
    browser.session = true;
    browser.mentionInserts = [];
    mockToastError.mockReset();
    // The composer's fetch reaches the real mention handler.
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      expect(url).toBe('/api/messaging/mention');
      const res = await call(JSON.parse(init.body));
      return new Response(JSON.stringify(res.body), { status: res.status });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a fixed notice that the post was saved when the endpoint denies the mention (403)', async () => {
    state.members.delete(MENTIONED);
    const post = await FeedService.createPost(WORKSPACE, postInput);

    expect(post.id).toBe(POST);
    expect(browser.mentionInserts).toHaveLength(1);
    expectNothingWritten();
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(mockToastError).toHaveBeenCalledWith(SAVED_NOTICE, expect.any(Object));
    expect(logged.join('\n')).toContain('403');
    expectCleanOutput(mockToastError.mock.calls);
    expect(logged.join('\n')).not.toContain('El usuario mencionado no pertenece');
  });

  it('shows no notice when the mention is accepted and notified', async () => {
    const post = await FeedService.createPost(WORKSPACE, postInput);

    expect(post.id).toBe(POST);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
    expectCleanOutput();
  });

  it('keeps the post and shows the notice when the notification request throws', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error(`SYNTHETIC-THROWN ${RAW_DB_ERROR}`);
    });
    const post = await FeedService.createPost(WORKSPACE, postInput);

    expect(post.id).toBe(POST);
    expect(mockToastError).toHaveBeenCalledWith(SAVED_NOTICE, expect.any(Object));
    expectCleanOutput();
  });

  it('keeps the post and shows the notice when there is no session to notify with', async () => {
    browser.session = false;
    const post = await FeedService.createPost(WORKSPACE, postInput);

    expect(post.id).toBe(POST);
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(SAVED_NOTICE, expect.any(Object));
  });
});
