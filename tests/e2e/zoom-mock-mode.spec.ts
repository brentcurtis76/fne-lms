import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parse as parseEnv } from 'dotenv';

/**
 * Z1c-4 — `ZOOM_MODE=mock` is real, and the e2e gate cannot reach live Zoom.
 *
 * `ci.yml` has declared `ZOOM_MODE=mock` since Z1c-1, and its own comment admitted the
 * declaration was "protective and currently unexercised": no spec reached `getZoomApi()`,
 * because the only route to it is the job registry behind the cron endpoints. A floor
 * nobody has ever stood on is not known to hold. This spec stands on it.
 *
 * It drives a REGISTERED job through the RUNNING server rather than a unit harness:
 * `zoom-reconcile` enqueues `host_sync:<UTC hour>` (registry.ts:69), `zoom-ticker` claims
 * and runs it via `runZoomTick`. Both authenticate with `Authorization: Bearer
 * ${CRON_SECRET}` (cron-auth.ts:51). Nothing here is mocked — the queue is the real
 * `zoom_internal.zoom_jobs` table and the handler is the real one.
 *
 * ## Why job completion is the assertion, and not a 200 from the route
 *
 * The ticker answers 200 for an empty queue too. What is asserted instead is the job row
 * reaching terminal `done` with no `last_error`, plus the tick's own counters. And the
 * reason `done` proves the FAKE ran is the negative space around it: no `ZOOM_S2S_*`
 * credentials exist in this environment, so the live adapter could not have produced a
 * success — it throws `ZoomConfigError` while building the OAuth request. `done` is
 * therefore only reachable through `createZoomFake()`.
 *
 * ## Why host_sync, and why an empty inventory is the right fixture
 *
 * `host_sync` is low-impact and writes nothing outside `zoom_internal.zoom_hosts`. The fake
 * starts with an empty user list, and host-sync.ts:216 REFUSES to act on an empty snapshot
 * while active hosts exist — deactivating a whole inventory on one bad response is exactly
 * the accident that guard prevents. With `zoom_hosts` empty (the seeded state), an empty
 * page is instead a legitimate no-op that completes, which is the outcome this spec wants.
 *
 * ## The negative controls are a safety requirement, not a formality
 *
 * A proof that the gate "uses the mock" is worthless if it would pass just as happily while
 * talking to Zoom. Both controls below are structurally incapable of emitting a request:
 *
 *   PRIMARY — `ZOOM_MODE=bogus`. `resolveZoomMode` (api.ts:431-436) throws `ZoomConfigError`
 *   for any value that is not 'live' or 'mock', and it throws INSIDE `getZoomApi` BEFORE
 *   `createLiveZoomApi()` is ever constructed. No client, no token provider, no socket.
 *
 *   SECONDARY — `ZOOM_MODE=''`, which `resolveZoomMode` treats exactly as unset and resolves
 *   to `live`. This one reaches `createLiveZoomApi()` → `createZoomClient()` →
 *   `getZoomTokenProvider()`, so it was verified by reading the chain rather than assumed:
 *   the first thing `grantFromZoom()` does is `readCredentials(env)` at token.ts:242, and
 *   the OAuth `fetchImpl(...)` call is at token.ts:248. With no credentials present,
 *   `readCredentials` throws `ZoomConfigError` at :242 — six lines before anything is sent.
 *   The throw happens while BUILDING the request, so the unset path cannot reach the
 *   network either.
 *
 * Empty-string rather than deleting the variable, because `.env.local` declares
 * `ZOOM_MODE=mock` and `@next/env` does not overwrite a key already present in the spawned
 * process's environment — verified empirically — whereas an unset key would simply be
 * refilled from the file and silently re-run the positive case.
 *
 * Both controls assert the failure is CONFIG-shaped, not network- or auth-shaped. That
 * distinction is the whole point: it separates "refused to run" from "tried and failed".
 *
 * This spec is mandatory (scripts/ci/e2e-mandatory.mjs) — it fails the gate if skipped.
 * Requires the seeded local Supabase stack and a production build (`next start`).
 */

const ROOT = join(__dirname, '..', '..');

/**
 * The e2e job in `ci.yml` writes `.env.local` and sources it only for the seed step, so the
 * Playwright process itself does not inherit the service key or `CRON_SECRET`. Read the file
 * directly; a real `process.env` entry still wins.
 */
const fileEnv: Record<string, string> = parseEnv(readFileSync(join(ROOT, '.env.local'), 'utf8'));

