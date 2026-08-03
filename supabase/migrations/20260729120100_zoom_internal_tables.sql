-- =============================================================================
-- zoom_internal tables (Zoom plan §6 list, §9 concurrency; Z1b-1, additive only)
--
-- Everything here is service-role only (schema lockdown in the previous
-- migration). RLS is enabled with ZERO policies on every table as
-- belt-and-braces: service_role bypasses RLS; anon/authenticated cannot even
-- reach the schema. Blanket REVOKE/GRANT re-run at the end of this file so the
-- deny-state never depends on default-privilege inheritance.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- zoom_token_cache — single-row S2S OAuth token cache (chunk 2 consumes).
-- CHECK (id = 1) + PRIMARY KEY enforce the single row.
-- -----------------------------------------------------------------------------
CREATE TABLE zoom_internal.zoom_token_cache (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    access_token text,
    token_type text,
    scope text,
    expires_at timestamptz,
    fetched_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zoom_internal.zoom_token_cache IS
  'Single-row cache for the S2S OAuth access token (CHECK id = 1). Written only by the chunk-2 token provider (single-flight).';

-- -----------------------------------------------------------------------------
-- zoom_hosts — licensed Zoom host inventory (§9). profile_id NULL = org pool
-- host (e.g. reuniones1@fne). org_owned marks FNE-owned identities that admins
-- may receive ZAKs for; is_active flips off when host_sync sees the license
-- removed. ON DELETE SET NULL: a deleted profile leaves the host row as an
-- unmapped identity for host_sync to reconcile.
-- -----------------------------------------------------------------------------
CREATE TABLE zoom_internal.zoom_hosts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zoom_user_id text NOT NULL UNIQUE,
    email text NOT NULL,
    profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    max_concurrent integer NOT NULL DEFAULT 1 CHECK (max_concurrent >= 1),
    org_owned boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zoom_internal.zoom_hosts IS
  'Licensed Zoom hosts only (§9 — Basic users are excluded; cloud recording requires Licensed). profile_id NULL = pool host; org_owned gates admin ZAK issuance.';

-- -----------------------------------------------------------------------------
-- zoom_meetings — desired-state row per provisioned meeting; holds the SECRET
-- fields (meeting number, plaintext passcode, join_url). One row per surface.
--
-- §9 concurrency reservation: the EXCLUDE constraint makes the INSERT itself
-- the host reservation — overlapping active meetings on the same host raise
-- 23P01 (= host busy → assignment tries the next candidate; no TOCTOU).
-- Buffer models early joins (−15 min) and overruns (+45 min). Only ACTIVE
-- statuses hold a reservation (partial WHERE); ended/cancelled/deleted/error
-- release the slot. NULL host (pre-assignment) never conflicts.
-- btree_gist is installed by the baseline (public schema) — the text equality
-- column names its opclass explicitly so the constraint never depends on
-- search_path.
--
-- IMMUTABLE helpers (declared DDL deviation from the §9 inline wording):
-- `timestamptz + interval` is only STABLE in PostgreSQL (day/month interval
-- components depend on the TimeZone setting), so it is rejected inside
-- generated columns and index/EXCLUDE expressions. Minute-only arithmetic is
-- genuinely timezone-independent, so these single-purpose wrappers are
-- honestly IMMUTABLE and preserve the §9 semantics exactly:
-- window = [starts_at − 15 min, ends_at + 45 min).
-- -----------------------------------------------------------------------------
CREATE FUNCTION zoom_internal.meeting_ends_at(
    p_starts_at timestamptz,
    p_duration_minutes integer
) RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
    SELECT p_starts_at + make_interval(mins => p_duration_minutes)
$$;

CREATE FUNCTION zoom_internal.meeting_reservation_window(
    p_starts_at timestamptz,
    p_duration_minutes integer
) RETURNS tstzrange
LANGUAGE sql IMMUTABLE
AS $$
    SELECT tstzrange(
        p_starts_at - make_interval(mins => 15),
        zoom_internal.meeting_ends_at(p_starts_at, p_duration_minutes) + make_interval(mins => 45)
    )
$$;

REVOKE EXECUTE ON FUNCTION zoom_internal.meeting_ends_at(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.meeting_reservation_window(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;

CREATE TABLE zoom_internal.zoom_meetings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    surface_type text NOT NULL CHECK (surface_type IN ('consultor_session', 'community_meeting')),
    surface_id uuid NOT NULL,
    school_id integer NOT NULL REFERENCES public.schools(id),
    zoom_meeting_number bigint,
    zoom_meeting_uuid text,
    host_zoom_user_id text REFERENCES zoom_internal.zoom_hosts(zoom_user_id),
    passcode text,
    join_url text,
    effective_settings jsonb,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'provisioned', 'started', 'ended', 'cancelled', 'deleted', 'error')),
    starts_at timestamptz NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
    ends_at timestamptz GENERATED ALWAYS AS
      (zoom_internal.meeting_ends_at(starts_at, duration_minutes)) STORED,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT zoom_meetings_surface_unique UNIQUE (surface_type, surface_id),
    CONSTRAINT zoom_meetings_host_no_overlap EXCLUDE USING gist (
        host_zoom_user_id public.gist_text_ops WITH =,
        zoom_internal.meeting_reservation_window(starts_at, duration_minutes) WITH &&
    ) WHERE (status IN ('pending', 'provisioned', 'started'))
);

CREATE INDEX zoom_meetings_school_idx ON zoom_internal.zoom_meetings (school_id);
CREATE INDEX zoom_meetings_status_idx ON zoom_internal.zoom_meetings (status);
CREATE INDEX zoom_meetings_host_idx ON zoom_internal.zoom_meetings (host_zoom_user_id);

COMMENT ON TABLE zoom_internal.zoom_meetings IS
  'Desired-state machine per managed meeting (§8): pending→provisioned→started→ended/cancelled/deleted/error. Secret-bearing (mn, plaintext passcode, join_url) — never leaves this schema. EXCLUDE constraint = §9 host concurrency reservation (23P01 = host busy).';

-- -----------------------------------------------------------------------------
-- zoom_webhook_events — idempotency ledger. dedupe_key = sha256 hex of the
-- VERIFIED raw body (§3 correction #6: Zoom documents no delivery-id dedupe
-- semantics; retries resend identical bodies). raw_payload is NULLABLE by
-- design: the 30-day scrub job (later phase) nulls it, keeping the dedupe row.
-- -----------------------------------------------------------------------------
CREATE TABLE zoom_internal.zoom_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key text NOT NULL UNIQUE,
    event_type text NOT NULL,
    zoom_meeting_uuid text,
    raw_payload jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);

CREATE INDEX zoom_webhook_events_received_idx ON zoom_internal.zoom_webhook_events (received_at);
CREATE INDEX zoom_webhook_events_type_idx ON zoom_internal.zoom_webhook_events (event_type);

COMMENT ON TABLE zoom_internal.zoom_webhook_events IS
  'Webhook idempotency ledger. dedupe_key = sha256(verified raw body) UNIQUE. raw_payload nullable — nulled by the 30-day retention scrub (later phase); the row itself stays for dedupe.';

-- -----------------------------------------------------------------------------
-- zoom_recording_files — per-file transfer state machine (§12 pipeline):
-- pending→transferring→stored→verified→zoom_trashed→zoom_deleted, or failed.
-- download_token nullable and nulled after transfer (never long-lived).
-- -----------------------------------------------------------------------------
CREATE TABLE zoom_internal.zoom_recording_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zoom_file_id text NOT NULL UNIQUE,
    meeting_id uuid NOT NULL REFERENCES zoom_internal.zoom_meetings(id),
    file_type text,
    file_extension text,
    file_size_bytes bigint,
    download_url text,
    download_token text,
    storage_path text,
    transfer_status text NOT NULL DEFAULT 'pending'
      CHECK (transfer_status IN ('pending', 'transferring', 'stored', 'verified', 'zoom_trashed', 'zoom_deleted', 'failed')),
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX zoom_recording_files_meeting_idx ON zoom_internal.zoom_recording_files (meeting_id);
CREATE INDEX zoom_recording_files_status_idx ON zoom_internal.zoom_recording_files (transfer_status);

