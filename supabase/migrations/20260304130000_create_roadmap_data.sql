-- ROADMAP-001: Create roadmap_data table
--
-- This migration creates the roadmap_data table used by the admin-only
-- GENERA roadmap tracking page (/admin/roadmap). The table stores a single
-- JSONB row keyed by 'genera-roadmap-v1' containing phase/task data.
--
-- Tables created:   1 (roadmap_data)
-- RLS policies:     1 (admin_read_write -- FOR ALL, admin role only)
-- References:       profiles(id) for updated_by audit column
--
-- This is internal project management data only.
-- No student PII is stored here -- Law 21.719 DPIA not required.
--
-- Date: 2026-03-04

-- ============================================================
-- TABLE: roadmap_data
-- ============================================================

CREATE TABLE IF NOT EXISTS roadmap_data (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        UNIQUE NOT NULL,
  value       JSONB       NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID        REFERENCES profiles(id)
);

COMMENT ON TABLE roadmap_data IS
  'Key/value store for GENERA admin roadmap data. Each row is a named JSON document. Currently holds a single row with key=genera-roadmap-v1.';

COMMENT ON COLUMN roadmap_data.key IS
  'Unique string identifier for the document, e.g. ''genera-roadmap-v1''.';

COMMENT ON COLUMN roadmap_data.value IS
  'Full roadmap data as JSONB (phases, tasks, progress, etc.).';

COMMENT ON COLUMN roadmap_data.updated_by IS
  'FK to profiles(id) -- the admin who last saved this row.';

-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE roadmap_data ENABLE ROW LEVEL SECURITY;

-- Admin-only: full read/write access.
-- Matches the established codebase pattern (see 20260208013000_fix_consultor_rls_gaps.sql).
-- Requires role_type = 'admin' AND is_active = true in user_roles.
CREATE POLICY "admin_read_write"
  ON roadmap_data
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id  = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id  = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );
