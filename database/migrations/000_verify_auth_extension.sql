-- Verification: Check auth extension is available
-- Run this BEFORE applying batch_assign_courses migration
-- This should be part of your Supabase setup by default

-- Check if auth schema exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
        RAISE EXCEPTION 'auth schema not found - Supabase auth extension may not be installed';
    END IF;
END $$;

-- Check if auth.uid() function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'auth' AND p.proname = 'uid'
    ) THEN
        RAISE EXCEPTION 'auth.uid() function not found - check auth extension setup';
    END IF;
END $$;

-- Test auth.uid() returns a value when authenticated
-- This should return NULL when run without JWT context (expected)
SELECT
    CASE
        WHEN auth.uid() IS NULL THEN 'OK: auth.uid() returns NULL (no JWT context - expected in SQL editor)'
        ELSE 'OK: auth.uid() returns ' || auth.uid()::text
    END as status;

-- Verification passed
SELECT 'Auth extension verified - safe to proceed with migrations' as result;
