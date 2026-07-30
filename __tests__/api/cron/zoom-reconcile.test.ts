// @vitest-environment node
/**
 * Reconcile suite (§17 slice, Z1b-3). The endpoint only enqueues, so the whole
 * contract is: authenticate, produce the right dedupe key, do not duplicate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

import {
  handleZoomReconcile,
  planReconcileJobs,
  utcHourKey,
} from '../../../pages/api/cron/zoom-reconcile';
import type { EnqueueResult, ZoomJobQueue } from '../../../lib/zoom/jobs/queue';
import type { ZoomJobInsert } from '../../../lib/zoom/db-types';

const CRON_SECRET = 'synthetic-vercel-cron-secret';
const CRON_API_KEY = 'synthetic-repo-cron-api-key';
const ENV = { CRON_SECRET, CRON_API_KEY } as unknown as NodeJS.ProcessEnv;

const NOON_UTC = Date.parse('2026-07-30T12:34:56.789Z');

/** Models the UNIQUE(dedupe_key) index — the only thing this endpoint relies on. */
function createFakeQueue() {
  const seen = new Set<string>();
  const enqueued: ZoomJobInsert[] = [];

  const queue = {
    async enqueue(job: ZoomJobInsert): Promise<EnqueueResult> {
      enqueued.push(job);
      if (job.dedupe_key && seen.has(job.dedupe_key)) return 'duplicate';
      if (job.dedupe_key) seen.add(job.dedupe_key);
      return 'enqueued';
    },
  } as unknown as ZoomJobQueue;

  return { queue, enqueued };
}

async function invokeReconcile(options: {
  method?: string;
  headers?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  queue?: ZoomJobQueue;
  nowMs?: number;
}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: (options.method ?? 'GET') as 'GET',
    headers: options.headers ?? { authorization: `Bearer ${CRON_SECRET}` },
  });
  await handleZoomReconcile(req, res, {
    env: options.env ?? ENV,
    queue: options.queue ?? createFakeQueue().queue,
    now: () => options.nowMs ?? NOON_UTC,
  });
  return res;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('/api/cron/zoom-reconcile — auth and method', () => {
  it('accepts either cron scheme', async () => {
    const viaBearer = await invokeReconcile({ headers: { authorization: `Bearer ${CRON_SECRET}` } });
    const viaHeader = await invokeReconcile({ headers: { 'x-cron-key': CRON_API_KEY } });
    expect(viaBearer._getStatusCode()).toBe(200);
    expect(viaHeader._getStatusCode()).toBe(200);
  });

  it('rejects an unauthenticated request and one with both env vars unset', async () => {
    const noHeaders = await invokeReconcile({ headers: {} });
    const noEnv = await invokeReconcile({
      env: {} as NodeJS.ProcessEnv,
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(noHeaders._getStatusCode()).toBe(401);
    expect(noEnv._getStatusCode()).toBe(401);
  });

  it('accepts GET and POST, and 405s anything else', async () => {
    expect((await invokeReconcile({ method: 'GET' }))._getStatusCode()).toBe(200);
    expect((await invokeReconcile({ method: 'POST' }))._getStatusCode()).toBe(200);
    const put = await invokeReconcile({ method: 'PUT' });
    expect(put._getStatusCode()).toBe(405);
    expect(put.getHeader('Allow')).toBe('GET, POST');
  });
});

describe('/api/cron/zoom-reconcile — hourly enqueue', () => {
  it('enqueues host_sync and webhook_sweep, each keyed on the UTC hour', async () => {
    const { queue, enqueued } = createFakeQueue();
    const res = await invokeReconcile({ queue });

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ enqueued: 2 });
    expect(enqueued).toEqual([
      {
        job_type: 'host_sync',
        payload: { source: 'reconcile' },
        dedupe_key: 'host_sync:2026-07-30T12',
      },
      {
        job_type: 'webhook_sweep',
        payload: { source: 'reconcile' },
        dedupe_key: 'webhook_sweep:2026-07-30T12',
      },
    ]);
  });

  it('a second call in the same hour conflicts and enqueues nothing', async () => {
    const { queue, enqueued } = createFakeQueue();

    const first = await invokeReconcile({ queue });
    const second = await invokeReconcile({ queue });

    expect(JSON.parse(first._getData())).toEqual({ enqueued: 2 });
    expect(JSON.parse(second._getData())).toEqual({ enqueued: 0 });
    // Both calls attempted both inserts; the UNIQUE index is what made the second pass
    // a no-op, exactly as a Vercel double-fire would be.
    expect(enqueued).toHaveLength(4);
    expect(enqueued[0].dedupe_key).toBe(enqueued[2].dedupe_key);
    expect(enqueued[1].dedupe_key).toBe(enqueued[3].dedupe_key);
  });

  it('the next hour gets its own key', async () => {
    const { queue } = createFakeQueue();

    const noon = await invokeReconcile({ queue, nowMs: NOON_UTC });
    const onePast = await invokeReconcile({
      queue,
      nowMs: Date.parse('2026-07-30T13:00:00.000Z'),
    });

    expect(JSON.parse(noon._getData())).toEqual({ enqueued: 2 });
    expect(JSON.parse(onePast._getData())).toEqual({ enqueued: 2 });
  });

  it('answers 500 when the queue is unreachable', async () => {
    const queue = {
      async enqueue() {
        throw new Error('zoom_jobs enqueue failed: connection refused');
      },
    } as unknown as ZoomJobQueue;

    const res = await invokeReconcile({ queue });
    expect(res._getStatusCode()).toBe(500);
  });
});

describe('reconcile plan', () => {
  it('keys the hour in UTC, not in the invoking region local time', () => {
    // 23:30 in Santiago (UTC−4 in July) is 03:30 UTC the NEXT day. A local-time key
    // would collide across the DST transition; the UTC key cannot.
    expect(utcHourKey(Date.parse('2026-07-31T03:30:00.000Z'))).toBe('2026-07-31T03');
    expect(utcHourKey(Date.parse('2026-07-31T03:59:59.999Z'))).toBe('2026-07-31T03');
    expect(utcHourKey(Date.parse('2026-07-31T04:00:00.000Z'))).toBe('2026-07-31T04');
  });

  it('plans exactly the two jobs this phase owns — the rest are later chunks', () => {
    const jobs = planReconcileJobs(NOON_UTC);
    expect(jobs.map((job) => job.job_type)).toEqual(['host_sync', 'webhook_sweep']);
  });

  it('gives every planned job its own hour-scoped dedupe key', () => {
    const jobs = planReconcileJobs(NOON_UTC);
    const keys = jobs.map((job) => job.dedupe_key);
    expect(keys).toEqual(['host_sync:2026-07-30T12', 'webhook_sweep:2026-07-30T12']);
    // Distinct keys, or one job's enqueue would suppress the other's.
    expect(new Set(keys).size).toBe(jobs.length);
  });
});