function requiredEnv(key: string): string {
  const value = process.env[key] || fileEnv[key];
  if (!value) {
    throw new Error(
      `[zoom-mock-mode] ${key} is not set. The e2e environment must declare it — see the ` +
        'ZOOM_MODE/CRON_SECRET block in .github/workflows/ci.yml.'
    );
  }
  return value;
}

/** Server-to-server Zoom credentials. Their ABSENCE is what makes the proof meaningful. */
const ZOOM_CREDENTIAL_VARS = [
  'ZOOM_S2S_ACCOUNT_ID',
  'ZOOM_S2S_CLIENT_ID',
  'ZOOM_S2S_CLIENT_SECRET',
] as const;

const CRON_SECRET = requiredEnv('CRON_SECRET');

const supabase: SupabaseClient = createClient(
  requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const zoomJobs = () => supabase.schema('zoom_internal').from('zoom_jobs');

interface ZoomJobRow {
  id: string;
  job_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
}

/**
 * Both cron routes dedupe on the UTC hour, so a second reconcile in the same hour enqueues
 * nothing and returns a clean 200. Every phase below therefore starts from an empty queue —
 * otherwise the negative controls would silently reuse the job the positive case completed.
 */
async function clearZoomJobs(): Promise<void> {
  const { error } = await zoomJobs().delete().in('job_type', ['host_sync', 'webhook_sweep']);
  if (error) throw new Error(`[zoom-mock-mode] could not clear zoom_jobs: ${error.message}`);
}

/**
 * `planReconcileJobs` enqueues `webhook_sweep` alongside `host_sync`. This spec is about
 * `host_sync`, so the sweep is dropped before the tick rather than asserted around — a
 * proof should not depend on the health of a job it is not making claims about.
 */
async function dropWebhookSweepJob(): Promise<void> {
  const { error } = await zoomJobs().delete().eq('job_type', 'webhook_sweep');
  if (error) throw new Error(`[zoom-mock-mode] could not drop webhook_sweep: ${error.message}`);
}

async function readHostSyncJob(): Promise<ZoomJobRow | null> {
  const { data, error } = await zoomJobs()
    .select('id, job_type, status, attempts, last_error')
    .eq('job_type', 'host_sync')
    .maybeSingle();
  if (error) throw new Error(`[zoom-mock-mode] could not read host_sync job: ${error.message}`);
  return (data as ZoomJobRow | null) ?? null;
}

async function postCron(baseUrl: string, path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

/**
 * Enqueue, isolate `host_sync`, then run exactly one tick. Returns the tick's counters and
 * the job row as it stands afterwards.
 */
async function runHostSyncCycle(
  baseUrl: string
): Promise<{ reconcile: { status: number; body: any }; tick: { status: number; body: any }; job: ZoomJobRow | null }> {
  await clearZoomJobs();

  const reconcile = await postCron(baseUrl, '/api/cron/zoom-reconcile');
  await dropWebhookSweepJob();

  const tick = await postCron(baseUrl, '/api/cron/zoom-ticker');
  return { reconcile, tick, job: await readHostSyncJob() };
}

/**
 * A second production server with a doctored environment, so a negative control exercises
 * the SAME route, registry and handler as the positive proof rather than an analogue of it.
 * `next start` reuses the build the gate already produced.
 */
async function startServer(port: number, overrides: Record<string, string>): Promise<ChildProcess> {
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: ROOT,
    env: { ...fileEnv, ...process.env, ...overrides },
    stdio: 'pipe',
  });

  // An unauthenticated ticker POST answers 401 without touching the queue — the cheapest
  // probe that proves the server is up AND routing to the endpoint under test.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/api/cron/zoom-ticker`, { method: 'POST' });
      if (probe.status === 401) return child;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  child.kill('SIGKILL');
  throw new Error(`[zoom-mock-mode] server on port ${port} never became ready`);
}

