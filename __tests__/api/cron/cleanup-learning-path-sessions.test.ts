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
 * client is a recording double with synthetic rows.
 *
 * RLS closure C4 (2026-09-07): the route performs TWO stages through two service_role-only
 * SECURITY DEFINER RPCs and reports each truthfully — `close_stale_learning_path_sessions`
 * (settlement, one transaction, exactly-once credit) and
 * `archive_settled_learning_path_sessions(before, limit)` (bounded retention that keeps
 * settlement evidence and reporting grain). Retention runs on idle and settlement-only runs,
 * a nonzero `settled` is reported even when `closed` is zero, a retention failure is a 500
 * that still carries what settlement achieved, a backlog is drained in bounded batches with
 * `hasMore`, and no table is touched directly (no read-modify-write, no direct DELETE).
 * The database-level semantics are proved by pgTAP 070 §6b / 079 and
 * scripts/ci/lp-session-settlement-proof.mjs.
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
    for (const method of ['select', 'eq', 'or', 'gte', 'lt', 'is', 'not', 'delete', 'update', 'upsert', 'insert', 'maybeSingle']) {
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
  function installRpc(settlement: Result | Error, archiveBatches: Array<Result | Error>) {
    let archiveCall = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'close_stale_learning_path_sessions') {
        if (settlement instanceof Error) throw settlement;
        return Promise.resolve(settlement);
      }
      if (name === 'archive_settled_learning_path_sessions') {
        const next = archiveBatches[Math.min(archiveCall, archiveBatches.length - 1)];
        archiveCall += 1;
        if (next instanceof Error) throw next;
        return Promise.resolve(next);
      }
      throw new Error(`unexpected rpc ${name}`);
    });
  }
  const archive = (deleted: number, has_more: boolean, retained_open_overlap = 0, retained_missing_evidence = 0): Result => ({
    data: { deleted, has_more, retained_open_overlap, retained_missing_evidence },
    error: null,
  });

  it('runs settlement then bounded retention and reports both stages truthfully', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    installRpc({ data: { closed: 1, settled: 3 }, error: null }, [archive(2, false, 1, 0)]);
    installQueryDouble({});

    const res = await invoke(method, { authorization: VALID_BEARER });

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      ok: true,
      message: 'Session maintenance completed',
      staleCutoff: '2026-09-15T11:45:00.000Z',
      retentionBoundary: '2026-09-08T11:55:00.000Z',
      settlement: { closed: 1, settled: 3, ok: true },
      retention: { archived: 2, batches: 1, hasMore: false, retainedOpenOverlap: 1, retainedMissingEvidence: 0, ok: true },
      errors: [],
      timestamp: '2026-09-15T12:00:00.000Z',
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, 'close_stale_learning_path_sessions', { p_stale_cutoff: '2026-09-15T11:45:00.000Z' });
    expect(rpc).toHaveBeenNthCalledWith(2, 'archive_settled_learning_path_sessions', { p_before: '2026-09-08T11:55:00.000Z', p_limit: 1000 });
    // No direct table operation of any kind in this process.
    expect(from).not.toHaveBeenCalled();
  });

  it('an idle run still performs retention and says it was idle (no false "no sessions" early return)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
    installRpc({ data: { closed: 0, settled: 0 }, error: null }, [archive(0, false)]);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      ok: true,
      message: 'Idle run: nothing to close, settle or archive',
      settlement: { closed: 0, settled: 0, ok: true },
      retention: { archived: 0, batches: 1, hasMore: false, ok: true },
      errors: [],
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, 'archive_settled_learning_path_sessions', expect.anything());
  });

  it('a settlement-only run (closed 0, settled > 0) reports the settled count and still archives', async () => {
    installRpc({ data: { closed: 0, settled: 4 }, error: null }, [archive(7, false)]);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      ok: true,
      message: 'Session maintenance completed',
      settlement: { closed: 0, settled: 4 },
      retention: { archived: 7 },
    });
  });

  it('drains a backlog in bounded batches (at most 5 per run) and reports hasMore for the next run', async () => {
    installRpc({ data: { closed: 0, settled: 0 }, error: null }, [
      archive(1000, true), archive(1000, true), archive(1000, true), archive(1000, true), archive(1000, true), archive(1000, true),
    ]);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ ok: true, retention: { archived: 5000, batches: 5, hasMore: true, ok: true } });
    expect(rpc).toHaveBeenCalledTimes(1 + 5);
  });

  it('stops batching as soon as the database reports no more candidates', async () => {
    installRpc({ data: { closed: 0, settled: 0 }, error: null }, [archive(1000, true), archive(120, false)]);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getJSONData()).toMatchObject({ retention: { archived: 1120, batches: 2, hasMore: false } });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('a settlement error is a 500, retention is skipped, and nothing is reported as achieved', async () => {
    installRpc({ data: null, error: { message: 'synthetic settlement failure' } }, [archive(5, false)]);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({
      ok: false,
      message: 'Session maintenance failed',
      settlement: { closed: 0, settled: 0, ok: false },
      retention: { archived: 0, batches: 0, ok: false },
      errors: [{ stage: 'settlement', message: 'synthetic settlement failure' }],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('a retention error is a 500 that still carries what settlement achieved (never errors: 0)', async () => {
    installRpc({ data: { closed: 2, settled: 2 }, error: null }, [archive(300, true), { data: null, error: { message: 'synthetic archive failure' } }]);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({
      ok: false,
      settlement: { closed: 2, settled: 2, ok: true },
      retention: { archived: 300, batches: 1, ok: false },
      errors: [{ stage: 'retention', message: 'synthetic archive failure' }],
    });
  });

  it('keeps a 500 shape when the processing path itself throws', async () => {
    rpc.mockImplementation(() => {
      throw new Error('synthetic backend failure');
    });
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toMatchObject({ ok: false, errors: [{ stage: 'settlement', message: 'synthetic backend failure' }] });
    expect(rpc).toHaveBeenCalledTimes(1); // authenticated, so the processing path WAS entered
  });

  it('never echoes the secret in a failed run', async () => {
    installRpc(new Error('boom'), []);
    const res = await invoke(method, { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(500);
    expect(res._getData()).not.toContain(SECRET);
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
