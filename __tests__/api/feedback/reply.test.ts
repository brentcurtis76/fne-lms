// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

/**
 * /api/feedback/reply, driven through the real handler and the real caller
 * checks of lib/api-auth (requireVerifiedRole: the auth server's verdict on the
 * Bearer token, the forced-password gate, the caller's active admin role row).
 * Only the database and the auth server are replaced, by one in-memory fake
 * behind every Supabase client. Synthetic data throughout.
 */

const { state, fakeClient } = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  type Recorded = {
    table: string;
    op: 'select' | 'insert' | 'update' | 'delete';
    columns?: string;
    payload?: any;
    filters: Array<[string, string, unknown]>;
  };
  const state: {
    /** token -> user id the auth server accepts */
    tokens: Record<string, string>;
    /** user ids with an active admin role row */
    admins: string[];
    feedbackRow: Record<string, unknown> | null;
    insertError: unknown;
    calls: Recorded[];
  } = { tokens: {}, admins: [], feedbackRow: null, insertError: null, calls: [] };

  function respond(q: Recorded): { data: unknown; error: unknown } {
    const eq = (c: string) => q.filters.find(([op, col]) => op === 'eq' && col === c)?.[2];
    switch (q.table) {
      case 'profiles':
        return { data: { must_change_password: false }, error: null };
      case 'user_roles': {
        const uid = eq('user_id') as string;
        const wanted = (q.filters.find(([op, col]) => op === 'in' && col === 'role_type')?.[2] ?? []) as string[];
        const ok = wanted.includes('admin') && state.admins.includes(uid) && eq('is_active') === true;
        return { data: ok ? [{ role_type: 'admin' }] : [], error: null };
      }
      case 'platform_feedback':
        return { data: state.feedbackRow && eq('id') === state.feedbackRow.id ? state.feedbackRow : null, error: null };
      case 'feedback_activity':
        if (q.op === 'insert') {
          if (state.insertError) return { data: null, error: state.insertError };
          return { data: { id: 'activity-1', created_at: '2026-11-18T12:00:00Z', ...q.payload }, error: null };
        }
        return { data: [], error: null };
      default:
        throw new Error(`fake supabase: unexpected table "${q.table}"`);
    }
  }

  const fakeClient = {
    auth: {
      async getUser(token: string) {
        const id = state.tokens[token];
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'bad_jwt' } };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
    },
    from(table: string) {
      const q: Recorded = { table, op: 'select', filters: [] };
      state.calls.push(q);
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
        delete() {
          q.op = 'delete';
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
        limit: () => builder,
        single: resolve,
        maybeSingle: resolve,
        then: (onFulfilled: any, onRejected?: any) => resolve().then(onFulfilled, onRejected),
      };
      return builder;
    },
    async rpc() {
      throw new Error('fake supabase: no rpc expected');
    },
  };

  return { state, fakeClient };
});

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createClient: () => fakeClient };
});

vi.mock('@supabase/auth-helpers-nextjs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, createServerSupabaseClient: () => fakeClient, createPagesServerClient: () => fakeClient };
});

import handler from '../../../pages/api/feedback/reply';

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOCENTE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FORGED_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FEEDBACK_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

async function call(body: unknown, opts: { token?: string; method?: string } = {}) {
  const { req, res } = createMocks({
    method: (opts.method ?? 'POST') as any,
    body: body as any,
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
  });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), json: res._getJSONData() };
}

const asAdmin = (body: unknown) => call(body, { token: 'admin-token' });

