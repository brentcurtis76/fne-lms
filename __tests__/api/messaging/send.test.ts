// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * /api/messaging/send, driven through the real handler. Replaced edges: the
 * caller's identity (getApiUser), the service-role database (an in-memory fake)
 * and notificationService.triggerNotification. Synthetic ids and text only.
 */

const SENDER = '11111111-1111-4111-8111-111111111111';
const RECIPIENT = '22222222-2222-4222-8222-222222222222';
const THREAD = '44444444-4444-4444-8444-444444444444';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const COMMUNITY_A = '66666666-6666-4666-8666-666666666666';
const COMMUNITY_B = '77777777-7777-4777-8777-777777777777';
const SECRET_BODY = 'SYNTHETIC-MESSAGE-BODY-do-not-leak';
const SECRET_SUBJECT = 'SYNTHETIC-SUBJECT-do-not-leak';
const RAW_DB_ERROR = 'relation "SYNTHETIC-INTERNAL-TABLE" permission denied';

type Role = { user_id: string; school_id: number | null; community_id: string | null };

const { state, fakeClient, mockGetApiUser, mockTrigger } = vi.hoisted(() => {
  type Query = {
    table: string;
    op: 'select' | 'insert' | 'update';
    columns?: string;
    payload?: any;
    filters: Array<[string, string, unknown]>;
  };
  const state = {
    activeRoles: [] as Role[],
    thread: null as Record<string, unknown> | null,
    workspaceMembers: new Set<string>(),
    profile: { first_name: 'Remitente', last_name: 'Sintético' } as Record<string, unknown> | null,
    mustChangePassword: false,
    faults: {} as Record<string, unknown>,
    writes: [] as Query[],
    roleQueries: [] as Query[],
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
      case 'user_roles': {
        state.roleQueries.push(q);
        const ids = (q.filters.find(([op, c]) => op === 'in' && c === 'user_id')?.[2] ?? []) as string[];
        return { data: state.activeRoles.filter((r) => ids.includes(r.user_id)), error: null };
      }
      case 'message_threads':
        return { data: state.thread, error: null };
      case 'workspace_messages':
        state.writes.push(q);
        if (q.op === 'insert') return { data: { id: 'message-1', recipient_id: q.payload.recipient_id }, error: null };
        return { data: null, error: null };
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
        update(payload: unknown) {
          q.op = 'update';
          q.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          q.filters.push(['eq', column, value]);
          return builder;
        },
        in(column: string, value: unknown) {
          q.filters.push(['in', column, value]);
          return builder;
        },
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
      if (fn !== 'can_access_message_thread') throw new Error(`fake supabase: unexpected rpc "${fn}"`);
      return { data: args.p_thread_id === THREAD && state.workspaceMembers.has(args.p_user_id), error: null };
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

import handler from '../../../pages/api/messaging/send';

let logged: string[] = [];

async function call(body: Record<string, unknown>, method: 'POST' | 'GET' = 'POST') {
  const { req, res } = createMocks({ method, body, headers: { authorization: 'Bearer synthetic-token' } });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getJSONData() };
}

const directBody = { recipient_id: RECIPIENT, content: SECRET_BODY };
const threadBody = { ...directBody, thread_id: THREAD };

const inserts = () => state.writes.filter((q) => q.op === 'insert');
const updates = () => state.writes.filter((q) => q.op === 'update');

function expectNothingWritten() {
  expect(state.writes).toHaveLength(0);
  expect(mockTrigger).not.toHaveBeenCalled();
}

function expectCleanOutput(...outputs: unknown[]) {
  const text = [...logged, ...outputs.map((o) => JSON.stringify(o))].join('\n');
  for (const secret of [SECRET_BODY, SECRET_SUBJECT, RAW_DB_ERROR, 'synthetic-token', RECIPIENT, 'SYNTHETIC-THROWN']) {
    expect(text).not.toContain(secret);
  }
}

beforeEach(() => {
  state.activeRoles = [
    { user_id: SENDER, school_id: 10, community_id: COMMUNITY_A },
    { user_id: RECIPIENT, school_id: 10, community_id: COMMUNITY_A },
  ];
  state.thread = { id: THREAD, workspace_id: WORKSPACE };
  state.workspaceMembers = new Set([SENDER, RECIPIENT]);
  state.profile = { first_name: 'Remitente', last_name: 'Sintético' };
  state.mustChangePassword = false;
  state.faults = {};
  state.writes = [];
  state.roleQueries = [];
  state.rpcCalls = [];
  mockGetApiUser.mockReset().mockResolvedValue({ user: { id: SENDER }, error: null });
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

describe('D1 · valid sender and recipient in the same scope', () => {
  it('saves a direct message and notifies the saved recipient with generic content', async () => {
    const res = await call(directBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Mensaje enviado', messageId: 'message-1', notificationSent: true });
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0].payload).toMatchObject({
      sender_id: SENDER,
      recipient_id: RECIPIENT,
      content: SECRET_BODY,
      subject: 'Mensaje directo',
      thread_id: null,
      context: 'direct_message',
      notification_sent: false,
    });
    expect(state.roleQueries[0].filters).toContainEqual(['eq', 'is_active', true]);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
    expect(mockTrigger).toHaveBeenCalledWith('message_sent', {
      message_id: 'message-1',
      sender_id: SENDER,
      recipient_id: RECIPIENT,
      sender_name: 'Remitente Sintético',
      content: 'Tienes un nuevo mensaje',
      context: 'direct_message',
    });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload).toEqual({ notification_sent: true });
    expect(updates()[0].filters).toContainEqual(['eq', 'id', 'message-1']);
    expectCleanOutput(res.body);
  });

  it('accepts a shared school when the users are in different communities', async () => {
    state.activeRoles = [
      { user_id: SENDER, school_id: 10, community_id: COMMUNITY_A },
      { user_id: RECIPIENT, school_id: 10, community_id: COMMUNITY_B },
    ];
    const res = await call(directBody);
    expect(res.status).toBe(200);
    expect(mockTrigger).toHaveBeenCalledTimes(1);
  });

  it('saves a thread message when both users can access the thread workspace', async () => {
    const res = await call(threadBody);
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual([
      { fn: 'can_access_message_thread', args: { p_user_id: SENDER, p_thread_id: THREAD } },
      { fn: 'can_access_message_thread', args: { p_user_id: RECIPIENT, p_thread_id: THREAD } },
    ]);
    expect(inserts()[0].payload).toMatchObject({ thread_id: THREAD, context: 'workspace_thread' });
    expect(mockTrigger.mock.calls[0][1]).toMatchObject({ recipient_id: RECIPIENT, context: 'workspace_thread' });
  });
});

describe('D2 · unauthenticated or out-of-scope recipient', () => {
  it('401 without a valid session', async () => {
    mockGetApiUser.mockResolvedValue({ user: null, error: new Error('Invalid token') });
    const res = await call(directBody);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Debes iniciar sesión' });
    expectNothingWritten();
  });

  it('holds a caller that must change their password', async () => {
    state.mustChangePassword = true;
    const res = await call(directBody);
    expect(res.status).toBe(403);
    expectNothingWritten();
  });

  it('403 for a recipient in another school and community', async () => {
    state.activeRoles = [
      { user_id: SENDER, school_id: 10, community_id: COMMUNITY_A },
      { user_id: RECIPIENT, school_id: 20, community_id: COMMUNITY_B },
    ];
    const res = await call(directBody);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No puedes enviar mensajes a este usuario' });
    expectNothingWritten();
  });

  it('403 for an inactive recipient (no active role)', async () => {
    state.activeRoles = [{ user_id: SENDER, school_id: 10, community_id: COMMUNITY_A }];
    const res = await call(directBody);
    expect(res.status).toBe(403);
    expectNothingWritten();
  });

  it('403 when the sender has no active scope of their own', async () => {
    state.activeRoles = [{ user_id: RECIPIENT, school_id: 10, community_id: COMMUNITY_A }];
    const res = await call(directBody);
    expect(res.status).toBe(403);
    expectNothingWritten();
  });

  it('403 when the recipient cannot access the thread workspace', async () => {
    state.workspaceMembers.delete(RECIPIENT);
    const res = await call(threadBody);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No puedes enviar mensajes a este usuario en esta conversación' });
    expectNothingWritten();
  });

  it('403 when the sender cannot access the thread workspace', async () => {
    state.workspaceMembers.delete(SENDER);
    const res = await call(threadBody);
    expect(res.status).toBe(403);
    expectNothingWritten();
  });

  it('404 for a thread that does not exist', async () => {
    state.thread = null;
    const res = await call(threadBody);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Conversación no encontrada' });
    expectNothingWritten();
  });
});

describe('D3 · malformed input and failed reads/writes', () => {
  it.each([
    ['missing recipient', { content: 'Hola' }, 'Destinatario inválido'],
    ['malformed recipient', { recipient_id: 'nope', content: 'Hola' }, 'Destinatario inválido'],
    ['empty content', { recipient_id: RECIPIENT, content: '   ' }, 'El mensaje no puede estar vacío'],
    ['non-string content', { recipient_id: RECIPIENT, content: { html: 'x' } }, 'El mensaje no puede estar vacío'],
    ['overlong subject', { ...directBody, subject: 'x'.repeat(256) }, 'Asunto inválido'],
    ['malformed thread', { ...directBody, thread_id: 'thread-1' }, 'Conversación inválida'],
  ])('400 for %s', async (_label, body, message) => {
    const res = await call(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
    expectNothingWritten();
  });

  it('405 for a non-POST method', async () => {
    const res = await call(directBody, 'GET');
    expect(res.status).toBe(405);
    expect(res.body).toEqual({ error: 'Método no permitido' });
  });

  it.each([
    ['user_roles.select', directBody, 'No se pudo verificar la membresía'],
    ['message_threads.select', threadBody, 'No se pudo verificar la conversación'],
    ['rpc.can_access_message_thread', threadBody, 'No se pudo verificar la membresía'],
    ['workspace_messages.insert', directBody, 'No se pudo enviar el mensaje'],
  ])('500 with a stable message when %s fails, without leaking the raw error', async (key, body, message) => {
    state.faults[key] = { message: RAW_DB_ERROR, details: `Key (recipient_id)=(${RECIPIENT})` };
    const res = await call(body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: message });
    expect(mockTrigger).not.toHaveBeenCalled();
    expect(updates()).toHaveLength(0);
    expectCleanOutput(res.body);
  });

  it('500 without leaking an unexpected exception', async () => {
    mockGetApiUser.mockRejectedValue(new Error('SYNTHETIC-THROWN synthetic-token'));
    const res = await call(directBody);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Error interno del servidor' });
    expectNothingWritten();
    expectCleanOutput(res.body);
  });
});

describe('D4 · forged context, subject and content', () => {
  it('derives context server-side and keeps subject and body out of the notification', async () => {
    const res = await call({
      ...directBody,
      subject: SECRET_SUBJECT,
      context: 'admin_broadcast',
      sender_name: 'Forged Name',
      related_url: 'https://evil.example',
    });
    expect(res.status).toBe(200);
    expect(inserts()[0].payload).toMatchObject({ subject: SECRET_SUBJECT, context: 'direct_message' });
    const [, eventData] = mockTrigger.mock.calls[0];
    expect(eventData.recipient_id).toBe(RECIPIENT);
    expect(eventData.context).toBe('direct_message');
    expect(eventData.content).toBe('Tienes un nuevo mensaje');
    for (const forged of [SECRET_BODY, SECRET_SUBJECT, 'admin_broadcast', 'Forged', 'evil.example']) {
      expect(JSON.stringify(eventData)).not.toContain(forged);
    }
    expectCleanOutput(res.body);
  });
});

describe('D5 · notification failure after a valid, authorized save', () => {
  it('keeps the message and leaves notification_sent false when the service reports failure', async () => {
    mockTrigger.mockResolvedValue({ success: false, error: RAW_DB_ERROR });
    const res = await call(directBody);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, messageId: 'message-1', notificationSent: false });
    expect(inserts()).toHaveLength(1);
    expect(updates()).toHaveLength(0);
    expectCleanOutput(res.body);
  });

  it('leaves notification_sent false when no notification row was created', async () => {
    mockTrigger.mockResolvedValue({ success: true, notificationsCreated: 0 });
    const res = await call(directBody);
    expect(res.status).toBe(200);
    expect(res.body.notificationSent).toBe(false);
    expect(updates()).toHaveLength(0);
  });

  it('keeps the message and does not log the exception when the service throws', async () => {
    mockTrigger.mockRejectedValue(new Error(`SYNTHETIC-THROWN ${SECRET_BODY}`));
    const res = await call(directBody);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, messageId: 'message-1', notificationSent: false });
    expect(updates()).toHaveLength(0);
    expectCleanOutput(res.body);
  });

  it('reports notificationSent=false when marking the message fails', async () => {
    state.faults['workspace_messages.update'] = { message: RAW_DB_ERROR };
    const res = await call(directBody);
    expect(res.status).toBe(200);
    expect(res.body.notificationSent).toBe(false);
    expectCleanOutput(res.body);
  });
});
