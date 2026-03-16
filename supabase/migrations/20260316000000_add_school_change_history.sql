-- ============================================================
-- Migration: school_change_history + completion status
-- Tracks changes to Contexto Transversal, Plan de Migración,
-- and Context Responses. Follows licitacion_historial pattern.
-- ============================================================

-- ============================================================
-- TABLE 1: school_change_history
-- Audit log for school-level feature changes.
-- ============================================================

CREATE TABLE school_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id INT NOT NULL REFERENCES schools(id),
  feature TEXT NOT NULL CHECK (feature IN ('transversal_context', 'migration_plan', 'context_responses')),
  action TEXT NOT NULL CHECK (action IN ('initial_save', 'update')),
  previous_state JSONB,
  new_state JSONB,
  changed_fields TEXT[],
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_school_change_history_school ON school_change_history(school_id);
CREATE INDEX idx_school_change_history_feature ON school_change_history(school_id, feature);
CREATE INDEX idx_school_change_history_created ON school_change_history(created_at DESC);

COMMENT ON TABLE school_change_history IS 'Audit log for changes to school-level features: transversal context, migration plan, and context responses.';

-- ============================================================
-- TABLE 2: school_plan_completion_status
-- Tracks completion state for migration_plan and context_responses.
-- ============================================================

CREATE TABLE school_plan_completion_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id INT NOT NULL REFERENCES schools(id),
  feature TEXT NOT NULL CHECK (feature IN ('migration_plan', 'context_responses')),
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, feature)
);

COMMENT ON TABLE school_plan_completion_status IS 'Completion status for migration plan and context responses per school.';

-- ============================================================
-- ALTER: school_transversal_context — add completion columns
-- ============================================================

ALTER TABLE school_transversal_context
  ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id);

-- ============================================================
-- ENABLE RLS
-- ============================================================

ALTER TABLE school_change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_plan_completion_status ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: school_change_history
-- ============================================================

-- Admin: full access
CREATE POLICY "school_change_history_admin_all" ON school_change_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

-- Consultor: SELECT for assigned schools
CREATE POLICY "school_change_history_consultor_select" ON school_change_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM consultant_assignments ca
            WHERE ca.user_id = auth.uid()
            AND ca.school_id = school_change_history.school_id
            AND ca.is_active = true)
  );

-- Equipo directivo: SELECT own school
CREATE POLICY "school_change_history_directivo_select" ON school_change_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'equipo_directivo'
            AND school_id = school_change_history.school_id
            AND is_active = true)
  );

-- NOTE: Inserts currently go through service role client (bypasses RLS).
-- This policy exists as defense-in-depth in case the client usage changes.
-- Equipo directivo: INSERT for own school
CREATE POLICY "school_change_history_directivo_insert" ON school_change_history
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'equipo_directivo'
            AND school_id = school_change_history.school_id
            AND is_active = true)
  );

-- ============================================================
-- RLS POLICIES: school_plan_completion_status
-- ============================================================

-- Admin: full access
CREATE POLICY "school_plan_completion_admin_all" ON school_plan_completion_status
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

-- Consultor: SELECT for assigned schools
CREATE POLICY "school_plan_completion_consultor_select" ON school_plan_completion_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM consultant_assignments ca
            WHERE ca.user_id = auth.uid()
            AND ca.school_id = school_plan_completion_status.school_id
            AND ca.is_active = true)
  );

-- Equipo directivo: SELECT own school
CREATE POLICY "school_plan_completion_directivo_select" ON school_plan_completion_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'equipo_directivo'
            AND school_id = school_plan_completion_status.school_id
            AND is_active = true)
  );

-- NOTE: INSERT/UPDATE currently go through service role client (bypasses RLS).
-- These policies exist as defense-in-depth in case the client usage changes.
-- Equipo directivo: INSERT for own school
CREATE POLICY "school_plan_completion_directivo_insert" ON school_plan_completion_status
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'equipo_directivo'
            AND school_id = school_plan_completion_status.school_id
            AND is_active = true)
  );

-- Equipo directivo: UPDATE for own school
CREATE POLICY "school_plan_completion_directivo_update" ON school_plan_completion_status
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'equipo_directivo'
            AND school_id = school_plan_completion_status.school_id
            AND is_active = true)
  );