function activityWrites() {
  return state.calls.filter((c) => c.table === 'feedback_activity' && c.op !== 'select');
}
function writes() {
  return state.calls.filter((c) => c.op !== 'select');
}
function feedbackReads() {
  return state.calls.filter((c) => c.table === 'platform_feedback');
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.assign(state, {
    tokens: { 'admin-token': ADMIN_ID, 'docente-token': DOCENTE_ID },
    admins: [ADMIN_ID],
    feedbackRow: { id: FEEDBACK_ID },
    insertError: null,
    calls: [],
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('/api/feedback/reply — who may call it', () => {
  it('(1) a visitor gets 401 and nothing is read or written', async () => {
    const { status } = await call({ feedback_id: FEEDBACK_ID, message: 'Hola' });
    expect(status).toBe(401);
    expect(feedbackReads()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });

  it('(1) a refused token gets 401', async () => {
    const { status } = await call({ feedback_id: FEEDBACK_ID, message: 'Hola' }, { token: 'forged' });
    expect(status).toBe(401);
    expect(writes()).toHaveLength(0);
  });

  it('(2) a signed-in person who is not an admin gets 403; the ticket is not read and nothing is written', async () => {
    const { status } = await call({ feedback_id: FEEDBACK_ID, message: 'Hola' }, { token: 'docente-token' });
    expect(status).toBe(403);
    expect(feedbackReads()).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });

  it('(8) other methods get 405 and nothing is read or written', async () => {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      state.calls = [];
      const { status } = await call({ feedback_id: FEEDBACK_ID, message: 'Hola' }, { token: 'admin-token', method });
      expect(status).toBe(405);
      expect(state.calls).toHaveLength(0);
    }
  });
});

describe('/api/feedback/reply — what the admin sends', () => {
  const spanishSentence = (s: unknown) => typeof s === 'string' && /[a-záéíóúñ]/i.test(s) && s.trim().length > 10;

  it.each([
    ['a message of only spaces', { feedback_id: FEEDBACK_ID, message: '   \n\t ' }],
    ['no message', { feedback_id: FEEDBACK_ID }],
    ['a message that is not text', { feedback_id: FEEDBACK_ID, message: 42 }],
    ['a message longer than 5,000 characters', { feedback_id: FEEDBACK_ID, message: 'a'.repeat(5001) }],
    ['no feedback_id', { message: 'Hola' }],
    ['a feedback_id that is not a uuid', { feedback_id: 'not-a-uuid', message: 'Hola' }],
    ['a feedback_id that is not text', { feedback_id: 7, message: 'Hola' }],
  ])('(3) %s → 400 with a Spanish sentence, nothing written', async (_label, body) => {
    const { status, json } = await asAdmin(body);
    expect(status).toBe(400);
    expect(spanishSentence(json.error)).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it('(3) exactly 5,000 characters is accepted', async () => {
    const { status } = await asAdmin({ feedback_id: FEEDBACK_ID, message: 'b'.repeat(5000) });
    expect(status).toBe(200);
  });

  it('(4) a ticket that does not exist → 404, nothing written', async () => {
    const { status, json } = await asAdmin({ feedback_id: MISSING_ID, message: 'Hola' });
    expect(status).toBe(404);
    expect(spanishSentence(json.error)).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it('(5) an admin and a real ticket → one insert of the reply with the service client, 200 with the row', async () => {
    const { status, json } = await asAdmin({ feedback_id: FEEDBACK_ID, message: '  Ya lo revisamos, gracias.  ' });
    expect(status).toBe(200);
    const inserts = activityWrites();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].op).toBe('insert');
    expect(inserts[0].payload).toEqual({
      feedback_id: FEEDBACK_ID,
      message: 'Ya lo revisamos, gracias.',
      created_by: ADMIN_ID,
      is_system_message: false,
      visible_to_reporter: true,
    });
    expect(writes()).toHaveLength(1);
    expect(json).toEqual({
      success: true,
      activity: {
        id: 'activity-1',
        created_at: '2026-11-18T12:00:00Z',
        feedback_id: FEEDBACK_ID,
        message: 'Ya lo revisamos, gracias.',
        created_by: ADMIN_ID,
        is_system_message: false,
        visible_to_reporter: true,
      },
    });
  });

  it('(6) created_by, visible_to_reporter, is_system_message and any other key in the body are ignored', async () => {
    const { status } = await asAdmin({
      feedback_id: FEEDBACK_ID,
      message: 'Respuesta',
      created_by: FORGED_ID,
      visible_to_reporter: false,
      is_system_message: true,
      id: MISSING_ID,
      created_at: '2000-01-01T00:00:00Z',
      extra: 'x',
    });
    expect(status).toBe(200);
    const inserts = activityWrites();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toEqual({
      feedback_id: FEEDBACK_ID,
      message: 'Respuesta',
      created_by: ADMIN_ID,
      is_system_message: false,
      visible_to_reporter: true,
    });
  });

  it('(7) the insert fails → 500 «No se pudo guardar la respuesta», nothing else written', async () => {
    state.insertError = { code: '42501', message: 'new row violates row-level security policy' };
    const { status, json } = await asAdmin({ feedback_id: FEEDBACK_ID, message: 'Respuesta' });
    expect(status).toBe(500);
    expect(json.error).toBe('No se pudo guardar la respuesta');
    expect(writes()).toHaveLength(1);
  });
});
