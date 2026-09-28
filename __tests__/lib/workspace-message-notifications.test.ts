// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * N2-03: workspace message mention and reply bells through
 * `notifyWorkspaceMessage` and the real `NotificationService`. The database is
 * an in-memory fake (also behind the service's own client) that enforces the
 * real `unique_notification_idempotency_key`. Synthetic ids and text only.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const db = vi.hoisted(() => ({
  messages: {} as Record<string, Record<string, any>>,
  threads: {} as Record<string, Record<string, any>>,
  mentions: [] as Array<Record<string, any>>,
  profiles: {} as Record<string, Record<string, any>>,
  members: new Set<string>(),
  bells: [] as Array<Record<string, any>>,
  writes: [] as string[],
  faults: {} as Record<string, number>,
}));

vi.mock('@supabase/supabase-js', () => {
  // A fault named `table.op` (or `rpc.fn`) answers with an error that many times.
  const fault = (key: string) => {
    if (!db.faults[key]) return null;
    db.faults[key]--;
    return { code: 'XX000', message: 'SYNTHETIC-RAW-DB-ERROR' };
  };
  const answer = (table: string, op: string, columns: string | undefined, payload: any, filters: Array<[string, any]>) => {
    const error = fault(`${table}.${op}`);
    if (error) return { data: null, error };
    const eq = (column: string) => filters.find(([c]) => c === column)?.[1];
    if (op === 'insert') db.writes.push(table);
    switch (table) {
      case 'community_messages':
        return { data: db.messages[eq('id')] ?? null, error: null };
      case 'message_threads':
        return { data: db.threads[eq('id')] ?? null, error: null };
      case 'message_mentions':
        if (op === 'insert') {
          db.mentions.push(...payload);
          return { data: null, error: null };
        }
        return { data: db.mentions.filter((m) => m.message_id === eq('message_id')), error: null };
      case 'profiles': {
        const ids: string[] = filters.find(([c]) => c === 'in:id')?.[1] ?? [eq('id')];
        const rows = ids.filter((id) => db.profiles[id]).map((id) => ({ id, ...db.profiles[id] }));
        return { data: filters.some(([c]) => c === 'in:id') ? rows : rows[0] ?? null, error: null };
      }
      case 'user_notifications':
        if (op !== 'insert') return { data: [], error: null };
        if (db.bells.some((row) => row.idempotency_key === payload.idempotency_key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "unique_notification_idempotency_key"' } };
        }
        db.bells.push(payload);
        return { data: { id: `bell-${db.bells.length}`, ...payload }, error: null };
      default:
        return { data: op === 'select' && columns === undefined ? [] : null, error: null };
    }
  };
  const from = (table: string) => {
    let op = 'select';
    let columns: string | undefined;
    let payload: any;
    const filters: Array<[string, any]> = [];
    const done = () => Promise.resolve(answer(table, op, columns, payload, filters));
    const builder: any = {
      select: (c?: string) => ((columns = op === 'insert' ? columns : c), builder),
      insert: (p: unknown) => ((op = 'insert'), (payload = p), builder),
      eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
      in: (c: string, v: unknown) => (filters.push([`in:${c}`, v]), builder),
      not: () => builder,
      gte: () => builder,
      limit: () => builder,
      order: () => builder,
      single: done,
      maybeSingle: done,
      then: (resolve: any, reject: any) => done().then(resolve, reject),
    };
    return builder;
  };
  const client = {
    from,
    rpc: (fn: string, args: Record<string, any>) => {
      const error = fault(`rpc.${fn}`);
      if (error) return Promise.resolve({ data: null, error });
      if (fn === 'can_access_workspace') {
        return Promise.resolve({ data: args.p_workspace_id === 'aaaaaaaa-0000-4000-8000-00000000000a' && db.members.has(args.p_user_id), error: null });
      }
      return Promise.resolve({ data: fn === 'get_active_triggers' ? [] : null, error: null });
    },
  };
  return { createClient: () => client };
});

import { createClient } from '@supabase/supabase-js';
import NotificationService from '../../lib/notificationService';
import { MENTION_COPY, REPLY_COPY, notifyWorkspaceMessage } from '../../lib/services/workspace-message-notifications';

const WORKSPACE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_WORKSPACE = 'aaaaaaaa-0000-4000-8000-00000000000b';
const THREAD = 'bbbbbbbb-0000-4000-8000-00000000000a';
const OTHER_THREAD = 'bbbbbbbb-0000-4000-8000-00000000000b';
const PARENT = 'cccccccc-0000-4000-8000-00000000000a';
const MESSAGE = 'cccccccc-0000-4000-8000-00000000000b';
const AUTHOR = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const REPLIED = '33333333-3333-4333-8333-333333333333';
const INACTIVE = '44444444-4444-4444-8444-444444444444';
const UNMENTIONED = '55555555-5555-4555-8555-555555555555';
const BODY = 'SYNTHETIC-PRIVATE-BODY';
const THREAD_URL = `/community/workspace?section=messaging&thread=${THREAD}`;

const client = createClient('http://fake', 'fake');
let logs: ReturnType<typeof vi.spyOn>[];

function seed(content = `${BODY} @Miembro_Uno @Autora_Replicada @Persona_Inactiva`) {
  Object.assign(db, { mentions: [], bells: [], writes: [], faults: {}, members: new Set([AUTHOR, MEMBER, REPLIED]) });
  db.threads = { [THREAD]: { id: THREAD, workspace_id: WORKSPACE }, [OTHER_THREAD]: { id: OTHER_THREAD, workspace_id: WORKSPACE } };
  db.messages = {
    [PARENT]: { id: PARENT, workspace_id: WORKSPACE, thread_id: THREAD, reply_to_id: null, author_id: REPLIED, content: 'padre', is_deleted: false },
    [MESSAGE]: { id: MESSAGE, workspace_id: WORKSPACE, thread_id: THREAD, reply_to_id: PARENT, author_id: AUTHOR, content, is_deleted: false },
  };
  db.profiles = {
    [AUTHOR]: { first_name: 'Autora', last_name: 'Sintetica', email: 'autora@qa.local.test' },
    [MEMBER]: { first_name: 'Miembro', last_name: 'Uno', email: 'miembro@qa.local.test' },
    [REPLIED]: { first_name: 'Autora', last_name: 'Replicada', email: 'replicada@qa.local.test' },
    [INACTIVE]: { first_name: 'Persona', last_name: 'Inactiva', email: 'inactiva@qa.local.test' },
    [UNMENTIONED]: { first_name: 'Sin', last_name: 'Mencion', email: 'sin-mencion@qa.local.test' },
  };
}

const notify = (mentionedUserIds: string[] = [MEMBER, REPLIED, INACTIVE]) =>
  notifyWorkspaceMessage(client as any, AUTHOR, { messageId: MESSAGE, workspaceId: WORKSPACE, mentionedUserIds });
const bellsFor = (id: string) => db.bells.filter((b) => b.user_id === id);
const loggedText = () => logs.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args)).join('\n');

