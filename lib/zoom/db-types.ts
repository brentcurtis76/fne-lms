/**
 * Hand-written row types for the Z1b Zoom tables (zoom_internal.* +
 * public.session_meetings_public) and the job-queue RPC contract.
 *
 * Deliberately NOT generated: types/supabase.ts is known-stale repo-wide and a
 * wholesale regen is out of scope (Z1b-1 item 6). These narrow types are the
 * source chunks 2–3 consume via `serviceClient.schema('zoom_internal')`.
 * Keep them in sync with supabase/migrations/20260729*.sql.
 */

// ---------------------------------------------------------------------------
// Shared unions
// ---------------------------------------------------------------------------

/** Which LMS surface a meeting/transcript belongs to. */
export type ZoomSurfaceType = 'consultor_session' | 'community_meeting';

/** zoom_internal.zoom_meetings.status machine (plan §8). */
export type ZoomMeetingStatus =
  | 'pending'
  | 'provisioned'
  | 'started'
  | 'ended'
  | 'cancelled'
  | 'deleted'
  | 'error';

/** Statuses that hold a §9 host-concurrency reservation (EXCLUDE constraint). */
export const ZOOM_MEETING_ACTIVE_STATUSES = [
  'pending',
  'provisioned',
  'started',
] as const satisfies readonly ZoomMeetingStatus[];

/** zoom_internal.zoom_recording_files.transfer_status machine (plan §12). */
export type ZoomTransferStatus =
  | 'pending'
  | 'transferring'
  | 'stored'
  | 'verified'
  | 'zoom_trashed'
  | 'zoom_deleted'
  | 'failed';

/** zoom_internal.zoom_transcripts.sanitization_status machine (plan §6). */
export type ZoomSanitizationStatus = 'pending' | 'sanitized' | 'flagged' | 'reviewed';

/** zoom_internal.zoom_jobs.status machine (see the claim/fail RPC contract). */
export type ZoomJobStatus = 'pending' | 'leased' | 'done' | 'failed' | 'dead';

/** public.session_meetings_public.meeting_status (plan §6). */
export type SessionMeetingPublicStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

// ---------------------------------------------------------------------------
// zoom_internal rows
// ---------------------------------------------------------------------------

/** Single-row S2S OAuth token cache (CHECK id = 1). */
export interface ZoomTokenCacheRow {
  id: 1;
  access_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  fetched_at: string | null;
  updated_at: string;
}

/** Licensed host inventory (§9). profile_id null = org pool host. */
export interface ZoomHostRow {
  id: string;
  zoom_user_id: string;
  email: string;
  profile_id: string | null;
  is_active: boolean;
  max_concurrent: number;
  org_owned: boolean;
  created_at: string;
  updated_at: string;
}

