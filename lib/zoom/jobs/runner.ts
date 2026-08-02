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
 * Three optional fields ride along beside it, all declared by the throwing error and
 * none of them derived here: `reason` (the sub-discriminator triage buckets on),
 * `detail` (one level finer), and `evidence` (the structured VALUES a manual remedy
 * needs — see `ZoomJobFailureRecord.evidence`). A handler that has to hand a human a
 * meeting number puts it there, not in the sentence.
 *
 * `isRetryableKind()` is the retry signal, passed straight through as `p_retryable`,
 * and `retryAfterSeconds` rides along as `p_retry_after_seconds`. What happens next —
 * backoff schedule, the floor the hint imposes on it, dead-lettering at `max_attempts`,
 * terminal `failed` for a non-retryable — belongs to the RPC and is not re-decided here.
 * The runner's job is to hand the RPC every input it needs; it decides nothing about
 * WHEN a job runs again.
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
  /**
   * Sub-discriminator, one level finer than `kind`. Set by the runner for failures it
   * raises itself (`unknown_job_type`), and carried through from any `ZoomError` that
   * declares a `reason` — which is how `meeting_provision` surfaces §9's terminal
   * `no_host_available` to triage and the health panel structurally, rather than by
   * making somebody match a message string.
   */
  reason?: string;
  /**
   * A third level, one finer than `reason`, for failures whose reason alone does not
   * say WHICH input was wrong — `meeting_provision`'s `session_ineligible` carries the
   * failed eligibility check (`status`, `is_active`, `modality`, `meeting_provider`)
   * here, so triage can bucket them without parsing a sentence.
   */
  detail?: string;
  status?: number;
  zoomCode?: number;
  operation?: string;
  retryAfterSeconds?: number;
  /**
   * Zoom's `x-zm-request-id`, when the response carried one. Stored so a human
   * resolving a job by hand — an `ambiguous_create_outcome` above all — has the one
   * identifier a Zoom support ticket can be opened against.
   */
  requestId?: string;
  /**
   * Structured triage evidence, for the failures whose remedy needs VALUES rather than
   * a category: `meeting_provision`'s `possible_orphan` carries the meeting number Zoom
   * minted for the losing attempt and the number the winner persisted, because those two
   * numbers ARE the remedy (cancel the first at Zoom) and this record is the only place
   * they survive — `complete_zoom_job` replaces `stage_state`, and a failed attempt never
   * wrote its number to a row.
   *
   * An object, not a formatted string, for the same reason `kind` is not a message
   * prefix: triage reads fields. Nothing here may carry student PII — meeting numbers and
   * internal row ids only, and `zoom_jobs` is service-role-only by the §6 GRANT lockdown.
   *
   * As produced by `describeJobFailure` this is always a JSON-SAFE clone of what the error
   * declared (Sol R8 ③) — never the handler's own object — or, when it could not be made
   * one, `{ evidence_unserializable: <error class> }`.
   */
  evidence?: Record<string, unknown>;
  /** Human-facing only. Nothing may branch on this string. */
  message: string;
}

/** A `ZoomError` subclass may declare a `reason`; nothing else may set one. */
function readErrorReason(error: unknown): string | undefined {
  const reason = (error as { reason?: unknown }).reason;
  return typeof reason === 'string' && reason !== '' ? reason : undefined;
}

/** Same contract as `reason`, one level down. */
function readErrorDetail(error: unknown): string | undefined {
  const detail = (error as { detail?: unknown }).detail;
  return typeof detail === 'string' && detail !== '' ? detail : undefined;
}

/**
 * The field name a record carries INSTEAD of its evidence when the evidence could not be
 * serialized. Structural, like everything else in this record: triage sees that evidence
 * existed and was lost, rather than a job that failed for no stated reason.
 */
export const UNSERIALIZABLE_EVIDENCE_FIELD = 'evidence_unserializable';

/**
 * Same contract again: only a `ZoomError` subclass may declare `evidence`, and only a
 * plain object counts. Anything else is dropped rather than stored.
 *
 * The shape check is not enough on its own (Sol R8 ③). A plain object can still be
 * unserializable — cyclic, holding a `BigInt`, or carrying a getter that throws — and
 * `JSON.stringify` would then throw INSIDE the runner's failure path, which is the one
 * place that must not throw: `fail_zoom_job` would never run, and the job would die by
 * lease expiry with its whole record lost. So the evidence is round-tripped through JSON
 * HERE, defensively, and replaced by a marker naming the failure's class if it cannot be.
 * Reading the property is itself wrapped, because that access can be a throwing getter too.
 */
