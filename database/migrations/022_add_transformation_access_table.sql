-- Migration 022: Add transformation access table with audit logging
--
-- Purpose: Replace simple boolean flag (transformation_enabled) with
-- assignment-based system for Transformation Vías access control.
--
-- Behavior:
-- - All 7 vías are assigned/revoked as a single package
-- - When access is revoked, active assessments are archived automatically
-- - Archived assessments do NOT reactivate if access is re-assigned later
-- - Full audit trail of all access changes and affected assessments
--
-- Author: Claude (with Brent Curtis)
-- Date: 2025-01-27

-- ============================================================================
-- 1. NEW TABLE: growth_community_transformation_access
-- ============================================================================

CREATE TABLE IF NOT EXISTS growth_community_transformation_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  growth_community_id uuid NOT NULL REFERENCES growth_communities(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid REFERENCES auth.users(id),
  notes text,
  UNIQUE(growth_community_id)
);

CREATE INDEX idx_gc_transformation_active
  ON growth_community_transformation_access(growth_community_id)
  WHERE is_active = true;

COMMENT ON TABLE growth_community_transformation_access IS
  'Asignación de paquete completo de 7 Vías de Transformación a Growth Communities. Las 7 vías (Aprendizaje, Personalización, Evaluación, Propósito, Familias, Trabajo Docente, Liderazgo) se asignan/remueven como unidad indivisible.';

COMMENT ON COLUMN growth_community_transformation_access.growth_community_id IS
  'Growth Community que tiene acceso al paquete completo de vías';

COMMENT ON COLUMN growth_community_transformation_access.is_active IS
  'Si false, el acceso fue revocado y los assessments archivados. NO se reactivan automáticamente si se vuelve a asignar.';

-- ============================================================================
-- 2. MIGRATE EXISTING DATA from transformation_enabled flag
-- ============================================================================

INSERT INTO growth_community_transformation_access (growth_community_id, is_active, notes)
SELECT id, true, 'Migrado automáticamente desde transformation_enabled flag'
FROM growth_communities
WHERE transformation_enabled = true
ON CONFLICT (growth_community_id) DO NOTHING;

-- ============================================================================
-- 3. AUDIT LOG TABLE for traceability
-- ============================================================================

CREATE TABLE IF NOT EXISTS transformation_access_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  growth_community_id uuid NOT NULL REFERENCES growth_communities(id),
  action text NOT NULL CHECK (action IN ('assigned', 'revoked')),
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  affected_assessment_ids uuid[] DEFAULT '{}',
  assessment_count integer DEFAULT 0,
  notes text
);

CREATE INDEX idx_transformation_audit_community
  ON transformation_access_audit_log(growth_community_id);

CREATE INDEX idx_transformation_audit_date
  ON transformation_access_audit_log(performed_at DESC);

COMMENT ON TABLE transformation_access_audit_log IS
  '📋 Audit log para rastrear asignaciones/revocaciones de acceso y los assessments afectados. Crítico para soporte: permite rastrear exactamente qué assessments fueron archivados y cuándo.';

-- ============================================================================
-- 4. TRIGGER: Auto-archive assessments when access is revoked
-- ============================================================================

