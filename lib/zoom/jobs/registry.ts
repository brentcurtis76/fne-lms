/**
 * Job-type → handler dispatch table for the Zoom ticker (plan §4).
 *
 * A registry rather than a `switch` because the ticker's suite has to be able to
 * dispatch to doubles without mocking a module, and because the set of job types
 * grows one chunk at a time (Z1b-3 owns `host_sync`; provisioning is Z1b-4,
 * recordings are Z4).
 *
 * The handler contract itself lives in `./types` — this module imports handlers, so
 * it must not be what handlers import.
 */
import { hostSyncJobHandler } from './host-sync';
import type { ZoomJobHandler, ZoomJobRegistry } from './types';

export type { ZoomJobContext, ZoomJobHandler, ZoomJobRegistry } from './types';
export { ZoomJobLeaseLostError } from './types';

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
 * per-request dependencies.
 *
 * Every job type Z1b-3 knows about is here. A type NOT in this table is claimed
 * anyway (the runner passes `p_job_types = NULL`) and marked terminally `failed` —
 * see `runner.ts` for why that is the recoverable outcome rather than the silent one.
 */
export function createZoomJobRegistry(): ZoomJobRegistry {
  return {
    host_sync: hostSyncJobHandler,
    noop: noopJobHandler,
  };
}
