/**
 * The job-handler contract, in a leaf module.
 *
 * Separate from `registry.ts` so a handler can depend on the contract without
 * depending on the table of every handler: `registry.ts` imports the handlers, the
 * handlers import this, and there is no cycle. (`ZoomJobLeaseLostError` is a runtime
 * value, so a type-only import would not have been enough to break one.)
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