/** Secret-bearing desired-state meeting row. Never leaves the service layer. */
export interface ZoomMeetingRow {
  id: string;
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  zoom_meeting_number: number | null;
  zoom_meeting_uuid: string | null;
  host_zoom_user_id: string | null;
  passcode: string | null;
  join_url: string | null;
  effective_settings: Record<string, unknown> | null;
  status: ZoomMeetingStatus;
  starts_at: string;
  duration_minutes: number;
  /** STORED generated: starts_at + duration_minutes. */
  ends_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Webhook idempotency ledger row. dedupe_key = sha256(verified raw body). */
export interface ZoomWebhookEventRow {
  id: string;
  dedupe_key: string;
  event_type: string;
  zoom_meeting_uuid: string | null;
  /** Nullable by design: the 30-day retention scrub nulls it (later phase). */
  raw_payload: Record<string, unknown> | null;
  received_at: string;
  processed_at: string | null;
}

/** Recording transfer pipeline row (§12). */
export interface ZoomRecordingFileRow {
  id: string;
  zoom_file_id: string;
  meeting_id: string;
  file_type: string | null;
  file_extension: string | null;
  file_size_bytes: number | null;
  download_url: string | null;
  /** Nulled after transfer — never long-lived. */
  download_token: string | null;
  storage_path: string | null;
  transfer_status: ZoomTransferStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw transcript quarantine row (§6). raw_text NEVER enters an LLM prompt. */
export interface ZoomTranscriptRow {
  id: string;
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  raw_text: string | null;
  /** The ONLY column any LLM prompt may read (plan §12 predicate). */
  sanitized_text: string | null;
  sanitization_status: ZoomSanitizationStatus;
  sanitizer_version: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Durable queue row. Claims only via the claim_zoom_jobs RPC. */
export interface ZoomJobRow {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  status: ZoomJobStatus;
  attempts: number;
  max_attempts: number;
  run_after: string;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  /** Resumable-pipeline checkpoint (§12 staged transfers). */
  stage_state: Record<string, unknown>;
  last_error: string | null;
  worker_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Insert shape for enqueueing a job (service-role .insert on zoom_jobs). */
export interface ZoomJobInsert {
  job_type: string;
  payload?: Record<string, unknown>;
  /** UNIQUE — a duplicate enqueue rejects with 23505. Omit for no dedupe. */
  dedupe_key?: string | null;
  max_attempts?: number;
  run_after?: string;
  stage_state?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// public.session_meetings_public
// ---------------------------------------------------------------------------

/** Secret-free projection row (plan §6). Writes are service-role only. */
export interface SessionMeetingPublicRow {
  id: string;
  surface_type: ZoomSurfaceType;
  surface_id: string;
  school_id: number;
  growth_community_id: string | null;
  provider: string;
  meeting_status: SessionMeetingPublicStatus;
  starts_at: string | null;
  ends_at: string | null;
  has_recording: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Job-queue RPC contract (zoom_internal.* SECURITY DEFINER functions).
// Full behavioral contract in supabase/migrations/20260729120200_zoom_jobs_rpcs.sql.
// ---------------------------------------------------------------------------

/** Args for zoom_internal.claim_zoom_jobs → returns ZoomJobRow[]. */
export interface ClaimZoomJobsArgs {
  p_worker_id: string;
  /** null/omitted = any job type. */
  p_job_types?: string[] | null;
  p_max_n?: number;
  p_lease_seconds?: number;
}

/** Args for zoom_internal.heartbeat_zoom_job → returns boolean (false = lease lost, STOP working). */
export interface HeartbeatZoomJobArgs {
  p_job_id: string;
  p_worker_id: string;
  p_lease_seconds?: number;
  /** When provided, checkpoints stage_state atomically with the lease extension. */
  p_stage_state?: Record<string, unknown> | null;
}

/** Args for zoom_internal.complete_zoom_job → returns boolean (false = job was reclaimed). */
export interface CompleteZoomJobArgs {
  p_job_id: string;
  p_worker_id: string;
  p_stage_state?: Record<string, unknown> | null;
}

/**
 * Args for zoom_internal.fail_zoom_job → returns the resulting ZoomJobStatus
 * ('failed' | 'dead' | 'pending'), or null when the job was not leased by
 * this worker (nothing modified).
 */
export interface FailZoomJobArgs {
  p_job_id: string;
  p_worker_id: string;
  p_error: string;
  /** false = terminal 'failed' (manual triage); default true = retry/backoff path. */
  p_retryable?: boolean;
  /**
   * The provider's own `Retry-After`, in seconds — `ZoomError.retryAfterSeconds`,
   * threaded through by the runner.
   *
   * A FLOOR under the 30·2^n backoff, never a replacement: the RPC schedules
   * `GREATEST(backoff, hint)`. Omitted/null reproduces the pre-hint schedule exactly.
   * Without it a 600 s hint was re-claimed at 30/60/120/240 s — four attempts spent to
   * be told 429 again (Sol F2).
   */
  p_retry_after_seconds?: number | null;
}
