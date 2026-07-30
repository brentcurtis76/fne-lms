/**
 * The Zoom ticker's work loop: claim a leased batch, dispatch it, report each job's
 * outcome back to the queue (plan §4).
 *
 * Split out of the route so the loop is testable without HTTP, and so
 * `/api/cron/zoom-ticker` stays what a route should be — auth, invoke, serialize.
 *
 * ## Failures are stored STRUCTURALLY, and `kind` is the key
 *
 * `fail_zoom_job(p_error text)` takes text, not jsonb — `zoom_jobs.last_error` is a
 * `text` column (see `20260729120100_zoom_internal_tables.sql`). So the structured
 * record is JSON-encoded into it: triage (and any §18 alerting) parses
 * `last_error` and keys on `.kind`, `.status` and `.operation`.
 *
 * It must NEVER key on the message. The Z1b-2·r1 ledger consumer note is explicit
 * that `ZoomError` message prefixes are not stable, and the error module's own header
 * says the message carries Zoom's wording verbatim — which Zoom can change without
 * telling anyone. `kind` is the four-value taxonomy the retry rules are defined on,
 * and it is the only field with a contract.
 *
 * `isRetryableKind()` is the retry signal, passed straight through as `p_retryable`.
 * What happens next — backoff schedule, dead-lettering at `max_attempts`, terminal
 * `failed` for a non-retryable — belongs to the RPC and is not re-decided here.
 *
 * ## Claiming every job type, on purpose
 *
 * `p_job_types` is left NULL so an UNKNOWN job type is claimed and immediately
 * marked non-retryable rather than sitting `pending` forever, invisible. The RPC maps
 * `p_retryable = false` to status `'failed'` — terminal *and manually triageable* —
 * not to `'dead'`, so a job enqueued by a newer deploy and claimed by an older
 * instance is recoverable by re-queueing it, never silently binned.
 */
import { randomUUID } from 'crypto';
import { isRetryableKind, isZoomError, type ZoomErrorKind } from '../errors';
import type { ZoomJobRow } from '../db-types';
import type { ZoomJobQueue } from './queue';
import {
  ZoomJobLeaseLostError,
  type ZoomJobContext,
  type ZoomJobRegistry,
} from './types';

/**
 * ~50 s. Vercel's default function timeout is far higher, but the ticker is scheduled
 * every minute: a tick that outran its own schedule would pile invocations on top of
 * each other. Stopping short leaves the leftovers `pending` for the next tick, which
 * is exactly what a durable queue is for.
 */
export const DEFAULT_TICK_BUDGET_MS = 50_000;

/** Jobs leased per claim. Small, because one slow job should not strand a batch. */
export const DEFAULT_BATCH_SIZE = 5;

/** Lease length. Longer than any handler here; heartbeats extend it when needed. */
export const DEFAULT_LEASE_SECONDS = 300;

/** Enough for triage; short enough that a pathological error cannot bloat the row. */
const MAX_STORED_MESSAGE_CHARS = 500;

// ---------------------------------------------------------------------------
// Structured failure records
// ---------------------------------------------------------------------------

export interface ZoomJobFailureRecord {
  /** The retry taxonomy. `'unknown'` = a non-`ZoomError` escaped a handler. */
  kind: ZoomErrorKind | 'unknown';
  /** Sub-discriminator for failures the runner itself raises. */
  reason?: 'unknown_job_type';
  status?: number;
  zoomCode?: number;
  operation?: string;
  retryAfterSeconds?: number;
  /** Human-facing only. Nothing may branch on this string. */
  message: string;
}

