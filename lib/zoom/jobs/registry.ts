/**
 * Job-type → handler dispatch table for the Zoom ticker (plan §4).
 *
 * A registry rather than a `switch` because the ticker's suite has to be able to
 * dispatch to doubles without mocking a module, and because the set of job types
 * grows one chunk at a time (Z1b-3 owns `host_sync`; Z1b-4 adds `meeting_provision`
 * and `webhook_sweep`; Z2-3b adds `meeting_sync` and `meeting_delete`; recordings are
 * Z4).
 *
 * **Sequencing rule** (Z1b-3 finding ②): a new job type is registered HERE in the same
 * commit that ships its first enqueue. Otherwise a deploy skew lets a newer instance
 * enqueue a type an older instance claims and terminally fails.
 *
 * The handler contract itself lives in `./types` — this module imports handlers, so
 * it must not be what handlers import.
 */
import { createHostSyncHandler, type ZoomHostStore } from './host-sync';
import { createMeetingDeleteHandler, type MeetingDeleteStore } from './meeting-delete';
import {
  createMeetingProvisionHandler,
  type MeetingProvisionStore,
} from './meeting-provision';
import { createMeetingSyncHandler, type MeetingSyncStore } from './meeting-sync';
import { createWebhookSweepHandler } from './webhook-sweep';
import type { ZoomApi } from '../api';
import type { ZoomWebhookSweepStore } from '../webhook-store';
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
 * Optional per-invocation dependencies. Production passes nothing and every handler
 * resolves its own Zoom api and service-role store from env.
 *
 * They exist so a suite can run the REAL dispatch table — the one the ticker uses —
 * against a fake Zoom and in-memory stores. Asserting provisioning through a registry
 * assembled by the test would prove the handler works and say nothing about whether it
 * is actually wired up, which is precisely the failure the sequencing rule above
 * exists to prevent.
 */
export interface ZoomJobRegistryDeps {
  api?: ZoomApi;
  hostStore?: ZoomHostStore;
  meetingProvisionStore?: MeetingProvisionStore;
  meetingSyncStore?: MeetingSyncStore;
  meetingDeleteStore?: MeetingDeleteStore;
  webhookSweepStore?: ZoomWebhookSweepStore;
  env?: NodeJS.ProcessEnv;
}

/**
 * The production registry. Built per invocation so a handler can close over
 * per-request dependencies.
 *
 * Every job type Z1b knows about is here. A type NOT in this table is claimed
 * anyway (the runner passes `p_job_types = NULL`) and marked terminally `failed` —
 * see `runner.ts` for why that is the recoverable outcome rather than the silent one.
 */
export function createZoomJobRegistry(deps: ZoomJobRegistryDeps = {}): ZoomJobRegistry {
  return {
    host_sync: createHostSyncHandler({ api: deps.api, store: deps.hostStore, env: deps.env }),
    meeting_provision: createMeetingProvisionHandler({
      api: deps.api,
      store: deps.meetingProvisionStore,
      env: deps.env,
    }),
    // Z2-3b, registered in the SAME commit as their first enqueue (the sequencing rule
    // above): the reschedule and the cancel/modality-flip legs of the §8 lifecycle.
    meeting_sync: createMeetingSyncHandler({
      api: deps.api,
      store: deps.meetingSyncStore,
      env: deps.env,
    }),
    meeting_delete: createMeetingDeleteHandler({
      api: deps.api,
      store: deps.meetingDeleteStore,
      env: deps.env,
    }),
    webhook_sweep: createWebhookSweepHandler({ store: deps.webhookSweepStore, env: deps.env }),
    noop: noopJobHandler,
  };
}
