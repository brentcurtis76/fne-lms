// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Espacio Colaborativo conversations (GENERA fixes F11).
 *
 * The browser client of utils/messagingUtils-simple is a recording fake: every
 * request (`from(table)` chain or `rpc`) is logged with the methods it called,
 * and `h.respond` decides what the "database" answers. The answers model what
 * the local database answers a community member (supabase/tests/127).
 */

import { has, opArgs, selects, type RecordedRequest as Request } from '../helpers/recordingSupabase';

const fake = vi.hoisted(() => ({ ref: null as any }));

vi.mock('../../lib/supabase-wrapper', async () => {
  const { createRecordingSupabase } = await import('../helpers/recordingSupabase');
  fake.ref = createRecordingSupabase();
  return { supabase: fake.ref.client };
});

import {
  createThread,
  ThreadCreationIncompleteError,
  getWorkspaceThreads,
  getWorkspaceMessages,
  subscribeToWorkspaceMessages,
} from '../../utils/messagingUtils-simple';

const h = fake.ref.state as {
  requests: Request[];
  channels: Array<{ name: string; handlers: Array<{ filter: any; handler: (p: any) => unknown }>; unsubscribed: number }>;
  respond: (req: Request, terminal: string) => { data: unknown; error: unknown };
  userId: string | null;
};

const WS = '12700000-0000-4000-8000-0000000000b1';
const RLS_READ_REFUSAL = {
  code: '42501',
  message: 'new row violates row-level security policy "messaging_read_boundary" for table "message_threads"',
  details: null,
  hint: null,
};


/** The database as a member of the workspace sees it (see 127). */
function memberDatabase() {
  const threads = new Map<string, Record<string, unknown>>();
  h.respond = (req, terminal) => {
    if (req.kind === 'from' && req.target === 'message_threads' && has(req, 'insert')) {
      // INSERT … RETURNING is refused by messaging_read_boundary; a plain INSERT lives.
      if (has(req, 'select')) return { data: null, error: RLS_READ_REFUSAL };
      const row = { created_at: '2026-11-16T12:00:00.000Z', ...(opArgs(req, 'insert')?.[0] as Record<string, unknown>) };
      threads.set(String(row.id), row);
      return { data: null, error: null };
    }
    if (req.kind === 'from' && req.target === 'message_threads' && has(req, 'select')) {
      const id = (opArgs(req, 'eq') ?? [])[1];
      const row = threads.get(String(id)) ?? null;
      return terminal === 'await' ? { data: row ? [row] : [], error: null } : { data: row, error: row ? null : { code: 'PGRST116' } };
    }
    if (req.kind === 'from' && req.target === 'profiles') {
      return { data: { first_name: 'Ana', last_name: 'Uno', email: 'a1@f11.test.local' }, error: null };
    }
    return { data: null, error: null };
  };
  return threads;
}