function readErrorEvidence(error: unknown): Record<string, unknown> | undefined {
  let evidence: unknown;
  try {
    evidence = (error as { evidence?: unknown }).evidence;
  } catch (accessError) {
    return { [UNSERIALIZABLE_EVIDENCE_FIELD]: errorClassName(accessError) };
  }
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    return undefined;
  }
  return sanitizeEvidence(evidence);
}

/** The constructor name of a thrown value — never its message, which may carry anything. */
function errorClassName(error: unknown): string {
  if (error instanceof Error) return error.constructor?.name ?? 'Error';
  return typeof error;
}

/**
 * A JSON-safe clone of `evidence`, or a minimal marker when it cannot be made one.
 *
 * The round trip is the check: whatever survives `JSON.parse(JSON.stringify(x))` is by
 * construction something `serializeJobFailure` can write. Anything else — cyclic, BigInt,
 * a throwing getter, a `toJSON` that returns `undefined` — is replaced rather than
 * propagated, and only the ERROR CLASS is kept, because an arbitrary message from a
 * serializer is not a field triage can key on and is not a place to put unvetted text.
 */
function sanitizeEvidence(evidence: object): Record<string, unknown> {
  try {
    const cloned: unknown = JSON.parse(JSON.stringify(evidence));
    if (typeof cloned !== 'object' || cloned === null || Array.isArray(cloned)) {
      return { [UNSERIALIZABLE_EVIDENCE_FIELD]: 'TypeError' };
    }
    return cloned as Record<string, unknown>;
  } catch (error) {
    return { [UNSERIALIZABLE_EVIDENCE_FIELD]: errorClassName(error) };
  }
}

export function describeJobFailure(error: unknown): ZoomJobFailureRecord {
  if (isZoomError(error)) {
    return {
      kind: error.kind,
      reason: readErrorReason(error),
      detail: readErrorDetail(error),
      status: error.status,
      zoomCode: error.zoomCode,
      operation: error.operation,
      retryAfterSeconds: error.retryAfterSeconds,
      requestId: error.requestId,
      evidence: readErrorEvidence(error),
      message: error.message.slice(0, MAX_STORED_MESSAGE_CHARS),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'unknown', message: message.slice(0, MAX_STORED_MESSAGE_CHARS) };
}

/**
 * The record as `zoom_jobs.last_error` stores it. TOTAL: it cannot throw (Sol R8 ③).
 *
 * `describeJobFailure` already hands back a JSON-safe `evidence`, so the first attempt is
 * the one that runs in practice. The retry underneath it exists because this function is
 * exported and takes a hand-built record, and because a single throw here would abort the
 * runner's failure path before `fail_zoom_job` — the failure mode being fixed. Each step
 * preserves strictly more than the one below it: full record → record minus evidence →
 * the discriminators triage keys on.
 */
export function serializeJobFailure(record: ZoomJobFailureRecord): string {
  let failure = 'Error';
  /** `null` when this shape could not be encoded; remembers WHY for the next shape. */
  const attempt = (build: () => unknown): string | null => {
    try {
      const json = JSON.stringify(build());
      return typeof json === 'string' ? json : null;
    } catch (error) {
      failure = errorClassName(error);
      return null;
    }
  };

  return (
    attempt(() => record) ??
    attempt(() => ({ ...record, evidence: { [UNSERIALIZABLE_EVIDENCE_FIELD]: failure } })) ??
    // Everything but the taxonomy is now suspect. `kind` is what the retry rules read and
    // `reason`/`detail` are what triage buckets on; losing those makes a job unclassifiable.
    attempt(() => ({
      kind: typeof record.kind === 'string' ? record.kind : 'unknown',
      reason: typeof record.reason === 'string' ? record.reason : undefined,
      detail: typeof record.detail === 'string' ? record.detail : undefined,
      evidence: { [UNSERIALIZABLE_EVIDENCE_FIELD]: failure },
      message: 'The failure record could not be serialized.',
    })) ??
    // No property of the record can be trusted to be readable. Still valid JSON, still
    // `kind`-keyed, and still a `fail_zoom_job` call rather than a lease expiry.
    `{"kind":"unknown","${UNSERIALIZABLE_EVIDENCE_FIELD}":"unreadable","message":"The failure record could not be serialized."}`
  );
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
      // The provider's own Retry-After, carried into SCHEDULING rather than only into
      // the stored record. Storing it and then re-claiming at 30 s was the whole of
      // Sol F2: `fail_zoom_job` floors the backoff at this value.
      p_retry_after_seconds: record.retryAfterSeconds ?? null,
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
