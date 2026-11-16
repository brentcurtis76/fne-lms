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

type Op = { method: string; args: unknown[] };
type Request = { kind: 'from' | 'rpc'; target: string; ops: Op[]; args?: unknown };
type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  requests: [] as Request[],
  respond: (_req: Request, _terminal: string): Answer => ({ data: null, error: null }),
  userId: 'user-a1' as string | null,
}));

vi.mock('../../lib/supabase-wrapper', () => {
  const chainFor = (req: Request) => {
    const answer = (terminal: string) => Promise.resolve(h.respond(req, terminal));
    const chain: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => answer('await').then(ok, ko);
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return () => {
              req.ops.push({ method: prop, args: [] });
              return answer(prop);
            };
          }
          return (...args: unknown[]) => {
            req.ops.push({ method: prop, args });
            return chain;
          };
        },
      }
    );
    return chain;
  };
  const supabase = {
    from: (table: string) => {
      const req: Request = { kind: 'from', target: table, ops: [] };
      h.requests.push(req);
      return chainFor(req);
    },
    rpc: (name: string, args: unknown) => {
      const req: Request = { kind: 'rpc', target: name, ops: [], args };
      h.requests.push(req);
      return chainFor(req);
    },
    auth: {
      getUser: async () => ({ data: { user: h.userId ? { id: h.userId } : null } }),
      getSession: async () => ({ data: { session: null } }),
    },
  };
  return { supabase };
});

import { createThread } from '../../utils/messagingUtils-simple';

const WS = '12700000-0000-4000-8000-0000000000b1';
const RLS_READ_REFUSAL = {
  code: '42501',
  message: 'new row violates row-level security policy "messaging_read_boundary" for table "message_threads"',
  details: null,
  hint: null,
};

const has = (req: Request, method: string) => req.ops.some((op) => op.method === method);
const opArgs = (req: Request, method: string) => req.ops.find((op) => op.method === method)?.args;

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
