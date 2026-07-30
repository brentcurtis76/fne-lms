// @vitest-environment node
/**
 * Ticker suite (§17 slice, Z1b-3): the route's auth matrix and the runner's loop.
 *
 * ## What this suite does NOT prove
 *
 * It does not prove concurrency safety. The fake queue below hands out disjoint
 * batches because it is written to; the real guarantee is `FOR UPDATE SKIP LOCKED`
 * inside `zoom_internal.claim_zoom_jobs`, and no in-memory double can exercise a
 * Postgres row lock. The "two sequential invocations never double-dispatch" test here
 * pins the RUNNER's half of the contract — that it does not re-dispatch a job it has
 * already worked, and that it passes its own worker id through every RPC. **The true
 * concurrency proof — two claim loops racing against real SKIP LOCKED — is explicitly
 * out of scope for this chunk and lands in Z1b-4 as a Gate-3 CI step.**
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

import { handleZoomTicker } from '../../../pages/api/cron/zoom-ticker';
import {
  runZoomTick,
  describeJobFailure,
  DEFAULT_LEASE_SECONDS,
} from '../../../lib/zoom/jobs/runner';
import {
  ZoomJobLeaseLostError,
  type ZoomJobHandler,
  type ZoomJobRegistry,
} from '../../../lib/zoom/jobs/registry';
import type { EnqueueResult, ZoomJobQueue } from '../../../lib/zoom/jobs/queue';
import type { ZoomJobRow, ZoomJobStatus } from '../../../lib/zoom/db-types';
import {
  ZoomNonRetryableError,
  ZoomRateLimitError,
  ZoomRetryableError,
} from '../../../lib/zoom/errors';

const CRON_SECRET = 'synthetic-vercel-cron-secret';
const CRON_API_KEY = 'synthetic-repo-cron-api-key';

// ---------------------------------------------------------------------------
// Fake queue — models the RPC contract closely enough to assert argument shape
// and outcome, and nothing more. The real semantics live in the migration.
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<ZoomJobRow> & { id: string; job_type: string }): ZoomJobRow {
  return {
    payload: {},
    dedupe_key: null,
    status: 'pending',
    attempts: 0,
    max_attempts: 5,
    run_after: '2026-07-30T00:00:00.000Z',
    lease_expires_at: null,
    heartbeat_at: null,
    stage_state: {},
    last_error: null,
    worker_id: null,
    created_at: '2026-07-30T00:00:00.000Z',
    updated_at: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

/** Fixed "now" for the fake queue's clock — after every fixture's `run_after`. */
const QUEUE_NOW_MS = Date.parse('2026-07-30T12:00:00.000Z');

function createFakeQueue(initial: ZoomJobRow[] = [], queueNow: () => number = () => QUEUE_NOW_MS) {
  const rows = new Map<string, ZoomJobRow>(initial.map((job) => [job.id, { ...job }]));
  const dedupeKeys = new Set<string>();

  const calls = {
    claim: [] as Record<string, unknown>[],
    heartbeat: [] as Record<string, unknown>[],
    complete: [] as Record<string, unknown>[],
    fail: [] as Record<string, unknown>[],
    enqueue: [] as Record<string, unknown>[],
  };

  const queue: ZoomJobQueue = {
    async claim(args) {
      calls.claim.push({ ...args });
      const leased: ZoomJobRow[] = [];
      for (const row of rows.values()) {
        if (leased.length >= (args.p_max_n ?? 1)) break;
        if (row.status !== 'pending') continue;
        // Runnable means pending AND due — the RPC's `run_after <= now()`. Without
        // this the double re-claims a just-failed job inside the same tick, which the
        // real backoff (30 s minimum) makes impossible.
        if (Date.parse(row.run_after) > queueNow()) continue;
        row.status = 'leased';
        row.worker_id = args.p_worker_id;
        leased.push({ ...row });
      }
      return leased;
    },
    async heartbeat(args) {
      calls.heartbeat.push({ ...args });
      const row = rows.get(args.p_job_id);
      return !!row && row.status === 'leased' && row.worker_id === args.p_worker_id;
    },
    async complete(args) {
      calls.complete.push({ ...args });
      const row = rows.get(args.p_job_id);
      if (!row || row.status !== 'leased' || row.worker_id !== args.p_worker_id) return false;
      row.status = 'done';
      row.worker_id = null;
      return true;
    },
    async fail(args): Promise<ZoomJobStatus | null> {
      calls.fail.push({ ...args });
      const row = rows.get(args.p_job_id);
      if (!row || row.status !== 'leased' || row.worker_id !== args.p_worker_id) return null;
      const priorAttempts = row.attempts;
      row.attempts += 1;
      row.last_error = args.p_error;
      row.worker_id = null;
      row.status =
        args.p_retryable === false
          ? 'failed'
          : row.attempts >= row.max_attempts
            ? 'dead'
            : 'pending';
      if (row.status === 'pending') {
        // The RPC's schedule: LEAST(30s * 2^prior_attempts, 3600s).
        const backoffSeconds = Math.min(30 * 2 ** Math.min(priorAttempts, 10), 3600);
        row.run_after = new Date(queueNow() + backoffSeconds * 1000).toISOString();
      }
      return row.status;
    },
    async enqueue(job): Promise<EnqueueResult> {
      calls.enqueue.push({ ...job } as Record<string, unknown>);
      if (job.dedupe_key && dedupeKeys.has(job.dedupe_key)) return 'duplicate';
      if (job.dedupe_key) dedupeKeys.add(job.dedupe_key);
      const id = `job-${rows.size + 1}`;
      rows.set(id, makeJob({ id, job_type: job.job_type, payload: job.payload ?? {} }));
      return 'enqueued';
    },
  };

  return { queue, rows, calls };
}