CREATE OR REPLACE FUNCTION archive_assessments_on_access_removal()
RETURNS TRIGGER AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
BEGIN
  -- Solo archivar si se desactiva el acceso (true → false)
  IF NEW.is_active = false AND OLD.is_active = true THEN

    -- 📋 Capturar IDs de assessments que serán archivados (para logging)
    SELECT ARRAY_AGG(id), COUNT(*)
    INTO affected_ids, affected_count
    FROM transformation_assessments
    WHERE growth_community_id = NEW.growth_community_id
      AND status IN ('in_progress', 'completed');

    -- Archivar assessments activos
    UPDATE transformation_assessments
    SET
      status = 'archived',
      updated_at = now()
    WHERE growth_community_id = NEW.growth_community_id
      AND status IN ('in_progress', 'completed');

    -- Registrar quién y cuándo archivó en el registro de acceso
    NEW.archived_at := now();
    NEW.archived_by := auth.uid();

    -- 🔍 Registrar en audit log para trazabilidad completa
    INSERT INTO transformation_access_audit_log (
      growth_community_id,
      action,
      performed_by,
      affected_assessment_ids,
      assessment_count,
      notes
    ) VALUES (
      NEW.growth_community_id,
      'revoked',
      auth.uid(),
      affected_ids,
      affected_count,
      format('Archivados %s assessments. IDs: %s',
             affected_count,
             ARRAY_TO_STRING(affected_ids, ', '))
    );

  -- Log cuando se ASIGNA acceso también (con advertencia de no-reactivación)
  ELSIF NEW.is_active = true AND OLD.is_active = false THEN
    INSERT INTO transformation_access_audit_log (
      growth_community_id,
      action,
      performed_by,
      notes
    ) VALUES (
      NEW.growth_community_id,
      'assigned',
      auth.uid(),
      '⚠️ Acceso reasignado. IMPORTANTE: Los assessments previamente archivados NO se reactivan automáticamente.'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_archive_on_access_removal
  BEFORE UPDATE ON growth_community_transformation_access
  FOR EACH ROW
  EXECUTE FUNCTION archive_assessments_on_access_removal();

COMMENT ON FUNCTION archive_assessments_on_access_removal() IS
  'Trigger function que archiva assessments automáticamente al revocar acceso y registra los IDs en audit log. También registra reasignaciones con advertencia de no-reactivación.';

-- ============================================================================
-- 4b. 🔧 MEDIUM FIX: Audit log INSERT trigger for first-time assignments
-- ============================================================================

CREATE OR REPLACE FUNCTION log_initial_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Log first-time assignments (INSERT operations)
  INSERT INTO transformation_access_audit_log (
    growth_community_id,
    action,
    performed_by,
    notes
  ) VALUES (
    NEW.growth_community_id,
    'assigned',
    NEW.assigned_by,
    'Asignación inicial de paquete completo (7 vías)'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_log_initial_assignment
  AFTER INSERT ON growth_community_transformation_access
  FOR EACH ROW
  EXECUTE FUNCTION log_initial_assignment();

COMMENT ON FUNCTION log_initial_assignment() IS
  '🔧 FIX: Registra asignaciones iniciales en audit log (trigger UPDATE solo capturaba reasignaciones)';

-- ============================================================================
-- 4c. 🔧 CRITICAL FIX: Keep legacy flag in sync until cleanup migration
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_legacy_transformation_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync legacy transformation_enabled flag with new table
  -- This is CRITICAL until migration 023 cleanup, otherwise fallback breaks

  UPDATE growth_communities
  SET transformation_enabled = NEW.is_active
  WHERE id = NEW.growth_community_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_sync_legacy_flag_insert
  AFTER INSERT ON growth_community_transformation_access
  FOR EACH ROW
  EXECUTE FUNCTION sync_legacy_transformation_flag();

CREATE TRIGGER trigger_sync_legacy_flag_update
  AFTER UPDATE ON growth_community_transformation_access
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION sync_legacy_transformation_flag();

COMMENT ON FUNCTION sync_legacy_transformation_flag() IS
  '🔧 CRITICAL: Mantiene transformation_enabled sincronizado con nueva tabla hasta cleanup migration 023. Sin esto, el fallback en has_transformation_access() fallará después de revocaciones.';

-- ============================================================================
-- 5. HELPER FUNCTION for RLS policies (with temporary fallback)
-- ============================================================================

-- Drop existing function first (may have different parameter name from previous version)
-- CASCADE will drop all dependent RLS policies, which we'll recreate below
DROP FUNCTION IF EXISTS has_transformation_access(uuid) CASCADE;

CREATE OR REPLACE FUNCTION has_transformation_access(community_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Verificar nueva tabla primero
  IF EXISTS (
    SELECT 1
    FROM growth_community_transformation_access gcta
    WHERE gcta.growth_community_id = community_id
      AND gcta.is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- Fallback TEMPORAL al flag viejo durante período de migración
  -- Este bloque se eliminará en migración 023 (cleanup)
  IF EXISTS (
    SELECT 1
    FROM growth_communities gc
    WHERE gc.id = community_id
      AND gc.transformation_enabled = true
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION has_transformation_access IS
  'Helper para RLS policies. Durante migración verifica AMBOS: nueva tabla Y flag viejo. Después de cleanup (migración 023) solo verificará la tabla nueva. Esto permite deployment gradual sin downtime.';

-- ============================================================================
-- 6. UPDATE RLS POLICIES to use new helper
-- ============================================================================

-- Policy para SELECT: Members can read assessments from their GC (including archived ones)
DROP POLICY IF EXISTS "members_read_transformation_assessments" ON transformation_assessments;
CREATE POLICY "members_read_transformation_assessments"
  ON transformation_assessments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND (
          ur.role_type IN ('admin', 'consultor')
          OR ur.community_id = growth_community_id
        )
    )
  );

-- Policy para INSERT: Solo puede crear assessments si la GC tiene acceso activo
DROP POLICY IF EXISTS "members_insert_transformation_assessments" ON transformation_assessments;
CREATE POLICY "members_insert_transformation_assessments"
  ON transformation_assessments FOR INSERT
  WITH CHECK (
    -- Verificar que la GC tiene acceso (helper con fallback)
    has_transformation_access(growth_community_id)
    AND
    -- Verificar que usuario tiene permiso (admin/consultor o miembro de la GC)
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND (
          ur.role_type IN ('admin', 'consultor')
          OR ur.community_id = growth_community_id
        )
    )
  );

-- Policy para UPDATE: Similar pero también verifica antes de permitir edición
DROP POLICY IF EXISTS "members_update_transformation_assessments" ON transformation_assessments;
CREATE POLICY "members_update_transformation_assessments"
  ON transformation_assessments FOR UPDATE
  USING (
    -- Usuario debe tener permiso para ver el assessment
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND (
          ur.role_type IN ('admin', 'consultor')
          OR ur.community_id = growth_community_id
        )
    )
  )
  WITH CHECK (
    -- GC debe seguir teniendo acceso activo
    has_transformation_access(growth_community_id)
    AND
    -- Usuario debe seguir teniendo permiso
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND (
          ur.role_type IN ('admin', 'consultor')
          OR ur.community_id = growth_community_id
        )
    )
  );

