/**
 * Job-type → handler dispatch table for the Zoom ticker (plan §4).
 *
 * A registry rather than a `switch` because the ticker's suite has to be able to
 * dispatch to doubles without mocking a module, and because the set of job types
 * grows one chunk at a time (Z1b-3 owns `host_sync`; provisioning is Z1b-4,
 * recordings are Z4).
 *
 * Handlers must be IDEMPOTENT. `complete_zoom_job` can lose a race with a reclaim, so
 * the queue is at-least-once by construction (plan §12) — a handler that ran twice
 * must produce the same world as one that ran once.
 */
import type { ZoomJobRow } from '../db-types';

export interface ZoomJobContext {
  job: ZoomJobRow;
  workerId: string;
  /**
   * Extends this worker's lease, optionally checkpointing `stage_state`. Returns
   * `false` when the lease was lost or expired — at which point the RPC contract says
   * the worker MUST stop, because another worker now owns the job. Long handlers call
   * this between units of work and throw `ZoomJobLeaseLostError` on `false`.
   */
  heartbeat(stageState?: Record<string, unknown>): Promise<boolean>;
}

/** The returned object is stored as the job's `stage_state` on completion. */
export type ZoomJobHandler = (ctx: ZoomJobContext) => Promise<Record<string, unknown>>;

export type ZoomJobRegistry = Record<string, ZoomJobHandler>;

/**
 * Thrown by a handler that saw `heartbeat()` return false. Distinct from a job
 * failure: nothing is wrong with the job, this worker simply no longer owns it, so
 * the runner must not report a failure against a lease it does not hold.
 */
export class ZoomJobLeaseLostError extends Error {
  constructor(jobId: string) {
    super(`Lease lost for zoom job ${jobId}; another worker owns it now.`);
    this.name = 'ZoomJobLeaseLostError';
  }
}

/**
 * A handler that does nothing, successfully.
 *
 * Not test scaffolding: it is the safe target for a job type that has been retired,
 * and it gives the ticker's suite a real registry entry to dispatch through without
 * inventing one. Idempotent by definition.
 */
export const noopJobHandler: ZoomJobHandler = async (ctx) => ({
  noop: true,
  job_type: ctx.job.job_type,
});

/**
 * The production registry. Built per invocation so a handler can close over
 * per-request dependencies; today none of them need to.
 */
export function createZoomJobRegistry(): ZoomJobRegistry {
  return {
    noop: noopJobHandler,
  };
}