function recordingRegistry() {
  const seen: string[] = [];
  const handler: ZoomJobHandler = vi.fn(async (ctx) => {
    seen.push(ctx.job.id);
    return { handled: ctx.job.id };
  });
  const registry: ZoomJobRegistry = { host_sync: handler, noop: handler };
  return { registry, handler, seen };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Route: auth matrix
// ---------------------------------------------------------------------------

interface InvokeTickerOptions {
  method?: string;
  headers?: Record<string, string>;
  env: NodeJS.ProcessEnv;
  queue?: ZoomJobQueue;
  registry?: ZoomJobRegistry;
}

async function invokeTicker(options: InvokeTickerOptions) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: (options.method ?? 'GET') as 'GET',
    headers: options.headers ?? {},
  });
  const fake = createFakeQueue();
  await handleZoomTicker(req, res, {
    env: options.env,
    queue: options.queue ?? fake.queue,
    registry: options.registry ?? {},
    workerId: 'zoom-ticker:test-worker',
  });
  return res;
}

describe('/api/cron/zoom-ticker — auth matrix', () => {
  const bothSet = {
    CRON_SECRET,
    CRON_API_KEY,
  } as unknown as NodeJS.ProcessEnv;

  it('accepts the Vercel-native bearer when CRON_SECRET is set', async () => {
    const res = await invokeTicker({
      env: { CRON_SECRET } as unknown as NodeJS.ProcessEnv,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ claimed: 0, completed: 0, failed: 0 });
  });

  it('rejects a wrong bearer', async () => {
    const res = await invokeTicker({
      env: { CRON_SECRET } as unknown as NodeJS.ProcessEnv,
      headers: { authorization: 'Bearer not-the-secret' },
    });
    expect(res._getStatusCode()).toBe(401);
  });

  it('rejects a bare secret without the Bearer prefix', async () => {
    const res = await invokeTicker({
      env: { CRON_SECRET } as unknown as NodeJS.ProcessEnv,
      headers: { authorization: CRON_SECRET },
    });
    expect(res._getStatusCode()).toBe(401);
  });

  it('fails closed on the bearer path when CRON_SECRET is unset', async () => {
    const res = await invokeTicker({
      env: {} as NodeJS.ProcessEnv,
      headers: { authorization: 'Bearer anything-at-all' },
    });
    expect(res._getStatusCode()).toBe(401);
  });

  it('accepts the repo x-cron-key when CRON_API_KEY is set', async () => {
    const res = await invokeTicker({
      env: { CRON_API_KEY } as unknown as NodeJS.ProcessEnv,
      headers: { 'x-cron-key': CRON_API_KEY },
    });
    expect(res._getStatusCode()).toBe(200);
  });

  it('rejects a wrong x-cron-key', async () => {
    const res = await invokeTicker({
      env: { CRON_API_KEY } as unknown as NodeJS.ProcessEnv,
      headers: { 'x-cron-key': 'not-the-key' },
    });
    expect(res._getStatusCode()).toBe(401);
  });

  it('fails closed on the header path when CRON_API_KEY is unset', async () => {
    const res = await invokeTicker({
      env: {} as NodeJS.ProcessEnv,
      headers: { 'x-cron-key': 'anything-at-all' },
    });
    expect(res._getStatusCode()).toBe(401);
  });

  it('rejects everything when BOTH variables are unset', async () => {
    for (const headers of [
      {},
      { authorization: `Bearer ${CRON_SECRET}` },
      { 'x-cron-key': CRON_API_KEY },
      { authorization: `Bearer ${CRON_SECRET}`, 'x-cron-key': CRON_API_KEY },
    ]) {
      const res = await invokeTicker({ env: {} as NodeJS.ProcessEnv, headers });
      expect(res._getStatusCode()).toBe(401);
    }
  });

  it('accepts either scheme when both are configured', async () => {
    const viaBearer = await invokeTicker({
      env: bothSet,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const viaHeader = await invokeTicker({
      env: bothSet,
      headers: { 'x-cron-key': CRON_API_KEY },
    });
    expect(viaBearer._getStatusCode()).toBe(200);
    expect(viaHeader._getStatusCode()).toBe(200);
  });

  it('rejects an unauthenticated request with no headers at all', async () => {
    const res = await invokeTicker({ env: bothSet });
    expect(res._getStatusCode()).toBe(401);
  });

  it('accepts GET (Vercel) and POST (manual), and 405s anything else', async () => {
    const get = await invokeTicker({
      method: 'GET',
      env: bothSet,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const post = await invokeTicker({
      method: 'POST',
      env: bothSet,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    const put = await invokeTicker({
      method: 'PUT',
      env: bothSet,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(get._getStatusCode()).toBe(200);
    expect(post._getStatusCode()).toBe(200);
    expect(put._getStatusCode()).toBe(405);
    expect(put.getHeader('Allow')).toBe('GET, POST');
  });

  it('answers 500 when the queue itself is unreachable', async () => {
    const broken = createFakeQueue();
    broken.queue.claim = vi.fn(async () => {
      throw new Error('claim_zoom_jobs failed: connection refused');
    });

    const res = await invokeTicker({
      env: bothSet,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      queue: broken.queue,
    });

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Internal error' });
  });
});

// ---------------------------------------------------------------------------
// Runner: dispatch
// ---------------------------------------------------------------------------

describe('runZoomTick — dispatch', () => {
  it('claims every job type (NULL p_job_types) so unknown types cannot hide', async () => {
    const { queue, calls } = createFakeQueue();
    await runZoomTick({ queue, registry: {}, workerId: 'w1' });

    expect(calls.claim[0]).toMatchObject({
      p_worker_id: 'w1',
      p_job_types: null,
      p_lease_seconds: DEFAULT_LEASE_SECONDS,
    });
  });

  it('dispatches claimed jobs to their registered handler and completes them', async () => {
    const { queue, rows, calls } = createFakeQueue([
      makeJob({ id: 'job-a', job_type: 'host_sync' }),
      makeJob({ id: 'job-b', job_type: 'noop' }),
    ]);
    const { registry, seen } = recordingRegistry();

    const result = await runZoomTick({ queue, registry, workerId: 'w1' });

    expect(result).toEqual({ claimed: 2, completed: 2, failed: 0 });
    expect(seen).toEqual(['job-a', 'job-b']);
    expect(rows.get('job-a')?.status).toBe('done');
    expect(rows.get('job-b')?.status).toBe('done');
    // The handler's return value is checkpointed as the job's stage_state.
    expect(calls.complete[0]).toEqual({
      p_job_id: 'job-a',
      p_worker_id: 'w1',
      p_stage_state: { result: { handled: 'job-a' } },
    });
  });

  it('passes the worker id through heartbeat with the tick lease length', async () => {
    const { queue, calls } = createFakeQueue([makeJob({ id: 'job-a', job_type: 'host_sync' })]);
    const registry: ZoomJobRegistry = {
      host_sync: async (ctx) => {
        const alive = await ctx.heartbeat({ page: 2 });
        return { alive };
      },
    };

    const result = await runZoomTick({ queue, registry, workerId: 'w1', leaseSeconds: 90 });

    expect(result.completed).toBe(1);
    expect(calls.heartbeat[0]).toEqual({
      p_job_id: 'job-a',
      p_worker_id: 'w1',
      p_lease_seconds: 90,
      p_stage_state: { page: 2 },
    });
  });

  it('marks an unknown job_type non-retryable so it lands in triage, not the queue', async () => {
    const { queue, rows, calls } = createFakeQueue([
      makeJob({ id: 'job-x', job_type: 'meeting_provision' }),
    ]);

    const result = await runZoomTick({ queue, registry: { noop: async () => ({}) }, workerId: 'w1' });

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(calls.fail[0]).toMatchObject({ p_job_id: 'job-x', p_retryable: false });
    // `failed`, not `dead`: terminal but manually re-queueable, which is what makes a
    // deploy-skew claim recoverable.
    expect(rows.get('job-x')?.status).toBe('failed');

    const stored = JSON.parse(rows.get('job-x')?.last_error as string);
    expect(stored.kind).toBe('non_retryable');
    expect(stored.reason).toBe('unknown_job_type');
    expect(stored.operation).toBe('meeting_provision');
  });
});

// ---------------------------------------------------------------------------
// Runner: structural failure storage
// ---------------------------------------------------------------------------

describe('runZoomTick — failures are stored structurally', () => {
  it('stores kind/status/operation as JSON and keys retry on kind, not the message', async () => {
    const { queue, rows, calls } = createFakeQueue([
      makeJob({ id: 'job-a', job_type: 'host_sync' }),
    ]);
    const registry: ZoomJobRegistry = {
      host_sync: async () => {
        throw new ZoomRetryableError('Zoom returned 503 for GET /users.', {
          status: 503,
          operation: 'GET /users',
        });
      },
    };

    const result = await runZoomTick({ queue, registry, workerId: 'w1' });

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    const stored = JSON.parse(rows.get('job-a')?.last_error as string);
    expect(stored).toMatchObject({ kind: 'retryable', status: 503, operation: 'GET /users' });
    expect(calls.fail[0]).toMatchObject({ p_retryable: true });
    // Triage reads `kind`. The message is present for humans and nothing branches on it.
    expect(typeof stored.message).toBe('string');
  });

  it('maps every ZoomError kind onto the RPC retry flag via isRetryableKind', async () => {
    const cases: Array<{ error: Error; kind: string; retryable: boolean }> = [
      {
        error: new ZoomRateLimitError('rate limited', { status: 429, retryAfterSeconds: 30 }),
        kind: 'rate_limit',
        retryable: true,
      },
      {
        error: new ZoomRetryableError('upstream 502', { status: 502 }),
        kind: 'retryable',
        retryable: true,
      },
      {
        error: new ZoomNonRetryableError('bad request', { status: 400 }),
        kind: 'non_retryable',
        retryable: false,
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const jobId = `job-${index}`;
      const { queue, rows, calls } = createFakeQueue([makeJob({ id: jobId, job_type: 'noop' })]);
      const registry: ZoomJobRegistry = {
        noop: async () => {
          throw testCase.error;
        },
      };

      await runZoomTick({ queue, registry, workerId: 'w1' });

      expect(JSON.parse(rows.get(jobId)?.last_error as string).kind).toBe(testCase.kind);
      expect(calls.fail[0]).toMatchObject({ p_retryable: testCase.retryable });
    }
  });

  it('treats an untyped error as kind "unknown" and retryable', async () => {
    const record = describeJobFailure(new TypeError('cannot read properties of undefined'));
    expect(record.kind).toBe('unknown');

    const { queue, calls } = createFakeQueue([makeJob({ id: 'job-a', job_type: 'noop' })]);
    const registry: ZoomJobRegistry = {
      noop: async () => {
        throw new TypeError('cannot read properties of undefined');
      },
    };

    await runZoomTick({ queue, registry, workerId: 'w1' });
    expect(calls.fail[0]).toMatchObject({ p_retryable: true });
  });

  it('does not re-claim a just-failed retryable job inside the same tick', async () => {
    // The runner has no backoff of its own — it relies entirely on fail_zoom_job
    // pushing `run_after` forward (30 s minimum, far longer than one tick). If that
    // ever stopped holding, a permanently-failing job would burn its whole
    // max_attempts budget in a single invocation instead of over ~8 minutes.
    const { queue, rows, calls } = createFakeQueue([makeJob({ id: 'job-a', job_type: 'noop' })]);
    const registry: ZoomJobRegistry = {
      noop: async () => {
        throw new ZoomRetryableError('upstream 503', { status: 503 });
      },
    };

    const result = await runZoomTick({ queue, registry, workerId: 'w1' });

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    expect(calls.fail).toHaveLength(1);
    expect(rows.get('job-a')?.status).toBe('pending');
    expect(rows.get('job-a')?.attempts).toBe(1);
    expect(Date.parse(rows.get('job-a')?.run_after as string)).toBe(QUEUE_NOW_MS + 30_000);
  });

  it('does not call fail_zoom_job when the lease was lost mid-handler', async () => {
    const { queue, calls } = createFakeQueue([makeJob({ id: 'job-a', job_type: 'host_sync' })]);
    const registry: ZoomJobRegistry = {
      host_sync: async (ctx) => {
        throw new ZoomJobLeaseLostError(ctx.job.id);
      },
    };

    const result = await runZoomTick({ queue, registry, workerId: 'w1' });

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1 });
    // The new leaseholder owns the job; reporting against a lease we do not hold
    // would modify nothing and muddy triage.
    expect(calls.fail).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Runner: batching, repeat invocations, budget
// ---------------------------------------------------------------------------

describe('runZoomTick — batching and budget', () => {
  it('two sequential invocations over disjoint claimed sets never double-dispatch', async () => {
    // NOTE: this pins the RUNNER's half of the contract only. The real anti-double-
    // claim guarantee is FOR UPDATE SKIP LOCKED inside claim_zoom_jobs, which no
    // in-memory double can exercise — that proof is a Z1b-4 Gate-3 CI step.
    const { queue, rows } = createFakeQueue([
      makeJob({ id: 'job-a', job_type: 'noop' }),
      makeJob({ id: 'job-b', job_type: 'noop' }),
    ]);
    const { registry, seen } = recordingRegistry();

    const first = await runZoomTick({ queue, registry, workerId: 'w1' });
    expect(first).toEqual({ claimed: 2, completed: 2, failed: 0 });

    // A later job arrives between ticks.
    rows.set('job-c', makeJob({ id: 'job-c', job_type: 'noop' }));

    const second = await runZoomTick({ queue, registry, workerId: 'w2' });
    expect(second).toEqual({ claimed: 1, completed: 1, failed: 0 });

    expect(seen).toEqual(['job-a', 'job-b', 'job-c']);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('drains across several claims until the queue is empty', async () => {
    const { queue, calls } = createFakeQueue([
      makeJob({ id: 'job-a', job_type: 'noop' }),
      makeJob({ id: 'job-b', job_type: 'noop' }),
      makeJob({ id: 'job-c', job_type: 'noop' }),
    ]);
    const { registry, seen } = recordingRegistry();

    const result = await runZoomTick({ queue, registry, workerId: 'w1', batchSize: 2 });

    expect(result).toEqual({ claimed: 3, completed: 3, failed: 0 });
    expect(seen).toEqual(['job-a', 'job-b', 'job-c']);
    // 2 + 1 + a final empty claim that breaks the loop.
    expect(calls.claim).toHaveLength(3);
  });

  it('stops CLAIMING once the soft budget is spent, leaving the rest pending', async () => {
    const { queue, rows, calls } = createFakeQueue([
      makeJob({ id: 'job-a', job_type: 'noop' }),
      makeJob({ id: 'job-b', job_type: 'noop' }),
      makeJob({ id: 'job-c', job_type: 'noop' }),
      makeJob({ id: 'job-d', job_type: 'noop' }),
    ]);
    const { registry } = recordingRegistry();

    // Clock jumps 30 s per read: start=0, first gate=30 s (under budget), second
    // gate=60 s (over).
    let ticks = 0;
    const now = () => {
      const value = ticks * 30_000;
      ticks += 1;
      return value;
    };

    const result = await runZoomTick({
      queue,
      registry,
      workerId: 'w1',
      batchSize: 2,
      budgetMs: 50_000,
      now,
    });

    expect(calls.claim).toHaveLength(1);
    // The claimed batch is always worked to the end — never abandoned mid-lease.
    expect(result).toEqual({ claimed: 2, completed: 2, failed: 0 });
    expect(rows.get('job-c')?.status).toBe('pending');
    expect(rows.get('job-d')?.status).toBe('pending');
  });
});
