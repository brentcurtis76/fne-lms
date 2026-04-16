-- =============================================================================
-- Migration: Add FK constraint consultor_sessions.school_id -> schools.id
-- Created:   2026-04-16
-- Phase:     B2 (School_id FK Migration Script)
-- =============================================================================
--
-- README / MANUAL APPLY INSTRUCTIONS
-- -----------------------------------------------------------------------------
-- THIS MIGRATION MUST BE APPLIED MANUALLY.
--
-- Do NOT rely on automated migration tooling for this file. It must be run via
-- the Supabase Management API after a human operator has verified that the
-- orphan scan (first DO block below) returns ZERO rows.
--
-- Procedure:
--   1. Run the orphan-scan DO block in isolation against the target database.
--      If it emits any NOTICE output listing orphan (id, school_id) pairs, DO
--      NOT proceed. Reconcile the orphan data first (either repoint the
--      offending rows to a valid school_id or null them out, depending on
--      product decision), then re-run the scan until it is clean.
--
--   2. Only once the orphan scan reports no orphans, apply the ALTER TABLE DO
--      block to add the FK constraint (ON DELETE RESTRICT).
--
--   3. Apply via the Supabase Management API:
--        POST https://api.supabase.com/v1/projects/<project-ref>/database/query
--        Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
--        Body: { "query": "<contents of the relevant DO block>" }
--
-- Rationale:
--   consultor_sessions.school_id is NOT NULL but historically had no FK to
--   schools(id). Adding the FK retroactively can fail if orphan rows exist,
--   and ON DELETE RESTRICT must be confirmed as the correct semantics for the
--   consultor workflow before locking it in.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Step 1: Orphan scan (read-only; safe to run any number of times).
-- Emits a NOTICE for every consultor_sessions row whose school_id does not
-- correspond to an existing schools.id. Must return zero notices before Step 2.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    orphan RECORD;
    orphan_count INTEGER := 0;
BEGIN
    FOR orphan IN
        SELECT id, school_id
        FROM consultor_sessions
        WHERE school_id IS NOT NULL
          AND school_id NOT IN (SELECT id FROM schools)
    LOOP
        orphan_count := orphan_count + 1;
        RAISE NOTICE 'Orphan consultor_sessions row: id=%, school_id=%',
            orphan.id, orphan.school_id;
    END LOOP;

    IF orphan_count = 0 THEN
        RAISE NOTICE 'Orphan scan clean: 0 orphan consultor_sessions rows.';
    ELSE
        RAISE NOTICE 'Orphan scan found % orphan row(s). DO NOT proceed to Step 2 until reconciled.',
            orphan_count;
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- Step 2: Add FK constraint if it does not already exist.
-- Uses pg_constraint lookup as an IF NOT EXISTS guard so re-running is safe.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_consultor_sessions_school'
          AND conrelid = 'public.consultor_sessions'::regclass
    ) THEN
        ALTER TABLE consultor_sessions
            ADD CONSTRAINT fk_consultor_sessions_school
            FOREIGN KEY (school_id)
            REFERENCES schools(id)
            ON DELETE RESTRICT;
        RAISE NOTICE 'Constraint fk_consultor_sessions_school added.';
    ELSE
        RAISE NOTICE 'Constraint fk_consultor_sessions_school already exists; skipping.';
    END IF;
END $$;