beforeEach(() => {
  h.requests.length = 0;
  h.channels.length = 0;
  h.userId = 'user-a1';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('EC-S4 createThread', () => {
  it('creates a conversation for a member: plain insert with its own id, then a read by that id', async () => {
    const threads = memberDatabase();

    const thread = await createThread(
      WS,
      { thread_title: 'Planificación', description: 'd', category: 'general', initial_message: 'Hola' },
      'user-a1'
    );

    const inserts = h.requests.filter((r) => r.target === 'message_threads' && has(r, 'insert'));
    expect(inserts).toHaveLength(1);
    expect(has(inserts[0], 'select')).toBe(false);
    const inserted = opArgs(inserts[0], 'insert')?.[0] as Record<string, unknown>;
    expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(threads.has(String(inserted.id))).toBe(true);

    const read = h.requests.find((r) => r.target === 'message_threads' && !has(r, 'insert') && has(r, 'select'));
    expect(read && opArgs(read, 'eq')).toEqual(['id', inserted.id]);
    expect(thread.id).toBe(inserted.id);
    expect(thread.thread_title).toBe('Planificación');
    expect(thread.creator_name).toBe('Ana Uno');

    // The first message goes into the new conversation, without asking for the row back.
    const first = h.requests.find((r) => r.target === 'community_messages' && has(r, 'insert'));
    expect(first).toBeDefined();
    expect((opArgs(first!, 'insert')?.[0] as Record<string, unknown>).thread_id).toBe(inserted.id);
    expect(has(first!, 'select')).toBe(false);
  });

  it('stores the custom category name the form sends', async () => {
    memberDatabase();
    const thread = await createThread(
      WS,
      { thread_title: 'T', category: 'custom', custom_category_name: '  Mi categoría ', initial_message: 'Hola' },
      'user-a1'
    );
    const insert = h.requests.find((r) => r.target === 'message_threads' && has(r, 'insert'))!;
    expect((opArgs(insert, 'insert')?.[0] as Record<string, unknown>).custom_category_name).toBe('Mi categoría');
    expect(thread.custom_category_name).toBe('Mi categoría');
  });

  it('sends no custom category name for a standard category', async () => {
    memberDatabase();
    await createThread(WS, { thread_title: 'T', category: 'ideas', custom_category_name: '', initial_message: 'Hola' }, 'user-a1');
    const insert = h.requests.find((r) => r.target === 'message_threads' && has(r, 'insert'))!;
    expect((opArgs(insert, 'insert')?.[0] as Record<string, unknown>).custom_category_name).toBeNull();
  });

  it('still fails, and sends no message, when the database refuses the conversation', async () => {
    h.respond = (req) =>
      req.target === 'message_threads' && has(req, 'insert')
        ? { data: null, error: { code: '42501', message: 'new row violates row-level security policy "messaging_insert_boundary"' } }
        : { data: null, error: null };
    await expect(
      createThread(WS, { thread_title: 'T', category: 'general', initial_message: 'Hola' }, 'user-c')
    ).rejects.toMatchObject({ code: '42501' });
    expect(h.requests.some((r) => r.target === 'community_messages')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Send-back 1, item 1: a conversation whose first message fails is not
// "created", and a retry with the id of the thread row stores only the message
// ---------------------------------------------------------------------------

describe('send-back 1 (1): createThread when the first message fails', () => {
  /** The member's database, whose first-message insert fails `failures` times. */
  function flakyFirstMessage(failures: number) {
    const threads = memberDatabase();
    const base = h.respond;
    const messages: Array<Record<string, unknown>> = [];
    let left = failures;
    h.respond = (req, terminal) => {
      if (req.kind === 'from' && req.target === 'message_threads' && has(req, 'insert')) {
        const row = opArgs(req, 'insert')?.[0] as Record<string, unknown>;
        if (threads.has(String(row.id))) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "message_threads_pkey"' } };
        }
      }
      if (req.kind === 'from' && req.target === 'community_messages' && has(req, 'insert')) {
        if (left > 0) {
          left -= 1;
          return { data: null, error: { code: '08006', message: 'connection failure' } };
        }
        messages.push(opArgs(req, 'insert')?.[0] as Record<string, unknown>);
        return { data: null, error: null };
      }
      return base(req, terminal);
    };
    return { threads, messages };
  }

  const DATA = { thread_title: 'Planificación', description: 'd', category: 'general' as const, initial_message: 'Mi texto de planificación' };

  it('fails, carrying the id of the thread row it created, when the first message cannot be stored', async () => {
    const { threads, messages } = flakyFirstMessage(1);
    const failure = await createThread(WS, DATA, 'user-a1').then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(ThreadCreationIncompleteError);
    const threadId = (failure as ThreadCreationIncompleteError).threadId;
    expect(threads.has(threadId)).toBe(true);
    expect(messages).toHaveLength(0);
  });

  it('a retry with that id stores only the first message: one thread, one message', async () => {
    const { threads, messages } = flakyFirstMessage(1);
    const failure = (await createThread(WS, DATA, 'user-a1').catch((error: unknown) => error)) as ThreadCreationIncompleteError;
    const thread = await createThread(WS, DATA, 'user-a1', failure.threadId);

    expect(thread.id).toBe(failure.threadId);
    expect(threads.size).toBe(1);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ thread_id: failure.threadId, content: 'Mi texto de planificación' });
    // The retry read the person's own thread first and did not insert it again.
    const inserts = h.requests.filter((r) => r.target === 'message_threads' && has(r, 'insert'));
    expect(inserts).toHaveLength(1);
    const ownCheck = h.requests.find(
      (r) => r.target === 'message_threads' && !has(r, 'insert') && r.ops.filter((op) => op.method === 'eq').length === 3
    )!;
    expect(ownCheck.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toEqual([
      ['id', failure.threadId],
      ['workspace_id', WS],
      ['created_by', 'user-a1'],
    ]);
  });

  it('a retry whose read misses the thread treats a duplicate key on the person\'s own thread as already there', async () => {
    const { threads, messages } = flakyFirstMessage(1);
    const failure = (await createThread(WS, DATA, 'user-a1').catch((error: unknown) => error)) as ThreadCreationIncompleteError;
    const base = h.respond;
    let ownChecks = 0;
    h.respond = (req, terminal) => {
      // The first read of the retry is lost; the one after the duplicate key finds it.
      if (req.target === 'message_threads' && !has(req, 'insert') && req.ops.filter((op) => op.method === 'eq').length === 3) {
        ownChecks += 1;
        if (ownChecks === 1) return { data: null, error: { code: '08006', message: 'connection failure' } };
      }
      return base(req, terminal);
    };
    const thread = await createThread(WS, DATA, 'user-a1', failure.threadId);
    expect(thread.id).toBe(failure.threadId);
    expect(threads.size).toBe(1);
    expect(messages).toHaveLength(1);
  });

  it('a duplicate key on an id that is not the person\'s own thread is still a failure, and sends no message', async () => {
    const { threads, messages } = flakyFirstMessage(0);
    threads.set('someone-elses', { id: 'someone-elses', workspace_id: WS, created_by: 'user-a2' });
    const base = h.respond;
    h.respond = (req, terminal) =>
      req.target === 'message_threads' && !has(req, 'insert') && req.ops.filter((op) => op.method === 'eq').length === 3
        ? { data: null, error: null }
        : base(req, terminal);
    await expect(createThread(WS, DATA, 'user-a1', 'someone-elses')).rejects.toMatchObject({ code: '23505' });
    expect(messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EC-S5: names of other people come from get_profile_cards
// ---------------------------------------------------------------------------

const SELF = 'user-a1';
const COMEMBER = 'user-a2';
const SAME_SCHOOL = 'user-b';
const CARDS: Record<string, { id: string; first_name: string; last_name: string; avatar_url: string | null }> = {
  [SELF]: { id: SELF, first_name: 'Ana', last_name: 'Uno', avatar_url: null },
  [COMEMBER]: { id: COMEMBER, first_name: 'María-José', last_name: 'Núñez', avatar_url: 'https://example.invalid/a2.png' },
  [SAME_SCHOOL]: { id: SAME_SCHOOL, first_name: 'Bruno', last_name: 'Dos', avatar_url: null },
};

/** A member's database: `profiles` answers only the caller's own row; cards answer the people they may know. */
function memberReads(tables: Record<string, unknown[]>) {
  h.respond = (req, terminal) => {
    if (req.kind === 'rpc' && req.target === 'get_profile_cards') {
      const ids = ((req.args as { p_ids: string[] }).p_ids ?? []) as string[];
      return { data: ids.filter((id) => CARDS[id]).map((id) => CARDS[id]), error: null };
    }
    if (req.kind === 'from' && req.target === 'profiles') {
      const inArgs = opArgs(req, 'in');
      const eqArgs = opArgs(req, 'eq');
      const ids = (inArgs?.[1] as string[]) ?? [eqArgs?.[1] as string];
      const rows = ids.filter((id) => id === SELF).map((id) => ({ ...CARDS[id], email: 'a1@f11.test.local' }));
      return terminal === 'await' ? { data: rows, error: null } : { data: rows[0] ?? null, error: rows[0] ? null : { code: 'PGRST116' } };
    }
    if (req.kind === 'from' && req.target in tables) {
      const rows = tables[req.target] as Array<Record<string, unknown>>;
      if (req.target === 'community_messages' && has(req, 'in')) {
        const ids = opArgs(req, 'in')?.[1] as string[];
        return { data: rows.filter((r) => ids.includes(String(r.id))), error: null };
      }
      return { data: rows, error: null };
    }
    return { data: terminal === 'await' ? [] : null, error: null };
  };
}

const cardCalls = () => h.requests.filter((r) => r.kind === 'rpc' && r.target === 'get_profile_cards');
const otherProfileReads = () =>
  h.requests.filter((r) => r.kind === 'from' && r.target === 'profiles' && !(opArgs(r, 'eq')?.[1] === SELF));

describe('EC-S5 names in conversations', () => {
  it('the list of conversations shows the creator\'s name to a member', async () => {
    memberReads({
      message_threads: [
        { id: 't1', workspace_id: WS, thread_title: 'Uno', created_by: COMEMBER, category: 'general' },
        { id: 't2', workspace_id: WS, thread_title: 'Dos', created_by: SAME_SCHOOL, category: 'general' },
      ],
    });
    const threads = await getWorkspaceThreads(WS);
    expect(threads.map((t) => t.creator_name)).toEqual(['María-José Núñez', 'Bruno Dos']);
    expect(cardCalls()).toHaveLength(1);
    expect(otherProfileReads()).toHaveLength(0);
  });

  it('messages show their authors\' names and pictures, and a reply shows the replied author', async () => {
    memberReads({
      community_messages: [
        { id: 'm1', workspace_id: WS, thread_id: 't1', author_id: COMEMBER, content: 'Hola', reply_to_id: null, created_at: '2026-11-16T12:00:00Z' },
        { id: 'm2', workspace_id: WS, thread_id: 't1', author_id: SELF, content: 'Respuesta', reply_to_id: 'm3', created_at: '2026-11-16T12:01:00Z' },
        { id: 'm3', workspace_id: WS, thread_id: 't1', author_id: SAME_SCHOOL, content: 'Antes', reply_to_id: null, created_at: '2026-11-16T11:00:00Z' },
      ],
    });
    const messages = await getWorkspaceMessages(WS, { thread_id: 't1' });
    const m1 = messages.find((m) => m.id === 'm1')!;
    const m2 = messages.find((m) => m.id === 'm2')!;
    expect(m1.author_name).toBe('María-José Núñez');
    expect(m1.author_avatar).toBe('https://example.invalid/a2.png');
    expect(m2.author_name).toBe('Ana Uno');
    expect(m2.reply_to_message?.author_name).toBe('Bruno Dos');
    expect(otherProfileReads()).toHaveLength(0);
  });

  it('a message that arrives live shows its author\'s name', async () => {
    memberReads({});
    const received: any[] = [];
    subscribeToWorkspaceMessages(WS, { onMessage: (m) => received.push(m) });
    const messages = h.channels.find((c) => c.name.startsWith('workspace-messages-'))!;
    await messages.handlers[0].handler({ new: { id: 'm9', thread_id: 't1', workspace_id: WS, author_id: COMEMBER, content: 'Nuevo' } });
    expect(received).toHaveLength(1);
    expect(received[0].author_name).toBe('María-José Núñez');
    expect(received[0].author_avatar).toBe('https://example.invalid/a2.png');

    const threads = h.channels.find((c) => c.name.startsWith('workspace-threads-'))!;
    const created: any[] = [];
    subscribeToWorkspaceMessages(WS, { onThread: (t) => created.push(t) });
    const threads2 = h.channels.filter((c) => c.name.startsWith('workspace-threads-')).pop()!;
    await threads2.handlers[0].handler({ new: { id: 't9', workspace_id: WS, thread_title: 'Nuevo', created_by: SAME_SCHOOL, category: 'general' } });
    expect(threads).toBeDefined();
    expect(created[0].creator_name).toBe('Bruno Dos');
    expect(otherProfileReads()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EC-M3: reactions survive a reload
// ---------------------------------------------------------------------------

describe('EC-M3 reactions on messages', () => {
  it('reads reactions without the missing profiles relation and names the people who reacted', async () => {
    memberReads({
      community_messages: [
        { id: 'm1', workspace_id: WS, thread_id: 't1', author_id: COMEMBER, content: 'Hola', reply_to_id: null, created_at: '2026-11-16T12:00:00Z' },
      ],
    });
    const base = h.respond;
    h.respond = (req, terminal) => {
      if (req.target === 'message_reactions') {
        // PostgREST: message_reactions.user_id references auth.users, not profiles (PGRST200).
        if (selects(req).some((columns) => columns.includes('profiles'))) {
          return { data: null, error: { code: 'PGRST200', message: "Could not find a relationship between 'message_reactions' and 'user_id' in the schema cache" } };
        }
        return {
          data: [
            { id: 'r1', message_id: 'm1', user_id: SELF, reaction_type: 'heart', created_at: '2026-11-16T12:01:00Z' },
            { id: 'r2', message_id: 'm1', user_id: COMEMBER, reaction_type: 'heart', created_at: '2026-11-16T12:02:00Z' },
            { id: 'r3', message_id: 'm1', user_id: SAME_SCHOOL, reaction_type: 'eyes', created_at: '2026-11-16T12:03:00Z' },
          ],
          error: null,
        };
      }
      return base(req, terminal);
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const [message] = await getWorkspaceMessages(WS, { thread_id: 't1' });

    const reactionQuery = h.requests.find((r) => r.target === 'message_reactions')!;
    expect(selects(reactionQuery).join(',')).not.toContain('profiles');
    expect(message.reactions).toEqual([
      {
        reaction_type: 'heart',
        count: 2,
        user_reacted: true,
        users: [
          { user_id: SELF, user_name: 'Ana Uno' },
          { user_id: COMEMBER, user_name: 'María-José Núñez' },
        ],
      },
      { reaction_type: 'eyes', count: 1, user_reacted: false, users: [{ user_id: SAME_SCHOOL, user_name: 'Bruno Dos' }] },
    ]);
    // Names of authors and reactors come from one cards call.
    expect(cardCalls()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// EC-M10: every sort the page offers orders by a column that exists
// ---------------------------------------------------------------------------

// Columns of the tables in the local database (\d public.community_messages, \d public.message_threads).
const MESSAGE_COLUMNS = ['id', 'workspace_id', 'thread_id', 'reply_to_id', 'author_id', 'content', 'content_html', 'is_edited',
  'is_deleted', 'edited_at', 'created_at', 'updated_at', 'message_type'];
const THREAD_COLUMNS = ['id', 'workspace_id', 'thread_title', 'description', 'created_by', 'is_pinned', 'is_locked', 'is_archived',
  'last_message_at', 'message_count', 'participant_count', 'created_at', 'updated_at', 'custom_category_name', 'category',
  'assignment_group_id'];
// The options of «Ordenar por» in components/messaging/MessageFilters.tsx.
const MESSAGE_SORT_OPTIONS = ['created_at', 'relevance', 'thread_activity'] as const;
const THREAD_SORT_OPTIONS = ['last_message_at', 'created_at', 'message_count', 'participant_count', 'thread_title'] as const;

describe('EC-M10 sorting a conversation', () => {
  it.each(MESSAGE_SORT_OPTIONS)('messages sorted by «%s» order by an existing column', async (sortBy) => {
    memberReads({ community_messages: [] });
    await getWorkspaceMessages(WS, { thread_id: 't1', sort_by: sortBy, sort_order: 'asc' });
    const query = h.requests.find((r) => r.target === 'community_messages')!;
    const order = opArgs(query, 'order')!;
    expect(MESSAGE_COLUMNS).toContain(order[0]);
    expect(order[1]).toEqual({ ascending: true });
  });

  it('«Relevancia» and «Actividad del hilo» keep the default order (by date)', async () => {
    for (const sortBy of ['relevance', 'thread_activity'] as const) {
      h.requests.length = 0;
      memberReads({ community_messages: [] });
      await getWorkspaceMessages(WS, { thread_id: 't1', sort_by: sortBy });
      expect(opArgs(h.requests.find((r) => r.target === 'community_messages')!, 'order')).toEqual(['created_at', { ascending: false }]);
    }
  });

  it.each(THREAD_SORT_OPTIONS)('conversations sorted by «%s» order by an existing column', async (sortBy) => {
    memberReads({ message_threads: [] });
    await getWorkspaceThreads(WS, { sort_by: sortBy });
    const order = opArgs(h.requests.find((r) => r.target === 'message_threads')!, 'order')!;
    expect(THREAD_COLUMNS).toContain(order[0]);
  });
});
