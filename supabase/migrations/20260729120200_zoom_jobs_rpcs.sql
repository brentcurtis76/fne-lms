-- =============================================================================
-- zoom_jobs queue RPCs (Zoom plan §3 correction #5; Z1b-1)
--
-- Vercel crons OVERLAP, never retry, and can double-fire — so every claim must
-- be an atomic lease. All four RPCs are SECURITY DEFINER, service-role-only
-- (EXECUTE revoked from PUBLIC/anon/authenticated), fully qualified with an
-- empty search_path.
--
-- ============================== CONTRACT (chunk 3 codes against this) =======
--
-- claim_zoom_jobs(p_worker_id text, p_job_types text[], p_max_n int,
--                 p_lease_seconds int) RETURNS SETOF zoom_internal.zoom_jobs
--   * Atomically leases up to p_max_n runnable jobs using
--     FOR UPDATE SKIP LOCKED: two overlapping tickers can never lease the same
--     job. Runnable = status 'pending' with run_after <= now(), OR status
--     'leased' with an EXPIRED lease (lease_expires_at <= now()).
--   * p_job_types NULL = any type; otherwise job_type = ANY(p_job_types).
--   * Returned rows are already leased to p_worker_id with
--     lease_expires_at = now() + p_lease_seconds and heartbeat_at = now().
--   * Reclaiming an expired lease counts the lost lease as one attempt
--     (attempts + 1). An expired-lease job whose attempts would reach
--     max_attempts is buried as 'dead' instead of being handed out — so a
--     worker that crashes without ever calling fail_zoom_job cannot produce an
--     infinite reclaim loop. Fresh 'pending' claims do NOT touch attempts.
--
-- heartbeat_zoom_job(p_job_id uuid, p_worker_id text, p_lease_seconds int,
--                    p_stage_state jsonb) RETURNS boolean
--   * Extends the caller's own LIVE lease (status 'leased', worker_id match,
--     lease not yet expired) and optionally checkpoints stage_state
--     (resumable pipelines). Returns false when the lease is lost/expired —
--     the worker MUST stop working on the job when it sees false.
--
-- complete_zoom_job(p_job_id uuid, p_worker_id text, p_stage_state jsonb)
--     RETURNS boolean
--   * Marks the caller's own leased job 'done'. Succeeds even if the lease
--     just expired, PROVIDED nobody reclaimed it (worker_id still matches).
--     Returns false when the job was reclaimed — at-least-once semantics; all
--     job handlers must be idempotent (plan §12).
--
-- fail_zoom_job(p_job_id uuid, p_worker_id text, p_error text,
--               p_retryable boolean) RETURNS text
--   * Records the failure on the caller's own leased job and increments
--     attempts. Resulting status (also the return value):
--       - p_retryable = false            -> 'failed' (terminal, manual triage)
--       - attempts (incl. this) >= max   -> 'dead'   (dead-letter)
--       - otherwise                      -> 'pending' with exponential backoff
--         run_after = now() + LEAST(30s * 2^prior_attempts, 3600s)
--         (30s, 60s, 120s, ... capped at 1h).
--   * Returns NULL when the job was not leased by this worker (reclaimed or
--     unknown id) — nothing is modified in that case.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- claim_zoom_jobs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zoom_internal.claim_zoom_jobs(
    p_worker_id text,
    p_job_types text[] DEFAULT NULL,
    p_max_n integer DEFAULT 1,
    p_lease_seconds integer DEFAULT 300
) RETURNS SETOF zoom_internal.zoom_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
        RAISE EXCEPTION 'claim_zoom_jobs: p_worker_id is required';
    END IF;

    -- Bury expired-lease jobs that have exhausted their attempts: the lost
    -- lease is their final attempt. Concurrent callers serialize on the row
    -- lock and re-check status, so attempts cannot double-increment.
    UPDATE zoom_internal.zoom_jobs j
       SET status = 'dead',
           attempts = j.attempts + 1,
           worker_id = NULL,
           lease_expires_at = NULL,
           last_error = COALESCE(j.last_error, 'lease expired without fail_zoom_job'),
           updated_at = now()
     WHERE j.status = 'leased'
       AND j.lease_expires_at <= now()
       AND j.attempts + 1 >= j.max_attempts
       AND (p_job_types IS NULL OR j.job_type = ANY (p_job_types));

    RETURN QUERY
    WITH candidate AS (
        SELECT j.id, (j.status = 'leased') AS was_expired_lease
          FROM zoom_internal.zoom_jobs j
         WHERE ((j.status = 'pending' AND j.run_after <= now())
             OR (j.status = 'leased' AND j.lease_expires_at <= now()))
           AND (p_job_types IS NULL OR j.job_type = ANY (p_job_types))
         ORDER BY j.run_after
         LIMIT GREATEST(p_max_n, 0)
           FOR UPDATE SKIP LOCKED
    )
    UPDATE zoom_internal.zoom_jobs j
       SET status = 'leased',
           worker_id = p_worker_id,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           heartbeat_at = now(),
           attempts = j.attempts + (CASE WHEN c.was_expired_lease THEN 1 ELSE 0 END),
           updated_at = now()
      FROM candidate c
     WHERE j.id = c.id
    RETURNING j.*;
