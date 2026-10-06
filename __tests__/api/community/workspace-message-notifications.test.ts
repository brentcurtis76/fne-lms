// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * /api/community/workspace-message-notifications, driven through the real
 * handler and the real service, and its browser caller `sendMessage`. Replaced
 * edges: the caller's identity (getApiUser), the service-role database (an
 * in-memory fake), notificationService.triggerNotification, the browser
 * Supabase client and fetch. Synthetic ids and text only.
 */

const WORKSPACE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_WORKSPACE = 'aaaaaaaa-0000-4000-8000-00000000000b';
const THREAD = 'bbbbbbbb-0000-4000-8000-00000000000a';
const PARENT = 'cccccccc-0000-4000-8000-00000000000a';
const MESSAGE = 'cccccccc-0000-4000-8000-00000000000b';
const MISSING = 'cccccccc-0000-4000-8000-00000000000c';
const AUTHOR = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const REPLIED = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const BODY = 'SYNTHETIC-PRIVATE-BODY';
const RAW_DB_ERROR = 'relation "SYNTHETIC-INTERNAL-TABLE" permission denied';

const { state, fakeClient, mockGetApiUser, mockTrigger } = vi.hoisted(() => {
  const state = {
    messages: {} as Record<string, Record<string, any>>,
    mentions: [] as Array<Record<string, any>>,
    members: new Set<string>(),
    mustChangePassword: false,
    faults: {} as Record<string, unknown>,
    writes: [] as string[],
  };
  const answer = (table: string, op: string, columns: string | undefined, payload: any, filters: Array<[string, any]>) => {
    const fault = state.faults[`${table}.${op}`];
    if (fault) return { data: null, error: fault };
    const eq = (column: string) => filters.find(([c]) => c === column)?.[1];
    if (op !== 'select') state.writes.push(`${table}.${op}`);
    switch (table) {
      case 'community_messages':
        return { data: state.messages[eq('id')] ?? null, error: null };
      case 'message_threads':
        return { data: eq('id') === THREAD ? { id: THREAD, workspace_id: WORKSPACE } : null, error: null };
      case 'message_mentions':
        if (op === 'insert') return state.mentions.push(...payload), { data: null, error: null };
        return { data: state.mentions.filter((m) => m.message_id === eq('message_id')), error: null };
      case 'profiles':
        if (columns === 'must_change_password') return { data: { must_change_password: state.mustChangePassword }, error: null };
        if (columns === 'first_name, last_name') return { data: { first_name: 'Autora', last_name: 'Sintetica' }, error: null };
        return {
          data: [
            { id: MEMBER, first_name: 'Miembro', last_name: 'Uno', email: null },
            { id: REPLIED, first_name: 'Autora', last_name: 'Replicada', email: null },
            { id: OUTSIDER, first_name: 'Persona', last_name: 'Externa', email: null },
          ].filter((p) => (filters.find(([c]) => c === 'in:id')?.[1] ?? []).includes(p.id)),
          error: null,
        };
      default:
        throw new Error(`fake supabase: unexpected table "${table}"`);
    }
  };
  const fakeClient = {
    from(table: string) {
      let op = 'select';
      let columns: string | undefined;
      let payload: any;
      const filters: Array<[string, any]> = [];
      const done = () => Promise.resolve(answer(table, op, columns, payload, filters));
      const builder: any = {
        select: (c?: string) => ((columns = op === 'select' ? c : columns), builder),
        insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
        eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
        in: (c: string, v: unknown) => (filters.push([`in:${c}`, v]), builder),
        maybeSingle: done,
        then: (resolve: any, reject: any) => done().then(resolve, reject),
      };
      return builder;
    },
    async rpc(fn: string, args: any) {
      const fault = state.faults[`rpc.${fn}`];
      if (fault) return { data: null, error: fault };
      return { data: args.p_thread_id === THREAD && state.members.has(args.p_user_id), error: null };
    },
  };
  return { state, fakeClient, mockGetApiUser: vi.fn(), mockTrigger: vi.fn() };
});

