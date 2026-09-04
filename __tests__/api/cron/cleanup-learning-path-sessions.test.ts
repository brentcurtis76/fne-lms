// @vitest-environment node
/**
 * B2c-M1 — authentication contract for `GET|POST /api/cron/cleanup-learning-path-sessions`.
 *
 * What this suite proves: the guard's ordering and outcomes (405 → 503 → 401 → processing)
 * for both supported methods, that an UNSET secret now fails closed (the pre-B2c-M1 route
 * let every request through in that state), and that no privileged query or RPC runs
 * unless the exact bearer secret is presented.
 *
 * What it does NOT prove: that the cleanup is correct against a real database. The backend
 * client is a recording double with synthetic rows; the `increment_path_time` RPC it
 * "answers" is known to be absent from the migration chain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../../lib/supabaseAdmin', () => ({
  supabaseAdmin: { from, rpc },
}));

import handler from '../../../pages/api/cron/cleanup-learning-path-sessions';

const SECRET = 'synthetic-cron-secret-b2c-m1';
const VALID_BEARER = `Bearer ${SECRET}`;
const SUPPORTED_METHODS = ['GET', 'POST'] as const;
const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

/** Sets or removes CRON_SECRET; `undefined` means genuinely absent (not the string "undefined"). */
function setCronSecret(value: string | undefined) {
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
}

type Result = { data?: unknown; error?: unknown; count?: number | null };

/**
 * Recording double for the PostgREST query builder: every `from(table)` returns a thenable
 * chain whose methods all return the chain; awaiting it resolves to the result registered
 * for `${table}:${firstMethod}` (e.g. 'learning_path_progress_sessions:update'), else an
 * empty success.
 */
function installQueryDouble(results: Record<string, Result>) {
  const calls: Array<{ table: string; ops: Array<{ method: string; args: unknown[] }> }> = [];
  from.mockImplementation((table: string) => {
    const entry = { table, ops: [] as Array<{ method: string; args: unknown[] }> };
    calls.push(entry);
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'or', 'gte', 'lt', 'is', 'delete', 'update', 'upsert', 'insert']) {
      chain[method] = (...args: unknown[]) => {
        entry.ops.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => {
      const key = `${table}:${entry.ops[0]?.method ?? ''}`;
      const value = results[key] ?? { data: [], error: null, count: null };
      return Promise.resolve(value).then(resolve, reject);
    };
    return chain;
  });
  return calls;
}

async function invoke(method: string, headers: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  const { req, res } = createMocks({ method: method as never, headers, ...extra });
  await handler(req as never, res as never);
  return res;
}

function expectNoBackendOperation() {
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  from.mockImplementation(() => {
    throw new Error('backend reached');
  });
  rpc.mockImplementation(() => {
    throw new Error('backend reached');
  });
  setCronSecret(SECRET);
});

afterEach(() => {
  setCronSecret(ORIGINAL_CRON_SECRET);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(SUPPORTED_METHODS)('%s /api/cron/cleanup-learning-path-sessions — configuration (503)', (method) => {
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace-only', '   \t '],
  ])('returns 503 and touches no backend when CRON_SECRET is %s', async (_label, value) => {
    setCronSecret(value);
    const res = await invoke(method, { authorization: `Bearer ${value ?? ''}` });
    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData()).toEqual({ error: 'Service unavailable' });
    expectNoBackendOperation();
  });

  it('regression: an UNSET secret no longer lets an unauthenticated request through', async () => {
    setCronSecret(undefined);
    const res = await invoke(method);
    expect(res._getStatusCode()).toBe(503);
    expectNoBackendOperation();
  });

  it('never echoes or logs the presented authorization value', async () => {
    setCronSecret(undefined);
    const res = await invoke(method, { authorization: 'Bearer should-not-leak' });
    const logged = [...(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls]
      .flat()
      .map(String)
      .join('\n');
    expect(logged).not.toContain('should-not-leak');
    expect(res._getData()).not.toContain('should-not-leak');
  });
});