export function describeJobFailure(error: unknown): ZoomJobFailureRecord {
  if (isZoomError(error)) {
    return {
      kind: error.kind,
      status: error.status,
      zoomCode: error.zoomCode,
      operation: error.operation,
      retryAfterSeconds: error.retryAfterSeconds,
      message: error.message.slice(0, MAX_STORED_MESSAGE_CHARS),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'unknown', message: message.slice(0, MAX_STORED_MESSAGE_CHARS) };
}

export function serializeJobFailure(record: ZoomJobFailureRecord): string {
  return JSON.stringify(record);
}

/**
 * An untyped error is treated as retryable, matching `fail_zoom_job`'s own default.
 * A genuine bug therefore burns its `max_attempts` with backoff and dead-letters,
 * which is self-limiting; the alternative — terminal on first sight — would strand a
 * transient failure nobody had thought to type yet.
 */
function isRetryableFailure(record: ZoomJobFailureRecord): boolean {
  if (record.kind === 'unknown') return true;
  return isRetryableKind(record.kind);
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export interface RunZoomTickDeps {
  queue: ZoomJobQueue;
  registry: ZoomJobRegistry;
  /** Per-invocation-unique. Two overlapping ticks must never share one. */
  workerId?: string;
  now?: () => number;
  budgetMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
}

export interface ZoomTickResult {
  claimed: number;
  completed: number;
  failed: number;
}

/** `zoom-ticker:<uuid>` — unique per invocation, and greppable in `zoom_jobs`. */
export function createTickerWorkerId(): string {
  return `zoom-ticker:${randomUUID()}`;
}

export async function runZoomTick(deps: RunZoomTickDeps): Promise<ZoomTickResult> {
  const now = deps.now ?? (() => Date.now());
  const budgetMs = deps.budgetMs ?? DEFAULT_TICK_BUDGET_MS;
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const leaseSeconds = deps.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const workerId = deps.workerId ?? createTickerWorkerId();

  const startedAt = now();
  const result: ZoomTickResult = { claimed: 0, completed: 0, failed: 0 };

  // The budget gates CLAIMING, never dispatch: a batch this worker already leased is
  // always worked to the end, so no job is abandoned mid-lease waiting for the lease
  // to expire.
  while (now() - startedAt < budgetMs) {
    const batch = await deps.queue.claim({
      p_worker_id: workerId,
      // NULL = every type. See the module header.
      p_job_types: null,
      p_max_n: batchSize,
      p_lease_seconds: leaseSeconds,
    });

    if (batch.length === 0) break;
    result.claimed += batch.length;

    for (const job of batch) {
      const outcome = await runOneJob(job, {
        queue: deps.queue,
        registry: deps.registry,
        workerId,
        leaseSeconds,
      });
      if (outcome === 'completed') result.completed += 1;
      else result.failed += 1;
    }
  }

  return result;
}

interface RunOneJobDeps {
  queue: ZoomJobQueue;
  registry: ZoomJobRegistry;
  workerId: string;
  leaseSeconds: number;
}

async function runOneJob(
  job: ZoomJobRow,
  deps: RunOneJobDeps
): Promise<'completed' | 'failed'> {
  const handler = deps.registry[job.job_type];

  if (!handler) {
    await deps.queue.fail({
      p_job_id: job.id,
      p_worker_id: deps.workerId,
      p_error: serializeJobFailure({
        kind: 'non_retryable',
        reason: 'unknown_job_type',
        operation: job.job_type,
        message: `No handler registered for job_type '${job.job_type}'.`,
      }),
      p_retryable: false,
    });
    console.error(`[zoom-ticker] no handler for job_type '${job.job_type}' (job ${job.id})`);
    return 'failed';
  }

  const ctx: ZoomJobContext = {
    job,
    workerId: deps.workerId,
    heartbeat: (stageState) =>
      deps.queue.heartbeat({
        p_job_id: job.id,
        p_worker_id: deps.workerId,
        p_lease_seconds: deps.leaseSeconds,
        p_stage_state: stageState ?? null,
      }),
  };

  let handlerResult: Record<string, unknown>;
  try {
    handlerResult = await handler(ctx);
  } catch (error) {
    if (error instanceof ZoomJobLeaseLostError) {
      // Do NOT call fail_zoom_job: the RPC would modify nothing (it matches on
      // worker_id) and the new leaseholder is already responsible for the job.
      console.warn(`[zoom-ticker] lease lost mid-handler for job ${job.id}`);
      return 'failed';
    }

    const record = describeJobFailure(error);
    const status = await deps.queue.fail({
      p_job_id: job.id,
      p_worker_id: deps.workerId,
      p_error: serializeJobFailure(record),
      p_retryable: isRetryableFailure(record),
    });
    console.error(
      `[zoom-ticker] job ${job.id} (${job.job_type}) failed: kind=${record.kind} status=${status ?? 'reclaimed'}`
    );
    return 'failed';
  }

  const marked = await deps.queue.complete({
    p_job_id: job.id,
    p_worker_id: deps.workerId,
    p_stage_state: { result: handlerResult },
  });

  if (!marked) {
    // The work is done, but the row was reclaimed before we could mark it — so it
    // will run again. That is the at-least-once contract, and it is why handlers are
    // required to be idempotent. Counted as completed because this attempt did
    // complete; the log is what says the lease was too short.
    console.warn(
      `[zoom-ticker] job ${job.id} (${job.job_type}) completed after its lease was reclaimed`
    );
  }
  return 'completed';
}