vi.mock('../../../lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api-auth')>();
  return { ...actual, getApiUser: mockGetApiUser, createServiceRoleClient: () => fakeClient };
});

vi.mock('../../../lib/notificationService', () => ({ default: { triggerNotification: mockTrigger } }));

// The workspace composer's browser client, for the sendMessage tests below.
const browser = vi.hoisted(() => {
  const browser = { session: true, writes: [] as Array<[string, any]> };
  const client = {
    auth: { getSession: async () => ({ data: { session: browser.session ? { access_token: 'synthetic-token' } : null } }) },
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        insert: (payload: unknown) => (browser.writes.push([table, payload]), builder),
        update: (payload: unknown) => (browser.writes.push([table, payload]), builder),
        single: async () =>
          table === 'profiles'
            ? { data: { first_name: 'Autora', last_name: 'Sintetica', email: 'autora@qa.local.test' }, error: null }
            : { data: { id: MESSAGE, created_at: '2026-09-28T00:00:00Z' }, error: null },
        then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
      };
      return builder;
    },
  };
  return Object.assign(browser, { client });
});

vi.mock('../../../lib/supabase-wrapper', () => ({ supabase: browser.client }));

import handler from '../../../pages/api/community/workspace-message-notifications';
import { getThreadCommunityId, sendMessage } from '../../../utils/messagingUtils-simple';
import { MENTION_COPY, REPLY_COPY } from '../../../lib/services/workspace-message-notifications';

let logged: string[] = [];