-- NOTA: Las policies de SELECT NO verifican has_transformation_access()
-- porque los miembros deben poder ver assessments históricos incluso
-- si el acceso fue revocado (status = 'archived')

-- Recreate policies for transformation_results (dropped by CASCADE above)
DROP POLICY IF EXISTS "members_read_transformation_results" ON transformation_results;
CREATE POLICY "members_read_transformation_results"
  ON transformation_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transformation_assessments ta
      JOIN user_roles ur ON ur.community_id = ta.growth_community_id
      WHERE ta.id = transformation_results.assessment_id
        AND ur.user_id = auth.uid()
        AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND ur.role_type IN ('admin', 'consultor')
    )
  );

DROP POLICY IF EXISTS "members_insert_transformation_results" ON transformation_results;
CREATE POLICY "members_insert_transformation_results"
  ON transformation_results FOR INSERT
  WITH CHECK (
    has_transformation_access(
      (SELECT growth_community_id FROM transformation_assessments WHERE id = assessment_id)
    )
    AND EXISTS (
      SELECT 1 FROM transformation_assessments ta
      JOIN user_roles ur ON ur.community_id = ta.growth_community_id
      WHERE ta.id = transformation_results.assessment_id
        AND ur.user_id = auth.uid()
        AND ur.is_active = true
    )
  );

DROP POLICY IF EXISTS "members_update_transformation_results" ON transformation_results;
CREATE POLICY "members_update_transformation_results"
  ON transformation_results FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM transformation_assessments ta
      JOIN user_roles ur ON ur.community_id = ta.growth_community_id
      WHERE ta.id = transformation_results.assessment_id
        AND ur.user_id = auth.uid()
        AND ur.is_active = true
    )
  )
  WITH CHECK (
    has_transformation_access(
      (SELECT growth_community_id FROM transformation_assessments WHERE id = assessment_id)
    )
  );

DROP POLICY IF EXISTS "members_delete_transformation_results" ON transformation_results;
CREATE POLICY "members_delete_transformation_results"
  ON transformation_results FOR DELETE
  USING (
    has_transformation_access(
      (SELECT growth_community_id FROM transformation_assessments WHERE id = assessment_id)
    )
    AND EXISTS (
      SELECT 1 FROM transformation_assessments ta
      JOIN user_roles ur ON ur.community_id = ta.growth_community_id
      WHERE ta.id = transformation_results.assessment_id
        AND ur.user_id = auth.uid()
        AND ur.is_active = true
        AND ur.role_type IN ('admin', 'consultor')
    )
  );

-- Recreate policies for transformation_conversation_messages (dropped by CASCADE above)
DROP POLICY IF EXISTS "members_read_transformation_conversation_messages" ON transformation_conversation_messages;
CREATE POLICY "members_read_transformation_conversation_messages"
  ON transformation_conversation_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transformation_assessments ta
      JOIN user_roles ur ON ur.community_id = ta.growth_community_id
      WHERE ta.id = transformation_conversation_messages.assessment_id
        AND ur.user_id = auth.uid()
        AND ur.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND ur.role_type IN ('admin', 'consultor')
    )
  );

DROP POLICY IF EXISTS "members_insert_transformation_conversation_messages" ON transformation_conversation_messages;
CREATE POLICY "members_insert_transformation_conversation_messages"
  ON transformation_conversation_messages FOR INSERT
  WITH CHECK (
    has_transformation_access(
      (SELECT growth_community_id FROM transformation_assessments WHERE id = assessment_id)
    )
    AND EXISTS (
      SELECT 1 FROM transformation_assessments ta
      JOIN user_roles ur ON ur.community_id = ta.growth_community_id
      WHERE ta.id = transformation_conversation_messages.assessment_id
        AND ur.user_id = auth.uid()
        AND ur.is_active = true
    )
  );

DROP POLICY IF EXISTS "members_delete_transformation_conversation_messages" ON transformation_conversation_messages;
CREATE POLICY "members_delete_transformation_conversation_messages"
  ON transformation_conversation_messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM transformation_assessments ta
      WHERE ta.id = transformation_conversation_messages.assessment_id
        AND has_transformation_access(ta.growth_community_id)
    )
  );

-- ============================================================================
-- 7. GRANT PERMISSIONS for audit log (admins only)
-- ============================================================================

-- RLS para audit log: solo admins pueden ver
ALTER TABLE transformation_access_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_audit_log" ON transformation_access_audit_log;
CREATE POLICY "admins_read_audit_log"
  ON transformation_access_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND ur.role_type IN ('admin', 'consultor')
    )
  );

-- INSERT policy: Trigger inserta, no usuarios directamente
-- No se necesita policy INSERT porque solo el trigger escribe

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verificación post-migración
DO $$
DECLARE
  migrated_count integer;
  flag_count integer;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM growth_community_transformation_access WHERE is_active = true;

  SELECT COUNT(*) INTO flag_count
  FROM growth_communities WHERE transformation_enabled = true;

  RAISE NOTICE '✅ Migration 022 complete!';
  RAISE NOTICE '   - Communities migrated to new table: %', migrated_count;
  RAISE NOTICE '   - Communities with old flag still true: %', flag_count;
  RAISE NOTICE '   - Helper function will check BOTH during transition period';
  RAISE NOTICE '   - Run migration 023 after 1 week to remove old flag';
END $$;
