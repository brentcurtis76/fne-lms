-- Add encargado_licitacion to user_role_type enum
--
-- This MUST be in a separate migration from the tables/policies that reference it,
-- because PostgreSQL requires ALTER TYPE ADD VALUE to be committed in its own
-- transaction before the new value can be used.
--
-- Date: 2026-02-20
-- Author: Pipeline (Licitaciones Phase 1)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'user_role_type'
    AND pg_enum.enumlabel = 'encargado_licitacion'
  ) THEN
    ALTER TYPE user_role_type ADD VALUE 'encargado_licitacion';
  END IF;
END $$;