END;
$$;

-- -----------------------------------------------------------------------------
-- heartbeat_zoom_job
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zoom_internal.heartbeat_zoom_job(
    p_job_id uuid,
    p_worker_id text,
    p_lease_seconds integer DEFAULT 300,
    p_stage_state jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE zoom_internal.zoom_jobs j
       SET heartbeat_at = now(),
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           stage_state = COALESCE(p_stage_state, j.stage_state),
           updated_at = now()
     WHERE j.id = p_job_id
       AND j.status = 'leased'
       AND j.worker_id = p_worker_id
       AND j.lease_expires_at > now();
    RETURN FOUND;
END;
$$;

-- -----------------------------------------------------------------------------
-- complete_zoom_job
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zoom_internal.complete_zoom_job(
    p_job_id uuid,
    p_worker_id text,
    p_stage_state jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE zoom_internal.zoom_jobs j
       SET status = 'done',
           lease_expires_at = NULL,
           stage_state = COALESCE(p_stage_state, j.stage_state),
           updated_at = now()
     WHERE j.id = p_job_id
       AND j.status = 'leased'
       AND j.worker_id = p_worker_id;
    RETURN FOUND;
END;
$$;

-- -----------------------------------------------------------------------------
-- fail_zoom_job
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zoom_internal.fail_zoom_job(
    p_job_id uuid,
    p_worker_id text,
    p_error text,
    p_retryable boolean DEFAULT true
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status text;
BEGIN
    UPDATE zoom_internal.zoom_jobs j
       SET attempts = j.attempts + 1,
           last_error = p_error,
           worker_id = NULL,
           lease_expires_at = NULL,
           heartbeat_at = NULL,
           status = CASE
                        WHEN NOT p_retryable THEN 'failed'
                        WHEN j.attempts + 1 >= j.max_attempts THEN 'dead'
                        ELSE 'pending'
                    END,
           run_after = CASE
                        WHEN p_retryable AND j.attempts + 1 < j.max_attempts
                        THEN now() + make_interval(secs =>
                               LEAST(30 * power(2, LEAST(j.attempts, 10)), 3600))
                        ELSE j.run_after
                       END,
           updated_at = now()
     WHERE j.id = p_job_id
       AND j.status = 'leased'
       AND j.worker_id = p_worker_id
    RETURNING j.status INTO v_status;
    RETURN v_status;
END;
$$;

-- -----------------------------------------------------------------------------
-- Grants: service-role only. Functions are born with EXECUTE granted to
-- PUBLIC — revoke it explicitly per signature; the pgTAP suite proves the
-- denial for anon/authenticated.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION zoom_internal.claim_zoom_jobs(text, text[], integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.heartbeat_zoom_job(uuid, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.complete_zoom_job(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.fail_zoom_job(uuid, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION zoom_internal.claim_zoom_jobs(text, text[], integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.heartbeat_zoom_job(uuid, text, integer, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.complete_zoom_job(uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.fail_zoom_job(uuid, text, text, boolean)
  TO service_role;

-- Blanket re-run so no function in the schema keeps a stray PUBLIC grant.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal TO service_role;