async function call(body: Record<string, unknown>, method: 'POST' | 'GET' = 'POST') {
  const { req, res } = createMocks({ method, body, headers: { authorization: 'Bearer synthetic-token' } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

const validBody = { message_id: MESSAGE, workspace_id: WORKSPACE, mentioned_user_ids: [MEMBER] };

function expectNoBell() {
  expect(mockTrigger).not.toHaveBeenCalled();
  expect(state.writes).toEqual([]);
}

function expectCleanOutput(...outputs: unknown[]) {
  const text = [...logged, ...outputs.map((o) => JSON.stringify(o))].join('\n');
  for (const secret of [BODY, RAW_DB_ERROR, 'synthetic-token', MEMBER, REPLIED, 'SYNTHETIC-THROWN']) {
    expect(text).not.toContain(secret);
  }
}

beforeEach(() => {
  state.messages = {
    [PARENT]: { id: PARENT, workspace_id: WORKSPACE, thread_id: THREAD, reply_to_id: null, author_id: REPLIED, content: 'padre', is_deleted: false },
    [MESSAGE]: { id: MESSAGE, workspace_id: WORKSPACE, thread_id: THREAD, reply_to_id: PARENT, author_id: AUTHOR, content: `${BODY} @Miembro_Uno`, is_deleted: false },
  };
  state.mentions = [];
  state.members = new Set([AUTHOR, MEMBER, REPLIED]);
  state.mustChangePassword = false;
  state.faults = {};
  state.writes = [];
  browser.session = true;
  browser.writes = [];
  mockGetApiUser.mockReset().mockResolvedValue({ user: { id: AUTHOR }, error: null });
  mockTrigger.mockReset().mockResolvedValue({ success: true, notificationsCreated: 1 });
  logged = [];
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('D1 · the author of a saved reply that mentions a member', () => {
  it('D1: notifies the verified mention and the replied-to author with server-derived, generic payloads; caller extras are ignored', async () => {
    const { status, body } = await call({ ...validBody, author_name: 'NOMBRE-FALSO', content: BODY, recipients: [AUTHOR] });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, notified: 2 });
    const context = { message_id: MESSAGE, thread_id: THREAD, workspace_id: WORKSPACE };
    expect(mockTrigger.mock.calls).toEqual([
      ['message_sent', { ...context, recipient_id: REPLIED, sender_name: 'Autora Sintetica', content: REPLY_COPY }],
      ['user_mentioned', { ...context, mentioned_user_id: MEMBER, author_name: 'Autora Sintetica', content_preview: MENTION_COPY }],
    ]);
    expect(state.mentions).toEqual([{ message_id: MESSAGE, mentioned_user_id: MEMBER, mention_text: '@Miembro_Uno' }]);
    expectCleanOutput(body);
  });
});

describe('D2 · anonymous, foreign or forged requests', () => {
  it('D2: 405 for a method other than POST', async () => {
    expect((await call(validBody, 'GET')).status).toBe(405);
    expectNoBell();
  });

  it('D2: 401 without a valid session', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('Invalid token') });
    expect(await call(validBody)).toEqual({ status: 401, body: { error: 'Debes iniciar sesión' } });
    expectNoBell();
  });

  it('D2: holds a caller that must change their password', async () => {
    state.mustChangePassword = true;
    expect((await call(validBody)).status).toBe(403);
    expectNoBell();
  });

  it.each([
    ['a missing message id', { workspace_id: WORKSPACE }],
    ['a non-UUID message id', { ...validBody, message_id: 'not-a-uuid' }],
    ['a non-UUID workspace id', { ...validBody, workspace_id: '1 OR 1=1' }],
    ['mentions that are not a list', { ...validBody, mentioned_user_ids: MEMBER }],
    ['a non-UUID mention', { ...validBody, mentioned_user_ids: ['@Miembro_Uno'] }],
    ['more than 50 mentions', { ...validBody, mentioned_user_ids: Array(51).fill(MEMBER) }],
  ])('D2: 400 for %s', async (_label, body) => {
    expect(await call(body)).toEqual({ status: 400, body: { error: 'Identificadores inválidos' } });
    expectNoBell();
  });

  it('D2: 403 for a community member who did not write the message (forged actor)', async () => {
    mockGetApiUser.mockResolvedValue({ user: { id: MEMBER }, error: null });
    expect(await call(validBody)).toEqual({ status: 403, body: { error: 'Solo el autor del mensaje puede notificar' } });
    expectNoBell();
  });

  it('D2: 403 when the author no longer has access to the workspace', async () => {
    state.members.delete(AUTHOR);
    expect(await call(validBody)).toEqual({ status: 403, body: { error: 'No tienes acceso a este espacio' } });
    expectNoBell();
  });

  it('D2: 400 for a real message sent with another workspace id', async () => {
    expect(await call({ ...validBody, workspace_id: OTHER_WORKSPACE })).toEqual({ status: 400, body: { error: 'El mensaje no pertenece a este espacio' } });
    expectNoBell();
  });

  it.each([
    ['a missing message', () => ({ ...validBody, message_id: MISSING })],
    ['a deleted message', () => ((state.messages[MESSAGE].is_deleted = true), validBody)],
  ])('D2: 404 for %s, without its text', async (_label, body) => {
    const response = await call(body());
    expect(response).toEqual({ status: 404, body: { error: 'Mensaje no encontrado' } });
    expectNoBell();
    expectCleanOutput(response);
  });

  it('D2: a mention of someone outside the community is dropped, not notified', async () => {
    state.messages[MESSAGE].content = `${BODY} @Persona_Externa`;
    const { status, body } = await call({ ...validBody, mentioned_user_ids: [OUTSIDER] });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, notified: 1 });
    expect(mockTrigger.mock.calls.map(([event, data]) => [event, data.recipient_id ?? data.mentioned_user_id])).toEqual([['message_sent', REPLIED]]);
    expect(state.mentions).toEqual([]);
  });
});