describe.each(SUPPORTED_METHODS)('%s /api/cron/cleanup-learning-path-sessions — authorization (401)', (method) => {
  it.each([
    ['no Authorization header', {}],
    ['bare scheme', { authorization: 'Bearer' }],
    ['scheme with empty token', { authorization: 'Bearer ' }],
    ['wrong token', { authorization: 'Bearer not-the-secret' }],
    ['lowercase scheme', { authorization: `bearer ${SECRET}` }],
    ['trailing whitespace', { authorization: `${VALID_BEARER} ` }],
    ['secret with a prefix', { authorization: `Bearer x${SECRET}` }],
    ['secret with a suffix', { authorization: `Bearer ${SECRET}x` }],
    ['Basic scheme carrying the secret', { authorization: `Basic ${SECRET}` }],
    ['raw secret without scheme', { authorization: SECRET }],
    ['x-cron-key alternate header', { 'x-cron-key': SECRET }],
    ['x-api-key alternate header', { 'x-api-key': SECRET }],
  ])('returns 401 and touches no backend: %s', async (_label, headers) => {
    const res = await invoke(method, headers as Record<string, string>);
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'Unauthorized' });
    expectNoBackendOperation();
  });

  it('does not accept the secret as a query parameter', async () => {
    const res = await invoke(method, {}, { query: { secret: SECRET, token: SECRET, cron_secret: SECRET } });
    expect(res._getStatusCode()).toBe(401);
    expectNoBackendOperation();
  });

  it('does not accept a session cookie in place of the bearer secret', async () => {
    const res = await invoke(
      method,
      { cookie: `sb-access-token=synthetic; cron_secret=${SECRET}` },
      { cookies: { 'sb-access-token': 'synthetic', cron_secret: SECRET } }
    );
    expect(res._getStatusCode()).toBe(401);
    expectNoBackendOperation();
  });

  it('does not accept a different configured secret (e.g. CRON_API_KEY) as a substitute', async () => {
    const previous = process.env.CRON_API_KEY;
    process.env.CRON_API_KEY = 'synthetic-other-secret';
    try {
      const res = await invoke(method, { authorization: 'Bearer synthetic-other-secret' });
      expect(res._getStatusCode()).toBe(401);
      expectNoBackendOperation();
    } finally {
      if (previous === undefined) delete process.env.CRON_API_KEY;
      else process.env.CRON_API_KEY = previous;
    }
  });
});

describe.each(SUPPORTED_METHODS)('%s /api/cron/cleanup-learning-path-sessions — authenticated processing', (method) => {
  it('closes a dangling session through the existing path and reports the mocked work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));

    const calls = installQueryDouble({
      'learning_path_progress_sessions:select': {
        data: [
          {
            id: 'session-1',
            user_id: 'user-1',
            path_id: 'path-a',
            session_start: '2026-09-15T10:00:00.000Z',
            last_heartbeat: '2026-09-15T10:30:00.000Z',
          },
        ],
        error: null,
      },
      'learning_path_progress_sessions:update': { data: null, error: null },
      'learning_path_progress_sessions:delete': { data: null, error: null, count: 2 },
    });
    rpc.mockResolvedValue({ data: null, error: null });

    const res = await invoke(method, { authorization: VALID_BEARER });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      message: 'Session cleanup completed',
      sessionsFound: 1,
      successfullyClosed: 1,
      errors: 0,
      oldSessionsArchived: 2,
      timestamp: '2026-09-15T12:00:00.000Z',
    });

    // Existing dangling-session query preserved: open sessions with a stale heartbeat (15 min).
    expect(calls[0]).toMatchObject({ table: 'learning_path_progress_sessions' });
    expect(calls[0].ops.map((op) => op.method)).toEqual(['select', 'is', 'lt']);
    expect(calls[0].ops[1].args).toEqual(['session_end', null]);
    expect(calls[0].ops[2].args).toEqual(['last_heartbeat', '2026-09-15T11:45:00.000Z']);

    // Existing close semantics preserved: last heartbeat as end time, 30 minutes spent.
    const update = calls[1];
    expect(update.ops[0].method).toBe('update');
    expect(update.ops[0].args[0]).toEqual({
      session_end: '2026-09-15T10:30:00.000Z',
      time_spent_minutes: 30,
      updated_at: '2026-09-15T12:00:00.000Z',
    });
    expect(update.ops[1]).toEqual({ method: 'eq', args: ['id', 'session-1'] });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('increment_path_time', {
      p_user_id: 'user-1',
      p_path_id: 'path-a',
      p_time_minutes: 30,
      p_last_activity: '2026-09-15T10:30:00.000Z',
    });

    // Existing 7-day retention delete preserved.
    const archive = calls[2];
    expect(archive.ops.map((op) => op.method)).toEqual(['delete', 'lt']);
    expect(archive.ops[1].args).toEqual(['session_start', '2026-09-08T12:00:00.000Z']);
  });

  it('reports "no dangling sessions" through the existing early-return path', async () => {
    installQueryDouble({
      'learning_path_progress_sessions:select': { data: [], error: null },
    });
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ message: 'No dangling sessions found', cleanedUp: 0 });
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps the existing 500 shape when the processing path itself fails', async () => {
    from.mockImplementation(() => {
      throw new Error('synthetic backend failure');
    });
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ error: 'Cleanup job failed', details: 'synthetic backend failure' });
    expect(from).toHaveBeenCalledTimes(1); // authenticated, so the processing path WAS entered
  });
});

describe('/api/cron/cleanup-learning-path-sessions — unsupported methods (405)', () => {
  it.each(['PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
    '%s returns 405 even with a valid bearer and touches no backend',
    async (method) => {
      const res = await invoke(method, { authorization: VALID_BEARER });
      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({ error: 'Method not allowed' });
      expectNoBackendOperation();
    }
  );

  it('DELETE returns 405 (not 503) when the secret is unset — method check stays first', async () => {
    setCronSecret(undefined);
    const res = await invoke('DELETE');
    expect(res._getStatusCode()).toBe(405);
    expectNoBackendOperation();
  });
});
