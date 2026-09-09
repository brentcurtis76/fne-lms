// @vitest-environment node
/**
 * B2c-M1 — authentication contract for `POST /api/cron/update-learning-path-summaries`.
 *
 * What this suite proves: the guard's ordering and outcomes (405 → 503 → 401 → processing)
 * and that no privileged query or RPC runs unless the exact bearer secret is presented.
 *
 * RLS closure C3 (2026-09-07, decision D2): the summaries are LIVE views (migration
 * 20260907120600); this refresh job is RETIRED. After the unchanged authentication guard
 * the route answers 410 Gone with an explicit `retired` payload and performs NO database
 * operation — a stale scheduler entry can never look like a working refresh, and the
 * three RPCs the old body called (absent from every migration) are never invoked.
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

import handler from '../../../pages/api/cron/update-learning-path-summaries';

const SECRET = 'synthetic-cron-secret-b2c-m1';
const VALID_BEARER = `Bearer ${SECRET}`;
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
 * for `${table}:${firstMethod}` (e.g. 'learning_paths:select'), else an empty success.
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
  // Any backend call would be a contract violation in the negative cases; make one
  // loudly observable instead of silently succeeding.
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

describe('POST /api/cron/update-learning-path-summaries — configuration (503)', () => {
  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['whitespace-only', '   \t '],
  ])('returns 503 and touches no backend when CRON_SECRET is %s', async (_label, value) => {
    setCronSecret(value);
    const res = await invoke('POST', { authorization: `Bearer ${value ?? ''}` });
    expect(res._getStatusCode()).toBe(503);
    expect(res._getJSONData()).toEqual({ error: 'Service unavailable' });
    expectNoBackendOperation();
  });

  it('503 wins over a well-formed bearer when the secret is unset (fail closed, not fail open)', async () => {
    setCronSecret(undefined);
    const res = await invoke('POST', { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(503);
    expectNoBackendOperation();
  });

  it('never echoes or logs the presented authorization value', async () => {
    setCronSecret(undefined);
    const res = await invoke('POST', { authorization: 'Bearer should-not-leak' });
    const logged = [...(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls]
      .flat()
      .map(String)
      .join('\n');
    expect(logged).not.toContain('should-not-leak');
    expect(res._getData()).not.toContain('should-not-leak');
  });
});

describe('POST /api/cron/update-learning-path-summaries — authorization (401)', () => {
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
    const res = await invoke('POST', headers as Record<string, string>);
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: 'Unauthorized' });
    expectNoBackendOperation();
  });

  it('does not accept the secret as a query parameter', async () => {
    const res = await invoke('POST', {}, { query: { secret: SECRET, token: SECRET, cron_secret: SECRET } });
    expect(res._getStatusCode()).toBe(401);
    expectNoBackendOperation();
  });

  it('does not accept a session cookie in place of the bearer secret', async () => {
    const res = await invoke(
      'POST',
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
      const res = await invoke('POST', { authorization: 'Bearer synthetic-other-secret' });
      expect(res._getStatusCode()).toBe(401);
      expectNoBackendOperation();
    } finally {
      if (previous === undefined) delete process.env.CRON_API_KEY;
      else process.env.CRON_API_KEY = previous;
    }
  });
});

describe('POST /api/cron/update-learning-path-summaries — retired after authentication (410)', () => {
  it('answers 410 Gone with the retired contract and touches no backend', async () => {
    const res = await invoke('POST', { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(410);
    expect(res._getJSONData()).toMatchObject({
      success: false,
      retired: true,
      replacement: {
        relations: [
          'user_learning_path_summary',
          'learning_path_performance_summary',
          'learning_path_daily_summary',
          'learning_path_monthly_summary',
        ],
        retentionJob: '/api/cron/cleanup-learning-path-sessions',
      },
    });
    // No query, no RPC: nothing to refresh, and the never-migrated RPCs are never called.
    expectNoBackendOperation();
  });

  it('regression: the retired body never calls the absent update_*_summary RPCs nor the 90-day summary delete', async () => {
    installQueryDouble({});
    rpc.mockResolvedValue({ data: null, error: null });
    const res = await invoke('POST', { authorization: VALID_BEARER });
    expect(res._getStatusCode()).toBe(410);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('the 410 still requires the exact bearer (a wrong secret is 401, not 410)', async () => {
    const res = await invoke('POST', { authorization: 'Bearer not-the-secret' });
    expect(res._getStatusCode()).toBe(401);
    expectNoBackendOperation();
  });
});

describe('/api/cron/update-learning-path-summaries — unsupported methods (405)', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
    '%s returns 405 even with a valid bearer and touches no backend',
    async (method) => {
      const res = await invoke(method, { authorization: VALID_BEARER });
      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({ error: 'Method not allowed' });
      expectNoBackendOperation();
    }
  );

  it('GET returns 405 (not 503) when the secret is unset — method check stays first', async () => {
    setCronSecret(undefined);
    const res = await invoke('GET');
    expect(res._getStatusCode()).toBe(405);
    expectNoBackendOperation();
  });
});