beforeEach(() => {
  seed();
  process.env.NOTIFICATION_EMAIL_ENABLED = 'false';
  logs = (['log', 'warn', 'error'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NOTIFICATION_EMAIL_ENABLED;
});

describe('D1 · a persisted reply that mentions a member', () => {
  it('D1: the mentioned member and the replied-to author each get one generic bell linking to the thread; nothing legacy is written', async () => {
    const outcome = await notify();

    expect(outcome).toEqual({ status: 200, body: { success: true, notified: 2 } });
    expect(bellsFor(MEMBER)).toEqual([
      expect.objectContaining({ title: 'Autora Sintetica te ha mencionado', description: MENTION_COPY, related_url: THREAD_URL, category: 'community' }),
    ]);
    expect(bellsFor(REPLIED)).toEqual([
      expect.objectContaining({ title: 'Mensaje de Autora Sintetica', description: REPLY_COPY, related_url: THREAD_URL, category: 'community' }),
    ]);
    expect(db.mentions.map((m) => [m.message_id, m.mentioned_user_id, m.mention_text])).toEqual([
      [MESSAGE, MEMBER, '@Miembro_Uno'],
      [MESSAGE, REPLIED, '@Autora_Replicada'],
    ]);
    expect(db.writes).not.toContain('notifications');
    expect(JSON.stringify(db.bells)).not.toContain(BODY);
  });
});

describe('D3 · reconciliation by message id', () => {
  it('D3: processing the same message twice creates no duplicate bell or mention row', async () => {
    await notify();
    const second = await notify();

    expect(second).toEqual({ status: 200, body: { success: true, notified: 2 } });
    expect(db.bells).toHaveLength(2);
    expect(db.mentions).toHaveLength(2);
  });

  it('D3: a failed first bell leaves the message saved and a repeat by message id alone fills only the missing bell', async () => {
    db.faults['user_notifications.insert'] = 1;
    const first = await notify();

    expect(first).toEqual({ status: 500, body: { error: 'No se pudieron crear todas las notificaciones' } });
    expect(db.messages[MESSAGE].is_deleted).toBe(false);
    expect(db.bells).toHaveLength(1);

    const retry = await notify([]);
    expect(retry.status).toBe(200);
    expect(bellsFor(MEMBER)).toHaveLength(1);
    expect(bellsFor(REPLIED)).toHaveLength(1);
    expect(db.bells).toHaveLength(2);
  });
});

describe('D4 · only the deduplicated authorized audience', () => {
  it('D4: self, duplicate, unwritten and inaccessible mentions add nothing; the replied-to author also mentioned gets one bell', async () => {
    db.members.add(UNMENTIONED);
    const outcome = await notify([AUTHOR, MEMBER, MEMBER.toUpperCase(), REPLIED, INACTIVE, UNMENTIONED]);

    expect(outcome).toEqual({ status: 200, body: { success: true, notified: 2 } });
    expect(bellsFor(AUTHOR)).toHaveLength(0);
    expect(bellsFor(MEMBER)).toHaveLength(1);
    expect(bellsFor(REPLIED).map((b) => b.description)).toEqual([REPLY_COPY]);
    expect(bellsFor(INACTIVE)).toHaveLength(0);
    expect(bellsFor(UNMENTIONED)).toHaveLength(0);
    expect(db.mentions.map((m) => m.mentioned_user_id)).toEqual([MEMBER, REPLIED]);
  });

  it('D4: a reply whose parent is in another thread notifies nobody', async () => {
    db.messages[PARENT].thread_id = OTHER_THREAD;

    expect(await notify()).toEqual({ status: 400, body: { error: 'La respuesta no corresponde a este hilo' } });
    expect(db.bells).toHaveLength(0);
    expect(db.mentions).toHaveLength(0);
  });

  it('D4: a reply to a missing parent notifies nobody', async () => {
    delete db.messages[PARENT];

    expect((await notify()).status).toBe(400);
    expect(db.bells).toHaveLength(0);
  });

  it('D4: a thread outside the message workspace notifies nobody', async () => {
    db.threads[THREAD].workspace_id = OTHER_WORKSPACE;

    expect(await notify()).toEqual({ status: 400, body: { error: 'El hilo del mensaje no es válido' } });
    expect(db.bells).toHaveLength(0);
  });

  it('D4: the replied-to author who left the community gets no bell; the mention still does', async () => {
    db.members.delete(REPLIED);

    expect(await notify()).toEqual({ status: 200, body: { success: true, notified: 1 } });
    expect(db.bells.map((b) => b.user_id)).toEqual([MEMBER]);
  });
});

describe('D5 · failures fail closed and leak nothing', () => {
  it('D5: an ambiguous recipient access check notifies nobody and records no mention', async () => {
    let calls = 0;
    const rpc = (client as any).rpc;
    vi.spyOn(client as any, 'rpc').mockImplementation((fn: any, args: any) =>
      fn === 'can_access_workspace' && ++calls === 2
        ? Promise.resolve({ data: null, error: { code: 'XX000', message: 'SYNTHETIC-RAW-DB-ERROR' } })
        : rpc(fn, args)
    );

    expect(await notify()).toEqual({ status: 500, body: { error: 'No se pudo verificar la membresía' } });
    expect(db.bells).toHaveLength(0);
    expect(db.mentions).toHaveLength(0);
  });

  it.each([
    ['community_messages.select', 'No se pudo verificar el mensaje'],
    ['message_mentions.select', 'No se pudo verificar las menciones'],
    ['message_mentions.insert', 'No se pudo registrar las menciones'],
  ])('D5: a failed %s read or write notifies nobody', async (fault, error) => {
    db.faults[fault] = 1;

    expect(await notify()).toEqual({ status: 500, body: { error } });
    expect(db.bells).toHaveLength(0);
  });

  it('D5: a provider failure keeps the bell; no body, address or raw error reaches a log or a bell', async () => {
    delete process.env.NOTIFICATION_EMAIL_ENABLED;
    const transport = vi.fn(async () => ({ data: null, error: { message: 'SYNTHETIC-PROVIDER-FAILURE' } }));
    const create = NotificationService.createNotification.bind(NotificationService);
    vi.spyOn(NotificationService, 'createNotification').mockImplementation((data: any) => create(data, { client: client as any, transport }));
    const outcome = await notify();

    expect(outcome.status).toBe(200);
    expect(transport).toHaveBeenCalled();
    expect(db.bells).toHaveLength(2);
    const text = loggedText() + JSON.stringify(db.bells);
    for (const secret of [BODY, 'qa.local.test', 'SYNTHETIC-PROVIDER-FAILURE', 'SYNTHETIC-RAW-DB-ERROR']) {
      expect(text).not.toContain(secret);
    }
  });
});