COMMENT ON TABLE zoom_internal.zoom_recording_files IS
  'Recording transfer pipeline state (§12): pending→transferring→stored→verified→zoom_trashed→zoom_deleted / failed. download_token nulled post-transfer.';

-- -----------------------------------------------------------------------------
-- zoom_transcripts — RAW transcript quarantine (§6/§12). raw_text never enters
-- any LLM prompt; only sanitized_text may (prompt-builder predicate:
-- sanitization_status IN ('sanitized','reviewed') AND sanitized_text IS NOT
-- NULL). State machine: pending → sanitized | flagged; flagged → reviewed via
-- human confirmation (reviewed_by/reviewed_at set on that transition).
-- -----------------------------------------------------------------------------
CREATE TABLE zoom_internal.zoom_transcripts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    surface_type text NOT NULL CHECK (surface_type IN ('consultor_session', 'community_meeting')),
    surface_id uuid NOT NULL,
    school_id integer NOT NULL REFERENCES public.schools(id),
    raw_text text,
    sanitized_text text,
    sanitization_status text NOT NULL DEFAULT 'pending'
      CHECK (sanitization_status IN ('pending', 'sanitized', 'flagged', 'reviewed')),
    sanitizer_version text,
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT zoom_transcripts_surface_unique UNIQUE (surface_type, surface_id)
);

CREATE INDEX zoom_transcripts_school_idx ON zoom_internal.zoom_transcripts (school_id);
CREATE INDEX zoom_transcripts_status_idx ON zoom_internal.zoom_transcripts (sanitization_status);

COMMENT ON TABLE zoom_internal.zoom_transcripts IS
  'Raw transcript quarantine (§6). raw_text NEVER enters an LLM prompt; sanitized_text is the only LLM-readable column. sanitization_status: pending → sanitized | flagged → reviewed (human).';

-- -----------------------------------------------------------------------------
-- zoom_jobs — durable job queue (§3 correction #5: Vercel crons overlap and
-- never retry, so every claim must be an atomic lease). Claim/heartbeat/
-- complete/fail semantics live in the SECURITY DEFINER RPCs (next migration).
-- stage_state carries resumable-pipeline checkpoints (§12 staged transfers).
-- dedupe_key UNIQUE (NULLs allowed: not every job type needs dedupe).
-- -----------------------------------------------------------------------------
CREATE TABLE zoom_internal.zoom_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key text UNIQUE,
    status text NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'leased', 'done', 'failed', 'dead')),
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
    run_after timestamptz NOT NULL DEFAULT now(),
    lease_expires_at timestamptz,
    heartbeat_at timestamptz,
    stage_state jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_error text,
    worker_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX zoom_jobs_pending_idx ON zoom_internal.zoom_jobs (run_after)
  WHERE status = 'pending';
CREATE INDEX zoom_jobs_leased_idx ON zoom_internal.zoom_jobs (lease_expires_at)
  WHERE status = 'leased';
CREATE INDEX zoom_jobs_type_idx ON zoom_internal.zoom_jobs (job_type);

COMMENT ON TABLE zoom_internal.zoom_jobs IS
  'Durable lease-based job queue. status: pending→leased→done | pending (retry w/ backoff) | dead (attempts exhausted) | failed (terminal non-retryable). Claims only via zoom_internal.claim_zoom_jobs (FOR UPDATE SKIP LOCKED).';

-- -----------------------------------------------------------------------------
-- RLS with zero policies on every table (belt-and-braces) + explicit re-run of
-- the blanket deny/grant so nothing depends on default-privilege inheritance.
-- -----------------------------------------------------------------------------
ALTER TABLE zoom_internal.zoom_token_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_internal.zoom_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_internal.zoom_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_internal.zoom_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_internal.zoom_recording_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_internal.zoom_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE zoom_internal.zoom_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA zoom_internal TO service_role;
