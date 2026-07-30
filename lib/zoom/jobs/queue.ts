/**
 * The `zoom_internal.zoom_jobs` queue seam.
 *
 * Every claim goes through `claim_zoom_jobs`, never through a `SELECT ... UPDATE`
 * written here: Vercel crons overlap, never retry, and can double-fire, so the lease
 * has to be atomic (`FOR UPDATE SKIP LOCKED`). The full behavioural contract —
 * runnable-set definition, the expired-lease attempt accounting, the backoff schedule,
 * the meaning of each return value — lives in
 * `supabase/migrations/20260729120200_zoom_jobs_rpcs.sql` and is NOT reimplemented
 * here. This module only marshals arguments and unwraps results.
 *
 * Structural client typing for the same reason `token.ts` does it: `types/supabase.ts`
 * predates `zoom_internal` entirely.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZoomServiceClient, zoomInternalSchema } from '../service-client';
import type {
  ClaimZoomJobsArgs,
  CompleteZoomJobArgs,
  FailZoomJobArgs,
  HeartbeatZoomJobArgs,
  ZoomJobInsert,
  ZoomJobRow,
  ZoomJobStatus,
} from '../db-types';

/** Outcome of a deduped enqueue. `'duplicate'` = the dedupe_key already existed. */
export type EnqueueResult = 'enqueued' | 'duplicate';

export interface ZoomJobQueue {
  /** Atomically leases up to `p_max_n` runnable jobs. Returns the leased rows. */
  claim(args: ClaimZoomJobsArgs): Promise<ZoomJobRow[]>;
  /** `false` = the lease is lost or expired; the worker MUST stop working the job. */
  heartbeat(args: HeartbeatZoomJobArgs): Promise<boolean>;
  /** `false` = the job was reclaimed by another worker before we marked it done. */
  complete(args: CompleteZoomJobArgs): Promise<boolean>;
  /** The resulting status, or `null` when the job was not leased by this worker. */
  fail(args: FailZoomJobArgs): Promise<ZoomJobStatus | null>;
  /** `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`. */
  enqueue(job: ZoomJobInsert): Promise<EnqueueResult>;
}

interface PostgrestError {
  message: string;
}

/** The ONLY untyped boundary in this module. See `service-client.ts`. */
export interface JobQueueSchemaClient {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): {
      select(columns: string): PromiseLike<{
        data: { id: string }[] | null;
        error: PostgrestError | null;
      }>;
    };
  };
}

export function createSupabaseJobQueue(client: JobQueueSchemaClient): ZoomJobQueue {
  return {
    async claim(args) {
      const { data, error } = await client.rpc('claim_zoom_jobs', {
        p_worker_id: args.p_worker_id,
        p_job_types: args.p_job_types ?? null,
        p_max_n: args.p_max_n ?? 1,
        p_lease_seconds: args.p_lease_seconds ?? 300,
      });
      if (error) throw new Error(`claim_zoom_jobs failed: ${error.message}`);
      return Array.isArray(data) ? (data as ZoomJobRow[]) : [];
    },

    async heartbeat(args) {
      const { data, error } = await client.rpc('heartbeat_zoom_job', {
        p_job_id: args.p_job_id,
        p_worker_id: args.p_worker_id,
        p_lease_seconds: args.p_lease_seconds ?? 300,
        p_stage_state: args.p_stage_state ?? null,
      });
      if (error) throw new Error(`heartbeat_zoom_job failed: ${error.message}`);
      return data === true;
    },

    async complete(args) {
      const { data, error } = await client.rpc('complete_zoom_job', {
        p_job_id: args.p_job_id,
        p_worker_id: args.p_worker_id,
        p_stage_state: args.p_stage_state ?? null,
      });
      if (error) throw new Error(`complete_zoom_job failed: ${error.message}`);
      return data === true;
    },

    async fail(args) {
      const { data, error } = await client.rpc('fail_zoom_job', {
        p_job_id: args.p_job_id,
        p_worker_id: args.p_worker_id,
        p_error: args.p_error,
        p_retryable: args.p_retryable ?? true,
      });
      if (error) throw new Error(`fail_zoom_job failed: ${error.message}`);
      return typeof data === 'string' ? (data as ZoomJobStatus) : null;
    },

    async enqueue(job) {
      // `ignoreDuplicates: true` is PostgREST's ON CONFLICT DO NOTHING; the
      // `.select()` makes the conflict observable as zero rows instead of an error.
      const { data, error } = await client
        .from('zoom_jobs')
        .upsert(
          {
            job_type: job.job_type,
            payload: job.payload ?? {},
            dedupe_key: job.dedupe_key ?? null,
            ...(job.max_attempts === undefined ? {} : { max_attempts: job.max_attempts }),
            ...(job.run_after === undefined ? {} : { run_after: job.run_after }),
            ...(job.stage_state === undefined ? {} : { stage_state: job.stage_state }),
          },
          { onConflict: 'dedupe_key', ignoreDuplicates: true }
        )
        .select('id');

      if (error) throw new Error(`zoom_jobs enqueue failed: ${error.message}`);
      return data && data.length > 0 ? 'enqueued' : 'duplicate';
    },
  };
}

/** Lazily builds the production queue. Never called at module scope. */
export function defaultZoomJobQueue(
  env: NodeJS.ProcessEnv = process.env,
  clientFactory: (env: NodeJS.ProcessEnv) => SupabaseClient = createZoomServiceClient
): ZoomJobQueue {
  return createSupabaseJobQueue(
    zoomInternalSchema<JobQueueSchemaClient>(clientFactory(env))
  );
}