async function stopServer(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, 10_000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/** Network- and auth-shaped failure signatures. A config refusal must match NONE of these. */
const NOT_CONFIG_SHAPED =
  /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket|transport layer|fetch failed|rate limited|401|403|zoom\.us/i;

// Serial: every test mutates the shared `zoom_jobs` queue.
test.describe.configure({ mode: 'serial' });

test.describe('ZOOM_MODE=mock — a registered job runs on the fake, through the server', () => {
  test.setTimeout(180_000);

  test('the e2e environment carries no live Zoom credentials', async () => {
    // The load-bearing precondition. If this ever fails, every "it used the mock" claim
    // below collapses, because a live adapter would then have had something to try.
    for (const key of ZOOM_CREDENTIAL_VARS) {
      expect(
        process.env[key] || fileEnv[key] || '',
        `${key} is set in the e2e environment — the mock-mode proof assumes it is not`
      ).toBe('');
    }
    expect(process.env.ZOOM_MODE || fileEnv.ZOOM_MODE).toBe('mock');
  });

  test('host_sync reaches terminal success using the fake adapter', async ({ baseURL }) => {
    const { reconcile, tick, job } = await runHostSyncCycle(baseURL!);

    expect(reconcile.status, 'reconcile should authenticate and enqueue').toBe(200);
    expect(reconcile.body.enqueued).toBeGreaterThanOrEqual(1);

    expect(tick.status, 'ticker should authenticate and run').toBe(200);
    expect(tick.body.claimed, 'the tick claimed no job').toBeGreaterThanOrEqual(1);
    expect(tick.body.completed, 'the tick completed no job').toBeGreaterThanOrEqual(1);
    expect(tick.body.failed, 'a job failed during the tick').toBe(0);

    // Terminal success on the row itself, not just a 200 from the route.
    expect(job, 'the host_sync job row disappeared').not.toBeNull();
    expect(job!.status, `host_sync ended '${job!.status}': ${job!.last_error ?? 'no error'}`).toBe(
      'done'
    );
    expect(job!.last_error).toBeNull();
  });
});

test.describe('the negative controls — the proof fails without ZOOM_MODE, and cannot call Zoom', () => {
  test.setTimeout(240_000);

  test("PRIMARY: an invalid ZOOM_MODE refuses before the live adapter is built", async () => {
    let server: ChildProcess | undefined;
    try {
      // resolveZoomMode throws for this value before createLiveZoomApi() is constructed,
      // so this control is structurally incapable of reaching the network.
      server = await startServer(3101, { ZOOM_MODE: 'bogus' });
      const { tick, job } = await runHostSyncCycle('http://127.0.0.1:3101');

      // The tick itself still succeeds — the queue is healthy; it is the JOB that refuses.
      expect(tick.status).toBe(200);
      expect(tick.body.completed, 'a job completed under an invalid ZOOM_MODE').toBe(0);
      expect(tick.body.failed).toBeGreaterThanOrEqual(1);

      expect(job).not.toBeNull();
      // ZoomConfigError extends ZoomNonRetryableError, so the RPC maps it to terminal
      // 'failed' rather than a retry — a misconfiguration no backoff can fix.
      expect(job!.status).toBe('failed');
      expect(job!.last_error, 'the failure was not config-shaped').toMatch(
        /ZOOM_MODE must be 'live' or 'mock'/
      );
      expect(job!.last_error).toContain('bogus');
      expect(
        job!.last_error,
        'the failure looks network- or auth-shaped, i.e. something was attempted'
      ).not.toMatch(NOT_CONFIG_SHAPED);
    } finally {
      await stopServer(server);
    }
  });

  test('SECONDARY: an unset ZOOM_MODE resolves live and refuses on missing credentials', async () => {
    let server: ChildProcess | undefined;
    try {
      // '' is treated exactly as unset by resolveZoomMode (api.ts:432) and survives
      // .env.local, which would otherwise refill a deleted key with 'mock'.
      server = await startServer(3102, { ZOOM_MODE: '' });
      const { tick, job } = await runHostSyncCycle('http://127.0.0.1:3102');

      expect(tick.status).toBe(200);
      expect(tick.body.completed, 'a job completed with no Zoom credentials').toBe(0);
      expect(tick.body.failed).toBeGreaterThanOrEqual(1);

      expect(job).not.toBeNull();
      expect(job!.status).toBe('failed');

      // readCredentials (token.ts:207-226) throws while BUILDING the OAuth request — it is
      // called at token.ts:242, six lines before the fetch at :248 — so this names the
      // missing variables rather than reporting a transport or auth outcome.
      expect(job!.last_error, 'the failure was not config-shaped').toMatch(
        /Zoom S2S credentials missing/
      );
      for (const key of ZOOM_CREDENTIAL_VARS) {
        expect(job!.last_error).toContain(key);
      }
      expect(
        job!.last_error,
        'the failure looks network- or auth-shaped, i.e. a request was attempted'
      ).not.toMatch(NOT_CONFIG_SHAPED);
    } finally {
      await stopServer(server);
    }
  });
});
