-- =============================================================================
-- Migration: Drop duplicate FK fk_consultor_sessions_school on consultor_sessions
-- Created:   2026-04-23
-- =============================================================================
--
-- Background
-- -----------------------------------------------------------------------------
-- consultor_sessions currently has two foreign-key constraints pointing
-- school_id -> schools(id):
--
--   1. consultor_sessions_school_id_fkey   (auto-named, no ON DELETE action)
--   2. fk_consultor_sessions_school        (added 2026-04-16 with ON DELETE
--                                           RESTRICT)
--
-- The duplicate was introduced when the retroactive FK migration
-- (20260416_consultor_sessions_school_fk.sql) was applied against a database
-- where the column already had an implicit FK. Having two FKs on the same
-- (table, column) -> (table, column) pair is redundant and causes double
-- constraint evaluation on writes.
--
-- This migration removes the redundant fk_consultor_sessions_school constraint
-- and keeps consultor_sessions_school_id_fkey in place. It is guarded so it is
-- safe to re-run on environments where the duplicate was already removed (or
-- never existed).
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_consultor_sessions_school'
          AND conrelid = 'public.consultor_sessions'::regclass
    ) THEN
        ALTER TABLE consultor_sessions
            DROP CONSTRAINT fk_consultor_sessions_school;
        RAISE NOTICE 'Constraint fk_consultor_sessions_school dropped.';
    ELSE
        RAISE NOTICE 'Constraint fk_consultor_sessions_school not present; nothing to drop.';
    END IF;
END $$;