describe('D3 · repeats and failed bells after the message is saved', () => {
  it('D3: a repeat by message id alone re-derives the same audience from the recorded mention', async () => {
    await call(validBody);
    const first = mockTrigger.mock.calls.slice();
    mockTrigger.mockClear();

    const { status } = await call({ message_id: MESSAGE, workspace_id: WORKSPACE });

    expect(status).toBe(200);
    expect(mockTrigger.mock.calls).toEqual(first);
    expect(state.mentions).toHaveLength(1);
  });

  it.each([
    ['reports no bell', () => mockTrigger.mockResolvedValueOnce({ success: true, notificationsCreated: 0 })],
    ['fails', () => mockTrigger.mockResolvedValueOnce({ success: false, error: 'SYNTHETIC-THROWN' })],
    ['throws', () => mockTrigger.mockRejectedValueOnce(new Error('SYNTHETIC-THROWN'))],
  ])('D3: 500 when a trigger %s; the message and the other bell stay', async (_label, arrange) => {
    arrange();
    const response = await call(validBody);

    expect(response).toEqual({ status: 500, body: { error: 'No se pudieron crear todas las notificaciones' } });
    expect(mockTrigger).toHaveBeenCalledTimes(2);
    expect(state.messages[MESSAGE].is_deleted).toBe(false);
    expect(state.writes).toEqual(['message_mentions.insert']);
    expectCleanOutput(response);
  });
});

describe('D5 · database failures fail closed without leaking', () => {
  it.each([
    ['community_messages.select', 'No se pudo verificar el mensaje'],
    ['rpc.can_access_message_thread', 'No se pudo verificar la membresía'],
  ])('D5: 500 when %s fails', async (fault, error) => {
    state.faults[fault] = { code: '42501', message: RAW_DB_ERROR };
    const response = await call(validBody);
    expect(response).toEqual({ status: 500, body: { error } });
    expectNoBell();
    expectCleanOutput(response);
  });

  it('D5: an unexpected exception is a generic 500 without its text', async () => {
    mockGetApiUser.mockRejectedValue(new Error(`SYNTHETIC-THROWN ${RAW_DB_ERROR}`));
    const response = await call(validBody);
    expect(response).toEqual({ status: 500, body: { error: 'Error interno del servidor' } });
    expectNoBell();
    expectCleanOutput(response);
  });
});

describe('sendMessage (browser caller)', () => {
  const composed = { content: `${BODY} @Miembro_Uno`, thread_id: THREAD, reply_to_id: PARENT, mentions: [MEMBER] };

  it('D1: saves the message, then posts only the ids to the server route; nothing is written to the legacy table', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const sent = await sendMessage(WORKSPACE, composed, AUTHOR);

    expect(sent.id).toBe(MESSAGE);
    expect(fetchMock).toHaveBeenCalledWith('/api/community/workspace-message-notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-token' },
      body: JSON.stringify({ message_id: MESSAGE, workspace_id: WORKSPACE, mentioned_user_ids: [MEMBER] }),
    });
    expect(browser.writes.map(([table]) => table)).toEqual(['community_messages', 'message_threads']);
  });

  it.each([
    ['is rejected', async () => ({ ok: false, status: 500 })],
    ['cannot be reached', async () => Promise.reject(new Error('SYNTHETIC-THROWN'))],
  ])('D3/D5: the message stays sent when the notification request %s', async (_label, reply) => {
    vi.stubGlobal('fetch', vi.fn(reply));

    await expect(sendMessage(WORKSPACE, composed, AUTHOR)).resolves.toMatchObject({ id: MESSAGE });
    expect(browser.writes.map(([table]) => table)).toEqual(['community_messages', 'message_threads']);
    expectCleanOutput();
  });

  it('asks for nothing when the message neither mentions nor replies, or there is no session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await sendMessage(WORKSPACE, { content: 'hola', thread_id: THREAD }, AUTHOR);
    browser.session = false;
    await expect(sendMessage(WORKSPACE, composed, AUTHOR)).resolves.toMatchObject({ id: MESSAGE });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getThreadCommunityId (bell thread links)', () => {
  it('r2 D4: a thrown lookup error resolves to no community and logs only a fixed message', async () => {
    const leaked = 'Error: notif09-leak@qa.local.test Bearer synthetic-credential-r2';
    vi.spyOn(browser.client, 'from').mockImplementation(() => {
      throw new Error(leaked);
    });

    await expect(getThreadCommunityId(THREAD)).resolves.toBeNull();

    expect(logged).toEqual(['Thread community lookup failed']);
    for (const secret of ['notif09-leak@qa.local.test', 'synthetic-credential-r2', THREAD]) {
      expect(logged.join('\n')).not.toContain(secret);
    }
  });
});
