-- ============================================================
-- Migration: Add per-year weight distribution for Assessment Builder
--
-- Purpose:
--   The weight distributor on the Calibración page currently uses a single
--   set of weights for the entire template. This migration adds a new table
--   to store independent weight distributions per transformation year (1-5),
--   so template creators can shift emphasis across years (e.g., Year 1:
--   Cobertura 40% / Profundidad 10% vs Year 4: Cobertura 10% / Profundidad 40%).
--
-- Changes:
--   1. CREATE TABLE assessment_entity_year_weights
--   2. Indexes: on template_id, on (entity_type, entity_id, year)
--   3. Enable RLS with 4 policies (SELECT, INSERT, UPDATE, DELETE)
--      — mirrors assessment_templates RBAC: admin write, admin/consultor read
--   4. COMMENT ON TABLE
--   5. updated_at trigger (uses existing set_updated_at() function)
--
-- Backward compatibility:
--   The existing `weight` column on assessment_objectives, assessment_modules,
--   and assessment_indicators is PRESERVED as the default/fallback. Per-year
--   weights in this table override the entity default when present.
--
-- Rollback plan:
--   DROP TRIGGER IF EXISTS trigger_entity_year_weights_updated_at
--     ON assessment_entity_year_weights;
--   DROP TABLE IF EXISTS assessment_entity_year_weights;
--   (No other tables are modified — fully additive migration.)
--
-- Data privacy: This table stores template configuration data only.
--   No student PII. No DPIA required.
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS assessment_entity_year_weights (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID        NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  entity_type   TEXT        NOT NULL CHECK (entity_type IN ('objective', 'module', 'indicator')),
  entity_id     UUID        NOT NULL,
  -- entity_id is a polymorphic reference: UUID of an assessment_objective,
  -- assessment_module, or assessment_indicator depending on entity_type.
  -- A single REFERENCES clause is not possible for polymorphic FKs.
  -- The template_id ON DELETE CASCADE handles the primary deletion case.
  -- Orphaned rows (e.g., indicator deleted but weight row remains) are
  -- harmless — they are filtered out on the next GET.
  year          SMALLINT    NOT NULL CHECK (year BETWEEN 1 AND 5),
  weight        DECIMAL(5,2) NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, entity_type, entity_id, year)
);

COMMENT ON TABLE assessment_entity_year_weights IS
  'Per-year weight distribution for assessment template entities (objectives, modules, '
  'indicators). Weights are percentages that sum to 100 within each parent group per '
  'year. Used by the scoring service to determine relative importance of each entity '
  'for a given transformation year (1-5). When no row exists for a (entity_id, year) '
  'pair, the scoring service falls back to the entity''s default weight column.';

COMMENT ON COLUMN assessment_entity_year_weights.entity_type IS
  'Discriminator for the polymorphic entity_id. One of: objective, module, indicator.';

COMMENT ON COLUMN assessment_entity_year_weights.entity_id IS
  'UUID of the referenced entity. References assessment_objectives.id, '
  'assessment_modules.id, or assessment_indicators.id depending on entity_type.';

COMMENT ON COLUMN assessment_entity_year_weights.year IS
  'Transformation year (1-5). Matches the transformation_year field on '
  'assessment_instances. Weights for different years are independent.';

COMMENT ON COLUMN assessment_entity_year_weights.weight IS
  'Weight as a percentage contribution within the parent group for this year. '
  'Within a group (same parent, same year), all weights must sum to 100 (±0.5). '
  'Stored as DECIMAL(5,2) to allow values like 33.33.';

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_entity_year_weights_template
  ON assessment_entity_year_weights (template_id);

CREATE INDEX IF NOT EXISTS idx_entity_year_weights_lookup
  ON assessment_entity_year_weights (entity_type, entity_id, year);

-- 3. Enable Row Level Security
ALTER TABLE assessment_entity_year_weights ENABLE ROW LEVEL SECURITY;

-- SELECT: admin and consultor can read all year weights
-- (mirrors assessment_templates_select_admin_consultor policy)
CREATE POLICY "entity_year_weights_select"
  ON assessment_entity_year_weights
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type IN ('admin', 'consultor')
        AND user_roles.is_active = true
    )
  );

-- INSERT: admin only (write operations require admin role)
-- (mirrors assessment_templates_insert_admin_only policy)
CREATE POLICY "entity_year_weights_insert"
  ON assessment_entity_year_weights
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

-- UPDATE: admin only
CREATE POLICY "entity_year_weights_update"
  ON assessment_entity_year_weights
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

-- DELETE: admin only
CREATE POLICY "entity_year_weights_delete"
  ON assessment_entity_year_weights
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_type = 'admin'
        AND user_roles.is_active = true
    )
  );

-- 4. updated_at trigger
-- Reuses the generic set_updated_at() function created in
-- 20260212000000_create_consultor_sessions_schema.sql
CREATE TRIGGER trigger_entity_year_weights_updated_at
  BEFORE UPDATE ON assessment_entity_year_weights
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
