// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks, type RequestMethod } from 'node-mocks-http';

/**
 * Redesign 4d — `/api/user/look`, the owner-only save of an account's look.
 * Replaced edges: who the caller is (`requireVerifiedCaller`) and the caller's own
 * Supabase client (one in-memory profile row). Synthetic ids only.
 */

const OWNER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

const { state } = vi.hoisted(() => ({
  state: {
    caller: null as null | { id: string },
    refused: null as null | { status: number; body: { error: string } },
    row: null as null | Record<string, unknown>,
    readError: false,
    writeError: false,
    calls: [] as Array<{ op: string; table: string; filters: Array<[string, unknown]>; payload?: unknown; columns?: string }>,
  },
}));

function clientFor() {
  return {
    from(table: string) {
      const call = { op: 'select', table, filters: [] as Array<[string, unknown]>, payload: undefined as unknown, columns: undefined as string | undefined };
      state.calls.push(call);
      const chain: any = {
        select: (columns: string) => ((call.columns = columns), chain),
        update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), chain),
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), chain),
        maybeSingle: async () => {
          if (call.op === 'select') return state.readError ? { data: null, error: { code: 'PGRST301' } } : { data: state.row, error: null };
          if (state.writeError) return { data: null, error: { code: '42501' } };
          state.row = { ...(state.row ?? {}), ...(call.payload as Record<string, unknown>) };
          return { data: state.row, error: null };
        },
      };
      return chain;
    },
  };
}

vi.mock('../../lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-auth')>()),
  requireVerifiedCaller: async () =>
    state.caller ? { user: state.caller, status: null, body: null } : { user: null, ...(state.refused ?? { status: 401, body: { error: 'No autorizado' } }) },
  createApiSupabaseClient: async () => clientFor(),
}));

import handler from '../../pages/api/user/look';

async function call(method: RequestMethod, body?: unknown) {
  const { req, res } = createMocks({ method, body: body as any });
  await handler(req as any, res as any);
  return { status: res._getStatusCode(), body: res._getData() ? JSON.parse(res._getData()) : null, headers: res._getHeaders() };
}

const writes = () => state.calls.filter((c) => c.op === 'update');

beforeEach(() => {
  Object.assign(state, {
    caller: { id: OWNER },
    refused: null,
    row: { can_run_qa_tests: true, learning_preferences: { pace: 'slow' } },
    readError: false,
    writeError: false,
    calls: [],
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/user/look', () => {
  it('only PUT exists', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as RequestMethod[]) {
      const res = await call(method, { look: 'nuevo' });
      expect(res.status).toBe(405);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(state.calls).toEqual([]);
  });

  it('no verified caller: 401, nothing read or written', async () => {
    state.caller = null;
    expect((await call('PUT', { look: 'nuevo' })).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it('a caller who must change their password is refused with that answer', async () => {
    state.caller = null;
    state.refused = { status: 403, body: { error: 'Debes cambiar tu contraseña' } };
    const res = await call('PUT', { look: 'nuevo' });
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it.each([
    [undefined],
    [null],
    ['nuevo'],
    [{}],
    [{ look: 'NUEVO' }],
    [{ look: 'azul' }],
    [{ look: true }],
    [{ look: 'nuevo', user_id: OTHER }],
    [{ look: 'nuevo', id: OTHER }],
    [[{ look: 'nuevo' }]],
  ])('refuses the body %j before touching the database', async (body) => {
    const res = await call('PUT', body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_look');
    expect(state.calls).toEqual([]);
  });

  it('an account that is not offered the choice cannot save one', async () => {
    state.row = { can_run_qa_tests: false, learning_preferences: {} };
    const res = await call('PUT', { look: 'nuevo' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_offered');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(writes()).toEqual([]);
    expect(state.row.learning_preferences).toEqual({});
  });

  it('saves the new look in the caller\'s own row and keeps the other keys', async () => {
    const res = await call('PUT', { look: 'nuevo' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ look: 'nuevo' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(state.calls.map((c) => [c.op, c.table, c.filters])).toEqual([
      ['select', 'profiles', [['id', OWNER]]],
      ['update', 'profiles', [['id', OWNER]]],
    ]);
    expect(writes()[0].payload).toEqual({ learning_preferences: { pace: 'slow', ui_look: 'nuevo' } });
  });

  it('going back removes the key instead of storing another value', async () => {
    state.row = { can_run_qa_tests: true, learning_preferences: { pace: 'slow', ui_look: 'nuevo' } };
    const res = await call('PUT', { look: 'clasico' });
    expect(res.body).toEqual({ look: 'clasico' });
    expect(writes()[0].payload).toEqual({ learning_preferences: { pace: 'slow' } });
  });

  it('writes nothing but learning_preferences', async () => {
    await call('PUT', { look: 'nuevo' });
    expect(Object.keys(writes()[0].payload as object)).toEqual(['learning_preferences']);
  });

  it('a profile that cannot be read, or is missing, is a 500 with nothing written', async () => {
    state.readError = true;
    expect((await call('PUT', { look: 'nuevo' })).body.code).toBe('read_failed');
    state.readError = false;
    state.row = null;
    const res = await call('PUT', { look: 'nuevo' });
    expect(res.status).toBe(500);
    expect(writes()).toEqual([]);
  });

  it('a refused write is a 500 that never claims success', async () => {
    state.writeError = true;
    const res = await call('PUT', { look: 'nuevo' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('write_failed');
    expect(res.body.look).toBeUndefined();
  });
});
